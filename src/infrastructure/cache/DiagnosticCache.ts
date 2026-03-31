/**
 * 通用诊断缓存类
 *
 * 基于 LRUCache 提供缓存策略，支持 TTL 过期和版本检查
 */

import { type ILogger } from '../../core/interfaces/ILogger';
import { LRUCache } from '../../core/utils/LRUCache';

/**
 * 缓存条目
 */
interface ICacheEntry<T> {
    /** 缓存的值 */
    value: T;
    /** 创建时间戳 */
    createdAt: number;
    /** 文档版本号 */
    version: number;
}

/**
 * 缓存配置选项
 */
export interface IDiagnosticCacheOptions {
    /** 最大缓存容量 */
    capacity?: number;
    /** TTL 过期时间（毫秒），0 表示不过期 */
    ttl?: number;
    /** 缓存名称（用于日志） */
    name?: string;
}

/**
 * 缓存统计信息
 */
export interface ICacheStats {
    /** 当前缓存大小 */
    size: number;
    /** 最大容量 */
    capacity: number;
    /** 缓存命中次数 */
    hits: number;
    /** 缓存未命中次数 */
    misses: number;
    /** 命中率 */
    hitRate: number;
    /** 过期淘汰次数 */
    expirations: number;
    /** LRU 淘汰次数 */
    evictions: number;
}

/**
 * 通用诊断缓存
 *
 * 特性：
 * - 基于 LRUCache 的淘汰策略
 * - 可选的 TTL 过期机制
 * - 基于文档版本号的缓存失效
 * - 内置性能统计
 *
 * @template T 缓存值类型
 */
export class DiagnosticCache<T> {
    private static readonly DEFAULT_CAPACITY = 100;
    private static readonly DEFAULT_TTL = 0;

    /**
     * 从性能配置创建诊断缓存选项
     */
    static optionsFromConfig(cacheConfig?: { capacity: number; ttl: number }): IDiagnosticCacheOptions {
        return {
            capacity: cacheConfig?.capacity ?? DiagnosticCache.DEFAULT_CAPACITY,
            ttl: cacheConfig?.ttl ?? DiagnosticCache.DEFAULT_TTL,
        };
    }

    private readonly cache: LRUCache<string, ICacheEntry<T>>;
    private readonly capacity: number;
    private readonly ttl: number;
    private readonly name: string;
    private readonly logger?: ILogger;

    private hits = 0;
    private misses = 0;
    private expirations = 0;
    private evictions = 0;

    constructor(options: IDiagnosticCacheOptions = {}, logger?: ILogger) {
        this.capacity = options.capacity ?? DiagnosticCache.DEFAULT_CAPACITY;
        this.ttl = options.ttl ?? DiagnosticCache.DEFAULT_TTL;
        this.name = options.name ?? 'DiagnosticCache';
        this.logger = logger;
        this.cache = new LRUCache<string, ICacheEntry<T>>(this.capacity);

        this.logger?.debug(`${this.name} initialized`, {
            capacity: this.capacity,
            ttl: this.ttl,
        });
    }
    /* PLACEHOLDER_METHODS */

    /**
     * 获取缓存值
     */
    get(key: string, version: number): T | undefined {
        const entry = this.cache.get(key);

        if (!entry) {
            this.misses++;
            return undefined;
        }

        // 检查版本号
        if (entry.version !== version) {
            this.misses++;
            this.cache.delete(key);
            return undefined;
        }

        // 检查 TTL 过期
        if (this.ttl > 0 && Date.now() - entry.createdAt > this.ttl) {
            this.expirations++;
            this.misses++;
            this.cache.delete(key);
            return undefined;
        }

        this.hits++;
        return entry.value;
    }

    /**
     * 设置缓存值
     */
    set(key: string, value: T, version: number): void {
        const previousSize = this.cache.size();
        this.cache.set(key, { value, createdAt: Date.now(), version });

        // LRUCache 自动淘汰，通过大小变化检测
        if (previousSize >= this.capacity && !this.cache.has(key)) {
            this.evictions++;
        }
    }

    /**
     * 检查缓存是否包含指定键
     */
    has(key: string, version?: number): boolean {
        const entry = this.cache.get(key);
        if (!entry) {
            return false;
        }

        if (version !== undefined && entry.version !== version) {
            return false;
        }

        if (this.ttl > 0 && Date.now() - entry.createdAt > this.ttl) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }
    /* PLACEHOLDER_REST */

    /**
     * 删除缓存条目
     */
    delete(key: string): boolean {
        return this.cache.delete(key);
    }

    /**
     * 清除所有缓存
     */
    clear(): void {
        const size = this.cache.size();
        this.cache.clear();
        this.logger?.debug(`${this.name} cleared`, { entriesCleared: size });
    }

    /**
     * 清除过期条目
     */
    purgeExpired(): number {
        if (this.ttl <= 0) {
            return 0;
        }

        const now = Date.now();
        let purged = 0;
        const keysToDelete: string[] = [];

        for (const key of this.cache.keys()) {
            const entry = this.cache.peek(key);
            if (entry && now - entry.createdAt > this.ttl) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            this.cache.delete(key);
            this.expirations++;
            purged++;
        }

        if (purged > 0) {
            this.logger?.debug(`${this.name} purged expired entries`, { count: purged });
        }

        return purged;
    }

    /**
     * 获取缓存统计信息
     */
    getStats(): ICacheStats {
        const total = this.hits + this.misses;
        return {
            size: this.cache.size(),
            capacity: this.capacity,
            hits: this.hits,
            misses: this.misses,
            hitRate: total > 0 ? this.hits / total : 0,
            expirations: this.expirations,
            evictions: this.evictions,
        };
    }

    /**
     * 重置统计信息
     */
    resetStats(): void {
        this.hits = 0;
        this.misses = 0;
        this.expirations = 0;
        this.evictions = 0;
    }

    /**
     * 获取当前缓存大小
     */
    get size(): number {
        return this.cache.size();
    }

    /**
     * 获取所有缓存键
     */
    keys(): IterableIterator<string> {
        return this.cache.keys();
    }
}
