import * as vscode from 'vscode';
import { type ILogger } from '../../../core/interfaces/ILogger';
import { type IExtensionService } from '../../../core/interfaces/IExtensionService';
import { type IDocumentParseCache, type IParsedDocument } from '../../../core/interfaces/IParsedDocument';
import { type IPerformanceMonitor } from '../../../core/interfaces/IPerformanceMonitor';
import {
    type IDiagnosticProvider,
    type IDiagnosticProviders,
    type IDiagnosticIgnoreParser,
} from '../../../core/interfaces/IDiagnosticProvider';
import { DocumentChangeTracker } from './DocumentChangeTracker';

// 重导出接口以保持向后兼容
export type { IDiagnosticProvider, IDiagnosticProviders };

/**
 * 诊断优先级定义
 */
export enum DiagnosticPriority {
    P0_SYNTAX = 0,
    P1_REFERENCE = 1,
    P2_TYPE = 2,
    P3_SUGGESTION = 3,
}

/**
 * 诊断执行组配置
 */
interface DiagnosticGroup {
    name: string;
    providers: (keyof IDiagnosticProviders)[];
    priority: DiagnosticPriority;
}

/**
 * 文档诊断处理器
 *
 * 统一管理 YAML 文档的诊断更新、文档事件监听等功能。
 * 将变更追踪委托给 DocumentChangeTracker。
 */
export class DocumentDiagnosticHandler {
    private readonly INITIAL_DELAY: number;
    private readonly HIGH_PRIORITY_DELAY: number;
    private readonly LOW_PRIORITY_DELAY: number;
    private readonly INCREMENTAL_THRESHOLD: number;
    private readonly DIAGNOSTIC_GROUPS: DiagnosticGroup[];

    private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
    private readonly lowPriorityTimers = new Map<string, NodeJS.Timeout>();
    private readonly changeTracker = new DocumentChangeTracker();
    private readonly ignoreParser: IDiagnosticIgnoreParser;

    constructor(
        private readonly logger: ILogger,
        private readonly providers: IDiagnosticProviders,
        private readonly extensionService: IExtensionService | null,
        private readonly documentParseCache?: IDocumentParseCache,
        private readonly performanceMonitor?: IPerformanceMonitor,
        ignoreParser?: IDiagnosticIgnoreParser,
        timingConfig?: {
            initialDelay?: number;
            highPriorityDelay?: number;
            lowPriorityDelay?: number;
            incrementalThreshold?: number;
            diagnosticGroups?: DiagnosticGroup[];
        },
    ) {
        this.ignoreParser = ignoreParser ?? { isFileIgnored: () => false };
        this.INITIAL_DELAY = timingConfig?.initialDelay ?? 100;
        this.HIGH_PRIORITY_DELAY = timingConfig?.highPriorityDelay ?? 200;
        this.LOW_PRIORITY_DELAY = timingConfig?.lowPriorityDelay ?? 1000;
        this.INCREMENTAL_THRESHOLD = timingConfig?.incrementalThreshold ?? 50;
        this.DIAGNOSTIC_GROUPS = timingConfig?.diagnosticGroups ?? [
            { name: 'syntax', providers: ['schema'], priority: DiagnosticPriority.P0_SYNTAX },
            {
                name: 'reference',
                providers: ['template', 'translation', 'category'],
                priority: DiagnosticPriority.P1_REFERENCE,
            },
            { name: 'type-validation', providers: ['filePath', 'itemId'], priority: DiagnosticPriority.P2_TYPE },
            {
                name: 'suggestions',
                providers: ['miniMessage', 'versionCondition'],
                priority: DiagnosticPriority.P3_SUGGESTION,
            },
        ];
    }

    /**
     * 注册文档事件监听器
     */
    registerDocumentListeners(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument((e) => this.handleDocumentChange(e)),
            vscode.workspace.onDidOpenTextDocument((doc) => this.handleDocumentOpen(doc)),
            vscode.workspace.onDidCloseTextDocument((doc) => this.handleDocumentClose(doc)),
            vscode.workspace.onDidSaveTextDocument((doc) => this.handleDocumentSave(doc)),
        );

