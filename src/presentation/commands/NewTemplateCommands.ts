import { 
    commands, 
    ExtensionContext, 
    window,
    ProgressLocation
} from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { IDataStoreService } from '../../core/interfaces/IDataStoreService';
import { ILogger } from '../../core/interfaces/ILogger';
import { IEventBus } from '../../core/interfaces/IEventBus';
import { SERVICE_TOKENS, EVENT_TYPES } from '../../core/constants/ServiceTokens';
import { PerformanceMonitor } from '../../infrastructure/performance/PerformanceMonitor';

/**
 * 模板命令处理器
 * 
 * 处理所有模板相关的 VSCode 命令
 */
export class NewTemplateCommands {
    private readonly dataStoreService: IDataStoreService;
    private readonly logger: ILogger;
    private readonly eventBus: IEventBus;
    private readonly performanceMonitor: PerformanceMonitor;
    
    constructor() {
        this.dataStoreService = ServiceContainer.getService<IDataStoreService>(SERVICE_TOKENS.DataStoreService);
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild('Commands');
        this.eventBus = ServiceContainer.getService<IEventBus>(SERVICE_TOKENS.EventBus);
        this.performanceMonitor = ServiceContainer.getService<PerformanceMonitor>(SERVICE_TOKENS.PerformanceMonitor);
    }
    
    /**
     * 注册所有命令
     */
    registerCommands(context: ExtensionContext): void {
        const commandList = [
            {
                id: 'craftengine.rebuildCache',
                handler: this.rebuildCache.bind(this)
            },
            {
                id: 'craftengine.reloadMinecraftItems',
                handler: this.reloadMinecraftBuiltinItems.bind(this)
            }
        ];
        
        for (const cmd of commandList) {
            const disposable = commands.registerCommand(cmd.id, cmd.handler);
            context.subscriptions.push(disposable);
            
            this.logger.debug('Command registered', { commandId: cmd.id });
        }
        
        this.logger.info('All template commands registered', {
            count: commandList.length
        });
    }
    
    /**
     * 重建模板缓存
     */
    private async rebuildCache(): Promise<void> {
        const timer = this.performanceMonitor.startTimer('command.rebuildCache');
        
        try {
            this.logger.info('Rebuilding template cache');
            
            // 显示进度
            await window.withProgress({
                location: ProgressLocation.Notification,
                title: 'Rebuilding template cache...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: 'Scanning workspace...' });
                
                // 清空现有缓存并重新加载
                await this.dataStoreService.reload();
                progress.report({ increment: 100, message: 'Cache rebuild completed!' });
            });
            
            // 获取统计信息
            const stats = await this.dataStoreService.getStatistics();
            
            const message = `Cache rebuild completed! Found ${stats.templateCount} templates from ${stats.indexedFileCount} files.`;
            window.showInformationMessage(message);
            
            this.logger.info('Cache rebuild completed', {
                templateCount: stats.templateCount,
                fileCount: stats.indexedFileCount
            });
            
            // 发布事件
            await this.eventBus.publish(EVENT_TYPES.TemplateCacheRebuilt, {
                id: this.generateEventId(),
                type: EVENT_TYPES.TemplateCacheRebuilt,
                timestamp: new Date(),
                source: 'TemplateCommands',
                templateCount: stats.templateCount,
                duration: timer.getElapsed()
            });
            
        } catch (error) {
            this.logger.error('Error rebuilding cache', error as Error);
            window.showErrorMessage(`Cache rebuild failed: ${error}`);
        } finally {
            timer.stop();
        }
    }
    
    /**
     * 重新加载 Minecraft 内置物品列表
     */
    private async reloadMinecraftBuiltinItems(): Promise<void> {
        const timer = this.performanceMonitor.startTimer('command.reloadMinecraftItems');
        
        try {
            this.logger.info('Reloading Minecraft builtin items');
            
            // 显示进度
            await window.withProgress({
                location: ProgressLocation.Notification,
                title: 'Reloading Minecraft builtin items...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: 'Fetching latest Minecraft version...' });
                
                // 重新加载内置物品
                const loaded = await this.dataStoreService.reloadMinecraftBuiltinItems();
                
                progress.report({ increment: 100, message: 'Reload completed!' });
                
                if (!loaded) {
                    window.showWarningMessage('Failed to reload Minecraft builtin items. Check logs for details.');
                    return;
                }
            });
            
            // 获取统计信息
            const stats = await this.dataStoreService.getStatistics();
            
            const message = `Minecraft builtin items reloaded! Total items: ${stats.itemCount}`;
            window.showInformationMessage(message);
            
            this.logger.info('Minecraft builtin items reloaded', {
                itemCount: stats.itemCount,
                builtinLoaded: this.dataStoreService.isBuiltinItemsLoaded()
            });
            
        } catch (error) {
            this.logger.error('Error reloading Minecraft builtin items', error as Error);
            window.showErrorMessage(`Failed to reload Minecraft builtin items: ${error}`);
        } finally {
            timer.stop();
        }
    }
    
    /**
     * 生成事件ID
     */
    private generateEventId(): string {
        return `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }
}
