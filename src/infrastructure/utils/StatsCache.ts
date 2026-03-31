/**
 * 带统计的缓存包装器
 *
 * 包装任意缓存实现，添加命中率统计功能。
 */

/**
 * 缓存统计信息
 */
export interface ICacheStats {
    /** 命中次数 */
    hits: number;
    /** 未命中次数 */
    misses: number;
    /** 命中率 */
    hitRate: number;
    /** 当前大小 */
    size: number;
}

/**
 * 带统计的缓存包装器
 *
 * 包装任意缓存实现，添加命中率统计功能。
 *
 * @typeParam K - 缓存键的类型
 * @typeParam V - 缓存值的类型
 *
 * @example
 * ```typescript
 * const innerCache = new LRUCache<string, object>(100);
 * const cache = new StatsCache(innerCache);
 *
 * cache.get('key'); // miss
 * cache.set('key', value);
 * cache.get('key'); // hit
 *
 * console.log(cache.getStats()); // { hits: 1, misses: 1, hitRate: 0.5, size: 1 }
 * ```
 */
export class StatsCache<K, V> {
    private hits = 0;
    private misses = 0;

    constructor(
        private readonly innerCache: {
            get(key: K): V | undefined;
            set(key: K, value: V): void;
            has(key: K): boolean;
            delete(key: K): boolean;
            clear(): void;
            size(): number;
        },
    ) {}

    /**
     * 获取缓存项
     */
    get(key: K): V | undefined {
        const value = this.innerCache.get(key);
        if (value !== undefined) {
            this.hits++;
        } else {
            this.misses++;
        }
        return value;
    }

    /**
     * 设置缓存项
     */
    set(key: K, value: V): void {
        this.innerCache.set(key, value);
    }

    /**
     * 检查是否存在缓存项
     */
    has(key: K): boolean {
        return this.innerCache.has(key);
    }

    /**
     * 删除缓存项
     */
    delete(key: K): boolean {
        return this.innerCache.delete(key);
    }

    /**
     * 清空缓存
     */
    clear(): void {
        this.innerCache.clear();
    }

    /**
     * 获取缓存大小
     */
    size(): number {
        return this.innerCache.size();
    }

    /**
     * 获取统计信息
     */
    getStats(): ICacheStats {
        const total = this.hits + this.misses;
        return {
            hits: this.hits,
            misses: this.misses,
            hitRate: total > 0 ? this.hits / total : 0,
            size: this.innerCache.size(),
        };
    }

    /**
     * 重置统计信息
     */
    resetStats(): void {
        this.hits = 0;
        this.misses = 0;
    }
}
