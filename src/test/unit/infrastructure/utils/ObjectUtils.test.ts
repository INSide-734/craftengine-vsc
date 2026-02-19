import { describe, it, expect } from 'vitest';
import {
    getNestedValue,
    setNestedValue,
    deleteNestedValue,
    hasNestedPath,
    deepClone,
    deepMerge,
    isPlainObject,
    pick,
    omit,
    isEmpty,
    getAllPaths,
    unflatten,
    flatten
} from '../../../../infrastructure/utils/ObjectUtils';

describe('ObjectUtils', () => {
    describe('getNestedValue', () => {
        it('should get deeply nested value', () => {
            const obj = { a: { b: { c: 1 } } };
            expect(getNestedValue(obj, 'a.b.c')).toBe(1);
        });

        it('should return default value for missing path', () => {
            const obj = { a: { b: 1 } };
            expect(getNestedValue(obj, 'a.b.d', 'default')).toBe('default');
            expect(getNestedValue(obj, 'x.y.z')).toBeUndefined();
        });

        it('should handle null in path', () => {
            const obj = { a: { b: null } } as Record<string, unknown>;
            expect(getNestedValue(obj, 'a.b.c', 'fallback')).toBe('fallback');
        });

        it('should get top-level value', () => {
            const obj = { a: 42 };
            expect(getNestedValue(obj, 'a')).toBe(42);
        });
    });

    describe('setNestedValue', () => {
        it('should set deeply nested value', () => {
            const obj: Record<string, unknown> = {};
            setNestedValue(obj, 'a.b.c', 1);
            expect((obj as { a: { b: { c: number } } }).a.b.c).toBe(1);
        });

        it('should overwrite existing value', () => {
            const obj: Record<string, unknown> = { a: { b: { c: 1 } } };
            setNestedValue(obj, 'a.b.c', 2);
            expect((obj as { a: { b: { c: number } } }).a.b.c).toBe(2);
        });

        it('should create intermediate objects', () => {
            const obj: Record<string, unknown> = { a: 'not-object' };
            setNestedValue(obj, 'a.b', 1);
            expect((obj as { a: { b: number } }).a.b).toBe(1);
        });
    });

    describe('deleteNestedValue', () => {
        it('should delete nested value', () => {
            const obj = { a: { b: { c: 1 } } };
            expect(deleteNestedValue(obj, 'a.b.c')).toBe(true);
            expect((obj as { a: { b: Record<string, unknown> } }).a.b).toEqual({});
        });

        it('should return false for non-existent path', () => {
            const obj = { a: 1 };
            expect(deleteNestedValue(obj, 'x.y.z')).toBe(false);
        });
    });

    describe('hasNestedPath', () => {
        it('should return true for existing path', () => {
            const obj = { a: { b: 1 } };
            expect(hasNestedPath(obj, 'a.b')).toBe(true);
            expect(hasNestedPath(obj, 'a')).toBe(true);
        });

        it('should return false for missing path', () => {
            const obj = { a: { b: 1 } };
            expect(hasNestedPath(obj, 'a.c')).toBe(false);
            expect(hasNestedPath(obj, 'x')).toBe(false);
        });
    });

    describe('deepClone', () => {
        it('should create deep copy', () => {
            const original = { a: { b: [1, 2, 3] } };
            const cloned = deepClone(original);
            cloned.a.b.push(4);
            expect(original.a.b).toEqual([1, 2, 3]);
            expect(cloned.a.b).toEqual([1, 2, 3, 4]);
        });

        it('should handle primitives', () => {
            expect(deepClone(42)).toBe(42);
            expect(deepClone('hello')).toBe('hello');
            expect(deepClone(null)).toBe(null);
        });
    });

    describe('deepMerge', () => {
        it('should deep merge objects', () => {
            const obj1 = { a: { b: 1, c: 2 } };
            const obj2 = { a: { b: 3, d: 4 } } as unknown as Partial<typeof obj1>;
            const merged = deepMerge(obj1, obj2);
            expect(merged).toEqual({ a: { b: 3, c: 2, d: 4 } });
        });

        it('should not mutate original objects', () => {
            const obj1 = { a: { b: 1 } };
            const obj2 = { a: { c: 2 } } as unknown as Partial<typeof obj1>;
            deepMerge(obj1, obj2);
            expect(obj1).toEqual({ a: { b: 1 } });
        });

        it('should handle no sources', () => {
            const obj = { a: 1 };
            expect(deepMerge(obj)).toEqual({ a: 1 });
        });

        it('should skip null/undefined sources', () => {
            const obj = { a: 1 };
            expect(deepMerge(obj, null as unknown as Partial<typeof obj>, undefined as unknown as Partial<typeof obj>)).toEqual({ a: 1 });
        });

        it('should overwrite arrays', () => {
            const obj1 = { a: [1, 2] } as Record<string, unknown>;
            const obj2 = { a: [3, 4] } as Record<string, unknown>;
            const merged = deepMerge(obj1, obj2);
            expect(merged.a).toEqual([3, 4]);
        });
    });

    describe('isPlainObject', () => {
        it('should return true for plain objects', () => {
            expect(isPlainObject({})).toBe(true);
            expect(isPlainObject({ a: 1 })).toBe(true);
            expect(isPlainObject(Object.create(null))).toBe(true);
        });

        it('should return false for non-plain objects', () => {
            expect(isPlainObject([])).toBe(false);
            expect(isPlainObject(null)).toBe(false);
            expect(isPlainObject(new Date())).toBe(false);
            expect(isPlainObject('string')).toBe(false);
            expect(isPlainObject(42)).toBe(false);
        });
    });

    describe('pick', () => {
        it('should pick specified keys', () => {
            const obj = { a: 1, b: 2, c: 3 };
            expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
        });

        it('should ignore missing keys', () => {
            const obj = { a: 1, b: 2 };
            expect(pick(obj, ['a', 'c' as keyof typeof obj])).toEqual({ a: 1 });
        });
    });

    describe('omit', () => {
        it('should omit specified keys', () => {
            const obj = { a: 1, b: 2, c: 3 };
            expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 });
        });

        it('should return copy when omitting nothing', () => {
            const obj = { a: 1 };
            const result = omit(obj, []);
            expect(result).toEqual({ a: 1 });
            expect(result).not.toBe(obj);
        });
    });

    describe('isEmpty', () => {
        it('should return true for empty objects', () => {
            expect(isEmpty({})).toBe(true);
            expect(isEmpty(null)).toBe(true);
            expect(isEmpty(undefined)).toBe(true);
        });

        it('should return false for non-empty objects', () => {
            expect(isEmpty({ a: 1 })).toBe(false);
        });
    });

    describe('getAllPaths', () => {
        it('should return all leaf paths', () => {
            const obj = { a: { b: 1, c: { d: 2 } }, e: 3 };
            const paths = getAllPaths(obj);
            expect(paths).toEqual(['a.b', 'a.c.d', 'e']);
        });

        it('should handle flat object', () => {
            expect(getAllPaths({ a: 1, b: 2 })).toEqual(['a', 'b']);
        });

        it('should handle empty object', () => {
            expect(getAllPaths({})).toEqual([]);
        });
    });

    describe('unflatten', () => {
        it('should convert flat to nested', () => {
            const flat = { 'a.b.c': 1, 'a.d': 2 };
            expect(unflatten(flat)).toEqual({ a: { b: { c: 1 }, d: 2 } });
        });
    });

    describe('flatten', () => {
        it('should convert nested to flat', () => {
            const nested = { a: { b: { c: 1 }, d: 2 } };
            expect(flatten(nested)).toEqual({ 'a.b.c': 1, 'a.d': 2 });
        });

        it('should handle flat object', () => {
            expect(flatten({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
        });
    });

    describe('flatten and unflatten roundtrip', () => {
        it('should be reversible', () => {
            const original = { a: { b: { c: 1 }, d: 2 }, e: 3 };
            expect(unflatten(flatten(original))).toEqual(original);
        });
    });
});
