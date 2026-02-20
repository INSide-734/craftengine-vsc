import { type IExtensionStatistics } from '../../../core/interfaces/IExtensionService';
import { type IPerformanceMonitor } from '../../../core/interfaces/IPerformanceMonitor';
import { type ILogger } from '../../../core/interfaces/ILogger';

/**
 * 扩展统计信息管理器
 *
 * 负责收集和管理扩展的运行时统计信息
 */
export class ExtensionStatistics {
    private activationTime?: Date;
    private processedDocumentsCount: number = 0;
    private completionsProvidedCount: number = 0;
    private disposed = false;

    constructor(
        private readonly performanceMonitor: IPerformanceMonitor,
        private readonly logger: ILogger,
    ) {}

    /**
     * 设置激活时间
     */
    setActivationTime(time: Date): void {
        this.activationTime = time;
    }

    /**
     * 获取激活时间
     */
    getActivationTime(): Date | undefined {
        return this.activationTime;
    }

    /**
     * 增加已处理文档计数
     */
    incrementProcessedDocuments(): void {
        if (this.disposed) {
            return;
        }
        this.processedDocumentsCount++;
        this.logger.debug('Document processed', {
            totalDocuments: this.processedDocumentsCount,
        });
    }

    /**
     * 增加已提供补全计数
     */
    incrementCompletionsProvided(): void {
        if (this.disposed) {
            return;
        }
        this.completionsProvidedCount++;
        this.logger.debug('Completion provided', {
            totalCompletions: this.completionsProvidedCount,
        });
    }

    /**
     * 重置统计计数器
     */
    reset(): void {
        this.processedDocumentsCount = 0;
        this.completionsProvidedCount = 0;
        this.logger.debug('Statistics reset');
    }

    /**
     * 释放资源
     */
    dispose(): void {
        this.disposed = true;
        this.reset();
        this.logger.debug('Statistics disposed');
    }

    /**
     * 获取统计信息
     */
    getStatistics(): IExtensionStatistics {
        const now = Date.now();
        const uptime = this.activationTime ? now - this.activationTime.getTime() : 0;

        return {
            activationTime: this.activationTime || new Date(),
            uptime,
            memoryUsage: this.getMemoryUsage(),
            processedDocuments: this.processedDocumentsCount,
            completionsProvided: this.completionsProvidedCount,
            cacheHitRate: this.getCacheHitRate(),
        };
    }

    /**
     * 获取内存使用情况
     */
    private getMemoryUsage(): number {
        if (typeof process !== 'undefined' && process.memoryUsage) {
            return process.memoryUsage().heapUsed;
        }
        return 0;
    }

    /**
     * 获取缓存命中率
     */
    private getCacheHitRate(): number | undefined {
        try {
            // 从性能监控器获取所有操作统计
            const allStats = this.performanceMonitor.getAllOperationStatistics();

            // 查找缓存相关的操作统计
            let cacheHits = 0;
            let cacheTotal = 0;

            for (const [operationName, stats] of Object.entries(allStats)) {
                if (operationName.includes('cache')) {
                    // 假设缓存操作中，成功的操作（非错误）是缓存命中
                    const hits = stats.count - stats.errors;
                    cacheHits += hits;
                    cacheTotal += stats.count;
                }
            }

            if (cacheTotal === 0) {
                // 没有缓存统计数据时返回 undefined 表示无数据
                return undefined;
            }

            return cacheHits / cacheTotal;
        } catch (error) {
            this.logger.warn('Failed to get cache hit rate', {
                error: (error as Error).message,
            });
            return undefined; // 出错时返回 undefined 而非虚假数据
        }
    }
}
