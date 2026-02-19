/**
 * LRU 缓存实现
 *
 * 基于 LRU（Least Recently Used，最近最少使用）策略的通用缓存容器。
 * 当缓存达到容量上限时，自动淘汰最久未使用的项。
 *
 * @remarks
 * **实现原理**：
 * - 使用 Map 存储数据（保持插入顺序）
 * - 每次访问（get）时，将项移到末尾
 * - 每次插入（set）时，如果超过容量，删除首项
 * - Map 的迭代顺序即为访问时间顺序
 *
 * **时间复杂度**：
 * - get: O(1) - Map 查找
 * - set: O(1) - Map 插入/删除
 * - has: O(1) - Map 存在性检查
 * - clear: O(1) - Map 清空
 *
 * @typeParam K - 缓存键的类型
 * @typeParam V - 缓存值的类型
 *
 * @example
 * ```typescript
 * // 创建字符串到对象的缓存
 * const cache = new LRUCache<string, Schema>(100);
 *
 * // 添加缓存项
 * cache.set('user-schema', userSchema);
 *
 * // 获取缓存项（会更新访问时间）
 * const schema = cache.get('user-schema');
 *
 * // 检查是否存在
 * if (cache.has('user-schema')) {
 *     console.log('Schema is cached');
 * }
 * ```
 */
export class LRUCache<K, V> {
    /** 底层 Map 存储 */
    private cache = new Map<K, V>();
    /** 最大缓存容量 */
    private readonly maxSize: number;

    /**
     * 构造 LRU 缓存实例
     *
     * @param maxSize - 最大缓存容量，默认 100
     *
     * @remarks
     * 容量选择建议：
     * - Schema 缓存：100-500（Schema 数量有限）
     * - 模板缓存：1000-5000（模板可能较多）
     * - 文件缓存：50-100（文件占用内存较大）
     */
    constructor(maxSize: number = 100) {
        this.maxSize = maxSize;
    }

    /**
     * 获取缓存项
     *
     * 获取指定键的值，如果存在则将其移到最近使用位置（Map 末尾）。
     *
     * @param key - 缓存键
     * @returns 缓存值，如果不存在返回 undefined
     */
    get(key: K): V | undefined {
        if (this.cache.has(key)) {
            const value = this.cache.get(key)!;
            // 移到最前面（LRU 策略）
            this.cache.delete(key);
            this.cache.set(key, value);
            return value;
        }
        return undefined;
    }

    /**
     * 设置缓存项
     *
     * @param key - 缓存键
     * @param value - 缓存值
     */
    set(key: K, value: V): void {
        // 如果已存在，先删除
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        // 如果超过最大容量，删除最旧的项
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }

        this.cache.set(key, value);
    }

    /**
     * 检查是否存在缓存项
     *
     * @param key - 缓存键
     * @returns 是否存在
     */
    has(key: K): boolean {
        return this.cache.has(key);
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
     * 清空缓存
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * 获取缓存大小
     *
     * @returns 缓存项数量
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * 获取所有键
     *
     * @returns 键的迭代器
     */
    keys(): IterableIterator<K> {
        return this.cache.keys();
    }

    /**
     * 获取所有值
     *
     * @returns 值的迭代器
     */
    values(): IterableIterator<V> {
        return this.cache.values();
    }

    /**
     * 获取所有键值对
     *
     * @returns 键值对的迭代器
     */
    entries(): IterableIterator<[K, V]> {
        return this.cache.entries();
    }
}
