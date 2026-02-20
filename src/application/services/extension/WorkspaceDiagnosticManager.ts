/**
 * 工作区诊断管理器
 *
 * 管理整个工作区的诊断状态
 */

import { type Disposable, Uri, workspace, type DiagnosticCollection } from 'vscode';
import { type ILogger } from '../../../core/interfaces/ILogger';
import { type IEventBus } from '../../../core/interfaces/IEventBus';

/**
 * 诊断统计信息
 */
export interface IDiagnosticStatistics {
    /** 总诊断数 */
    totalDiagnostics: number;
    /** 错误数 */
    errorCount: number;
    /** 警告数 */
    warningCount: number;
    /** 信息数 */
    informationCount: number;
    /** 提示数 */
    hintCount: number;
    /** 文件数 */
    fileCount: number;
    /** 按来源分组的统计 */
    bySource: Record<string, number>;
}

/**
 * 诊断报告
 */
export interface IDiagnosticReport {
    /** 生成时间 */
    generatedAt: Date;
    /** 工作区路径 */
    workspacePath: string;
    /** 统计信息 */
    statistics: IDiagnosticStatistics;
    /** 按文件分组的诊断 */
    byFile: Record<
        string,
        {
            errors: number;
            warnings: number;
            info: number;
            hints: number;
        }
    >;
}

/**
 * 工作区诊断管理器
 *
 * 功能：
 * - 管理整个工作区的诊断状态
 * - 提供诊断统计和报告
 * - 处理文件删除事件
 * - 支持批量操作
 */
export class WorkspaceDiagnosticManager implements Disposable {
    private readonly logger: ILogger;
    private readonly disposables: Disposable[] = [];

    /** 已注册的诊断集合 */
    private readonly diagnosticCollections = new Map<string, DiagnosticCollection>();

    /** 文件诊断状态追踪 */
    private readonly fileDiagnosticState = new Map<
        string,
        {
            lastUpdated: Date;
            diagnosticCount: number;
        }
    >();

