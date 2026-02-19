/**
 * TTL 缓存实现
 *
 * 带有过期时间（Time To Live）的缓存容器。
 * 缓存项在指定时间后自动过期。
 */

/**
 * TTL 缓存项
 */
interface TTLCacheEntry<V> {
    value: V;
    timestamp: number;
    /** 自定义 TTL（毫秒），未设置时使用 defaultTTL */
    ttl?: number;
}

/**
 * TTL 缓存实现
 *
 * 带有过期时间（Time To Live）的缓存容器。
 * 缓存项在指定时间后自动过期。
 *
 * @typeParam K - 缓存键的类型
 * @typeParam V - 缓存值的类型
 *
 * @example
 * ```typescript
 * // 创建 5 秒过期的缓存
 * const cache = new TTLCache<string, object>(5000);
 *
 * cache.set('key', { data: 'value' });
 *
 * // 5 秒内可以获取
 * const value = cache.get('key');
 *
 * // 5 秒后自动过期
 * setTimeout(() => {
 *     cache.get('key'); // undefined
 * }, 6000);
 * ```
 */
export class TTLCache<K, V> {
    /** 缓存存储 */
    private cache = new Map<K, TTLCacheEntry<V>>();
    /** 默认 TTL（毫秒） */
    private readonly defaultTTL: number;
    /** 清理定时器 */
    private cleanupTimer: NodeJS.Timeout | null = null;
    /** 清理间隔（毫秒） */
    private readonly cleanupInterval: number;

    /**
     * 构造 TTL 缓存实例
     *
     * @param defaultTTL - 默认过期时间（毫秒），默认 60000（1分钟）
     * @param cleanupInterval - 自动清理间隔（毫秒），默认 60000（1分钟），0 表示不自动清理
     */
    constructor(defaultTTL: number = 60000, cleanupInterval: number = 60000) {
        this.defaultTTL = defaultTTL;
        this.cleanupInterval = cleanupInterval;

        if (cleanupInterval > 0) {
            this.startCleanup();
        }
    }

    /**
     * 获取缓存项
     *
     * @param key - 缓存键
     * @returns 缓存值，如果不存在或已过期返回 undefined
     */
    get(key: K): V | undefined {
        const entry = this.cache.get(key);
        if (!entry) {
            return undefined;
        }

        // 检查是否过期
        const ttl = entry.ttl ?? this.defaultTTL;
        if (Date.now() - entry.timestamp > ttl) {
            this.cache.delete(key);
            return undefined;
        }

        return entry.value;
    }

    /**
     * 设置缓存项
     *
     * @param key - 缓存键
     * @param value - 缓存值
     * @param ttl - 可选的自定义 TTL（毫秒）
     */
    set(key: K, value: V, ttl?: number): void {
        this.cache.set(key, {
            value,
            timestamp: Date.now(),
            ttl
        });
    }

    /**
     * 检查是否存在有效的缓存项
     *
     * @param key - 缓存键
     * @returns 是否存在且未过期
     */
    has(key: K): boolean {
        const entry = this.cache.get(key);
        if (!entry) {
            return false;
        }

        const ttl = entry.ttl ?? this.defaultTTL;
        if (Date.now() - entry.timestamp > ttl) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    /**
     * 删除缓存项
     *
     * @param key - 缓存键
     * @returns 是否成功删除
     */
    delete(key: K): boolean {
        return this.cache.delete(key);
    }

    /**
     * 清空缓存并停止自动清理
     */
    clear(): void {
        this.stopCleanup();
        this.cache.clear();
    }

    /**
     * 获取缓存大小（包括已过期项）
     *
     * @returns 缓存项数量
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * 清理过期项
     *
     * @returns 清理的项数
     */
    cleanup(): number {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.cache.entries()) {
            const ttl = entry.ttl ?? this.defaultTTL;
            if (now - entry.timestamp > ttl) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        return cleaned;
    }

    /**
     * 刷新缓存项的时间戳
     *
     * @param key - 缓存键
     * @returns 是否成功刷新
     */
    refresh(key: K): boolean {
        const entry = this.cache.get(key);
        if (!entry) {
            return false;
        }

        entry.timestamp = Date.now();
        return true;
    }

    /**
     * 启动自动清理
     */
    private startCleanup(): void {
        if (this.cleanupTimer) {
            return;
        }

        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, this.cleanupInterval);

        // 确保不阻止进程退出
        if (this.cleanupTimer.unref) {
            this.cleanupTimer.unref();
        }
    }

    /**
     * 停止自动清理
     */
    stopCleanup(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    /**
     * 销毁缓存
     */
    dispose(): void {
        this.stopCleanup();
        this.cache.clear();
    }
}
