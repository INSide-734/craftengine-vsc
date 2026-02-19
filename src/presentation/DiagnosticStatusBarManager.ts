import { StatusBarItem, StatusBarAlignment, window, ThemeColor } from 'vscode';
import { ServiceContainer } from '../infrastructure/ServiceContainer';
import { ILogger } from '../core/interfaces/ILogger';
import { IEventBus } from '../core/interfaces/IEventBus';
import { SERVICE_TOKENS, EVENT_TYPES } from '../core/constants/ServiceTokens';

/**
 * 诊断状态栏管理器
 * 
 * 在状态栏显示错误和警告的统计信息
 */
export class DiagnosticStatusBarManager {
    private readonly statusBarItem: StatusBarItem;
    private readonly logger: ILogger;
    private readonly eventBus: IEventBus;

    // 事件订阅（用于 dispose 时清理）
    private readonly subscriptions: Array<{ unsubscribe: () => void }> = [];

    private errorCount = 0;
    private warningCount = 0;
    private isActive = false;
    
    constructor() {
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild('StatusBarManager');
        this.eventBus = ServiceContainer.getService<IEventBus>(SERVICE_TOKENS.EventBus);
        
        // 创建状态栏项
        this.statusBarItem = window.createStatusBarItem(
            StatusBarAlignment.Left,
            100
        );
        
        // 设置命令（点击时显示问题面板）
        this.statusBarItem.command = 'workbench.actions.view.problems';
        this.statusBarItem.name = 'CraftEngine Diagnostics';
        
        this.setupEventListeners();
        this.updateDisplay();
    }
    
    /**
     * 更新错误统计
     */
    updateStatistics(errorCount: number, warningCount: number): void {
        this.errorCount = errorCount;
        this.warningCount = warningCount;
        this.isActive = errorCount > 0 || warningCount > 0;
        
        this.updateDisplay();
        
        this.logger.debug('Diagnostic statistics updated', {
            errorCount,
            warningCount,
            isActive: this.isActive
        });
    }
    
    /**
     * 更新显示
     */
    private updateDisplay(): void {
        if (!this.isActive) {
            // 无错误或警告时隐藏
            this.statusBarItem.hide();
            return;
        }
        
        // 构建显示文本
        const parts: string[] = [];
        
        if (this.errorCount > 0) {
            parts.push(`$(error) ${this.errorCount}`);
        }
        
        if (this.warningCount > 0) {
            parts.push(`$(warning) ${this.warningCount}`);
        }
        
        this.statusBarItem.text = `$(symbol-class) CraftEngine: ${parts.join(' ')}`;
        
        // 设置工具提示
        this.statusBarItem.tooltip = this.buildTooltip();
        
        // 设置颜色
        if (this.errorCount > 0) {
            this.statusBarItem.backgroundColor = new ThemeColor('statusBarItem.errorBackground');
            this.statusBarItem.color = new ThemeColor('statusBarItem.errorForeground');
        } else if (this.warningCount > 0) {
            this.statusBarItem.backgroundColor = new ThemeColor('statusBarItem.warningBackground');
            this.statusBarItem.color = new ThemeColor('statusBarItem.warningForeground');
        } else {
            this.statusBarItem.backgroundColor = undefined;
            this.statusBarItem.color = undefined;
        }
        
        this.statusBarItem.show();
    }
    
    /**
     * 构建工具提示
     */
    private buildTooltip(): string {
        const parts: string[] = ['CraftEngine Template Diagnostics'];
        
        if (this.errorCount > 0) {
            parts.push(`\n❌ ${this.errorCount} error${this.errorCount > 1 ? 's' : ''}`);
        }
        
        if (this.warningCount > 0) {
            parts.push(`\n⚠️  ${this.warningCount} warning${this.warningCount > 1 ? 's' : ''}`);
        }
        
        parts.push('\n\nClick to view problems panel');
        
        return parts.join('');
    }
    
    /**
     * 显示临时消息
     */
    showTemporaryMessage(message: string, duration: number = 3000): void {
        const originalText = this.statusBarItem.text;
        const originalTooltip = this.statusBarItem.tooltip;
        
        this.statusBarItem.text = `$(info) ${message}`;
        this.statusBarItem.tooltip = message;
        
        setTimeout(() => {
            this.statusBarItem.text = originalText;
            this.statusBarItem.tooltip = originalTooltip;
        }, duration);
    }
    
    /**
     * 显示加载状态
     */
    showLoading(message: string): void {
        this.statusBarItem.text = `$(loading~spin) ${message}`;
        this.statusBarItem.tooltip = message;
        this.statusBarItem.show();
    }
    
    /**
     * 显示成功消息
     */
    showSuccess(message: string, duration: number = 2000): void {
        this.statusBarItem.text = `$(check) ${message}`;
        this.statusBarItem.tooltip = message;
        this.statusBarItem.backgroundColor = new ThemeColor('statusBarItem.prominentBackground');
        this.statusBarItem.show();
        
        setTimeout(() => {
            this.updateDisplay();
        }, duration);
    }
    
    /**
     * 设置事件监听
     */
    private setupEventListeners(): void {
        // 监听诊断统计事件
        this.subscriptions.push(this.eventBus.subscribe('diagnostics.statistics', (event: unknown) => {
            const evt = event as Record<string, unknown>;
            const errorCount = typeof evt.errorCount === 'number' ? evt.errorCount : 0;
            const warningCount = typeof evt.warningCount === 'number' ? evt.warningCount : 0;
            this.updateStatistics(errorCount, warningCount);
        }));

        // 监听模板扫描事件
        this.subscriptions.push(this.eventBus.subscribe('template.scan.started', () => {
            this.showLoading('Scanning templates...');
        }));

        this.subscriptions.push(this.eventBus.subscribe('template.scan.completed', () => {
            this.showSuccess('Template scan completed');
        }));

        // 监听模板缓存重建事件
        this.subscriptions.push(this.eventBus.subscribe('template.cache.rebuilding', () => {
            this.showLoading('Rebuilding cache...');
        }));

        this.subscriptions.push(this.eventBus.subscribe(EVENT_TYPES.TemplateCacheRebuilt, () => {
            this.showSuccess('Cache rebuilt');
        }));
    }
    
    /**
     * 清理资源
     */
    dispose(): void {
        // 取消所有事件订阅
        for (const sub of this.subscriptions) {
            sub.unsubscribe();
        }
        this.subscriptions.length = 0;

        this.statusBarItem.dispose();
        this.logger.debug('Status bar manager disposed');
    }
}