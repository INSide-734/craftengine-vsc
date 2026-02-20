import { type ExtensionContext } from 'vscode';
import {
    type IExtensionService,
    ExtensionState,
    type IExtensionStatistics,
} from '../../core/interfaces/IExtensionService';
import { type ILogger } from '../../core/interfaces/ILogger';
import { type IConfiguration } from '../../core/interfaces/IConfiguration';
import { type IEventBus } from '../../core/interfaces/IEventBus';
import { type IDataStoreService } from '../../core/interfaces/IDataStoreService';
import { type IFileWatcher } from '../../core/interfaces/IFileWatcher';
import { EVENT_TYPES } from '../../core/constants/ServiceTokens';
import { type IPerformanceMonitor } from '../../core/interfaces/IPerformanceMonitor';
import { generateEventId } from '../../core/utils';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import {
    ExtensionStatistics,
    ExtensionHealthChecker,
    ExtensionConfigurationManager,
    DataFileHandler,
    DataCacheInitializer,
    ExtensionEventListeners,
    ExtensionFileWatcherManager,
} from './extension';

/**
 * 扩展服务实现
 *
 * 作为应用层的核心服务，管理整个扩展的生命周期、状态和核心功能。
 * 协调各子模块的初始化、配置、文件监控和健康检查。
 *
 * @remarks
 * ExtensionService 的主要职责：
 * - 扩展生命周期管理（初始化、激活、停用）
 * - 状态管理和监控
 * - 子组件协调（统计、健康检查、配置管理等）
 * - 事件监听和发布
 * - 模板缓存管理
 * - 文件监控管理
 *
 * 该服务遵循组合模式，将复杂功能分解到多个子组件中：
 * - ExtensionStatistics: 统计信息管理
 * - ExtensionHealthChecker: 健康状态检查
 * - ExtensionConfigurationManager: 配置管理
 * - DataFileHandler: 数据文件处理（模板+翻译）
 * - DataCacheInitializer: 数据缓存初始化
 * - ExtensionEventListeners: 事件监听管理
 * - ExtensionFileWatcherManager: 文件监控管理
 *
 * @example
 * ```typescript
 * // 创建扩展服务实例
 * const extensionService = new ExtensionService(
 *     logger,
 *     configuration,
 *     eventBus,
 *     dataStoreService,
 *     fileWatcher,
 *     performanceMonitor
 * );
 *
 * // 初始化扩展
 * await extensionService.initialize(context);
 *
 * // 激活扩展
 * await extensionService.activate();
 *
 * // 获取扩展统计信息
 * const stats = await extensionService.getStatistics();
 * console.log(`Active templates: ${stats.activeTemplatesCount}`);
 *
 * // 检查健康状态
 * const health = await extensionService.checkHealth();
 * console.log(`Health status: ${health.healthy ? 'OK' : 'Error'}`);
 *
 * // 停用扩展
 * await extensionService.deactivate();
 * ```
 */
export class ExtensionService implements IExtensionService {
    /** 扩展当前状态 */
    private state: ExtensionState = ExtensionState.Inactive;
    /** VSCode 扩展上下文 */
    private context?: ExtensionContext;

    // 子组件
    private statistics!: ExtensionStatistics;
    private healthChecker!: ExtensionHealthChecker;
    private configManager!: ExtensionConfigurationManager;
    private fileHandler!: DataFileHandler;
    private cacheInitializer!: DataCacheInitializer;
    private eventListeners!: ExtensionEventListeners;
    private fileWatcherManager!: ExtensionFileWatcherManager;

    public readonly initialScanCompleted: Promise<void>;

    /**
     * 构造扩展服务
     *
     * @param logger 日志记录器
     * @param configuration 配置管理器
     * @param eventBus 事件总线
     * @param dataStoreService 数据存储服务（统一管理模板和翻译）
     * @param fileWatcher 文件监控器
     * @param performanceMonitor 性能监控器
     */
    constructor(
        private readonly logger: ILogger,
        private readonly configuration: IConfiguration,
        private readonly eventBus: IEventBus,
        private readonly dataStoreService: IDataStoreService,
        private readonly fileWatcher: IFileWatcher,
        private readonly performanceMonitor: IPerformanceMonitor,
    ) {
        // 初始化子组件
        this.initializeComponents();

        // 代理初始扫描完成的 Promise
        this.initialScanCompleted = this.cacheInitializer.initialScanCompleted;
    }

    /**
     * 初始化子组件
     */
    private initializeComponents(): void {
        // 统计管理器
        this.statistics = new ExtensionStatistics(this.performanceMonitor, this.logger.createChild('Statistics'));

        // 健康检查器
        this.healthChecker = new ExtensionHealthChecker(
            this.logger.createChild('HealthChecker'),
            this.configuration,
            this.dataStoreService,
            this.fileWatcher,
        );

        // 配置管理器
        this.configManager = new ExtensionConfigurationManager(
            this.logger.createChild('ConfigurationManager'),
            this.configuration,
            this.eventBus,
            generateEventId,
        );

        // 数据文件处理器（统一处理模板和翻译）
        this.fileHandler = new DataFileHandler(
            this.logger.createChild('DataFileHandler'),
            this.eventBus,
            this.dataStoreService,
            generateEventId,
        );

        // 数据缓存初始化器
        this.cacheInitializer = new DataCacheInitializer(
            this.logger.createChild('DataCacheInitializer'),
            this.eventBus,
            this.dataStoreService,
            this.performanceMonitor,
            generateEventId,
            () => this.warmupCaches(),
        );

        // 事件监听器管理器
        this.eventListeners = new ExtensionEventListeners(
            this.logger.createChild('EventListeners'),
            this.eventBus,
            this.statistics,
        );

        // 文件监控管理器
        this.fileWatcherManager = new ExtensionFileWatcherManager(
            this.logger.createChild('FileWatcherManager'),
            this.configuration,
            this.fileWatcher,
            this.fileHandler,
        );
    }

