import { type ILogger } from '../../core/interfaces/ILogger';
import { type IEventBus } from '../../core/interfaces/IEventBus';
import { type IConfiguration, type IConfigurationChangeEvent } from '../../core/interfaces/IConfiguration';
import { EVENT_TYPES } from '../../core/constants/ServiceTokens';

/**
 * 性能指标接口
 */
export interface IPerformanceMetric {
    name: string;
    value: number;
    unit: string;
    timestamp: Date;
    tags?: Record<string, string>;
}

/**
 * 性能统计信息
 */
export interface IPerformanceStatistics {
    totalOperations: number;
    averageResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    errorRate: number;
    memoryUsage: number;
    uptime: number;
}

/**
 * 性能监控器接口
 */
export interface IPerformanceMonitor {
    /**
     * 开始计时
     */
    startTimer(operationName: string): IPerformanceTimer;

    /**
     * 记录指标
     */
    recordMetric(metric: IPerformanceMetric): void;

    /**
     * 获取统计信息
     */
    getStatistics(): IPerformanceStatistics;

    /**
     * 清除历史数据
     */
    clearHistory(): void;

    /**
     * 开启/关闭监控
     */
    setEnabled(enabled: boolean): void;
}

/**
 * 性能计时器接口
 */
export interface IPerformanceTimer {
    /**
     * 停止计时并记录
     */
    stop(tags?: Record<string, string>): number;

    /**
     * 获取经过的时间（毫秒）
     */
    getElapsed(): number;
}

/**
 * 性能计时器实现
 */
class PerformanceTimer implements IPerformanceTimer {
    private readonly startTime: number;

    constructor(
        private readonly operationName: string,
        private readonly monitor: PerformanceMonitor,
    ) {
        this.startTime = performance.now();
    }

    stop(tags?: Record<string, string>): number {
        const elapsed = this.getElapsed();

        this.monitor.recordMetric({
            name: this.operationName,
            value: elapsed,
            unit: 'ms',
            timestamp: new Date(),
            tags,
        });

        return elapsed;
    }

    getElapsed(): number {
        return performance.now() - this.startTime;
    }
}

/**
 * 性能监控器实现
 */
export class PerformanceMonitor implements IPerformanceMonitor {
    /** 环形缓冲区存储性能指标 */
    private metrics: IPerformanceMetric[];
    private metricsHead = 0;
    private metricsSize = 0;
    private readonly operationStats = new Map<
        string,
        {
            count: number;
            totalTime: number;
            minTime: number;
            maxTime: number;
            errors: number;
        }
    >();

    private enabled = true;
    private maxHistorySize = 1000;
    private startTime = Date.now();
    private configuration?: IConfiguration;
    private performanceThresholds: Record<string, number> = {
        'template.parse': 100, // 100ms
        'template.completion': 50, // 50ms
        'cache.rebuild': 5000, // 5s
        'file.scan': 200, // 200ms
    };

    constructor(
        private readonly logger?: ILogger,
        private readonly eventBus?: IEventBus,
    ) {
        this.metrics = new Array(this.maxHistorySize);
    }

    /**
     * 延迟注入配置服务，避免循环依赖
     *
     * 在 ServiceContainer 注册完成后调用此方法，将配置服务注入到性能监控器中。
     *
     * @param config - 配置管理器实例
     */
    setConfiguration(config: IConfiguration): void {
        this.configuration = config;

        // 从配置读取性能监控开关
        this.enabled = this.configuration.get('performance.monitoring', false);

        this.logger?.info('Performance monitoring initialized', { enabled: this.enabled });

        // 监听配置变更
        this.configuration.onChange((event: IConfigurationChangeEvent) => {
            if (event.key === 'performance.monitoring') {
                this.setEnabled(event.newValue as boolean);
            }
        });
    }

    startTimer(operationName: string): IPerformanceTimer {
        return new PerformanceTimer(operationName, this);
    }

    recordMetric(metric: IPerformanceMetric): void {
        if (!this.enabled) {
            return;
        }

        // 添加到环形缓冲区（O(1)）
        const index = (this.metricsHead + this.metricsSize) % this.maxHistorySize;
        this.metrics[index] = metric;
        if (this.metricsSize < this.maxHistorySize) {
            this.metricsSize++;
        } else {
            this.metricsHead = (this.metricsHead + 1) % this.maxHistorySize;
        }

        // 更新操作统计
        this.updateOperationStats(metric);

        // 记录日志
        this.logger?.debug('Performance metric recorded', {
            metric: metric.name,
            value: metric.value,
            unit: metric.unit,
            tags: metric.tags,
        });

        // 发布事件
        void this.eventBus?.publish(EVENT_TYPES.PerformanceMetric, metric);

        // 检查性能阈值
        this.checkPerformanceThresholds(metric);
    }

