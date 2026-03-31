/**
 * SimplifiedModelReader 单元测试
 *
 * 验证简化模型读取器的移植正确性
 */

import { describe, it, expect } from 'vitest';
import { Key } from '../../../../../domain/services/model/utils/Key';
import {
    GeneratedModelReaderInstances,
    BowModelReaderInstance,
    SimplifiedModelConfigError,
} from '../../../../../domain/services/model/simplified';

describe('SimplifiedModelReader', () => {
    describe('GeneratedModelReader (GENERATED)', () => {
        const reader = GeneratedModelReaderInstances.GENERATED;
        const id = Key.of('custom:my_item');

        describe('convertFromTextures', () => {
            it('should convert single texture to model', () => {
                const result = reader.convertFromTextures(['custom:item/my_texture'], [], id);

                expect(result).not.toBeNull();
                expect(result.type).toBe('model');
                expect(result.path).toBe('custom:item/my_item');
            });

            it('should use auto model path when no paths provided', () => {
                const result = reader.convertFromTextures(['texture1'], [], id);

                expect(result.path).toBe('custom:item/my_item');
            });

            it('should use provided model path when specified', () => {
                const result = reader.convertFromTextures(['texture1'], ['custom:path/to/model'], id);

                expect(result.path).toBe('custom:path/to/model');
            });

            it('should convert 2 textures to layers', () => {
                const result = reader.convertFromTextures(['texture1', 'texture2'], [], id);

                const generation = result.generation as Record<string, unknown>;
                const textures = generation.textures as Record<string, string>;
                expect(textures.layer0).toBe('texture1');
                expect(textures.layer1).toBe('texture2');
            });

            it('should convert multiple textures to layers', () => {
                const result = reader.convertFromTextures(['texture1', 'texture2', 'texture3'], [], id);

                const generation = result.generation as Record<string, unknown>;
                const textures = generation.textures as Record<string, string>;
                expect(textures.layer0).toBe('texture1');
                expect(textures.layer1).toBe('texture2');
                expect(textures.layer2).toBe('texture3');
            });

            it('should use generated parent model', () => {
                const result = reader.convertFromTextures(['texture1'], [], id);

                const generation = result.generation as Record<string, unknown>;
                expect(generation.parent).toBe('item/generated');
            });

            it('should throw error when more than 1 model path provided', () => {
                expect(() => {
                    reader.convertFromTextures(['texture1'], ['path1', 'path2'], id);
                }).toThrow(SimplifiedModelConfigError);
            });
        });

        describe('convertFromModels', () => {
            it('should return simple path for single model', () => {
                const result = reader.convertFromModels(['custom:item/my_model']);

                expect(result).not.toBeNull();
                expect(result!.path).toBe('custom:item/my_model');
            });

            it('should return composite for multiple models', () => {
                const result = reader.convertFromModels(['custom:item/model1', 'custom:item/model2']);

                expect(result).not.toBeNull();
                expect(result!.type).toBe('composite');
                expect(result!.models).toEqual(['custom:item/model1', 'custom:item/model2']);
            });
        });
    });

    describe('GeneratedModelReader (HANDHELD)', () => {
        const reader = GeneratedModelReaderInstances.HANDHELD;
        const id = Key.of('custom:my_sword');

        it('should use handheld parent model', () => {
            const result = reader.convertFromTextures(['texture1'], [], id);

            const generation = result.generation as Record<string, unknown>;
            expect(generation.parent).toBe('item/handheld');
        });
    });

    describe('BowModelReader', () => {
        const reader = BowModelReaderInstance;
        const id = Key.of('custom:my_bow');

        describe('convertFromTextures', () => {
            it('should require exactly 4 textures', () => {
                expect(() => {
                    reader.convertFromTextures(['t1', 't2'], [], id);
                }).toThrow(SimplifiedModelConfigError);

                expect(() => {
                    reader.convertFromTextures(['t1', 't2', 't3', 't4', 't5'], [], id);
                }).toThrow(SimplifiedModelConfigError);
            });

            it('should generate condition model for bow', () => {
                const result = reader.convertFromTextures(['t0', 't1', 't2', 't3'], [], id);

                expect(result).not.toBeNull();
                expect(result.type).toBe('condition');
                expect(result.property).toBe('using_item');
            });

            it('should generate correct on-false structure (normal bow)', () => {
                const textures = ['texture_normal', 'texture_pulling_0', 'texture_pulling_1', 'texture_pulling_2'];
                const result = reader.convertFromTextures(textures, [], id);

                const onFalse = result['on-false'] as Record<string, unknown>;
                expect(onFalse.path).toBe('custom:item/my_bow');

                const generation = onFalse.generation as Record<string, unknown>;
                expect(generation.parent).toBe('item/bow');

                const genTextures = generation.textures as Record<string, string>;
                expect(genTextures.layer0).toBe('texture_normal');
            });

            it('should generate correct on-true structure (range_dispatch)', () => {
                const textures = ['t0', 't1', 't2', 't3'];
                const result = reader.convertFromTextures(textures, [], id);

                const onTrue = result['on-true'] as Record<string, unknown>;
                expect(onTrue.type).toBe('range_dispatch');
                expect(onTrue.property).toBe('use_duration');
                expect(onTrue.scale).toBe(0.05);

                // 检查 entries
                const entries = onTrue.entries as Array<Record<string, unknown>>;
                expect(entries).toHaveLength(2);

                // threshold 0.65
                expect(entries[0].threshold).toBe(0.65);
                const entry1Model = entries[0].model as Record<string, unknown>;
                expect(entry1Model.path).toBe('custom:item/my_bow_pulling_1');

                // threshold 0.9
                expect(entries[1].threshold).toBe(0.9);
                const entry2Model = entries[1].model as Record<string, unknown>;
                expect(entry2Model.path).toBe('custom:item/my_bow_pulling_2');

                // fallback (pulling_0)
                const fallback = onTrue.fallback as Record<string, unknown>;
                expect(fallback.path).toBe('custom:item/my_bow_pulling_0');
            });

            it('should use provided model paths when specified', () => {
                const textures = ['t0', 't1', 't2', 't3'];
                const paths = ['path0', 'path1', 'path2', 'path3'];
                const result = reader.convertFromTextures(textures, paths, id);

                const onFalse = result['on-false'] as Record<string, unknown>;
                expect(onFalse.path).toBe('path0');

                const onTrue = result['on-true'] as Record<string, unknown>;
                const entries = onTrue.entries as Array<Record<string, unknown>>;

                const entry1Model = entries[0].model as Record<string, unknown>;
                expect(entry1Model.path).toBe('path2');

                const entry2Model = entries[1].model as Record<string, unknown>;
                expect(entry2Model.path).toBe('path3');

                const fallback = onTrue.fallback as Record<string, unknown>;
                expect(fallback.path).toBe('path1');
            });

            it('should throw error when model paths count is invalid', () => {
                const textures = ['t0', 't1', 't2', 't3'];
                expect(() => {
                    reader.convertFromTextures(textures, ['p1', 'p2'], id);
                }).toThrow(SimplifiedModelConfigError);
            });
        });

        describe('convertFromModels', () => {
            it('should require exactly 4 models', () => {
                expect(() => {
                    reader.convertFromModels(['m1', 'm2']);
                }).toThrow(SimplifiedModelConfigError);
            });

            it('should generate correct condition model structure', () => {
                const models = ['model0', 'model1', 'model2', 'model3'];
                const result = reader.convertFromModels(models);

                expect(result.type).toBe('condition');
                expect(result.property).toBe('using_item');

                const onFalse = result['on-false'] as Record<string, unknown>;
                expect(onFalse.path).toBe('model0');

                const onTrue = result['on-true'] as Record<string, unknown>;
                expect(onTrue.type).toBe('range_dispatch');

                const entries = onTrue.entries as Array<Record<string, unknown>>;
                const entry1Model = entries[0].model as Record<string, unknown>;
                expect(entry1Model.path).toBe('model2');

                const entry2Model = entries[1].model as Record<string, unknown>;
                expect(entry2Model.path).toBe('model3');

                const fallback = onTrue.fallback as Record<string, unknown>;
                expect(fallback.path).toBe('model1');
            });
        });
    });
});
