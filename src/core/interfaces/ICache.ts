/**
 * 缓存条目
 *
 * @typeParam T - 缓存值的类型
 */
export interface ICacheEntry<T> {
    /** 缓存的值 */
    value: T;
    /** 创建时间 */
    createdAt: Date;
    /** 过期时间（可选，不设置则永不过期） */
    expiresAt?: Date;
    /** 访问次数 */
    accessCount: number;
    /** 最后访问时间 */
    lastAccessedAt: Date;
}

/**
 * 缓存选项
 */
export interface ICacheOptions {
    /** 最大条目数 */
    maxSize?: number;
    /** 默认 TTL（毫秒） */
    defaultTTL?: number;
    /** 是否启用 LRU 淘汰策略 */
    enableLRU?: boolean;
    /** 过期检查间隔（毫秒） */
    cleanupInterval?: number;
}

/**
 * 缓存统计信息
 */
export interface ICacheStatistics {
    /** 当前条目数量 */
    size: number;
    /** 命中次数 */
    hits: number;
    /** 未命中次数 */
    misses: number;
    /** 命中率（0-1） */
    hitRate: number;
    /** 内存使用估算（字节） */
    memoryUsage?: number;
}

/**
 * 缓存接口
 *
 * 提供通用缓存功能，支持过期策略、LRU 淘汰和统计信息。
 *
 * @typeParam K - 缓存键的类型
 * @typeParam V - 缓存值的类型
 */
export interface ICache<K = string, V = unknown> {
    /**
     * 获取缓存值
     * @param key - 缓存键
     * @returns 缓存值，不存在或已过期则返回 undefined
     */
    get(key: K): V | undefined;

    /**
     * 设置缓存值
     * @param key - 缓存键
     * @param value - 缓存值
     * @param ttl - TTL（毫秒），不提供则使用默认值
     */
    set(key: K, value: V, ttl?: number): void;

    /**
     * 检查缓存键是否存在且未过期
     * @param key - 缓存键
     */
    has(key: K): boolean;

    /**
     * 删除缓存值
     * @param key - 缓存键
     * @returns 是否删除成功
     */
    delete(key: K): boolean;

    /** 清空所有缓存条目 */
    clear(): void;

    /** 获取当前缓存条目数量 */
    size(): number;

    /** 获取所有缓存键 */
    keys(): K[];

    /** 获取缓存统计信息 */
    getStatistics(): ICacheStatistics;

    /**
     * 清理过期条目
     * @returns 清理的条目数量
     */
    cleanup(): number;

    /** 重置统计信息 */
    resetStatistics(): void;

    /** 释放资源，停止自动清理定时器 */
    dispose(): void;
}
