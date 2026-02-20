import { window, type Diagnostic, DiagnosticSeverity, type Uri, type TextDocument } from 'vscode';
import { ServiceContainer } from '../infrastructure/ServiceContainer';
import { type ILogger } from '../core/interfaces/ILogger';
import { type IEventBus } from '../core/interfaces/IEventBus';
import { SERVICE_TOKENS } from '../core/constants/ServiceTokens';
import { generateEventId } from '../infrastructure/utils/IdGenerator';

/**
 * 错误通知管理器
 *
 * 管理用户友好的错误通知，避免通知疲劳
 */
export class ErrorNotificationManager {
    private readonly logger: ILogger;
    private readonly eventBus: IEventBus;

    // 通知防抖和去重
    private readonly notificationHistory = new Map<string, number>();
    private readonly notificationThrottleMs = 5000; // 5秒内相同通知只显示一次
    private errorCount = 0;
    private warningCount = 0;

    // 事件订阅（用于 dispose 时清理）
    private readonly subscriptions: Array<{ unsubscribe: () => void }> = [];

    // 防止重复设置事件监听
    private eventListenersSetup = false;

    constructor() {
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild(
            'ErrorNotificationManager',
        );
        this.eventBus = ServiceContainer.getService<IEventBus>(SERVICE_TOKENS.EventBus);

        this.setupEventListeners();
    }

    /**
     * 处理诊断更新，显示重要错误通知
     */
    async handleDiagnosticsUpdate(uri: Uri, diagnostics: Diagnostic[]): Promise<void> {
        try {
            // 统计错误和警告
            const errors = diagnostics.filter((d) => d.severity === DiagnosticSeverity.Error);
            const warnings = diagnostics.filter((d) => d.severity === DiagnosticSeverity.Warning);

            this.errorCount = errors.length;
            this.warningCount = warnings.length;

            // 发布统计事件（用于状态栏更新）
            await this.eventBus.publish('diagnostics.statistics', {
                id: generateEventId('notif'),
                type: 'diagnostics.statistics',
                timestamp: new Date(),
                source: 'ErrorNotificationManager',
                uri,
                errorCount: this.errorCount,
                warningCount: this.warningCount,
            });

            // 显示严重错误通知
            await this.notifyCriticalErrors(uri, errors);

            // 显示首次警告通知
            await this.notifyFirstTimeWarnings(uri, warnings);
        } catch (error) {
            this.logger.error('Error handling diagnostics update', error as Error);
        }
    }

    /**
     * 显示严重错误通知
     */
    private async notifyCriticalErrors(uri: Uri, errors: Diagnostic[]): Promise<void> {
        if (errors.length === 0) {
            return;
        }

        // 识别严重错误
        const criticalErrors = errors.filter(
            (e) =>
                e.code === 'unknown_template' || e.code === 'syntax-error' || e.code === 'missing_required_parameter',
        );

        if (criticalErrors.length === 0) {
            return;
        }

        // 防止重复通知
        const notificationKey = `critical_${uri.fsPath}_${criticalErrors.length}`;
        if (this.shouldThrottleNotification(notificationKey)) {
            return;
        }

        // 显示通知
        const fileName = this.getFileName(uri);
        const message = this.buildErrorMessage(fileName, criticalErrors);

        const action = await window.showErrorMessage(message, 'View Problems', 'Ignore');

        await this.handleNotificationAction(action, uri, criticalErrors);

        this.logger.info('Critical error notification shown', {
            file: uri.fsPath,
            errorCount: criticalErrors.length,
        });
    }

    /**
     * 显示首次警告通知
     */
    private async notifyFirstTimeWarnings(uri: Uri, warnings: Diagnostic[]): Promise<void> {
        if (warnings.length === 0) {
            return;
        }

        // 只对第一次出现的警告显示通知
        const notificationKey = `warning_first_time_${uri.fsPath}`;
        if (this.notificationHistory.has(notificationKey)) {
            return;
        }

        this.notificationHistory.set(notificationKey, Date.now());

        const fileName = this.getFileName(uri);
        const message = `${fileName} has ${warnings.length} warning${warnings.length > 1 ? 's' : ''}`;

        const action = await window.showWarningMessage(message, 'View Warnings', "Don't Show Again");

        if (action === 'View Warnings') {
            await this.showProblemsPanel();
        } else if (action === "Don't Show Again") {
            // 永久记录
            this.notificationHistory.set(notificationKey, Number.MAX_SAFE_INTEGER);
        }
    }

    /**
     * 显示单个错误的详细通知
     */
    async showErrorDetails(diagnostic: Diagnostic, document: TextDocument): Promise<void> {
        const fileName = this.getFileName(document.uri);
        const line = diagnostic.range.start.line + 1;

        // 构建详细消息
        const details = this.buildDiagnosticDetails(diagnostic);

        const message = `${fileName}:${line}\n\n${details}`;

        const action = await window.showErrorMessage(message, { modal: true }, 'Go to Error', 'Copy Error Info');

        await this.handleDetailedAction(action, diagnostic, document);
    }

    /**
     * 显示成功通知
     */
    async showSuccessNotification(message: string): Promise<void> {
        window.showInformationMessage(`✅ ${message}`);
    }

    /**
     * 显示提示通知
     */
    async showHintNotification(message: string, actions?: string[]): Promise<string | undefined> {
        if (actions) {
            return window.showInformationMessage(`💡 ${message}`, ...actions);
        } else {
            window.showInformationMessage(`💡 ${message}`);
            return undefined;
        }
    }

