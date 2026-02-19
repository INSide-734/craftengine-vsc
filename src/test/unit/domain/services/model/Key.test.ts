/**
 * Key 单元测试
 */

import { describe, it, expect } from 'vitest';
import { Key } from '../../../../../domain/services/model/utils/Key';

describe('Key', () => {
    describe('of', () => {
        it('should parse namespaced key', () => {
            const key = Key.of('minecraft:diamond');
            expect(key.namespace).toBe('minecraft');
            expect(key.value).toBe('diamond');
        });

        it('should use minecraft namespace by default', () => {
            const key = Key.of('diamond');
            expect(key.namespace).toBe('minecraft');
            expect(key.value).toBe('diamond');
        });
    });

    describe('withDefaultNamespace', () => {
        it('should use provided namespace when no namespace in key', () => {
            const key = Key.withDefaultNamespace('my_item', 'custom');
            expect(key.namespace).toBe('custom');
            expect(key.value).toBe('my_item');
        });

        it('should preserve existing namespace', () => {
            const key = Key.withDefaultNamespace('other:my_item', 'custom');
            expect(key.namespace).toBe('other');
            expect(key.value).toBe('my_item');
        });
    });

    describe('asString', () => {
        it('should return full key string', () => {
            const key = Key.of('minecraft:diamond');
            expect(key.asString()).toBe('minecraft:diamond');
        });
    });

    describe('equals', () => {
        it('should return true for equal keys', () => {
            const key1 = Key.of('minecraft:diamond');
            const key2 = Key.of('minecraft:diamond');
            expect(key1.equals(key2)).toBe(true);
        });

        it('should return false for different keys', () => {
            const key1 = Key.of('minecraft:diamond');
            const key2 = Key.of('minecraft:gold');
            expect(key1.equals(key2)).toBe(false);
        });
    });
});
