/**
 * 性能指标
 */
export interface IPerformanceMetric {
    /** 操作名称（如 'template.parse', 'yaml.scan'） */
    operation: string;
    /** 持续时间（毫秒） */
    duration: number;
    /** 时间戳 */
    timestamp: Date;
    /** 额外元数据 */
    metadata?: Record<string, unknown>;
}

/**
 * 性能计时器
 */
export interface IPerformanceTimer {
    /** 操作名称 */
    readonly operationName: string;
    /** 开始时间（高精度） */
    readonly startTime: number;

    /**
     * 停止计时并记录指标
     * @param metadata - 额外的元数据
     * @returns 生成的性能指标
     */
    stop(metadata?: Record<string, unknown>): IPerformanceMetric;

    /**
     * 获取已经过的时间（毫秒），不停止计时器
     */
    getElapsed(): number;
}

/**
 * 性能统计信息
 */
export interface IPerformanceStatistics {
    /** 操作名称 */
    operation: string;
    /** 调用次数 */
    count: number;
    /** 总耗时（毫秒） */
    totalDuration: number;
    /** 平均耗时（毫秒） */
    averageDuration: number;
    /** 最小耗时（毫秒） */
    minDuration: number;
    /** 最大耗时（毫秒） */
    maxDuration: number;
    /** P95 耗时（毫秒） */
    p95Duration?: number;
    /** P99 耗时（毫秒） */
    p99Duration?: number;
}

/**
 * 性能阈值配置
 */
export interface IPerformanceThreshold {
    /** 操作名称 */
    operation: string;
    /** 警告阈值（毫秒） */
    warningThreshold: number;
    /** 错误阈值（毫秒） */
    errorThreshold: number;
}

/**
 * 性能监控器接口
 *
 * 提供性能计时、指标收集、统计分析和阈值检测功能。
 */
export interface IPerformanceMonitor {
    /**
     * 启动性能计时器
     * @param operationName - 操作名称
     */
    startTimer(operationName: string): IPerformanceTimer;

    /**
     * 记录性能指标
     * @param metric - 性能指标对象
     */
    recordMetric(metric: IPerformanceMetric): void;

    /**
     * 获取操作的统计信息
     * @param operationName - 操作名称
     * @returns 统计信息，不存在则返回 undefined
     */
    getStatistics(operationName: string): IPerformanceStatistics | undefined;

    /**
     * 获取所有操作的统计信息
     */
    getAllStatistics(): IPerformanceStatistics[];

    /**
     * 设置性能阈值
     * @param threshold - 阈值配置
     */
    setThreshold(threshold: IPerformanceThreshold): void;

    /**
     * 检查操作耗时是否超过错误阈值
     * @param operationName - 操作名称
     * @param duration - 持续时间（毫秒）
     */
    isAboveThreshold(operationName: string, duration: number): boolean;

    /**
     * 获取所有操作的统计信息（按操作名称索引）
     */
    getAllOperationStatistics(): Record<
        string,
        { count: number; totalTime: number; minTime: number; maxTime: number; errors: number }
    >;

    /**
     * 清除统计数据
     * @param operationName - 操作名称（可选，不提供则清除所有）
     */
    clearStatistics(operationName?: string): void;

    /** 重置监控器到初始状态 */
    reset(): void;

    /** 释放资源 */
    dispose(): void;
}
