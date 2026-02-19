/**
 * 物品模型注册表
 *
 * 数据来源：data/minecraft/model-properties.json
 * 此模块从 JSON 配置文件加载物品模型类型定义。
 * 必须在使用前调用 initializeItemModelTypes() 初始化。
 */

import { Key } from './utils/Key';
import { ResourceKey } from './registry/ResourceKey';
import { WritableRegistry } from './registry/WritableRegistry';
import { BuiltInRegistries, ItemModelFactory, ItemModelReader } from './registry/BuiltInRegistries';
import { Registries } from './registry/Registries';
import { InvalidItemModelError } from '../../../core/errors/ExtensionErrors';

// ============================================================================
// 模块私有状态（由 initializeItemModelTypes 填充）
// ============================================================================

/** 物品模型类型 Key 映射 */
let itemModelTypesData: Record<string, Key> | null = null;

/**
 * 从 JSON 配置初始化物品模型类型常量
 *
 * @param types - modelTypes 映射（如 { EMPTY: "minecraft:empty", ... }）
 */
export function initializeItemModelTypes(types: Record<string, string>): void {
    itemModelTypesData = {};
    for (const [name, value] of Object.entries(types)) {
        itemModelTypesData[name] = Key.of(value);
    }
}

/**
 * 物品模型类型常量
 *
 * 通过 Proxy 延迟访问，未初始化时抛出错误。
 */
export const ITEM_MODEL_TYPES: Record<string, Key> = new Proxy(
    {} as Record<string, Key>,
    {
        get(_target, prop: string): Key {
            if (!itemModelTypesData) {
                throw new Error('ITEM_MODEL_TYPES not initialized. Call initializeItemModelTypes() first.');
            }
            const val = itemModelTypesData[prop];
            if (!val) {
                throw new Error(`Unknown ITEM_MODEL_TYPES key: ${prop}`);
            }
            return val;
        },
    }
);

/**
 * 注册物品模型工厂
 */
export function registerItemModelFactory(key: Key, factory: ItemModelFactory): void {
    const registry = BuiltInRegistries.ITEM_MODEL_FACTORY as WritableRegistry<ItemModelFactory>;
    const resourceKey = ResourceKey.create<ItemModelFactory>(
        Registries.ITEM_MODEL_FACTORY.getLocation(),
        key
    );
    registry.register(resourceKey, factory);
}

/**
 * 注册物品模型读取器
 */
export function registerItemModelReader(key: Key, reader: ItemModelReader): void {
    const registry = BuiltInRegistries.ITEM_MODEL_READER as WritableRegistry<ItemModelReader>;
    const resourceKey = ResourceKey.create<ItemModelReader>(
        Registries.ITEM_MODEL_READER.getLocation(),
        key
    );
    registry.register(resourceKey, reader);
}

/**
 * 从 Map 创建物品模型
 */
export function itemModelFromMap(map: Record<string, unknown>): unknown {
    const type = String(map['type'] ?? 'minecraft:model');
    const key = Key.withDefaultNamespace(type, 'minecraft');
    const factory = BuiltInRegistries.ITEM_MODEL_FACTORY.getValue(key);
    if (!factory) {
        throw new InvalidItemModelError(key.asString());
    }
    return factory.create(map);
}

/**
 * 从 JSON 读取物品模型
 */
export function itemModelFromJson(json: Record<string, unknown>): unknown {
    const type = String(json['type'] ?? 'minecraft:model');
    const key = Key.withDefaultNamespace(type, 'minecraft');
    const reader = BuiltInRegistries.ITEM_MODEL_READER.getValue(key);
    if (!reader) {
        throw new InvalidItemModelError(key.asString());
    }
    return reader.read(json);
}