        this.logger.debug('Document event listeners registered');
    }

    /**
     * 更新所有打开的 YAML 文档的诊断
     */
    updateOpenDocuments(): void {
        const openYamlDocs = this.getOpenYamlDocuments();
        if (openYamlDocs.length === 0) {
            return;
        }

        setTimeout(async () => {
            // 并行更新所有打开的文档
            await Promise.all(openYamlDocs.map((doc) => this.updateAllDiagnostics(doc)));
            this.logger.debug('Initial diagnostics updated', { documentCount: openYamlDocs.length });
        }, this.INITIAL_DELAY);
    }

    /**
     * 清除指定定时器映射中的定时器
     */
    private clearPendingTimer(uri: string, timerMap: Map<string, NodeJS.Timeout>): void {
        const timer = timerMap.get(uri);
        if (timer) {
            clearTimeout(timer);
            timerMap.delete(uri);
        }
    }

    /**
     * 处理文档变更事件
     *
     * 实现增量更新和优先级调度：
     * 1. 追踪变更的行范围
     * 2. 高优先级诊断快速响应
     * 3. 低优先级诊断延迟执行
     */
    private handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
        if (!this.isYamlFile(event.document)) {
            return;
        }

        if (this.shouldIgnoreFile(event.document.uri)) {
            this.logger.debug('Document ignored by .craftengine-ignore', {
                file: event.document.fileName,
            });
            return;
        }

        const uri = event.document.uri.toString();

        // 追踪变更的行
        this.changeTracker.trackChanges(event);

        // 清除之前的定时器
        this.clearPendingTimer(uri, this.debounceTimers);
        this.clearPendingTimer(uri, this.lowPriorityTimers);

        // 增加执行版本（使正在执行的诊断任务失效）
        const currentVersion = this.changeTracker.incrementVersion(uri);

        // 判断是否可以使用增量更新
        const changeInfo = this.changeTracker.getChangeInfo(uri);
        const useIncremental = changeInfo && changeInfo.changedLines.size <= this.INCREMENTAL_THRESHOLD;

        // 高优先级诊断（P0, P1）快速响应
        const highPriorityTimer = setTimeout(async () => {
            if (!this.changeTracker.isVersionCurrent(uri, currentVersion)) {
                this.logger.debug('Skipping outdated high priority diagnostics', {
                    file: event.document.fileName,
                });
                return;
            }
            await this.updateHighPriorityDiagnostics(
                event.document,
                useIncremental ? changeInfo : undefined,
                currentVersion,
            );
            this.debounceTimers.delete(uri);
        }, this.HIGH_PRIORITY_DELAY);

        this.debounceTimers.set(uri, highPriorityTimer);

        // 低优先级诊断（P2, P3）延迟执行
        const lowTimer = setTimeout(async () => {
            if (!this.changeTracker.isVersionCurrent(uri, currentVersion)) {
                this.logger.debug('Skipping outdated low priority diagnostics', {
                    file: event.document.fileName,
                });
                return;
            }
            await this.updateLowPriorityDiagnostics(event.document, currentVersion);
            this.lowPriorityTimers.delete(uri);
            this.changeTracker.clearChanges(uri);
        }, this.LOW_PRIORITY_DELAY);

        this.lowPriorityTimers.set(uri, lowTimer);
    }

    /**
     * 更新高优先级诊断（P0, P1）
     */
    private async updateHighPriorityDiagnostics(
        document: vscode.TextDocument,
        _changeInfo?: import('./DocumentChangeTracker').DocumentChangeInfo,
        executionVersion?: number,
    ): Promise<void> {
        const timer = this.performanceMonitor?.startTimer('diagnostics.highPriority');

        try {
            // 预解析文档
            let parsedDoc: IParsedDocument | undefined;
            if (this.documentParseCache) {
                parsedDoc = await this.documentParseCache.getParsedDocument(document);
            }

            // 执行高优先级组（P0, P1）
            const highPriorityGroups = this.DIAGNOSTIC_GROUPS.filter(
                (g) => g.priority <= DiagnosticPriority.P1_REFERENCE,
            );

            for (const group of highPriorityGroups) {
                await this.executeGroupDiagnostics(group, document, parsedDoc, executionVersion);
            }

            timer?.stop({ success: 'true' });
        } catch (error) {
            this.logger.error('Failed to update high priority diagnostics', error as Error, {
                file: document.fileName,
            });
            timer?.stop({ success: 'false', error: (error as Error).message });
        }
    }

    /**
     * 更新低优先级诊断（P2, P3）
     */
    private async updateLowPriorityDiagnostics(
        document: vscode.TextDocument,
        executionVersion?: number,
    ): Promise<void> {
        const timer = this.performanceMonitor?.startTimer('diagnostics.lowPriority');

        try {
            // 预解析文档（可能已缓存）
            let parsedDoc: IParsedDocument | undefined;
            if (this.documentParseCache) {
                parsedDoc = await this.documentParseCache.getParsedDocument(document);
            }

            // 执行低优先级组（P2, P3）
            const lowPriorityGroups = this.DIAGNOSTIC_GROUPS.filter(
                (g) => g.priority > DiagnosticPriority.P1_REFERENCE,
            );

            for (const group of lowPriorityGroups) {
                await this.executeGroupDiagnostics(group, document, parsedDoc, executionVersion);
            }

            timer?.stop({ success: 'true' });
        } catch (error) {
            this.logger.error('Failed to update low priority diagnostics', error as Error, {
                file: document.fileName,
            });
            timer?.stop({ success: 'false', error: (error as Error).message });
        }
    }

    /**
     * 处理文档打开事件
     */
    private handleDocumentOpen(document: vscode.TextDocument): void {
        if (!this.isYamlFile(document)) {
            return;
        }

        // 检查文件是否应该被忽略
        if (this.shouldIgnoreFile(document.uri)) {
            this.logger.debug('Document ignored by .craftengine-ignore', {
                file: document.fileName,
            });
            return;
        }

        // 等待初始扫描完成后再更新诊断
        this.extensionService?.initialScanCompleted
            .then(async () => {
                await this.updateAllDiagnostics(document);
            })
            .catch((error) => {
                this.logger.error('Failed to update diagnostics on document open', error as Error);
            });
    }

    /**
     * 处理文档关闭事件
     */
    private handleDocumentClose(document: vscode.TextDocument): void {
        if (!this.isYamlFile(document)) {
            return;
        }

        const uri = document.uri.toString();

        this.clearPendingTimer(uri, this.debounceTimers);
        this.clearPendingTimer(uri, this.lowPriorityTimers);
        this.changeTracker.clearChanges(uri);
        this.changeTracker.clearVersion(uri);
        this.documentParseCache?.clearCache(uri);
        this.clearAllDiagnostics(document.uri);
    }

    /**
     * 处理文档保存事件
     *
     * 保存时强制清除缓存并重新验证，确保诊断信息是最新的
     */
    private handleDocumentSave(document: vscode.TextDocument): void {
        if (!this.isYamlFile(document)) {
            return;
        }

        const uri = document.uri.toString();

        this.clearPendingTimer(uri, this.debounceTimers);
        this.clearPendingTimer(uri, this.lowPriorityTimers);
        this.changeTracker.incrementVersion(uri);
        this.changeTracker.clearChanges(uri);
        this.documentParseCache?.clearCache(uri);
        this.clearAllCaches(document.uri);

        this.updateAllDiagnostics(document).catch((error) => {
            this.logger.error('Failed to update diagnostics on save', error as Error);
        });

        this.logger.debug('Document saved, diagnostics refreshed', {
            file: document.fileName,
        });
    }

    /**
     * 更新文档的所有诊断
     *
     * 优化策略：
     * 1. 预解析文档，共享解析结果
     * 2. 所有诊断组并行执行
     */
    private async updateAllDiagnostics(document: vscode.TextDocument): Promise<void> {
        const timer = this.performanceMonitor?.startTimer('diagnostics.updateAll');

        try {
            // 1. 预解析文档（如果有缓存服务）
            let parsedDoc: IParsedDocument | undefined;
            if (this.documentParseCache) {
                parsedDoc = await this.documentParseCache.getParsedDocument(document);
                this.logger.debug('Document pre-parsed for diagnostics', {
                    file: document.fileName,
                    success: parsedDoc.success,
                    errorCount: parsedDoc.errors.length,
                });
            }

            // 2. 所有诊断组并行执行
            await Promise.all(
                this.DIAGNOSTIC_GROUPS.map((group) => this.executeGroupDiagnostics(group, document, parsedDoc)),
            );

            timer?.stop({ success: 'true' });
        } catch (error) {
            this.logger.error('Failed to update all diagnostics', error as Error, {
                file: document.fileName,
            });
            timer?.stop({ success: 'false', error: (error as Error).message });
        }
    }

    /**
     * 执行一组诊断（并行）
     *
     * @param group - 诊断组配置
     * @param document - 文档
     * @param parsedDoc - 预解析文档
     * @param executionVersion - 执行版本号，用于检测过时任务
     */
    private async executeGroupDiagnostics(
        group: DiagnosticGroup,
        document: vscode.TextDocument,
        parsedDoc?: IParsedDocument,
        executionVersion?: number,
    ): Promise<void> {
        // 检查执行版本是否仍然有效
        if (executionVersion !== undefined) {
            const uri = document.uri.toString();
            if (!this.changeTracker.isVersionCurrent(uri, executionVersion)) {
                this.logger.debug('Skipping outdated diagnostic group', {
                    group: group.name,
                    file: document.fileName,
                });
                return;
            }
        }

        const timer = this.performanceMonitor?.startTimer(`diagnostics.group.${group.name}`);

        try {
            // 收集该组中存在的提供者
            const tasks: Promise<void>[] = [];

            for (const providerKey of group.providers) {
                const provider = this.providers[providerKey];
                if (provider) {
                    // 包装为 Promise（处理同步和异步两种情况）
                    const task = Promise.resolve(provider.updateDiagnostics(document, parsedDoc)).catch((error) => {
                        this.logger.error(`Diagnostic provider ${providerKey} failed`, error as Error, {
                            file: document.fileName,
                        });
                    });
                    tasks.push(task);
                }
            }

            // 并行执行该组的所有诊断
            if (tasks.length > 0) {
                await Promise.all(tasks);
            }

            timer?.stop({ success: 'true', providerCount: String(tasks.length) });
        } catch (error) {
            this.logger.error(`Diagnostic group ${group.name} failed`, error as Error);
            timer?.stop({ success: 'false', error: (error as Error).message });
        }
    }

    /**
     * 清除文档的所有诊断
     */
    private clearAllDiagnostics(uri: vscode.Uri): void {
        this.providers.template?.clearDiagnostics(uri);
        this.providers.translation?.clearDiagnostics(uri);
        this.providers.schema?.clearDiagnostics(uri);
        this.providers.filePath?.clearDiagnostics(uri);
        this.providers.miniMessage?.clearDiagnostics(uri);
        this.providers.itemId?.clearDiagnostics(uri);
        this.providers.versionCondition?.clearDiagnostics(uri);
        this.providers.category?.clearDiagnostics(uri);
    }

    /**
     * 清除文档的所有诊断缓存
     *
     * 用于强制重新验证文档（如保存时）
     */
    private clearAllCaches(uri: vscode.Uri): void {
        this.providers.template?.clearCache?.(uri);
        this.providers.translation?.clearCache?.(uri);
        this.providers.schema?.clearCache?.(uri);
        this.providers.filePath?.clearCache?.(uri);
        this.providers.miniMessage?.clearCache?.(uri);
        this.providers.itemId?.clearCache?.(uri);
        this.providers.versionCondition?.clearCache?.(uri);
        this.providers.category?.clearCache?.(uri);
    }

    /**
     * 检查是否为 YAML 文件
     */
    private isYamlFile(document: vscode.TextDocument): boolean {
        return document.languageId === 'yaml' && document.uri.scheme === 'file';
    }

    /**
     * 检查文件是否应该被忽略
     */
    private shouldIgnoreFile(uri: vscode.Uri): boolean {
        return this.ignoreParser.isFileIgnored(uri);
    }

    /**
     * 获取所有打开的 YAML 文档
     */
    private getOpenYamlDocuments(): vscode.TextDocument[] {
        return vscode.workspace.textDocuments.filter((doc) => this.isYamlFile(doc));
    }

    /**
     * 清理所有资源
     *
     * 清除所有 pending timer、变更追踪和执行版本记录
     */
    dispose(): void {
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();

        for (const timer of this.lowPriorityTimers.values()) {
            clearTimeout(timer);
        }
        this.lowPriorityTimers.clear();

        this.changeTracker.dispose();

        this.logger.debug('DocumentDiagnosticHandler disposed');
    }
}
