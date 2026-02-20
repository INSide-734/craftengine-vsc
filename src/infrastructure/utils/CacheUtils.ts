/**
 * 缓存工具模块
 *
 * 提供通用的缓存实现和辅助函数。
 * 各缓存类已拆分到独立文件，此处统一导出并保留工具函数。
 */

// 重新导出缓存类
export { LRUCache } from './LRUCache';
export { TTLCache } from './TTLCache';
export { StatsCache } from './StatsCache';
export type { CacheStats } from './StatsCache';

/**
 * 获取或设置缓存值的辅助函数
 *
 * 如果缓存中存在值则返回，否则调用工厂函数创建并缓存。
 *
 * @param cache - 缓存实例
 * @param key - 缓存键
 * @param factory - 工厂函数，用于创建缓存值
 * @returns 缓存值或新创建的值
 *
 * @example
 * ```typescript
 * const cache = new LRUCache<string, object>(100);
 * const value = await getOrSet(cache, 'key', async () => {
 *     return await loadFromDatabase();
 * });
 * ```
 */
export async function getOrSet<K, V>(
    cache: { get(key: K): V | undefined; set(key: K, value: V): void },
    key: K,
    factory: () => V | Promise<V>,
): Promise<V> {
    const cached = cache.get(key);
    if (cached !== undefined) {
        return cached;
    }

    const value = await factory();
    cache.set(key, value);
    return value;
}

/**
 * 同步版本的获取或设置缓存值
 *
 * @param cache - 缓存实例
 * @param key - 缓存键
 * @param factory - 工厂函数
 * @returns 缓存值或新创建的值
 */
export function getOrSetSync<K, V>(
    cache: { get(key: K): V | undefined; set(key: K, value: V): void },
    key: K,
    factory: () => V,
): V {
    const cached = cache.get(key);
    if (cached !== undefined) {
        return cached;
    }

    const value = factory();
    cache.set(key, value);
    return value;
}
