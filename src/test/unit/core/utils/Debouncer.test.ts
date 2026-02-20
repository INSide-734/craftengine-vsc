import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Debouncer } from '../../../../core/utils/Debouncer';

describe('Debouncer', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should execute function after delay', () => {
        const debouncer = new Debouncer();
        const fn = vi.fn();

        debouncer.debounce('test', fn, 100);
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledOnce();
    });

    it('should reset timer on repeated calls', () => {
        const debouncer = new Debouncer();
        const fn = vi.fn();

        debouncer.debounce('test', fn, 100);
        vi.advanceTimersByTime(50);
        debouncer.debounce('test', fn, 100);
        vi.advanceTimersByTime(50);
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(50);
        expect(fn).toHaveBeenCalledOnce();
    });

    it('should handle different keys independently', () => {
        const debouncer = new Debouncer();
        const fn1 = vi.fn();
        const fn2 = vi.fn();

        debouncer.debounce('key1', fn1, 100);
        debouncer.debounce('key2', fn2, 200);

        vi.advanceTimersByTime(100);
        expect(fn1).toHaveBeenCalledOnce();
        expect(fn2).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);
        expect(fn2).toHaveBeenCalledOnce();
    });
    it('should cancel a pending debounce', () => {
        const debouncer = new Debouncer();
        const fn = vi.fn();

        debouncer.debounce('test', fn, 100);
        expect(debouncer.cancel('test')).toBe(true);

        vi.advanceTimersByTime(200);
        expect(fn).not.toHaveBeenCalled();
    });

    it('should return false when cancelling non-existent key', () => {
        const debouncer = new Debouncer();
        expect(debouncer.cancel('nonexistent')).toBe(false);
    });

    it('should report pending status', () => {
        const debouncer = new Debouncer();
        const fn = vi.fn();

        expect(debouncer.isPending('test')).toBe(false);
        debouncer.debounce('test', fn, 100);
        expect(debouncer.isPending('test')).toBe(true);

        vi.advanceTimersByTime(100);
        expect(debouncer.isPending('test')).toBe(false);
    });

    it('should report pending count', () => {
        const debouncer = new Debouncer();
        expect(debouncer.pendingCount()).toBe(0);

        debouncer.debounce('a', vi.fn(), 100);
        debouncer.debounce('b', vi.fn(), 200);
        expect(debouncer.pendingCount()).toBe(2);

        vi.advanceTimersByTime(100);
        expect(debouncer.pendingCount()).toBe(1);
    });

    it('should clear all pending timers', () => {
        const debouncer = new Debouncer();
        const fn1 = vi.fn();
        const fn2 = vi.fn();

        debouncer.debounce('a', fn1, 100);
        debouncer.debounce('b', fn2, 100);
        debouncer.clear();

        vi.advanceTimersByTime(200);
        expect(fn1).not.toHaveBeenCalled();
        expect(fn2).not.toHaveBeenCalled();
        expect(debouncer.pendingCount()).toBe(0);
    });

    it('should handle async function errors gracefully', () => {
        const debouncer = new Debouncer();
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const fn = vi.fn().mockRejectedValue(new Error('async fail'));

        debouncer.debounce('test', fn, 100);
        vi.advanceTimersByTime(100);

        // 错误被捕获，不会抛出
        expect(fn).toHaveBeenCalledOnce();
        consoleSpy.mockRestore();
    });
});
