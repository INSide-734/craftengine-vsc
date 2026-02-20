/**
 * 范围分发属性模块
 *
 * 数据来源：data/minecraft/model-properties.json
 * 此模块从 JSON 配置文件加载范围分发属性类型定义。
 * 必须在使用前调用 initializeRangeDispatchProperties() 初始化。
 */

import { Key } from '../utils/Key';
import {
    type Property,
    type PropertyFactory,
    type PropertyReader,
    SimpleProperty,
    SimplePropertyFactory,
    SimplePropertyReader,
    PropertyRegistry,
} from '../property/PropertyBase';
import { type IModelPropertyDefinition } from '../../../../core/types/ConfigTypes';

// ============================================
// 范围分发属性接口（保持向后兼容）
// ============================================

export type RangeDispatchProperty = Property;
export type RangeDispatchPropertyFactory = PropertyFactory<RangeDispatchProperty>;
export type RangeDispatchPropertyReader = PropertyReader<RangeDispatchProperty>;

// ============================================
// 简单范围分发属性
// ============================================

export class SimpleRangeDispatchProperty extends SimpleProperty {
    constructor(type: Key) {
        super(type, 'property');
    }
}

// ============================================
// 范围分发属性类型常量（从 JSON 配置初始化）
// ============================================

/** 范围分发属性类型数据（由 initializeRangeDispatchProperties 填充） */
let rangeDispatchPropertyTypesData: Record<string, Key> | null = null;
/**
 * 范围分发属性类型常量
 *
 * 通过 Proxy 延迟访问，未初始化时抛出错误。
 */
export const RANGE_DISPATCH_PROPERTY_TYPES: Record<string, Key> = new Proxy({} as Record<string, Key>, {
    get(_target, prop: string): Key {
        if (!rangeDispatchPropertyTypesData) {
            throw new Error(
                'RANGE_DISPATCH_PROPERTY_TYPES not initialized. Call initializeRangeDispatchProperties() first.',
            );
        }
        const val = rangeDispatchPropertyTypesData[prop];
        if (!val) {
            throw new Error(`Unknown RANGE_DISPATCH_PROPERTY_TYPES key: ${prop}`);
        }
        return val;
    },
});

// ============================================
// 注册表（延迟初始化）
// ============================================

let registry: PropertyRegistry<RangeDispatchProperty> | null = null;

function ensureRegistryInitialized(): PropertyRegistry<RangeDispatchProperty> {
    if (!registry) {
        throw new Error(
            'Range dispatch property registry not initialized. Call initializeRangeDispatchProperties() first.',
        );
    }
    return registry;
}

/**
 * 从 JSON 配置初始化范围分发属性
 *
 * @param definitions - 范围分发属性定义列表
 */
export function initializeRangeDispatchProperties(definitions: IModelPropertyDefinition[]): void {
    rangeDispatchPropertyTypesData = {};
    for (const def of definitions) {
        rangeDispatchPropertyTypesData[def.name] = Key.of(def.key);
    }

    const simpleFactory = new SimplePropertyFactory<RangeDispatchProperty>(
        (type) => new SimpleRangeDispatchProperty(type),
    );
    const simpleReader = new SimplePropertyReader<RangeDispatchProperty>(
        (type) => new SimpleRangeDispatchProperty(type),
    );

    registry = new PropertyRegistry<RangeDispatchProperty>('range dispatch property');
    registry.registerSimpleTypes(
        definitions.map((d) => Key.of(d.key)),
        simpleFactory,
        simpleReader,
    );
}

// ============================================
// 导出函数
// ============================================

export function rangeDispatchPropertyFromMap(map: Record<string, unknown>): RangeDispatchProperty {
    return ensureRegistryInitialized().fromMap(map);
}

export function rangeDispatchPropertyFromJson(json: Record<string, unknown>): RangeDispatchProperty {
    return ensureRegistryInitialized().fromJson(json);
}

export function registerRangeDispatchPropertyFactory(key: Key, factory: RangeDispatchPropertyFactory): void {
    ensureRegistryInitialized().registerFactory(key, factory);
}

export function registerRangeDispatchPropertyReader(key: Key, reader: RangeDispatchPropertyReader): void {
    ensureRegistryInitialized().registerReader(key, reader);
}