    /**
     * 初始化扩展
     */
    async initialize(context: ExtensionContext): Promise<void> {
        const timer = this.performanceMonitor.startTimer('extension.initialize');

        try {
            this.state = ExtensionState.Initializing;
            this.context = context;

            this.logger.info('Initializing CraftEngine extension');

            // 1. 初始化配置
            await this.configManager.initialize();

            // 2. 设置文件监控
            await this.fileWatcherManager.setup();

            // 3. 设置事件监听器
            this.eventListeners.setup();

            // 4. 初始化数据缓存（模板 + 翻译）
            await this.cacheInitializer.initialize();

            this.logger.info('CraftEngine extension initialized successfully');
        } catch (error) {
            this.state = ExtensionState.Error;
            this.logger.error('Failed to initialize extension', error as Error);
            throw error;
        } finally {
            timer.stop();
        }
    }

    /**
     * 激活扩展
     */
    async activate(): Promise<void> {
        const timer = this.performanceMonitor.startTimer('extension.activate');

        try {
            if (this.state !== ExtensionState.Initializing) {
                throw new Error(`Cannot activate from state: ${this.state}`);
            }

            this.state = ExtensionState.Active;
            const activationTime = new Date();

            // 设置激活时间
            this.statistics.setActivationTime(activationTime);

            this.logger.info('CraftEngine extension activated', {
                activationTime: activationTime.toISOString(),
            });

            // 发布激活事件
            await this.eventBus.publish(EVENT_TYPES.ExtensionActivated, {
                id: generateEventId(),
                type: EVENT_TYPES.ExtensionActivated,
                timestamp: activationTime,
                source: 'ExtensionService',
                activationTime: timer.getElapsed(),
            });
        } catch (error) {
            this.state = ExtensionState.Error;
            this.logger.error('Failed to activate extension', error as Error);
            throw error;
        } finally {
            timer.stop();
        }
    }

    /**
     * 停用扩展
     */
    async deactivate(): Promise<void> {
        try {
            this.state = ExtensionState.Deactivating;

            // 按依赖顺序逆序释放子组件
            // 1. 先停止事件监听，避免在清理过程中触发事件
            this.eventListeners.dispose();

            // 2. 停止文件监控
            this.fileWatcherManager.dispose();

            // 3. 停止缓存初始化器（可能有进行中的扫描）
            this.cacheInitializer.dispose();

            // 4. 停止文件处理器
            this.fileHandler.dispose();

            // 5. 停止配置管理器
            this.configManager.dispose();

            // 6. 停止健康检查器
            this.healthChecker.dispose();

            // 7. 停止统计管理器
            this.statistics.dispose();

            // 8. 最后清理文件监控器
            this.fileWatcher.dispose();

            this.state = ExtensionState.Inactive;

            this.logger.info('CraftEngine extension deactivated');
        } catch (error) {
            this.logger.error('Error during extension deactivation', error as Error);
            throw error;
        }
    }

    /**
     * 获取扩展状态
     */
    getState(): ExtensionState {
        return this.state;
    }

    /**
     * 获取统计信息
     */
    getStatistics(): IExtensionStatistics {
        return this.statistics.getStatistics();
    }

    /**
     * 重启扩展
     */
    async restart(): Promise<void> {
        this.logger.info('Restarting CraftEngine extension');

        if (this.state === ExtensionState.Active) {
            await this.deactivate();
        }

        if (this.context) {
            await this.initialize(this.context);
            await this.activate();
        } else {
            throw new Error('Cannot restart: no context available');
        }

        this.logger.info('CraftEngine extension restarted');
    }

    /**
     * 检查扩展健康状态
     */
    async checkHealth(): Promise<boolean> {
        return this.healthChecker.checkHealth(this.state);
    }

    /**
     * 预热关键缓存
     *
     * 由 DataCacheInitializer 回调调用，在 Application 层桥接 Infrastructure 服务
     */
    private async warmupCaches(): Promise<void> {
        const results = await Promise.allSettled([this.warmupWorkspaceScanCache(), this.warmupSchemaCache()]);

        const successCount = results.filter((r) => r.status === 'fulfilled').length;
        this.logger.debug('Cache warmup results', { successCount, totalCount: results.length });
    }

    private async warmupWorkspaceScanCache(): Promise<void> {
        const cache = ServiceContainer.tryGetService<{ warmup(): Promise<void> }>(SERVICE_TOKENS.WorkspaceScanCache);
        if (cache) {
            await cache.warmup();
        }
    }

    private async warmupSchemaCache(): Promise<void> {
        const commonPaths = ['items', 'templates', 'categories', 'events', 'recipes'];
        const schemaService = ServiceContainer.tryGetService<{ getSchemaForPath(path: string[]): Promise<unknown> }>(
            SERVICE_TOKENS.SchemaService,
        );
        if (schemaService) {
            await Promise.all(commonPaths.map((path) => schemaService.getSchemaForPath([path]).catch(() => {})));
        }
    }
}
