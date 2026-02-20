import { describe, it, expect } from 'vitest';
import { deepFreeze } from '../../../../core/utils/deepFreeze';

describe('deepFreeze', () => {
    it('should freeze a simple object', () => {
        const obj = { a: 1, b: 'hello' };
        const result = deepFreeze(obj);

        expect(result).toBe(obj);
        expect(Object.isFrozen(obj)).toBe(true);
    });

    it('should recursively freeze nested objects', () => {
        const obj = { nested: { value: 1, deep: { x: 2 } } };
        deepFreeze(obj);

        expect(Object.isFrozen(obj)).toBe(true);
        expect(Object.isFrozen(obj.nested)).toBe(true);
        expect(Object.isFrozen(obj.nested.deep)).toBe(true);
    });

    it('should return primitives as-is', () => {
        expect(deepFreeze(null)).toBe(null);
        expect(deepFreeze(undefined)).toBe(undefined);
        expect(deepFreeze(42 as unknown)).toBe(42);
        expect(deepFreeze('hello' as unknown)).toBe('hello');
        expect(deepFreeze(true as unknown)).toBe(true);
    });

    it('should handle already frozen objects', () => {
        const obj = Object.freeze({ a: 1 });
        const result = deepFreeze(obj);

        expect(result).toBe(obj);
        expect(Object.isFrozen(obj)).toBe(true);
    });

    it('should handle circular references without infinite recursion', () => {
        const obj: Record<string, unknown> = { a: 1 };
        obj.self = obj;

        // 不应抛出错误
        deepFreeze(obj);

        expect(Object.isFrozen(obj)).toBe(true);
    });

    it('should freeze arrays and their elements', () => {
        const obj = { items: [{ id: 1 }, { id: 2 }] };
        deepFreeze(obj);

        expect(Object.isFrozen(obj)).toBe(true);
        expect(Object.isFrozen(obj.items)).toBe(true);
        expect(Object.isFrozen(obj.items[0])).toBe(true);
        expect(Object.isFrozen(obj.items[1])).toBe(true);
    });

    it('should handle empty objects', () => {
        const obj = {};
        deepFreeze(obj);
        expect(Object.isFrozen(obj)).toBe(true);
    });

    it('should handle objects with null/undefined properties', () => {
        const obj = { a: null, b: undefined, c: 'value' };
        deepFreeze(obj);
        expect(Object.isFrozen(obj)).toBe(true);
    });
});