    /**
     * 构建错误消息
     */
    private buildErrorMessage(fileName: string, errors: Diagnostic[]): string {
        if (errors.length === 1) {
            const error = errors[0];
            const line = error.range.start.line + 1;
            return `${fileName}:${line} - ${error.message}`;
        } else {
            const firstError = errors[0];
            const line = firstError.range.start.line + 1;
            return `${fileName} has ${errors.length} error${errors.length > 1 ? 's' : ''} (first at line ${line})`;
        }
    }

    /**
     * 构建诊断详情
     */
    private buildDiagnosticDetails(diagnostic: Diagnostic): string {
        const parts: string[] = [];

        // 错误类型
        const severity = this.getSeverityText(diagnostic.severity);
        parts.push(`Type: ${severity}`);

        // 错误代码
        if (diagnostic.code) {
            parts.push(`Code: ${diagnostic.code}`);
        }

        // 错误消息
        parts.push(`\n${diagnostic.message}`);

        // 来源
        if (diagnostic.source) {
            parts.push(`\nSource: ${diagnostic.source}`);
        }

        // 相关信息
        if (diagnostic.relatedInformation && diagnostic.relatedInformation.length > 0) {
            parts.push('\nRelated Information:');
            diagnostic.relatedInformation.forEach((info) => {
                const relatedFile = this.getFileName(info.location.uri);
                const relatedLine = info.location.range.start.line + 1;
                parts.push(`  - ${relatedFile}:${relatedLine}: ${info.message}`);
            });
        }

        return parts.join('\n');
    }

    /**
     * 处理通知操作
     */
    private async handleNotificationAction(
        action: string | undefined,
        uri: Uri,
        diagnostics: Diagnostic[],
    ): Promise<void> {
        switch (action) {
            case 'View Problems':
                await this.showProblemsPanel();
                // 打开文档并跳转到第一个错误
                if (diagnostics.length > 0) {
                    await this.navigateToDiagnostic(uri, diagnostics[0]);
                }
                break;

            case 'Ignore':
                // 记录忽略
                this.logger.debug('User ignored error notification', {
                    file: uri.fsPath,
                    errorCount: diagnostics.length,
                });
                break;
        }
    }

    /**
     * 处理详细操作
     */
    private async handleDetailedAction(
        action: string | undefined,
        diagnostic: Diagnostic,
        document: TextDocument,
    ): Promise<void> {
        switch (action) {
            case 'Go to Error':
                await this.navigateToDiagnostic(document.uri, diagnostic);
                break;

            case 'Copy Error Info':
                await this.copyDiagnosticToClipboard(diagnostic);
                window.showInformationMessage('Error information copied to clipboard');
                break;
        }
    }

    /**
     * 跳转到诊断位置
     */
    private async navigateToDiagnostic(uri: Uri, diagnostic: Diagnostic): Promise<void> {
        const document = await window.showTextDocument(uri);
        const position = diagnostic.range.start;
        document.selection = new (await import('vscode')).Selection(position, position);
        document.revealRange(diagnostic.range);
    }

    /**
     * 显示问题面板
     */
    private async showProblemsPanel(): Promise<void> {
        await import('vscode').then((vscode) => vscode.commands.executeCommand('workbench.actions.view.problems'));
    }

    /**
     * 复制诊断信息到剪贴板
     */
    private async copyDiagnosticToClipboard(diagnostic: Diagnostic): Promise<void> {
        const details = this.buildDiagnosticDetails(diagnostic);
        await import('vscode').then((vscode) => vscode.env.clipboard.writeText(details));
    }

    /**
     * 检查是否应该节流通知
     */
    private shouldThrottleNotification(key: string): boolean {
        const lastTime = this.notificationHistory.get(key);
        const now = Date.now();

        if (lastTime && now - lastTime < this.notificationThrottleMs) {
            return true;
        }

        this.notificationHistory.set(key, now);
        return false;
    }

    /**
     * 获取文件名
     */
    private getFileName(uri: Uri): string {
        const parts = uri.fsPath.split(/[\\/]/);
        return parts[parts.length - 1];
    }

    /**
     * 获取严重性文本
     */
    private getSeverityText(severity: DiagnosticSeverity | undefined): string {
        const severityMap: Record<DiagnosticSeverity, string> = {
            [DiagnosticSeverity.Error]: 'Error',
            [DiagnosticSeverity.Warning]: 'Warning',
            [DiagnosticSeverity.Information]: 'Information',
            [DiagnosticSeverity.Hint]: 'Hint',
        };
        return severity !== undefined ? (severityMap[severity] ?? 'Unknown') : 'Unknown';
    }

    /**
     * 设置事件监听
     */
    private setupEventListeners(): void {
        // 防止重复订阅
        if (this.eventListenersSetup) {
            this.logger.warn('Event listeners already setup, skipping');
            return;
        }

        // 监听诊断更新事件
        const sub = this.eventBus.subscribe('diagnostics.updated', (event: unknown) => {
            const evt = event as Record<string, unknown>;
            this.logger.debug('Diagnostics update event received', {
                uri: (evt.uri as { fsPath?: string })?.fsPath,
                count: evt.diagnosticCount as number,
            });
        });
        this.subscriptions.push(sub);

        this.eventListenersSetup = true;
    }

    /**
     * 获取错误统计
     */
    getErrorStatistics(): { errorCount: number; warningCount: number } {
        return {
            errorCount: this.errorCount,
            warningCount: this.warningCount,
        };
    }

    /**
     * 清除通知历史
     */
    clearNotificationHistory(): void {
        this.notificationHistory.clear();
        this.logger.debug('Notification history cleared');
    }

    /**
     * 清理资源
     *
     * 取消事件订阅并清除通知历史
     */
    dispose(): void {
        for (const sub of this.subscriptions) {
            sub.unsubscribe();
        }
        this.subscriptions.length = 0;
        this.notificationHistory.clear();
        this.eventListenersSetup = false;
        this.logger.debug('ErrorNotificationManager disposed');
    }
}
