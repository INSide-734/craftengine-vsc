/**
 * ItemModel 单元测试
 *
 * 验证所有 ItemModel 类型的移植正确性
 */

import { describe, it, expect } from 'vitest';
import {
    EmptyItemModel,
    BaseItemModel,
    CompositeItemModel,
    ConditionItemModel,
    SelectItemModel,
    RangeDispatchItemModel,
    SpecialItemModel,
    BundleSelectedItemModel,
    MODEL_TYPES,
    createItemModel,
    normalizeModelPath,
} from '../../../../../domain/services/model/ItemModel';

describe('ItemModel', () => {
    describe('EmptyItemModel', () => {
        it('should have correct type', () => {
            const model = new EmptyItemModel();
            expect(model.type).toBe(MODEL_TYPES.EMPTY);
        });

        it('should generate correct JSON', () => {
            const model = new EmptyItemModel();
            const json = model.toJson();
            expect(json.type).toBe('minecraft:empty');
        });

        it('should return empty models to generate', () => {
            const model = new EmptyItemModel();
            expect(model.modelsToGenerate()).toEqual([]);
        });

        it('should return empty revisions', () => {
            const model = new EmptyItemModel();
            expect(model.revisions()).toEqual([]);
        });
    });

    describe('BaseItemModel', () => {
        it('should have correct type', () => {
            const model = new BaseItemModel('minecraft:item/diamond');
            expect(model.type).toBe(MODEL_TYPES.MODEL);
        });

        it('should generate correct JSON', () => {
            const model = new BaseItemModel('minecraft:item/diamond');
            const json = model.toJson();
            expect(json.type).toBe('minecraft:model');
            expect(json.model).toBe('minecraft:item/diamond');
        });

        it('should include tints in JSON when provided', () => {
            const mockTint = { toJson: () => ({ type: 'constant', value: 0xff0000 }) };
            const model = new BaseItemModel('minecraft:item/diamond', [mockTint as never]);
            const json = model.toJson();
            expect(json.tints).toHaveLength(1);
        });

        it('should return model generation when provided', () => {
            const modelGeneration = {
                path: 'minecraft:item/diamond',
                parentModelPath: 'minecraft:item/generated',
            };
            const model = new BaseItemModel('minecraft:item/diamond', [], modelGeneration);
            const generations = model.modelsToGenerate();
            expect(generations).toHaveLength(1);
            expect(generations[0]).toBe(modelGeneration);
        });
    });

    describe('CompositeItemModel', () => {
        it('should have correct type', () => {
            const model = new CompositeItemModel([]);
            expect(model.type).toBe(MODEL_TYPES.COMPOSITE);
        });

        it('should generate correct JSON with child models', () => {
            const child1 = new EmptyItemModel();
            const child2 = new BaseItemModel('minecraft:item/diamond');
            const model = new CompositeItemModel([child1, child2]);

            const json = model.toJson();
            expect(json.type).toBe('minecraft:composite');
            expect(Array.isArray(json.models)).toBe(true);
            expect((json.models as unknown[]).length).toBe(2);
        });

        it('should aggregate modelsToGenerate from children', () => {
            const generation = {
                path: 'minecraft:item/diamond',
                parentModelPath: 'minecraft:item/generated',
            };
            const child1 = new BaseItemModel('minecraft:item/diamond', [], generation);
            const child2 = new EmptyItemModel();
            const model = new CompositeItemModel([child1, child2]);

            expect(model.modelsToGenerate()).toHaveLength(1);
        });

        it('should aggregate revisions from children', () => {
            const child1 = new EmptyItemModel();
            const child2 = new EmptyItemModel();
            const model = new CompositeItemModel([child1, child2]);

            expect(model.revisions()).toEqual([]);
        });
    });

    describe('ConditionItemModel', () => {
        it('should have correct type', () => {
            const model = new ConditionItemModel('using_item', {}, new EmptyItemModel(), new EmptyItemModel());
            expect(model.type).toBe(MODEL_TYPES.CONDITION);
        });

        it('should generate correct JSON', () => {
            const onTrue = new BaseItemModel('minecraft:item/active');
            const onFalse = new BaseItemModel('minecraft:item/inactive');
            const model = new ConditionItemModel('using_item', {}, onTrue, onFalse);

            const json = model.toJson();
            expect(json.type).toBe('minecraft:condition');
            expect(json.property).toBe('using_item');
            expect(json.on_true).toBeDefined();
            expect(json.on_false).toBeDefined();
        });

        it('should include property args in JSON', () => {
            const model = new ConditionItemModel(
                'custom_model_data',
                { index: 0 },
                new EmptyItemModel(),
                new EmptyItemModel(),
            );

            const json = model.toJson();
            expect(json.index).toBe(0);
        });

        it('should aggregate modelsToGenerate from both branches', () => {
            const gen1 = { path: 'path1', parentModelPath: 'parent1' };
            const gen2 = { path: 'path2', parentModelPath: 'parent2' };
            const onTrue = new BaseItemModel('path1', [], gen1);
            const onFalse = new BaseItemModel('path2', [], gen2);
            const model = new ConditionItemModel('using_item', {}, onTrue, onFalse);

            expect(model.modelsToGenerate()).toHaveLength(2);
        });
    });

    describe('SelectItemModel', () => {
        it('should have correct type', () => {
            const model = new SelectItemModel('charge_type', {}, []);
            expect(model.type).toBe(MODEL_TYPES.SELECT);
        });

        it('should generate correct JSON with cases', () => {
            const cases = [
                { when: 'arrow', model: new BaseItemModel('minecraft:item/arrow') },
                { when: 'rocket', model: new BaseItemModel('minecraft:item/rocket') },
            ];
            const fallback = new EmptyItemModel();
            const model = new SelectItemModel('charge_type', {}, cases, fallback);

            const json = model.toJson();
            expect(json.type).toBe('minecraft:select');
            expect(json.property).toBe('charge_type');
            expect(Array.isArray(json.cases)).toBe(true);
            expect((json.cases as unknown[]).length).toBe(2);
            expect(json.fallback).toBeDefined();
        });

        it('should not include fallback if not provided', () => {
            const model = new SelectItemModel('charge_type', {}, []);
            const json = model.toJson();
            expect(json.fallback).toBeUndefined();
        });

        it('should aggregate modelsToGenerate from all cases and fallback', () => {
            const gen1 = { path: 'path1', parentModelPath: 'parent1' };
            const gen2 = { path: 'path2', parentModelPath: 'parent2' };
            const genFallback = { path: 'fallback', parentModelPath: 'parent' };
            const cases = [
                { when: 'a', model: new BaseItemModel('path1', [], gen1) },
                { when: 'b', model: new BaseItemModel('path2', [], gen2) },
            ];
            const fallback = new BaseItemModel('fallback', [], genFallback);
            const model = new SelectItemModel('property', {}, cases, fallback);

            expect(model.modelsToGenerate()).toHaveLength(3);
        });
    });

    describe('RangeDispatchItemModel', () => {
        it('should have correct type', () => {
            const model = new RangeDispatchItemModel('use_duration', {}, 1, []);
            expect(model.type).toBe(MODEL_TYPES.RANGE_DISPATCH);
        });

        it('should generate correct JSON with entries', () => {
            const entries = [
                { threshold: 0.5, model: new BaseItemModel('minecraft:item/half') },
                { threshold: 1.0, model: new BaseItemModel('minecraft:item/full') },
            ];
            const fallback = new EmptyItemModel();
            const model = new RangeDispatchItemModel('use_duration', {}, 0.05, entries, fallback);

            const json = model.toJson();
            expect(json.type).toBe('minecraft:range_dispatch');
            expect(json.property).toBe('use_duration');
            expect(json.scale).toBe(0.05);
            expect(Array.isArray(json.entries)).toBe(true);
            expect((json.entries as unknown[]).length).toBe(2);
            expect(json.fallback).toBeDefined();
        });

        it('should not include scale if it equals 1', () => {
            const model = new RangeDispatchItemModel('property', {}, 1, []);
            const json = model.toJson();
            expect(json.scale).toBeUndefined();
        });

        it('should aggregate modelsToGenerate from entries and fallback', () => {
            const gen1 = { path: 'path1', parentModelPath: 'parent1' };
            const genFallback = { path: 'fallback', parentModelPath: 'parent' };
            const entries = [{ threshold: 0.5, model: new BaseItemModel('path1', [], gen1) }];
            const fallback = new BaseItemModel('fallback', [], genFallback);
            const model = new RangeDispatchItemModel('property', {}, 1, entries, fallback);

            expect(model.modelsToGenerate()).toHaveLength(2);
        });
    });

    describe('SpecialItemModel', () => {
        it('should have correct type', () => {
            const model = new SpecialItemModel({ type: 'minecraft:banner' });
            expect(model.type).toBe(MODEL_TYPES.SPECIAL);
        });

        it('should generate correct JSON', () => {
            const model = new SpecialItemModel({ type: 'minecraft:banner' }, 'minecraft:entity/banner');

            const json = model.toJson();
            expect(json.type).toBe('minecraft:special');
            expect(json.model).toEqual({ type: 'minecraft:banner' });
            expect(json.base).toBe('minecraft:entity/banner');
        });

        it('should not include base if not provided', () => {
            const model = new SpecialItemModel({ type: 'minecraft:banner' });
            const json = model.toJson();
            expect(json.base).toBeUndefined();
        });
    });

    describe('BundleSelectedItemModel', () => {
        it('should have correct type', () => {
            const model = new BundleSelectedItemModel();
            expect(model.type).toBe(MODEL_TYPES.BUNDLE_SELECTED_ITEM);
        });

        it('should generate correct JSON', () => {
            const model = new BundleSelectedItemModel();
            const json = model.toJson();
            expect(json.type).toBe('minecraft:bundle/selected_item');
        });
    });

    describe('normalizeModelPath', () => {
        it('should add default namespace for simple path', () => {
            expect(normalizeModelPath('diamond')).toBe('minecraft:item/diamond');
        });

        it('should preserve existing namespace', () => {
            expect(normalizeModelPath('custom:diamond')).toBe('custom:item/diamond');
        });

        it('should preserve path with slash', () => {
            expect(normalizeModelPath('custom:block/stone')).toBe('custom:block/stone');
        });

        it('should add item/ prefix for namespaced path without slash', () => {
            expect(normalizeModelPath('custom:diamond')).toBe('custom:item/diamond');
        });
    });

    describe('createItemModel factory', () => {
        it('should create EmptyItemModel for string "empty"', () => {
            const model = createItemModel({ type: 'empty' });
            expect(model).toBeInstanceOf(EmptyItemModel);
        });

        it('should create EmptyItemModel for type minecraft:empty', () => {
            const model = createItemModel({ type: 'minecraft:empty' });
            expect(model).toBeInstanceOf(EmptyItemModel);
        });

        it('should create BaseItemModel for string path', () => {
            const model = createItemModel('minecraft:item/diamond');
            expect(model).toBeInstanceOf(BaseItemModel);
        });

        it('should create BaseItemModel for model config', () => {
            const model = createItemModel({ type: 'model', path: 'minecraft:item/diamond' });
            expect(model).toBeInstanceOf(BaseItemModel);
        });

        it('should create CompositeItemModel for composite config', () => {
            const model = createItemModel({
                type: 'composite',
                models: [{ type: 'empty' }, { path: 'minecraft:item/diamond' }],
            });
            expect(model).toBeInstanceOf(CompositeItemModel);
        });

        it('should create ConditionItemModel for condition config', () => {
            const model = createItemModel({
                type: 'condition',
                property: 'using_item',
                'on-true': { type: 'empty' },
                'on-false': { path: 'minecraft:item/diamond' },
            });
            expect(model).toBeInstanceOf(ConditionItemModel);
        });

        it('should create SelectItemModel for select config', () => {
            const model = createItemModel({
                type: 'select',
                property: 'charge_type',
                cases: [{ when: 'arrow', model: { type: 'empty' } }],
            });
            expect(model).toBeInstanceOf(SelectItemModel);
        });

        it('should create RangeDispatchItemModel for range_dispatch config', () => {
            const model = createItemModel({
                type: 'range_dispatch',
                property: 'use_duration',
                scale: 0.05,
                entries: [{ threshold: 0.5, model: { type: 'empty' } }],
            });
            expect(model).toBeInstanceOf(RangeDispatchItemModel);
        });

        it('should create SpecialItemModel for special config', () => {
            const model = createItemModel({
                type: 'special',
                model: { type: 'minecraft:banner' },
            });
            expect(model).toBeInstanceOf(SpecialItemModel);
        });

        it('should create BundleSelectedItemModel for bundle/selected_item config', () => {
            const model = createItemModel({ type: 'bundle/selected_item' });
            expect(model).toBeInstanceOf(BundleSelectedItemModel);
        });

        it('should create EmptyItemModel for null or undefined', () => {
            expect(createItemModel(null)).toBeInstanceOf(EmptyItemModel);
            expect(createItemModel(undefined)).toBeInstanceOf(EmptyItemModel);
        });

        it('should handle on_true/on_false alternative syntax', () => {
            const model = createItemModel({
                type: 'condition',
                property: 'using_item',
                on_true: { type: 'empty' },
                on_false: { path: 'minecraft:item/diamond' },
            });
            expect(model).toBeInstanceOf(ConditionItemModel);
        });
    });
});
