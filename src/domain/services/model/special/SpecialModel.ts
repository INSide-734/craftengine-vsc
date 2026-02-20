/**
 * 特殊模型模块
 *
 * 数据来源：data/minecraft/model-properties.json
 * 此模块从 JSON 配置文件加载特殊模型类型定义。
 * 必须在使用前调用 initializeSpecialModelTypes() 初始化。
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
// 特殊模型接口（保持向后兼容）
// ============================================

export type SpecialModel = Property;
export type SpecialModelFactory = PropertyFactory<SpecialModel>;
export type SpecialModelReader = PropertyReader<SpecialModel>;

// ============================================
// 简单特殊模型
// ============================================

export class SimpleSpecialModel extends SimpleProperty {
    constructor(type: Key) {
        super(type, 'type');
    }
}

// ============================================
// 特殊模型类型常量（从 JSON 配置初始化）
// ============================================

/** 特殊模型类型数据（由 initializeSpecialModelTypes 填充） */
let specialModelTypesData: Record<string, Key> | null = null;
/**
 * 特殊模型类型常量
 *
 * 通过 Proxy 延迟访问，未初始化时抛出错误。
 */
export const SPECIAL_MODEL_TYPES: Record<string, Key> = new Proxy({} as Record<string, Key>, {
    get(_target, prop: string): Key {
        if (!specialModelTypesData) {
            throw new Error('SPECIAL_MODEL_TYPES not initialized. Call initializeSpecialModelTypes() first.');
        }
        const val = specialModelTypesData[prop];
        if (!val) {
            throw new Error(`Unknown SPECIAL_MODEL_TYPES key: ${prop}`);
        }
        return val;
    },
});

// ============================================
// 注册表（延迟初始化）
// ============================================

let registry: PropertyRegistry<SpecialModel> | null = null;

function ensureRegistryInitialized(): PropertyRegistry<SpecialModel> {
    if (!registry) {
        throw new Error('Special model registry not initialized. Call initializeSpecialModelTypes() first.');
    }
    return registry;
}

/**
 * 从 JSON 配置初始化特殊模型类型
 *
 * @param definitions - 特殊模型类型定义列表
 */
export function initializeSpecialModelTypes(definitions: IModelPropertyDefinition[]): void {
    specialModelTypesData = {};
    for (const def of definitions) {
        specialModelTypesData[def.name] = Key.of(def.key);
    }

    const simpleFactory = new SimplePropertyFactory<SpecialModel>((type) => new SimpleSpecialModel(type), 'type');
    const simpleReader = new SimplePropertyReader<SpecialModel>((type) => new SimpleSpecialModel(type), 'type');

    registry = new PropertyRegistry<SpecialModel>('special model', 'type');
    registry.registerSimpleTypes(
        definitions.map((d) => Key.of(d.key)),
        simpleFactory,
        simpleReader,
    );
}

// ============================================
// 导出函数
// ============================================

export function specialModelFromMap(map: Record<string, unknown>): SpecialModel {
    return ensureRegistryInitialized().fromMap(map);
}

export function specialModelFromJson(json: Record<string, unknown>): SpecialModel {
    return ensureRegistryInitialized().fromJson(json);
}

export function registerSpecialModelFactory(key: Key, factory: SpecialModelFactory): void {
    ensureRegistryInitialized().registerFactory(key, factory);
}

export function registerSpecialModelReader(key: Key, reader: SpecialModelReader): void {
    ensureRegistryInitialized().registerReader(key, reader);
}
