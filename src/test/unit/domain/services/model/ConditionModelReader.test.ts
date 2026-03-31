/**
 * ConditionModelReader 单元测试
 *
 * 验证条件模型读取器的移植正确性
 */

import { describe, it, expect } from 'vitest';
import { Key } from '../../../../../domain/services/model/utils/Key';
import {
    ConditionModelReader,
    ConditionModelReaderInstances,
} from '../../../../../domain/services/model/simplified/ConditionModelReader';
import { SimplifiedModelConfigError } from '../../../../../domain/services/model/simplified/GeneratedModelReader';

describe('ConditionModelReader', () => {
    describe('FISHING_ROD reader', () => {
        const reader = ConditionModelReaderInstances.FISHING_ROD;
        const id = Key.of('custom:my_fishing_rod');

        describe('convertFromTextures', () => {
            it('should require exactly 2 textures', () => {
                expect(() => {
                    reader.convertFromTextures(['t1'], [], id);
                }).toThrow(SimplifiedModelConfigError);

                expect(() => {
                    reader.convertFromTextures(['t1', 't2', 't3'], [], id);
                }).toThrow(SimplifiedModelConfigError);
            });

            it('should generate condition model with fishing_rod/cast property', () => {
                const textures = ['texture_normal', 'texture_cast'];
                const result = reader.convertFromTextures(textures, [], id);

                expect(result).not.toBeNull();
                expect(result!.type).toBe('condition');
                expect(result!.property).toBe('fishing_rod/cast');
            });

            it('should generate correct on-false structure', () => {
                const textures = ['texture_normal', 'texture_cast'];
                const result = reader.convertFromTextures(textures, [], id)!;

                const onFalse = result['on-false'] as Record<string, unknown>;
                expect(onFalse.path).toBe('custom:item/my_fishing_rod');

                const generation = onFalse.generation as Record<string, unknown>;
                expect(generation.parent).toBe('item/fishing_rod');

                const genTextures = generation.textures as Record<string, string>;
                expect(genTextures.layer0).toBe('texture_normal');
            });

            it('should generate correct on-true structure with _cast suffix', () => {
                const textures = ['texture_normal', 'texture_cast'];
                const result = reader.convertFromTextures(textures, [], id)!;

                const onTrue = result['on-true'] as Record<string, unknown>;
                expect(onTrue.path).toBe('custom:item/my_fishing_rod_cast');

                const generation = onTrue.generation as Record<string, unknown>;
                expect(generation.parent).toBe('item/fishing_rod');

                const genTextures = generation.textures as Record<string, string>;
                expect(genTextures.layer0).toBe('texture_cast');
            });

            it('should use provided model paths when specified', () => {
                const textures = ['t0', 't1'];
                const paths = ['path/normal', 'path/cast'];
                const result = reader.convertFromTextures(textures, paths, id)!;

                const onFalse = result['on-false'] as Record<string, unknown>;
                expect(onFalse.path).toBe('path/normal');

                const onTrue = result['on-true'] as Record<string, unknown>;
                expect(onTrue.path).toBe('path/cast');
            });

            it('should throw error when model paths count is invalid', () => {
                const textures = ['t0', 't1'];
                expect(() => {
                    reader.convertFromTextures(textures, ['p1'], id);
                }).toThrow(SimplifiedModelConfigError);
            });
        });

        describe('convertFromModels', () => {
            it('should require exactly 2 models', () => {
                expect(() => {
                    reader.convertFromModels(['m1']);
                }).toThrow(SimplifiedModelConfigError);
            });

            it('should generate correct condition model structure', () => {
                const models = ['model/normal', 'model/cast'];
                const result = reader.convertFromModels(models);

                expect(result.type).toBe('condition');
                expect(result.property).toBe('fishing_rod/cast');

                const onFalse = result['on-false'] as Record<string, unknown>;
                expect(onFalse.path).toBe('model/normal');

                const onTrue = result['on-true'] as Record<string, unknown>;
                expect(onTrue.path).toBe('model/cast');
            });
        });
    });

    describe('ELYTRA reader', () => {
        const reader = ConditionModelReaderInstances.ELYTRA;
        const id = Key.of('custom:my_elytra');

        it('should use broken property', () => {
            const textures = ['texture_normal', 'texture_broken'];
            const result = reader.convertFromTextures(textures, [], id)!;

            expect(result.type).toBe('condition');
            expect(result.property).toBe('broken');
        });

        it('should use _broken suffix for on-true path', () => {
            const textures = ['texture_normal', 'texture_broken'];
            const result = reader.convertFromTextures(textures, [], id)!;

            const onTrue = result['on-true'] as Record<string, unknown>;
            expect(onTrue.path).toBe('custom:item/my_elytra_broken');
        });

        it('should use generated parent model', () => {
            const textures = ['texture_normal', 'texture_broken'];
            const result = reader.convertFromTextures(textures, [], id)!;

            const onFalse = result['on-false'] as Record<string, unknown>;
            const generation = onFalse.generation as Record<string, unknown>;
            expect(generation.parent).toBe('item/generated');
        });
    });

    describe('SHIELD reader', () => {
        const reader = ConditionModelReaderInstances.SHIELD;
        const id = Key.of('custom:my_shield');

        it('should return null when using convertFromTextures (model is empty)', () => {
            const textures = ['texture_normal', 'texture_blocking'];
            const result = reader.convertFromTextures(textures, [], id);

            expect(result).toBeNull();
        });

        it('should still work with convertFromModels', () => {
            const models = ['model/shield', 'model/shield_blocking'];
            const result = reader.convertFromModels(models);

            expect(result.type).toBe('condition');
            expect(result.property).toBe('using_item');

            const onTrue = result['on-true'] as Record<string, unknown>;
            expect(onTrue.path).toBe('model/shield_blocking');
        });
    });

    describe('Custom ConditionModelReader', () => {
        it('should be configurable with custom model, property and suffix', () => {
            const customReader = new ConditionModelReader('handheld', 'custom/property', '_active');
            const id = Key.of('custom:my_item');

            const textures = ['texture_inactive', 'texture_active'];
            const result = customReader.convertFromTextures(textures, [], id)!;

            expect(result.property).toBe('custom/property');

            const onFalse = result['on-false'] as Record<string, unknown>;
            const generation = onFalse.generation as Record<string, unknown>;
            expect(generation.parent).toBe('item/handheld');

            const onTrue = result['on-true'] as Record<string, unknown>;
            expect(onTrue.path).toBe('custom:item/my_item_active');
        });
    });
});