    getStatistics(): IPerformanceStatistics {
        const now = Date.now();
        const uptime = now - this.startTime;

        let totalOperations = 0;
        let totalTime = 0;
        let minTime = Infinity;
        let maxTime = 0;
        let totalErrors = 0;

        for (const stats of this.operationStats.values()) {
            totalOperations += stats.count;
            totalTime += stats.totalTime;
            minTime = Math.min(minTime, stats.minTime);
            maxTime = Math.max(maxTime, stats.maxTime);
            totalErrors += stats.errors;
        }

        const averageResponseTime = totalOperations > 0 ? totalTime / totalOperations : 0;
        const errorRate = totalOperations > 0 ? totalErrors / totalOperations : 0;
        const memoryUsage = this.getMemoryUsage();

        return {
            totalOperations,
            averageResponseTime,
            minResponseTime: minTime === Infinity ? 0 : minTime,
            maxResponseTime: maxTime,
            errorRate,
            memoryUsage,
            uptime,
        };
    }

    clearHistory(): void {
        this.metrics = new Array(this.maxHistorySize);
        this.metricsHead = 0;
        this.metricsSize = 0;
        this.operationStats.clear();
        this.startTime = Date.now();

        this.logger?.info('Performance history cleared');
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        this.logger?.info('Performance monitoring', { enabled });
    }

    /**
     * 设置性能阈值
     */
    setPerformanceThresholds(thresholds: Record<string, number>): void {
        this.performanceThresholds = thresholds;
    }

    /**
     * 设置最大历史记录大小
     */
    setMaxHistorySize(size: number): void {
        const oldMetrics: IPerformanceMetric[] = [];
        // 提取现有指标（按时间顺序）
        for (let i = 0; i < this.metricsSize; i++) {
            oldMetrics.push(this.metrics[(this.metricsHead + i) % this.metrics.length]);
        }

        this.maxHistorySize = size;
        this.metrics = new Array(size);
        this.metricsHead = 0;

        // 保留最近的指标
        const kept = oldMetrics.slice(-size);
        this.metricsSize = kept.length;
        for (let i = 0; i < kept.length; i++) {
            this.metrics[i] = kept[i];
        }
    }

    /**
     * 获取指定操作的统计信息
     */
    getOperationStatistics(
        operationName: string,
    ): { count: number; totalTime: number; minTime: number; maxTime: number; errors: number } | undefined {
        const stats = this.operationStats.get(operationName);
        return stats ? { ...stats } : undefined;
    }

    /**
     * 获取所有操作的统计信息
     */
    getAllOperationStatistics(): Record<
        string,
        { count: number; totalTime: number; minTime: number; maxTime: number; errors: number }
    > {
        const result: Record<
            string,
            { count: number; totalTime: number; minTime: number; maxTime: number; errors: number }
        > = {};
        for (const [name, stats] of this.operationStats) {
            result[name] = { ...stats };
        }
        return result;
    }

    /**
     * 更新操作统计
     */
    private updateOperationStats(metric: IPerformanceMetric): void {
        if (!this.operationStats.has(metric.name)) {
            this.operationStats.set(metric.name, {
                count: 0,
                totalTime: 0,
                minTime: Infinity,
                maxTime: 0,
                errors: 0,
            });
        }

        const stats = this.operationStats.get(metric.name);
        if (!stats) {
            return;
        }
        stats.count++;
        stats.totalTime += metric.value;
        stats.minTime = Math.min(stats.minTime, metric.value);
        stats.maxTime = Math.max(stats.maxTime, metric.value);

        // 检查是否是错误指标
        if (metric.tags?.error === 'true') {
            stats.errors++;
        }
    }

    /**
     * 检查性能阈值
     */
    private checkPerformanceThresholds(metric: IPerformanceMetric): void {
        const threshold = this.performanceThresholds[metric.name];
        if (threshold && metric.value > threshold) {
            this.logger?.warn('Performance threshold exceeded', {
                operation: metric.name,
                value: metric.value,
                threshold,
                unit: metric.unit,
            });
        }
    }

    /**
     * 获取内存使用情况
     */
    private getMemoryUsage(): number {
        if (typeof process !== 'undefined' && process.memoryUsage) {
            return process.memoryUsage().heapUsed;
        }

        // 浏览器环境的近似值
        if (typeof performance !== 'undefined' && 'memory' in performance) {
            const perfWithMemory = performance as typeof globalThis.performance & {
                memory?: { usedJSHeapSize: number };
            };
            return perfWithMemory.memory?.usedJSHeapSize ?? 0;
        }

        return 0;
    }
}
