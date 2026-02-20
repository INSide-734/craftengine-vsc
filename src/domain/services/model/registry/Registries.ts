/**
 * 注册表键定义
 *
 * 移植自 craft-engine 的 Registries
 */

import { Key } from '../utils/Key';
import { ResourceKey } from './ResourceKey';
import { type Registry } from './Registry';

/**
 * 创建注册表键
 */
function createRegistryKey<T>(name: string): ResourceKey<Registry<T>> {
    return ResourceKey.createRegistryKey<T>(Key.of(`craftengine:${name}`));
}

/**
 * 注册表键定义
 */
export const Registries = {
    ITEM_MODEL_FACTORY: createRegistryKey<unknown>('item_model_factory'),
    ITEM_MODEL_READER: createRegistryKey<unknown>('item_model_reader'),
    CONDITION_PROPERTY_FACTORY: createRegistryKey<unknown>('condition_property_factory'),
    CONDITION_PROPERTY_READER: createRegistryKey<unknown>('condition_property_reader'),
    RANGE_DISPATCH_PROPERTY_FACTORY: createRegistryKey<unknown>('range_dispatch_property_factory'),
    RANGE_DISPATCH_PROPERTY_READER: createRegistryKey<unknown>('range_dispatch_property_reader'),
    SELECT_PROPERTY_FACTORY: createRegistryKey<unknown>('select_property_factory'),
    SELECT_PROPERTY_READER: createRegistryKey<unknown>('select_property_reader'),
    SPECIAL_MODEL_FACTORY: createRegistryKey<unknown>('special_model_factory'),
    SPECIAL_MODEL_READER: createRegistryKey<unknown>('special_model_reader'),
    TINT_FACTORY: createRegistryKey<unknown>('tint_factory'),
    TINT_READER: createRegistryKey<unknown>('tint_reader'),
} as const;
