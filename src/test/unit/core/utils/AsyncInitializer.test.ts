import { describe, it, expect, vi } from 'vitest';
import { createAsyncInitializer } from '../../../../core/utils/AsyncInitializer';

describe('createAsyncInitializer', () => {
    it('should call loadFn on first ensure()', async () => {
        const loadFn = vi.fn().mockResolvedValue(undefined);
        const initializer = createAsyncInitializer(loadFn);

        expect(initializer.isLoaded()).toBe(false);
        await initializer.ensure();
        expect(initializer.isLoaded()).toBe(true);
        expect(loadFn).toHaveBeenCalledTimes(1);
    });

    it('should be idempotent - not call loadFn again after loaded', async () => {
        const loadFn = vi.fn().mockResolvedValue(undefined);
        const initializer = createAsyncInitializer(loadFn);

        await initializer.ensure();
        await initializer.ensure();
        await initializer.ensure();

        expect(loadFn).toHaveBeenCalledTimes(1);
    });

    it('should share the same promise for concurrent calls', async () => {
        let resolveLoad: () => void;
        const loadFn = vi.fn().mockImplementation(
            () =>
                new Promise<void>((r) => {
                    resolveLoad = r;
                }),
        );
        const initializer = createAsyncInitializer(loadFn);

        const p1 = initializer.ensure();
        const p2 = initializer.ensure();

        // 两次调用应共享同一个 Promise
        expect(loadFn).toHaveBeenCalledTimes(1);

        resolveLoad!();
        await p1;
        await p2;

        expect(initializer.isLoaded()).toBe(true);
    });

    it('should allow retry after failure', async () => {
        let callCount = 0;
        const loadFn = vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                throw new Error('Load failed');
            }
        });
        const initializer = createAsyncInitializer(loadFn);

        // 第一次调用失败
        await expect(initializer.ensure()).rejects.toThrow('Load failed');
        expect(initializer.isLoaded()).toBe(false);

        // 第二次调用应该重试
        await initializer.ensure();
        expect(initializer.isLoaded()).toBe(true);
        expect(loadFn).toHaveBeenCalledTimes(2);
    });

    it('should reset state correctly', async () => {
        const loadFn = vi.fn().mockResolvedValue(undefined);
        const initializer = createAsyncInitializer(loadFn);

        await initializer.ensure();
        expect(initializer.isLoaded()).toBe(true);

        initializer.reset();
        expect(initializer.isLoaded()).toBe(false);

        // reset 后再次 ensure 应重新加载
        await initializer.ensure();
        expect(loadFn).toHaveBeenCalledTimes(2);
    });
});