    constructor(
        logger: ILogger,
        private readonly eventBus: IEventBus,
        private readonly generateEventId: (prefix?: string) => string,
    ) {
        this.logger = logger.createChild('WorkspaceDiagnosticManager');

        this.setupEventListeners();
        this.logger.info('WorkspaceDiagnosticManager initialized');
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners(): void {
        // 监听文件删除事件
        this.disposables.push(
            workspace.onDidDeleteFiles((event) => {
                for (const uri of event.files) {
                    this.handleFileDeleted(uri);
                }
            }),
        );

        // 监听文件重命名事件
        this.disposables.push(
            workspace.onDidRenameFiles((event) => {
                for (const { oldUri, newUri } of event.files) {
                    this.handleFileRenamed(oldUri, newUri);
                }
            }),
        );

        // 监听工作区文件夹变化
        this.disposables.push(
            workspace.onDidChangeWorkspaceFolders(() => {
                this.handleWorkspaceFoldersChanged();
            }),
        );

        this.logger.debug('Event listeners registered');
    }

    /**
     * 注册诊断集合
     *
     * @param name 集合名称
     * @param collection 诊断集合
     */
    registerDiagnosticCollection(name: string, collection: DiagnosticCollection): void {
        this.diagnosticCollections.set(name, collection);
        this.logger.debug('Diagnostic collection registered', { name });
    }

    /**
     * 处理文件删除事件
     */
    private handleFileDeleted(uri: Uri): void {
        this.logger.debug('File deleted, clearing diagnostics', { file: uri.fsPath });

        // 清除所有诊断集合中该文件的诊断
        for (const [name, collection] of this.diagnosticCollections) {
            collection.delete(uri);
            this.logger.debug('Cleared diagnostics from collection', { name, file: uri.fsPath });
        }

        // 清除状态追踪
        this.fileDiagnosticState.delete(uri.toString());

        // 发布事件
        this.eventBus.publish('diagnostics.fileDeleted', {
            id: this.generateEventId('diag-file-deleted'),
            type: 'diagnostics.fileDeleted',
            timestamp: new Date(),
            uri,
        });
    }

    /**
     * 处理文件重命名事件
     */
    private handleFileRenamed(oldUri: Uri, newUri: Uri): void {
        this.logger.debug('File renamed, updating diagnostics', {
            oldFile: oldUri.fsPath,
            newFile: newUri.fsPath,
        });

        // 对于每个诊断集合，将旧文件的诊断移动到新文件
        for (const [name, collection] of this.diagnosticCollections) {
            const diagnostics = collection.get(oldUri);
            if (diagnostics && diagnostics.length > 0) {
                collection.set(newUri, diagnostics);
                collection.delete(oldUri);
                this.logger.debug('Moved diagnostics to new file', {
                    name,
                    count: diagnostics.length,
                });
            }
        }

        // 更新状态追踪
        const state = this.fileDiagnosticState.get(oldUri.toString());
        if (state) {
            this.fileDiagnosticState.delete(oldUri.toString());
            this.fileDiagnosticState.set(newUri.toString(), state);
        }
    }

    /**
     * 处理工作区文件夹变化
     */
    private handleWorkspaceFoldersChanged(): void {
        this.logger.info('Workspace folders changed');

        // 清除不再属于工作区的文件的诊断
        const workspaceFolders = workspace.workspaceFolders || [];
        const workspacePaths = workspaceFolders.map((f) => f.uri.fsPath);

        for (const [uriString] of this.fileDiagnosticState) {
            const uri = Uri.parse(uriString);
            const isInWorkspace = workspacePaths.some((wp) => uri.fsPath.startsWith(wp));

            if (!isInWorkspace) {
                this.clearDiagnosticsForFile(uri);
            }
        }
    }

    /**
     * 清除文件的所有诊断
     */
    clearDiagnosticsForFile(uri: Uri): void {
        for (const collection of this.diagnosticCollections.values()) {
            collection.delete(uri);
        }
        this.fileDiagnosticState.delete(uri.toString());
    }

    /**
     * 清除工作区所有诊断
     */
    clearAll(): void {
        this.logger.info('Clearing all diagnostics');

        for (const collection of this.diagnosticCollections.values()) {
            collection.clear();
        }
        this.fileDiagnosticState.clear();

        this.eventBus.publish('diagnostics.cleared', {
            id: this.generateEventId('diag-cleared'),
            type: 'diagnostics.cleared',
            timestamp: new Date(),
        });
    }

    /**
     * 刷新工作区所有诊断
     */
    async refreshAll(): Promise<void> {
        this.logger.info('Refreshing all diagnostics');

        // 发布刷新请求事件
        await this.eventBus.publish('diagnostics.refreshRequested', {
            id: this.generateEventId('diag-refresh'),
            type: 'diagnostics.refreshRequested',
            timestamp: new Date(),
        });
    }

    /**
     * 获取工作区诊断统计
     */
    getStatistics(): IDiagnosticStatistics {
        const stats: IDiagnosticStatistics = {
            totalDiagnostics: 0,
            errorCount: 0,
            warningCount: 0,
            informationCount: 0,
            hintCount: 0,
            fileCount: 0,
            bySource: {},
        };

        const filesWithDiagnostics = new Set<string>();

        for (const collection of this.diagnosticCollections.values()) {
            collection.forEach((uri, diagnostics) => {
                if (diagnostics.length > 0) {
                    filesWithDiagnostics.add(uri.toString());
                }

                for (const diagnostic of diagnostics) {
                    stats.totalDiagnostics++;

                    // 按严重程度统计
                    switch (diagnostic.severity) {
                        case 0: // Error
                            stats.errorCount++;
                            break;
                        case 1: // Warning
                            stats.warningCount++;
                            break;
                        case 2: // Information
                            stats.informationCount++;
                            break;
                        case 3: // Hint
                            stats.hintCount++;
                            break;
                    }

                    // 按来源统计
                    const source = diagnostic.source || 'Unknown';
                    stats.bySource[source] = (stats.bySource[source] || 0) + 1;
                }
            });
        }

        stats.fileCount = filesWithDiagnostics.size;

        return stats;
    }

    /**
     * 导出诊断报告
     */
    exportReport(): IDiagnosticReport {
        const statistics = this.getStatistics();
        const byFile: Record<string, { errors: number; warnings: number; info: number; hints: number }> = {};

        for (const collection of this.diagnosticCollections.values()) {
            collection.forEach((uri, diagnostics) => {
                const filePath = uri.fsPath;

                if (!byFile[filePath]) {
                    byFile[filePath] = { errors: 0, warnings: 0, info: 0, hints: 0 };
                }

                for (const diagnostic of diagnostics) {
                    switch (diagnostic.severity) {
                        case 0:
                            byFile[filePath].errors++;
                            break;
                        case 1:
                            byFile[filePath].warnings++;
                            break;
                        case 2:
                            byFile[filePath].info++;
                            break;
                        case 3:
                            byFile[filePath].hints++;
                            break;
                    }
                }
            });
        }

        return {
            generatedAt: new Date(),
            workspacePath: workspace.workspaceFolders?.[0]?.uri.fsPath || '',
            statistics,
            byFile,
        };
    }

    /**
     * 更新文件诊断状态
     */
    updateFileState(uri: Uri, diagnosticCount: number): void {
        this.fileDiagnosticState.set(uri.toString(), {
            lastUpdated: new Date(),
            diagnosticCount,
        });
    }

    /**
     * 获取文件诊断状态
     */
    getFileState(uri: Uri): { lastUpdated: Date; diagnosticCount: number } | undefined {
        return this.fileDiagnosticState.get(uri.toString());
    }

    /**
     * 清理资源
     */
    dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
        this.diagnosticCollections.clear();
        this.fileDiagnosticState.clear();
        this.logger.info('WorkspaceDiagnosticManager disposed');
    }
}
