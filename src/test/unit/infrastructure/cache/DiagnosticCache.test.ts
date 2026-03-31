import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiagnosticCache } from '../../../../infrastructure/cache/DiagnosticCache';
import { type ILogger } from '../../../../core/interfaces/ILogger';

function createMockLogger(): ILogger {
    return {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        createChild: vi.fn().mockReturnThis(),
        setLevel: vi.fn(),
        getLevel: vi.fn().mockReturnValue('DEBUG'),
        isDebugEnabled: vi.fn().mockReturnValue(true),
    } as unknown as ILogger;
}

describe('DiagnosticCache', () => {
    let logger: ILogger;

    beforeEach(() => {
        logger = createMockLogger();
    });

    it('should create with default options', () => {
        const cache = new DiagnosticCache();
        expect(cache.size).toBe(0);
    });

    it('should create with custom options', () => {
        const cache = new DiagnosticCache({ capacity: 50, ttl: 1000, name: 'TestCache' }, logger);
        expect(cache.size).toBe(0);
    });

    it('should create options from config', () => {
        const opts = DiagnosticCache.optionsFromConfig({ capacity: 200, ttl: 5000 });
        expect(opts.capacity).toBe(200);
        expect(opts.ttl).toBe(5000);
    });

    it('should use defaults when config is undefined', () => {
        const opts = DiagnosticCache.optionsFromConfig();
        expect(opts.capacity).toBe(100);
        expect(opts.ttl).toBe(0);
    });

    it('should set and get values', () => {
        const cache = new DiagnosticCache<string>();
        cache.set('key1', 'value1', 1);
        expect(cache.get('key1', 1)).toBe('value1');
    });

    it('should return undefined for missing key', () => {
        const cache = new DiagnosticCache<string>();
        expect(cache.get('missing', 1)).toBeUndefined();
    });

    it('should return undefined for version mismatch', () => {
        const cache = new DiagnosticCache<string>();
        cache.set('key1', 'value1', 1);
        expect(cache.get('key1', 2)).toBeUndefined();
    });

    it('should return value when TTL not expired', () => {
        const cache = new DiagnosticCache<string>({ ttl: 60000 });
        cache.set('key1', 'value1', 1);
        expect(cache.get('key1', 1)).toBe('value1');
    });

    it('should check has with version', () => {
        const cache = new DiagnosticCache<string>();
        cache.set('key1', 'value1', 1);
        expect(cache.has('key1')).toBe(true);
        expect(cache.has('key1', 1)).toBe(true);
        expect(cache.has('key1', 2)).toBe(false);
        expect(cache.has('missing')).toBe(false);
    });

    it('should delete entries', () => {
        const cache = new DiagnosticCache<string>();
        cache.set('key1', 'value1', 1);
        expect(cache.delete('key1')).toBe(true);
        expect(cache.get('key1', 1)).toBeUndefined();
        expect(cache.delete('missing')).toBe(false);
    });

    it('should clear all entries', () => {
        const cache = new DiagnosticCache<string>({}, logger);
        cache.set('a', 'v1', 1);
        cache.set('b', 'v2', 1);
        cache.clear();
        expect(cache.size).toBe(0);
    });

    it('should return 0 from purgeExpired when TTL disabled', () => {
        const cache = new DiagnosticCache<string>({ ttl: 0 });
        cache.set('key1', 'value1', 1);
        expect(cache.purgeExpired()).toBe(0);
    });

    it('should track hits and misses', () => {
        const cache = new DiagnosticCache<string>();
        cache.set('key1', 'value1', 1);
        cache.get('key1', 1);
        cache.get('key1', 1);
        cache.get('missing', 1);

        const stats = cache.getStats();
        expect(stats.hits).toBe(2);
        expect(stats.misses).toBe(1);
        expect(stats.hitRate).toBeCloseTo(2 / 3);
        expect(stats.size).toBe(1);
    });

    it('should return 0 hitRate when no accesses', () => {
        const cache = new DiagnosticCache<string>();
        expect(cache.getStats().hitRate).toBe(0);
    });

    it('should reset stats', () => {
        const cache = new DiagnosticCache<string>();
        cache.set('key1', 'value1', 1);
        cache.get('key1', 1);
        cache.get('missing', 1);
        cache.resetStats();
        const stats = cache.getStats();
        expect(stats.hits).toBe(0);
        expect(stats.misses).toBe(0);
    });

    it('should return all cache keys', () => {
        const cache = new DiagnosticCache<string>();
        cache.set('a', 'v1', 1);
        cache.set('b', 'v2', 1);
        const keys = [...cache.keys()];
        expect(keys).toContain('a');
        expect(keys).toContain('b');
    });

    it('should purge expired entries without infinite loop (RangeError)', () => {
        const cache = new DiagnosticCache<string>({ ttl: 50 });

        // 填充多个条目
        cache.set('a', 'v1', 1);
        cache.set('b', 'v2', 1);
        cache.set('c', 'v3', 1);

        // 让所有条目过期
        vi.useFakeTimers();
        vi.advanceTimersByTime(100);

        // 如果 purgeExpired 在遍历 keys() 时调用 get() 触发 Map 重排序，
        // 会导致无限循环抛出 RangeError
        expect(() => cache.purgeExpired()).not.toThrow();
        expect(cache.purgeExpired()).toBe(0); // 已经全部清除
        expect(cache.size).toBe(0);

        vi.useRealTimers();
    });

    it('should purge only expired entries and keep valid ones', () => {
        vi.useFakeTimers({ now: 1000 });

        const cache = new DiagnosticCache<string>({ ttl: 100 });

        cache.set('old1', 'v1', 1);
        cache.set('old2', 'v2', 1);

        vi.advanceTimersByTime(150); // old1, old2 已过期

        cache.set('new1', 'v3', 1); // 这个是新的，未过期

        const purged = cache.purgeExpired();
        expect(purged).toBe(2);
        expect(cache.size).toBe(1);
        expect(cache.get('new1', 1)).toBe('v3');

        vi.useRealTimers();
    });
});
