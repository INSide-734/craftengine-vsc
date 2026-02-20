/**
 * 条件属性模块
 *
 * 数据来源：data/minecraft/model-properties.json
 * 此模块从 JSON 配置文件加载条件属性类型定义。
 * 必须在使用前调用 initializeConditionProperties() 初始化。
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
// 条件属性接口（保持向后兼容）
// ============================================

/**
 * 条件属性接口
 */
export type ConditionProperty = Property;

/**
 * 条件属性工厂接口
 */
export type ConditionPropertyFactory = PropertyFactory<ConditionProperty>;

/**
 * 条件属性读取器接口
 */
export type ConditionPropertyReader = PropertyReader<ConditionProperty>;

// ============================================
// 简单条件属性
// ============================================

/**
 * 简单条件属性
 */
export class SimpleConditionProperty extends SimpleProperty {
    constructor(type: Key) {
        super(type, 'property');
    }
}

// ============================================
// 自定义模型数据条件属性
// ============================================

/**
 * 自定义模型数据条件属性
 */
export class CustomModelDataConditionProperty implements ConditionProperty {
    static readonly TYPE = Key.of('minecraft:custom_model_data');

    readonly type = CustomModelDataConditionProperty.TYPE;
    readonly index: number;

    constructor(index = 0) {
        this.index = index;
    }

    apply(json: Record<string, unknown>): void {
        json['property'] = this.type.toString();
        if (this.index !== 0) {
            json['index'] = this.index;
        }
    }

    toJson(): Record<string, unknown> {
        const json: Record<string, unknown> = {
            property: this.type.toString(),
        };
        if (this.index !== 0) {
            json['index'] = this.index;
        }
        return json;
    }
}

// ============================================
// 条件属性类型常量（从 JSON 配置初始化）
// ============================================

/** 条件属性类型数据（由 initializeConditionProperties 填充） */
let conditionPropertyTypesData: Record<string, Key> | null = null;

/**
 * 条件属性类型常量
 *
 * 通过 Proxy 延迟访问，未初始化时抛出错误。
 */
export const CONDITION_PROPERTY_TYPES: Record<string, Key> = new Proxy({} as Record<string, Key>, {
    get(_target, prop: string): Key {
        if (!conditionPropertyTypesData) {
            throw new Error('CONDITION_PROPERTY_TYPES not initialized. Call initializeConditionProperties() first.');
        }
        const val = conditionPropertyTypesData[prop];
        if (!val) {
            throw new Error(`Unknown CONDITION_PROPERTY_TYPES key: ${prop}`);
        }
        return val;
    },
});

// ============================================
// 注册表（延迟初始化）
// ============================================

let registry: PropertyRegistry<ConditionProperty> | null = null;

/**
 * 确保注册表已初始化
 */
function ensureRegistryInitialized(): PropertyRegistry<ConditionProperty> {
    if (!registry) {
        throw new Error('Condition property registry not initialized. Call initializeConditionProperties() first.');
    }
    return registry;
}

/**
 * 从 JSON 配置初始化条件属性
 *
 * @param definitions - 条件属性定义列表
 */
export function initializeConditionProperties(definitions: IModelPropertyDefinition[]): void {
    // 构建类型常量
    conditionPropertyTypesData = {};
    for (const def of definitions) {
        conditionPropertyTypesData[def.name] = Key.of(def.key);
    }

    // 创建注册表
    const simpleFactory = new SimplePropertyFactory<ConditionProperty>((type) => new SimpleConditionProperty(type));
    const simpleReader = new SimplePropertyReader<ConditionProperty>((type) => new SimpleConditionProperty(type));

    registry = new PropertyRegistry<ConditionProperty>('condition property');

    // 注册简单属性类型（排除 CUSTOM_MODEL_DATA，它有自定义工厂）
    const customModelDataKey = 'minecraft:custom_model_data';
    const simpleKeys = definitions.filter((d) => d.key !== customModelDataKey).map((d) => Key.of(d.key));
    registry.registerSimpleTypes(simpleKeys, simpleFactory, simpleReader);

    // 注册自定义模型数据属性（特殊工厂/读取器）
    const customModelDataFactory: ConditionPropertyFactory = {
        create: (args) => new CustomModelDataConditionProperty(Number(args['index'] ?? 0)),
    };
    const customModelDataReader: ConditionPropertyReader = {
        read: (json) => new CustomModelDataConditionProperty(Number(json['index'] ?? 0)),
    };
    registry.registerFactory(Key.of(customModelDataKey), customModelDataFactory);
    registry.registerReader(Key.of(customModelDataKey), customModelDataReader);
}

// ============================================
// 导出函数
// ============================================

/**
 * 从 Map 创建条件属性
 */
export function conditionPropertyFromMap(map: Record<string, unknown>): ConditionProperty {
    return ensureRegistryInitialized().fromMap(map);
}

/**
 * 从 JSON 创建条件属性
 */
export function conditionPropertyFromJson(json: Record<string, unknown>): ConditionProperty {
    return ensureRegistryInitialized().fromJson(json);
}

/**
 * 注册条件属性工厂
 */
export function registerConditionPropertyFactory(key: Key, factory: ConditionPropertyFactory): void {
    ensureRegistryInitialized().registerFactory(key, factory);
}

/**
 * 注册条件属性读取器
 */
export function registerConditionPropertyReader(key: Key, reader: ConditionPropertyReader): void {
    ensureRegistryInitialized().registerReader(key, reader);
}
