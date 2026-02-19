/**
 * 内置注册表
 *
 * 简化后的内置注册表实现，移除冗余的类型转换。
 */

import { Registry } from './Registry';
import { SimpleRegistry } from './SimpleRegistry';
import { Registries } from './Registries';
import { ConditionPropertyFactory, ConditionPropertyReader } from '../condition';
import { RangeDispatchPropertyFactory, RangeDispatchPropertyReader } from '../rangedispatch';
import { SelectPropertyFactory, SelectPropertyReader } from '../select';
import { SpecialModelFactory, SpecialModelReader } from '../special';

// ============================================
// 物品模型工厂和读取器接口
// ============================================

export interface ItemModelFactory {
    create(arguments_: Record<string, unknown>): unknown;
}

export interface ItemModelReader {
    read(json: Record<string, unknown>): unknown;
}

// ============================================
// 辅助函数：创建注册表
// ============================================

function createRegistry<T>(registryKey: unknown): Registry<T> {
    return new SimpleRegistry<T>(registryKey as never);
}

// ============================================
// 内置注册表
// ============================================

export const BuiltInRegistries = {
    ITEM_MODEL_FACTORY: createRegistry<ItemModelFactory>(Registries.ITEM_MODEL_FACTORY),
    ITEM_MODEL_READER: createRegistry<ItemModelReader>(Registries.ITEM_MODEL_READER),
    CONDITION_PROPERTY_FACTORY: createRegistry<ConditionPropertyFactory>(Registries.CONDITION_PROPERTY_FACTORY),
    CONDITION_PROPERTY_READER: createRegistry<ConditionPropertyReader>(Registries.CONDITION_PROPERTY_READER),
    RANGE_DISPATCH_PROPERTY_FACTORY: createRegistry<RangeDispatchPropertyFactory>(Registries.RANGE_DISPATCH_PROPERTY_FACTORY),
    RANGE_DISPATCH_PROPERTY_READER: createRegistry<RangeDispatchPropertyReader>(Registries.RANGE_DISPATCH_PROPERTY_READER),
    SELECT_PROPERTY_FACTORY: createRegistry<SelectPropertyFactory>(Registries.SELECT_PROPERTY_FACTORY),
    SELECT_PROPERTY_READER: createRegistry<SelectPropertyReader>(Registries.SELECT_PROPERTY_READER),
    SPECIAL_MODEL_FACTORY: createRegistry<SpecialModelFactory>(Registries.SPECIAL_MODEL_FACTORY),
    SPECIAL_MODEL_READER: createRegistry<SpecialModelReader>(Registries.SPECIAL_MODEL_READER),
} as const;
