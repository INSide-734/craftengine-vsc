import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    Debouncer,
    Throttler,
    delay,
    withTimeout,
    retry,
    ConcurrencyLimiter,
    batchAsync,
    debounce,
    throttle,
} from '../../../../infrastructure/utils/AsyncUtils';

describe('AsyncUtils', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('Debouncer', () => {
        it('should debounce function calls', async () => {
            const debouncer = new Debouncer();
            const fn = vi.fn();

            debouncer.debounce('key', fn, 100);
            debouncer.debounce('key', fn, 100);
            debouncer.debounce('key', fn, 100);

            expect(fn).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(100);
            expect(fn).toHaveBeenCalledTimes(1);

            debouncer.clear();
        });

        it('should support different keys independently', async () => {
            const debouncer = new Debouncer();
            const fn1 = vi.fn();
            const fn2 = vi.fn();

            debouncer.debounce('key1', fn1, 100);
            debouncer.debounce('key2', fn2, 100);

            await vi.advanceTimersByTimeAsync(100);
            expect(fn1).toHaveBeenCalledTimes(1);
            expect(fn2).toHaveBeenCalledTimes(1);

            debouncer.clear();
        });

        it('should cancel pending debounce', () => {
            const debouncer = new Debouncer();
            const fn = vi.fn();

            debouncer.debounce('key', fn, 100);
            expect(debouncer.cancel('key')).toBe(true);
            expect(debouncer.cancel('nonexistent')).toBe(false);

            vi.advanceTimersByTime(200);
            expect(fn).not.toHaveBeenCalled();

            debouncer.clear();
        });

        it('should report pending status', () => {
            const debouncer = new Debouncer();
            const fn = vi.fn();

            expect(debouncer.isPending('key')).toBe(false);
            debouncer.debounce('key', fn, 100);
            expect(debouncer.isPending('key')).toBe(true);

            debouncer.clear();
        });

        it('should report pending count', () => {
            const debouncer = new Debouncer();
            const fn = vi.fn();

            expect(debouncer.pendingCount()).toBe(0);
            debouncer.debounce('key1', fn, 100);
            debouncer.debounce('key2', fn, 100);
            expect(debouncer.pendingCount()).toBe(2);

            debouncer.clear();
            expect(debouncer.pendingCount()).toBe(0);
        });
    });

    describe('Throttler', () => {
        it('should execute immediately on first call (leading)', async () => {
            const throttler = new Throttler();
            const fn = vi.fn();

            throttler.throttle('key', fn, 100);
            await vi.advanceTimersByTimeAsync(0);
            expect(fn).toHaveBeenCalledTimes(1);

            throttler.clear();
        });

        it('should throttle subsequent calls', async () => {
            const throttler = new Throttler();
            const fn = vi.fn();

            throttler.throttle('key', fn, 100);
            await vi.advanceTimersByTimeAsync(0);
            throttler.throttle('key', fn, 100); // 应该被节流
            await vi.advanceTimersByTimeAsync(50);
            expect(fn).toHaveBeenCalledTimes(1);

            // 等待尾随调用
            await vi.advanceTimersByTimeAsync(60);
            expect(fn).toHaveBeenCalledTimes(2);

            throttler.clear();
        });

        it('should cancel throttle', async () => {
            const throttler = new Throttler();
            const fn = vi.fn();

            throttler.throttle('key', fn, 100);
            await vi.advanceTimersByTimeAsync(0);
            throttler.throttle('key', fn, 100);
            throttler.cancel('key');

            await vi.advanceTimersByTimeAsync(200);
            expect(fn).toHaveBeenCalledTimes(1); // 只有第一次的 leading 调用

            throttler.clear();
        });

        it('should clear all state', () => {
            const throttler = new Throttler();
            const fn = vi.fn();

            throttler.throttle('key1', fn, 100);
            throttler.throttle('key2', fn, 100);
            throttler.clear();
            // 不应该抛出错误
        });
    });

    describe('delay', () => {
        it('should resolve after specified time', async () => {
            const fn = vi.fn();
            delay(100).then(fn);

            expect(fn).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(100);
            expect(fn).toHaveBeenCalled();
        });
    });

    describe('withTimeout', () => {
        it('should resolve if promise completes in time', async () => {
            vi.useRealTimers();
            const result = await withTimeout(Promise.resolve(42), 1000);
            expect(result).toBe(42);
        });

        it('should reject on timeout', async () => {
            vi.useRealTimers();
            const slowPromise = new Promise<number>(() => {
                // 永远不 resolve
            });

            await expect(withTimeout(slowPromise, 50)).rejects.toThrow('Operation timed out');
        });

        it('should use custom error message', async () => {
            vi.useRealTimers();
            const slowPromise = new Promise<number>(() => {
                // 永远不 resolve
            });

            await expect(withTimeout(slowPromise, 50, 'Custom timeout')).rejects.toThrow('Custom timeout');
        });

        it('should propagate original error', async () => {
            vi.useRealTimers();
            const failingPromise = Promise.reject(new Error('Original error'));
            await expect(withTimeout(failingPromise, 1000)).rejects.toThrow('Original error');
        });
    });

    describe('retry', () => {
        it('should return on first success', async () => {
            vi.useRealTimers();
            const fn = vi.fn().mockResolvedValue(42);
            const result = await retry(fn, { maxRetries: 3, retryDelay: 10 });
            expect(result).toBe(42);
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should retry on failure', async () => {
            vi.useRealTimers();
            const fn = vi
                .fn()
                .mockRejectedValueOnce(new Error('fail 1'))
                .mockRejectedValueOnce(new Error('fail 2'))
                .mockResolvedValue(42);

            const result = await retry(fn, { maxRetries: 3, retryDelay: 10 });
            expect(result).toBe(42);
            expect(fn).toHaveBeenCalledTimes(3);
        });

        it('should throw after max retries', async () => {
            vi.useRealTimers();
            const fn = vi.fn().mockRejectedValue(new Error('always fails'));

            await expect(retry(fn, { maxRetries: 2, retryDelay: 10 })).rejects.toThrow('always fails');
            expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
        });

        it('should call onRetry callback', async () => {
            vi.useRealTimers();
            const onRetry = vi.fn();
            const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue(42);

            await retry(fn, { maxRetries: 2, retryDelay: 10, onRetry });
            expect(onRetry).toHaveBeenCalledTimes(1);
            expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
        });

        it('should respect shouldRetry condition', async () => {
            vi.useRealTimers();
            const fn = vi.fn().mockRejectedValue(new Error('permanent'));

            await expect(
                retry(fn, {
                    maxRetries: 5,
                    retryDelay: 10,
                    shouldRetry: () => false,
                }),
            ).rejects.toThrow('permanent');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should handle non-Error throws', async () => {
            vi.useRealTimers();
            const fn = vi.fn().mockRejectedValue('string error');

            await expect(retry(fn, { maxRetries: 0, retryDelay: 10 })).rejects.toThrow('string error');
        });
    });

    describe('ConcurrencyLimiter', () => {
        it('should limit concurrent executions', async () => {
            vi.useRealTimers();
            const limiter = new ConcurrencyLimiter(2);
            let running = 0;
            let maxRunning = 0;

            const task = () =>
                limiter.run(async () => {
                    running++;
                    maxRunning = Math.max(maxRunning, running);
                    await new Promise((r) => setTimeout(r, 50));
                    running--;
                });

            await Promise.all([task(), task(), task(), task()]);
            expect(maxRunning).toBeLessThanOrEqual(2);
        });

        it('should report running and pending counts', async () => {
            vi.useRealTimers();
            const limiter = new ConcurrencyLimiter(1);
            let resolveFirst: () => void;
            const firstPromise = new Promise<void>((r) => {
                resolveFirst = r;
            });

            const p1 = limiter.run(() => firstPromise);
            expect(limiter.runningCount()).toBe(1);

            // 启动第二个任务（会排队）
            const p2Promise = limiter.run(async () => {});
            // 给事件循环一个 tick
            await new Promise((r) => setTimeout(r, 10));
            expect(limiter.pendingCount()).toBe(1);

            resolveFirst!();
            await p1;
            await p2Promise;
        });
    });

    describe('batchAsync', () => {
        it('should process items in batches', async () => {
            vi.useRealTimers();
            const items = [1, 2, 3, 4, 5];
            const results = await batchAsync(items, async (item) => item * 2, 2);
            expect(results).toEqual([2, 4, 6, 8, 10]);
        });

        it('should pass correct index', async () => {
            vi.useRealTimers();
            const items = ['a', 'b', 'c'];
            const indices: number[] = [];
            await batchAsync(
                items,
                async (_, index) => {
                    indices.push(index);
                    return index;
                },
                2,
            );
            expect(indices).toEqual([0, 1, 2]);
        });

        it('should handle empty array', async () => {
            vi.useRealTimers();
            const results = await batchAsync([], async (item: number) => item, 2);
            expect(results).toEqual([]);
        });
    });

    describe('debounce function', () => {
        it('should debounce function calls', async () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100);

            debounced();
            debounced();
            debounced();

            expect(fn).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(100);
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should pass arguments to debounced function', async () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100);

            debounced('hello', 42);
            await vi.advanceTimersByTimeAsync(100);
            expect(fn).toHaveBeenCalledWith('hello', 42);
        });
    });

    describe('throttle function', () => {
        it('should execute immediately on first call', () => {
            const fn = vi.fn();
            const throttled = throttle(fn, 100);

            throttled();
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should throttle subsequent calls', async () => {
            const fn = vi.fn();
            const throttled = throttle(fn, 100);

            throttled();
            throttled();
            throttled();

            expect(fn).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(100);
            expect(fn).toHaveBeenCalledTimes(2); // trailing call
        });

        it('should pass arguments', () => {
            const fn = vi.fn();
            const throttled = throttle(fn, 100);

            throttled('hello');
            expect(fn).toHaveBeenCalledWith('hello');
        });
    });
});
