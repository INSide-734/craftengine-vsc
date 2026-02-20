import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LRUCache, TTLCache, StatsCache, getOrSet, getOrSetSync } from '../../../../infrastructure/utils/CacheUtils';

describe('CacheUtils', () => {
    describe('LRUCache', () => {
        it('should set and get values', () => {
            const cache = new LRUCache<string, number>(10);
            cache.set('a', 1);
            expect(cache.get('a')).toBe(1);
        });

        it('should return undefined for missing keys', () => {
            const cache = new LRUCache<string, number>(10);
            expect(cache.get('missing')).toBeUndefined();
        });

        it('should evict least recently used item', () => {
            const cache = new LRUCache<string, number>(3);
            cache.set('a', 1);
            cache.set('b', 2);
            cache.set('c', 3);
            cache.set('d', 4); // 'a' 应该被淘汰
            expect(cache.get('a')).toBeUndefined();
            expect(cache.get('d')).toBe(4);
        });

        it('should update LRU order on get', () => {
            const cache = new LRUCache<string, number>(3);
            cache.set('a', 1);
            cache.set('b', 2);
            cache.set('c', 3);
            cache.get('a'); // 'a' 变为最近使用
            cache.set('d', 4); // 'b' 应该被淘汰
            expect(cache.get('a')).toBe(1);
            expect(cache.get('b')).toBeUndefined();
        });

        it('should update existing key', () => {
            const cache = new LRUCache<string, number>(10);
            cache.set('a', 1);
            cache.set('a', 2);
            expect(cache.get('a')).toBe(2);
            expect(cache.size()).toBe(1);
        });

        it('should check existence with has', () => {
            const cache = new LRUCache<string, number>(10);
            cache.set('a', 1);
            expect(cache.has('a')).toBe(true);
            expect(cache.has('b')).toBe(false);
        });

        it('should delete items', () => {
            const cache = new LRUCache<string, number>(10);
            cache.set('a', 1);
            expect(cache.delete('a')).toBe(true);
            expect(cache.get('a')).toBeUndefined();
            expect(cache.delete('nonexistent')).toBe(false);
        });

        it('should clear all items', () => {
            const cache = new LRUCache<string, number>(10);
            cache.set('a', 1);
            cache.set('b', 2);
            cache.clear();
            expect(cache.size()).toBe(0);
        });

        it('should report correct size', () => {
            const cache = new LRUCache<string, number>(10);
            expect(cache.size()).toBe(0);
            cache.set('a', 1);
            cache.set('b', 2);
            expect(cache.size()).toBe(2);
        });

        it('should iterate keys, values, entries', () => {
            const cache = new LRUCache<string, number>(10);
            cache.set('a', 1);
            cache.set('b', 2);
            expect([...cache.keys()]).toEqual(['a', 'b']);
            expect([...cache.values()]).toEqual([1, 2]);
            expect([...cache.entries()]).toEqual([
                ['a', 1],
                ['b', 2],
            ]);
        });

        it('should use default maxSize of 100', () => {
            const cache = new LRUCache<number, number>();
            for (let i = 0; i < 110; i++) {
                cache.set(i, i);
            }
            expect(cache.size()).toBe(100);
        });
    });

    describe('TTLCache', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should set and get values', () => {
            const cache = new TTLCache<string, number>(5000, 0);
            cache.set('a', 1);
            expect(cache.get('a')).toBe(1);
        });

        it('should expire items after TTL', () => {
            const cache = new TTLCache<string, number>(1000, 0);
            cache.set('a', 1);
            expect(cache.get('a')).toBe(1);
            vi.advanceTimersByTime(1001);
            expect(cache.get('a')).toBeUndefined();
        });

        it('should report has correctly with expiry', () => {
            const cache = new TTLCache<string, number>(1000, 0);
            cache.set('a', 1);
            expect(cache.has('a')).toBe(true);
            vi.advanceTimersByTime(1001);
            expect(cache.has('a')).toBe(false);
        });

        it('should delete items', () => {
            const cache = new TTLCache<string, number>(5000, 0);
            cache.set('a', 1);
            expect(cache.delete('a')).toBe(true);
            expect(cache.get('a')).toBeUndefined();
        });

        it('should clear all items', () => {
            const cache = new TTLCache<string, number>(5000, 0);
            cache.set('a', 1);
            cache.set('b', 2);
            cache.clear();
            expect(cache.size()).toBe(0);
        });

        it('should cleanup expired items', () => {
            const cache = new TTLCache<string, number>(1000, 0);
            cache.set('a', 1);
            cache.set('b', 2);
            vi.advanceTimersByTime(500);
            cache.set('c', 3);
            vi.advanceTimersByTime(600);
            const cleaned = cache.cleanup();
            expect(cleaned).toBe(2); // a 和 b 过期
            expect(cache.get('c')).toBe(3);
        });

        it('should refresh timestamp', () => {
            const cache = new TTLCache<string, number>(1000, 0);
            cache.set('a', 1);
            vi.advanceTimersByTime(800);
            expect(cache.refresh('a')).toBe(true);
            vi.advanceTimersByTime(800);
            expect(cache.get('a')).toBe(1); // 刷新后还没过期
        });

        it('should return false when refreshing non-existent key', () => {
            const cache = new TTLCache<string, number>(1000, 0);
            expect(cache.refresh('nonexistent')).toBe(false);
        });

        it('should dispose properly', () => {
            const cache = new TTLCache<string, number>(1000, 0);
            cache.set('a', 1);
            cache.dispose();
            expect(cache.size()).toBe(0);
        });

        it('should stop cleanup timer', () => {
            const cache = new TTLCache<string, number>(1000, 500);
            cache.stopCleanup();
            cache.set('a', 1);
            vi.advanceTimersByTime(2000);
            // 即使过期，因为停止了自动清理，size 仍然是 1
            expect(cache.size()).toBe(1);
            cache.dispose();
        });
    });

    describe('StatsCache', () => {
        it('should track hits and misses', () => {
            const inner = new LRUCache<string, number>(10);
            const cache = new StatsCache(inner);

            cache.get('missing'); // miss
            cache.set('a', 1);
            cache.get('a'); // hit

            const stats = cache.getStats();
            expect(stats.hits).toBe(1);
            expect(stats.misses).toBe(1);
            expect(stats.hitRate).toBe(0.5);
            expect(stats.size).toBe(1);
        });

        it('should delegate set/has/delete/clear/size', () => {
            const inner = new LRUCache<string, number>(10);
            const cache = new StatsCache(inner);

            cache.set('a', 1);
            expect(cache.has('a')).toBe(true);
            expect(cache.size()).toBe(1);
            expect(cache.delete('a')).toBe(true);
            expect(cache.size()).toBe(0);

            cache.set('b', 2);
            cache.clear();
            expect(cache.size()).toBe(0);
        });

        it('should reset stats', () => {
            const inner = new LRUCache<string, number>(10);
            const cache = new StatsCache(inner);

            cache.get('missing');
            cache.resetStats();

            const stats = cache.getStats();
            expect(stats.hits).toBe(0);
            expect(stats.misses).toBe(0);
            expect(stats.hitRate).toBe(0);
        });

        it('should return 0 hitRate when no operations', () => {
            const inner = new LRUCache<string, number>(10);
            const cache = new StatsCache(inner);
            expect(cache.getStats().hitRate).toBe(0);
        });
    });

    describe('getOrSet', () => {
        it('should return cached value', async () => {
            const cache = new LRUCache<string, number>(10);
            cache.set('key', 42);
            const factory = vi.fn(() => 99);
            const result = await getOrSet(cache, 'key', factory);
            expect(result).toBe(42);
            expect(factory).not.toHaveBeenCalled();
        });

        it('should call factory and cache result', async () => {
            const cache = new LRUCache<string, number>(10);
            const result = await getOrSet(cache, 'key', () => 42);
            expect(result).toBe(42);
            expect(cache.get('key')).toBe(42);
        });

        it('should handle async factory', async () => {
            const cache = new LRUCache<string, number>(10);
            const result = await getOrSet(cache, 'key', async () => 42);
            expect(result).toBe(42);
        });
    });

    describe('getOrSetSync', () => {
        it('should return cached value', () => {
            const cache = new LRUCache<string, number>(10);
            cache.set('key', 42);
            const factory = vi.fn(() => 99);
            const result = getOrSetSync(cache, 'key', factory);
            expect(result).toBe(42);
            expect(factory).not.toHaveBeenCalled();
        });

        it('should call factory and cache result', () => {
            const cache = new LRUCache<string, number>(10);
            const result = getOrSetSync(cache, 'key', () => 42);
            expect(result).toBe(42);
            expect(cache.get('key')).toBe(42);
        });
    });
});
