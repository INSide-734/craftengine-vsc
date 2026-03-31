import { type ILogger } from '../../../core/interfaces/ILogger';
import { LRUCache } from '../../utils/LRUCache';

/**
 * 命名空间缓存条目
 */
interface INamespaceCacheEntry {
    /** 命名空间列表 */
    namespaces: string[];
    /** 缓存时间戳 */
    timestamp: number;
}

/**
 * 命名空间缓存管理器
 *
 * 使用 LRU 缓存策略管理命名空间发现结果，提高性能。
 */
export class NamespaceCache {
    /**
     * 默认缓存 TTL（毫秒）
     */
    private static readonly DEFAULT_CACHE_TTL_FALLBACK = 300000; // 5分钟

    /**
     * 默认命名空间缓存最大容量
     */
    private static readonly DEFAULT_MAX_CACHE_SIZE = 50;

    /**
     * 命名空间缓存（使用 LRUCache 自动管理容量）
     */
    private readonly cache: LRUCache<string, INamespaceCacheEntry>;

    /**
     * 缓存 TTL
     */
    private cacheTTL: number;

    /**
     * 构造函数
     *
     * @param logger - 日志记录器（可选）
     * @param cacheTTL - 缓存 TTL（毫秒），默认 5 分钟
     * @param maxCacheSize - 最大缓存容量，默认 50
     */
    constructor(
        private readonly logger?: ILogger,
        cacheTTL?: number,
        maxCacheSize?: number,
    ) {
        this.cache = new LRUCache<string, INamespaceCacheEntry>(maxCacheSize || NamespaceCache.DEFAULT_MAX_CACHE_SIZE);
        this.cacheTTL = cacheTTL || NamespaceCache.DEFAULT_CACHE_TTL_FALLBACK;
    }

    /**
     * 从缓存获取命名空间
     *
     * @param key - 缓存键
     * @returns 命名空间列表，如果缓存未命中或已过期则返回 null
     */
    get(key: string): string[] | null {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            this.logger?.debug('Using cached namespaces', { key, count: cached.namespaces.length });
            return cached.namespaces;
        }
        return null;
    }

    /**
     * 设置命名空间缓存
     *
     * @param key - 缓存键
     * @param namespaces - 命名空间列表
     */
    set(key: string, namespaces: string[]): void {
        this.cache.set(key, {
            namespaces,
            timestamp: Date.now(),
        });
    }

    /**
     * 清除所有缓存
     */
    clear(): void {
        this.cache.clear();
        this.logger?.debug('Namespace cache cleared');
    }

    /**
     * 更新缓存 TTL
     *
     * @param ttl - 新的 TTL（毫秒）
     */
    setCacheTTL(ttl: number): void {
        this.cacheTTL = ttl;
        this.logger?.debug('Cache TTL updated', { cacheTTL: ttl });
    }

    /**
     * 获取当前缓存 TTL
     *
     * @returns 缓存 TTL（毫秒）
     */
    getCacheTTL(): number {
        return this.cacheTTL;
    }
}
