import { type ILogger } from '../../../core/interfaces/ILogger';
import { type IEventBus } from '../../../core/interfaces/IEventBus';
import { type IDataStoreService, type IDataStoreStatistics } from '../../../core/interfaces/IDataStoreService';
import { type IPerformanceMonitor } from '../../../core/interfaces/IPerformanceMonitor';
import { DataStatus } from '../../../core/types/DomainEvents';

/**
 * 数据缓存初始化器
 *
 * 负责执行初始扫描并初始化所有数据缓存（模板、翻译键、物品 ID、分类等）
 */
export class DataCacheInitializer {
    private completeInitialScan!: () => void;
    public readonly initialScanCompleted: Promise<void>;
    private disposed = false;
    private scanInProgress = false;

    constructor(
        private readonly logger: ILogger,
        private readonly eventBus: IEventBus,
        private readonly dataStoreService: IDataStoreService,
        private readonly performanceMonitor: IPerformanceMonitor,
        private readonly generateEventId: () => string,
        private readonly cacheWarmupFn?: () => Promise<void>,
    ) {
        this.initialScanCompleted = new Promise<void>((resolve) => {
            this.completeInitialScan = resolve;
        });
    }

    /**
     * 初始化数据缓存
     */
    async initialize(): Promise<void> {
        if (this.disposed) {
            return;
        }

        try {
            this.logger.info('Initializing data cache...');

            // 执行初始扫描（等待完成）
            await this.performInitialScan();
        } catch (error) {
            this.logger.error('Failed to start data cache initialization', error as Error);
        }
    }

    /**
     * 释放资源
     */
    dispose(): void {
        this.disposed = true;
        // 如果扫描正在进行，标记为已完成以解除等待
        if (this.scanInProgress) {
            this.completeInitialScan();
        }
        this.logger.debug('Data cache initializer disposed');
    }

    /**
     * 执行初始扫描
     */
    private async performInitialScan(): Promise<void> {
        if (this.disposed) {
            return;
        }

        this.scanInProgress = true;
        const timer = this.performanceMonitor.startTimer('extension.initialScan');
        try {
            this.logger.info('Performing initial data scan...');

            // 发布加载中状态
            await this.publishDataStatusEvent(DataStatus.Loading);

            if (this.disposed) {
                return;
            }

            // 使用 DataStoreService 统一初始化（模板 + 翻译 + 物品 + 分类）
            await this.dataStoreService.initialize();

            if (this.disposed) {
                return;
            }

            // 获取完整统计信息
            const stats = await this.dataStoreService.getStatistics();

            // 输出诊断报告
            this.outputDiagnostics(stats);

            // 预热关键缓存（后台执行，不阻塞主流程）
            this.warmupCaches().catch((error) => {
                this.logger.warn('Cache warmup failed', {
                    error: error instanceof Error ? error.message : String(error),
                });
            });

            // 发布扫描完成事件
            await this.publishScanCompletedEvent(stats);

            // 发布就绪状态
            await this.publishDataStatusEvent(DataStatus.Ready);
        } catch (error) {
            this.logger.error('Initial data scan failed', error as Error);

            // 发布数据状态变更事件，通知扫描失败
            await this.publishDataStatusEvent(
                DataStatus.Failed,
                error instanceof Error ? error.message : String(error),
            );
        } finally {
            timer.stop();
            this.scanInProgress = false;
            this.completeInitialScan();
        }
    }

    /**
     * 输出诊断报告
     */
    private outputDiagnostics(stats: IDataStoreStatistics): void {
        this.logger.info('Data cache initialized', {
            filesProcessed: stats.indexedFileCount,
            templateCount: stats.templateCount,
            translationKeyCount: stats.translationKeyCount,
            itemCount: stats.itemCount,
            categoryCount: stats.categoryCount,
            languageCount: stats.languageCount,
            namespaceCount: stats.namespaceCount,
        });
    }

    /**
     * 发布扫描完成事件
     */
    private async publishScanCompletedEvent(stats: IDataStoreStatistics): Promise<void> {
        if (this.disposed) {
            return;
        }

        await this.eventBus.publish('data.scan.completed', {
            id: this.generateEventId(),
            type: 'data.scan.completed',
            timestamp: new Date(),
            source: 'DataCacheInitializer',
            filesProcessed: stats.indexedFileCount,
            templatesFound: stats.templateCount,
            translationKeysFound: stats.translationKeyCount,
            itemsFound: stats.itemCount,
            categoriesFound: stats.categoryCount,
            languageCount: stats.languageCount,
            namespaceCount: stats.namespaceCount,
        });
    }

    /**
     * 发布数据状态变更事件
     */
    private async publishDataStatusEvent(status: DataStatus, error?: string): Promise<void> {
        if (this.disposed) {
            return;
        }

        await this.eventBus.publish('data.status.changed', {
            id: this.generateEventId(),
            type: 'data.status.changed',
            timestamp: new Date(),
            source: 'DataCacheInitializer',
            status,
            error,
        });
    }

    /**
     * 预热关键缓存
     *
     * 在初始化完成后预热各种缓存，提高首次补全响应速度
     */
    private async warmupCaches(): Promise<void> {
        if (this.disposed || !this.cacheWarmupFn) {
            return;
        }

        this.logger.info('Warming up caches...');
        const startTime = performance.now();

        try {
            await this.cacheWarmupFn();
        } catch (error) {
            this.logger.warn('Cache warmup failed', {
                error: error instanceof Error ? error.message : String(error),
            });
        }

        const duration = performance.now() - startTime;
        this.logger.info('Cache warmup completed', {
            duration: `${duration.toFixed(2)}ms`,
        });
    }
}
