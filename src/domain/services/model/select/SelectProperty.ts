/**
 * 选择属性模块
 *
 * 数据来源：data/minecraft/model-properties.json
 * 此模块从 JSON 配置文件加载选择属性类型定义。
 * 必须在使用前调用 initializeSelectProperties() 初始化。
 */

import { Key } from '../utils/Key';
import {
    type IProperty,
    type IPropertyFactory,
    type IPropertyReader,
    SimpleProperty,
    SimplePropertyFactory,
    SimplePropertyReader,
    PropertyRegistry,
} from '../property/PropertyBase';
import { type IModelPropertyDefinition } from '../../../../core/types/ConfigTypes';

// ============================================
// 选择属性接口（保持向后兼容）
// ============================================

export type SelectProperty = IProperty;
export type SelectPropertyFactory = IPropertyFactory<SelectProperty>;
export type SelectPropertyReader = IPropertyReader<SelectProperty>;

// ============================================
// 简单选择属性
// ============================================

export class SimpleSelectProperty extends SimpleProperty {
    constructor(type: Key) {
        super(type, 'property');
    }
}

// ============================================
// 选择属性类型常量（从 JSON 配置初始化）
// ============================================

/** 选择属性类型数据（由 initializeSelectProperties 填充） */
let selectPropertyTypesData: Record<string, Key> | null = null;
/**
 * 选择属性类型常量
 *
 * 通过 Proxy 延迟访问，未初始化时抛出错误。
 */
export const SELECT_PROPERTY_TYPES: Record<string, Key> = new Proxy({} as Record<string, Key>, {
    get(_target, prop: string): Key {
        if (!selectPropertyTypesData) {
            throw new Error('SELECT_PROPERTY_TYPES not initialized. Call initializeSelectProperties() first.');
        }
        const val = selectPropertyTypesData[prop];
        if (!val) {
            throw new Error(`Unknown SELECT_PROPERTY_TYPES key: ${prop}`);
        }
        return val;
    },
});

// ============================================
// 注册表（延迟初始化）
// ============================================

let registry: PropertyRegistry<SelectProperty> | null = null;

function ensureRegistryInitialized(): PropertyRegistry<SelectProperty> {
    if (!registry) {
        throw new Error('Select property registry not initialized. Call initializeSelectProperties() first.');
    }
    return registry;
}

/**
 * 从 JSON 配置初始化选择属性
 *
 * @param definitions - 选择属性定义列表
 */
export function initializeSelectProperties(definitions: IModelPropertyDefinition[]): void {
    selectPropertyTypesData = {};
    for (const def of definitions) {
        selectPropertyTypesData[def.name] = Key.of(def.key);
    }

    const simpleFactory = new SimplePropertyFactory<SelectProperty>((type) => new SimpleSelectProperty(type));
    const simpleReader = new SimplePropertyReader<SelectProperty>((type) => new SimpleSelectProperty(type));

    registry = new PropertyRegistry<SelectProperty>('select property');
    registry.registerSimpleTypes(
        definitions.map((d) => Key.of(d.key)),
        simpleFactory,
        simpleReader,
    );
}

// ============================================
// 导出函数
// ============================================

export function selectPropertyFromMap(map: Record<string, unknown>): SelectProperty {
    return ensureRegistryInitialized().fromMap(map);
}

export function selectPropertyFromJson(json: Record<string, unknown>): SelectProperty {
    return ensureRegistryInitialized().fromJson(json);
}

export function registerSelectPropertyFactory(key: Key, factory: SelectPropertyFactory): void {
    ensureRegistryInitialized().registerFactory(key, factory);
}

export function registerSelectPropertyReader(key: Key, reader: SelectPropertyReader): void {
    ensureRegistryInitialized().registerReader(key, reader);
}
