import { describe, it, expect } from 'vitest';
import { LRUCache } from '../../../../core/utils/LRUCache';

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

    it('should evict least recently used item when capacity exceeded', () => {
        const cache = new LRUCache<string, number>(3);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);
        cache.set('d', 4);
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('b')).toBe(2);
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

    it('should overwrite existing key', () => {
        const cache = new LRUCache<string, number>(3);
        cache.set('a', 1);
        cache.set('a', 2);
        expect(cache.get('a')).toBe(2);
        expect(cache.size()).toBe(1);
    });

    it('should report correct size', () => {
        const cache = new LRUCache<string, number>(10);
        expect(cache.size()).toBe(0);
        cache.set('a', 1);
        cache.set('b', 2);
        expect(cache.size()).toBe(2);
    });
    it('should check existence with has', () => {
        const cache = new LRUCache<string, number>(10);
        cache.set('a', 1);
        expect(cache.has('a')).toBe(true);
        expect(cache.has('b')).toBe(false);
    });

    it('should delete entries', () => {
        const cache = new LRUCache<string, number>(10);
        cache.set('a', 1);
        expect(cache.delete('a')).toBe(true);
        expect(cache.get('a')).toBeUndefined();
        expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should clear all entries', () => {
        const cache = new LRUCache<string, number>(10);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.clear();
        expect(cache.size()).toBe(0);
        expect(cache.get('a')).toBeUndefined();
    });

    it('should iterate keys', () => {
        const cache = new LRUCache<string, number>(10);
        cache.set('a', 1);
        cache.set('b', 2);
        const keys = [...cache.keys()];
        expect(keys).toContain('a');
        expect(keys).toContain('b');
    });

    it('should iterate values', () => {
        const cache = new LRUCache<string, number>(10);
        cache.set('a', 1);
        cache.set('b', 2);
        const values = [...cache.values()];
        expect(values).toContain(1);
        expect(values).toContain(2);
    });

    it('should iterate entries', () => {
        const cache = new LRUCache<string, number>(10);
        cache.set('a', 1);
        cache.set('b', 2);
        const entries = [...cache.entries()];
        expect(entries).toHaveLength(2);
    });

    it('should use default maxSize of 100', () => {
        const cache = new LRUCache<number, number>();
        for (let i = 0; i < 100; i++) {
            cache.set(i, i);
        }
        expect(cache.size()).toBe(100);
        cache.set(100, 100);
        expect(cache.size()).toBe(100);
        expect(cache.get(0)).toBeUndefined();
    });

    it('should handle capacity of 1', () => {
        const cache = new LRUCache<string, number>(1);
        cache.set('a', 1);
        cache.set('b', 2);
        expect(cache.size()).toBe(1);
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('b')).toBe(2);
    });

    it('should not evict when updating existing key at capacity', () => {
        const cache = new LRUCache<string, number>(2);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('a', 10); // 更新已有键，不应淘汰
        expect(cache.size()).toBe(2);
        expect(cache.get('a')).toBe(10);
        expect(cache.get('b')).toBe(2);
    });

    it('should peek value without updating LRU order', () => {
        const cache = new LRUCache<string, number>(3);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        // peek 不应更新访问顺序，'a' 仍然是最旧的
        expect(cache.peek('a')).toBe(1);

        cache.set('d', 4); // 'a' 应该被淘汰（因为 peek 没有更新顺序）
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('b')).toBe(2);
    });

    it('should return undefined from peek for missing key', () => {
        const cache = new LRUCache<string, number>(10);
        expect(cache.peek('missing')).toBeUndefined();
    });

    it('should safely peek during keys() iteration without infinite loop', () => {
        const cache = new LRUCache<string, number>(10);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        const results: [string, number | undefined][] = [];
        for (const key of cache.keys()) {
            results.push([key, cache.peek(key)]);
        }

        expect(results).toHaveLength(3);
        expect(results.map(([k]) => k)).toEqual(['a', 'b', 'c']);
    });
});
