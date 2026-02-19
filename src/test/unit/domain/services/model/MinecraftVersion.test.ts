/**
 * MinecraftVersion 单元测试
 */

import { describe, it, expect } from 'vitest';
import {
    MinecraftVersion,
    MinecraftVersions,
} from '../../../../../domain/services/model/utils/MinecraftVersion';

describe('MinecraftVersion', () => {
    describe('constructor', () => {
        it('should create version from string', () => {
            const version = new MinecraftVersion('1.21.4');
            expect(version.version).toBe('1.21.4');
        });

        it('should parse version correctly', () => {
            const version = new MinecraftVersion('1.21');
            expect(version.version).toBe('1.21');
        });
    });

    describe('version comparison', () => {
        it('should compare versions correctly with isAtOrAbove', () => {
            const v1_21_4 = new MinecraftVersion('1.21.4');
            const v1_21 = new MinecraftVersion('1.21');
            const v1_20_6 = new MinecraftVersion('1.20.6');

            expect(v1_21_4.isAtOrAbove(v1_21)).toBe(true);
            expect(v1_21_4.isAtOrAbove(v1_21_4)).toBe(true);
            expect(v1_21.isAtOrAbove(v1_21_4)).toBe(false);
            expect(v1_21_4.isAtOrAbove(v1_20_6)).toBe(true);
        });

        it('should compare versions correctly with isBelow', () => {
            const v1_21_4 = new MinecraftVersion('1.21.4');
            const v1_21 = new MinecraftVersion('1.21');

            expect(v1_21.isBelow(v1_21_4)).toBe(true);
            expect(v1_21_4.isBelow(v1_21)).toBe(false);
            expect(v1_21_4.isBelow(v1_21_4)).toBe(false);
        });
    });

    describe('packFormat', () => {
        it('should return correct pack format for known versions', () => {
            expect(MinecraftVersions.V1_21_4.packFormat).toBe(46);
            expect(MinecraftVersions.V1_21_2.packFormat).toBe(42);
            expect(MinecraftVersions.V1_21.packFormat).toBe(34);
        });
    });

    describe('toString', () => {
        it('should return version string', () => {
            const version = new MinecraftVersion('1.21.4');
            expect(version.toString()).toBe('1.21.4');
        });
    });
});
