/**
 * CrossbowModelReader 单元测试
 *
 * 验证弩模型读取器的移植正确性
 */

import { describe, it, expect } from 'vitest';
import { Key } from '../../../../../domain/services/model/utils/Key';
import { CrossbowModelReaderInstance } from '../../../../../domain/services/model/simplified/CrossbowModelReader';
import { SimplifiedModelConfigError } from '../../../../../domain/services/model/simplified/GeneratedModelReader';

describe('CrossbowModelReader', () => {
    const reader = CrossbowModelReaderInstance;
    const id = Key.of('custom:my_crossbow');

    describe('convertFromTextures', () => {
        it('should require exactly 6 textures', () => {
            expect(() => {
                reader.convertFromTextures(['t1', 't2', 't3'], [], id);
            }).toThrow(SimplifiedModelConfigError);

            expect(() => {
                reader.convertFromTextures(['t1'], [], id);
            }).toThrow();
        });

        it('should generate condition model with auto model paths', () => {
            const textures = ['t0', 't1', 't2', 't3', 't4', 't5'];
            const result = reader.convertFromTextures(textures, [], id);

            expect(result).not.toBeNull();
            expect(result.type).toBe('condition');
            expect(result.property).toBe('using_item');
        });

        it('should generate correct on-false structure (select model)', () => {
            const textures = ['t0', 't1', 't2', 't3', 't4', 't5'];
            const result = reader.convertFromTextures(textures, [], id);

            const onFalse = result['on-false'] as Record<string, unknown>;
            expect(onFalse.type).toBe('select');
            expect(onFalse.property).toBe('charge_type');

            // 检查 cases
            const cases = onFalse.cases as Array<Record<string, unknown>>;
            expect(cases).toHaveLength(2);
            expect(cases[0].when).toBe('arrow');
            expect(cases[1].when).toBe('rocket');

            // 检查 arrow case
            const arrowModel = cases[0].model as Record<string, unknown>;
            expect(arrowModel.path).toBe('custom:item/my_crossbow_arrow');
            const arrowGeneration = arrowModel.generation as Record<string, unknown>;
            expect(arrowGeneration.parent).toBe('item/crossbow_arrow');

            // 检查 rocket case
            const rocketModel = cases[1].model as Record<string, unknown>;
            expect(rocketModel.path).toBe('custom:item/my_crossbow_firework');
            const rocketGeneration = rocketModel.generation as Record<string, unknown>;
            expect(rocketGeneration.parent).toBe('item/crossbow_firework');

            // 检查 fallback
            const fallback = onFalse.fallback as Record<string, unknown>;
            expect(fallback.path).toBe('custom:item/my_crossbow');
            const fallbackGeneration = fallback.generation as Record<string, unknown>;
            expect(fallbackGeneration.parent).toBe('item/crossbow');
        });

        it('should generate correct on-true structure (range_dispatch model)', () => {
            const textures = ['t0', 't1', 't2', 't3', 't4', 't5'];
            const result = reader.convertFromTextures(textures, [], id);

            const onTrue = result['on-true'] as Record<string, unknown>;
            expect(onTrue.type).toBe('range_dispatch');
            expect(onTrue.property).toBe('crossbow/pull');

            // 检查 entries
            const entries = onTrue.entries as Array<Record<string, unknown>>;
            expect(entries).toHaveLength(2);

            // 检查第一个 entry (threshold 0.58)
            expect(entries[0].threshold).toBe(0.58);
            const entry1Model = entries[0].model as Record<string, unknown>;
            expect(entry1Model.path).toBe('custom:item/my_crossbow_pulling_1');

            // 检查第二个 entry (threshold 1.0)
            expect(entries[1].threshold).toBe(1.0);
            const entry2Model = entries[1].model as Record<string, unknown>;
            expect(entry2Model.path).toBe('custom:item/my_crossbow_pulling_2');

            // 检查 fallback
            const fallback = onTrue.fallback as Record<string, unknown>;
            expect(fallback.path).toBe('custom:item/my_crossbow_pulling_0');
        });

        it('should use provided model paths when specified', () => {
            const textures = ['t0', 't1', 't2', 't3', 't4', 't5'];
            const paths = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
            const result = reader.convertFromTextures(textures, paths, id);

            const onFalse = result['on-false'] as Record<string, unknown>;
            const fallback = onFalse.fallback as Record<string, unknown>;
            expect(fallback.path).toBe('p0');

            const cases = onFalse.cases as Array<Record<string, unknown>>;
            const arrowModel = cases[0].model as Record<string, unknown>;
            expect(arrowModel.path).toBe('p4');
            const rocketModel = cases[1].model as Record<string, unknown>;
            expect(rocketModel.path).toBe('p5');

            const onTrue = result['on-true'] as Record<string, unknown>;
            const onTrueFallback = onTrue.fallback as Record<string, unknown>;
            expect(onTrueFallback.path).toBe('p1');
        });

        it('should throw error when model paths count is invalid', () => {
            const textures = ['t0', 't1', 't2', 't3', 't4', 't5'];
            expect(() => {
                reader.convertFromTextures(textures, ['p1', 'p2'], id);
            }).toThrow(SimplifiedModelConfigError);
        });
    });

    describe('convertFromModels', () => {
        it('should require exactly 6 models', () => {
            expect(() => {
                reader.convertFromModels(['m1', 'm2', 'm3']);
            }).toThrow(SimplifiedModelConfigError);
        });

        it('should generate correct condition model structure', () => {
            const models = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5'];
            const result = reader.convertFromModels(models);

            expect(result.type).toBe('condition');
            expect(result.property).toBe('using_item');

            // 检查 on-false
            const onFalse = result['on-false'] as Record<string, unknown>;
            expect(onFalse.type).toBe('select');
            const fallback = onFalse.fallback as Record<string, unknown>;
            expect(fallback.path).toBe('m0');

            // 检查 on-true
            const onTrue = result['on-true'] as Record<string, unknown>;
            expect(onTrue.type).toBe('range_dispatch');

            const entries = onTrue.entries as Array<Record<string, unknown>>;
            const entry1Model = entries[0].model as Record<string, unknown>;
            expect(entry1Model.path).toBe('m2');
            const entry2Model = entries[1].model as Record<string, unknown>;
            expect(entry2Model.path).toBe('m3');

            const onTrueFallback = onTrue.fallback as Record<string, unknown>;
            expect(onTrueFallback.path).toBe('m1');
        });
    });
});
