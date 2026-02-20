import { describe, it, expect, beforeEach } from 'vitest';
import { safeCompileRegex, clearSafeRegexCache } from '../../../../core/utils/SafeRegex';

describe('safeCompileRegex', () => {
    beforeEach(() => {
        clearSafeRegexCache();
    });

    it('should compile a valid regex pattern', () => {
        const regex = safeCompileRegex('^[a-z]+$');
        expect(regex).toBeInstanceOf(RegExp);
        expect(regex!.test('hello')).toBe(true);
        expect(regex!.test('HELLO')).toBe(false);
    });

    it('should return null for patterns exceeding max length', () => {
        const longPattern = 'a'.repeat(201);
        expect(safeCompileRegex(longPattern)).toBeNull();
    });

    it('should respect custom maxLength parameter', () => {
        // 使用不同 pattern 避免缓存干扰
        const shortPattern = 'a'.repeat(8);
        const longPattern = 'b'.repeat(15);
        expect(safeCompileRegex(shortPattern, 10)).toBeInstanceOf(RegExp);
        expect(safeCompileRegex(longPattern, 10)).toBeNull();
    });

    it('should return null for nested quantifier patterns (ReDoS)', () => {
        // 嵌套量词模式
        expect(safeCompileRegex('(a+)+')).toBeNull();
        expect(safeCompileRegex('(a*)*')).toBeNull();
        expect(safeCompileRegex('(a+){2}')).toBeNull();
    });

    it('should return null for invalid regex syntax', () => {
        expect(safeCompileRegex('[invalid')).toBeNull();
        expect(safeCompileRegex('(?P<name>)')).toBeNull();
    });

    it('should cache compiled results', () => {
        const pattern = '^test$';
        const first = safeCompileRegex(pattern);
        const second = safeCompileRegex(pattern);

        // 应返回缓存的同一实例
        expect(first).toBe(second);
    });

    it('should cache null results for invalid patterns', () => {
        const pattern = '[invalid';
        const first = safeCompileRegex(pattern);
        const second = safeCompileRegex(pattern);

        expect(first).toBeNull();
        expect(second).toBeNull();
    });

    it('should handle empty pattern', () => {
        const regex = safeCompileRegex('');
        expect(regex).toBeInstanceOf(RegExp);
    });

    it('should handle common schema patterns', () => {
        // 命名空间 ID 模式
        const nsPattern = safeCompileRegex('^[a-z][a-z0-9_-]*:[a-z][a-z0-9_/-]*$');
        expect(nsPattern).toBeInstanceOf(RegExp);
        expect(nsPattern!.test('minecraft:stone')).toBe(true);
    });
});

describe('clearSafeRegexCache', () => {
    it('should clear the cache so patterns are recompiled', () => {
        const pattern = '^test$';
        const first = safeCompileRegex(pattern);
        clearSafeRegexCache();
        const second = safeCompileRegex(pattern);

        // 清除缓存后应该是新实例
        expect(first).not.toBe(second);
        expect(first).toEqual(second);
    });
});
