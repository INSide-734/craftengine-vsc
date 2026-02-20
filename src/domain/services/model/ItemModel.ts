/**
 * ItemModel 工厂
 *
 * 提供 createItemModel 工厂函数及其私有辅助函数。
 * 所有模型类和常量从 ItemModelTypes 重新导出以保持向后兼容。
 */

import {
    type IItemModel,
    type ItemModelConfig,
    type IModelGeneration,
    type IModelGenerationConfig,
} from '../../../core/interfaces/IModelGenerator';
import { createTints } from './Tint';
import {
    normalizeModelPath,
    createModelGeneration,
    EmptyItemModel,
    BaseItemModel,
    CompositeItemModel,
    ConditionItemModel,
    SelectItemModel,
    RangeDispatchItemModel,
    SpecialItemModel,
    BundleSelectedItemModel,
} from './ItemModelTypes';

// 重新导出所有类型，保持向后兼容
export {
    MODEL_TYPES,
    collectModelsToGenerate,
    collectRevisions,
    normalizeModelPath,
    createModelGeneration,
    EmptyItemModel,
    BaseItemModel,
    CompositeItemModel,
    ConditionItemModel,
    SelectItemModel,
    RangeDispatchItemModel,
    SpecialItemModel,
    BundleSelectedItemModel,
} from './ItemModelTypes';

// ============================================
// 工厂辅助函数
// ============================================

/**
 * 提取属性参数（排除已知字段）
 */
function extractPropertyArgs(cfg: Record<string, unknown>, knownKeys: string[]): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(cfg)) {
        if (!knownKeys.includes(key)) {
            args[key] = value;
        }
    }
    return args;
}

/**
 * 过滤并映射配置数组
 */
function filterAndMapConfig<T>(config: unknown, mapper: (item: Record<string, unknown>) => T): T[] {
    if (!Array.isArray(config)) {
        return [];
    }
    return config
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .map(mapper);
}

/**
 * 解析可选的 fallback 模型
 */
function parseFallback(cfg: Record<string, unknown>): IItemModel | undefined {
    return cfg['fallback'] ? createItemModel(cfg['fallback']) : undefined;
}

// ============================================
// ItemModel 工厂
// ============================================

/**
 * 从配置创建 ItemModel 实例
 *
 * @param config - 模型配置
 * @returns ItemModel 实例
 */
export function createItemModel(config: ItemModelConfig | unknown): IItemModel {
    // 字符串形式的简写
    if (typeof config === 'string') {
        return new BaseItemModel(normalizeModelPath(config));
    }

    if (typeof config !== 'object' || config === null) {
        return new EmptyItemModel();
    }

    const cfg = config as Record<string, unknown>;
    const type = String(cfg['type'] ?? 'minecraft:model');

    switch (type) {
        case 'minecraft:empty':
        case 'empty':
            return new EmptyItemModel();

        case 'minecraft:model':
        case 'model':
            return createBaseItemModel(cfg);

        case 'minecraft:composite':
        case 'composite':
            return createCompositeItemModel(cfg);

        case 'minecraft:condition':
        case 'condition':
            return createConditionItemModel(cfg);

        case 'minecraft:select':
        case 'select':
            return createSelectItemModel(cfg);

        case 'minecraft:range_dispatch':
        case 'range_dispatch':
            return createRangeDispatchItemModel(cfg);

        case 'minecraft:special':
        case 'special':
            return createSpecialItemModel(cfg);

        case 'minecraft:bundle/selected_item':
        case 'bundle/selected_item':
            return new BundleSelectedItemModel();

        default:
            // 未知类型，尝试作为基础模型处理
            if (cfg['path']) {
                return createBaseItemModel(cfg);
            }
            return new EmptyItemModel();
    }
}

// ============================================
// 私有工厂辅助函数
// ============================================

/**
 * 创建基础模型
 */
function createBaseItemModel(cfg: Record<string, unknown>): BaseItemModel {
    const path = String(cfg['path'] ?? cfg['model'] ?? '');
    const tints = cfg['tints'] ? createTints(cfg['tints'] as unknown[]) : [];

    let modelGeneration: IModelGeneration | undefined;
    if (cfg['generation']) {
        const gen = cfg['generation'] as IModelGenerationConfig;
        modelGeneration = createModelGeneration(path, gen);
    }

    return new BaseItemModel(normalizeModelPath(path), tints, modelGeneration);
}

/**
 * 创建复合模型
 */
function createCompositeItemModel(cfg: Record<string, unknown>): CompositeItemModel {
    const modelsConfig = cfg['models'];
    if (!Array.isArray(modelsConfig)) {
        return new CompositeItemModel([]);
    }
    const models = modelsConfig.map((m) => createItemModel(m));
    return new CompositeItemModel(models);
}

/**
 * 创建条件模型
 */
function createConditionItemModel(cfg: Record<string, unknown>): ConditionItemModel {
    const property = String(cfg['property'] ?? '');
    const knownKeys = ['type', 'property', 'on-true', 'on_true', 'on-false', 'on_false'];
    const propertyArgs = extractPropertyArgs(cfg, knownKeys);

    const onTrueConfig = cfg['on-true'] ?? cfg['on_true'];
    const onFalseConfig = cfg['on-false'] ?? cfg['on_false'];

    return new ConditionItemModel(
        property,
        propertyArgs,
        createItemModel(onTrueConfig),
        createItemModel(onFalseConfig),
    );
}

/**
 * 创建选择模型
 */
function createSelectItemModel(cfg: Record<string, unknown>): SelectItemModel {
    const property = String(cfg['property'] ?? '');
    const knownKeys = ['type', 'property', 'cases', 'fallback'];
    const propertyArgs = extractPropertyArgs(cfg, knownKeys);

    const cases = filterAndMapConfig(cfg['cases'], (c) => ({
        when: c['when'],
        model: createItemModel(c['model']),
    }));

    return new SelectItemModel(property, propertyArgs, cases, parseFallback(cfg));
}

/**
 * 创建范围分发模型
 */
function createRangeDispatchItemModel(cfg: Record<string, unknown>): RangeDispatchItemModel {
    const property = String(cfg['property'] ?? '');
    const scale = Number(cfg['scale'] ?? 1);
    const knownKeys = ['type', 'property', 'scale', 'entries', 'fallback'];
    const propertyArgs = extractPropertyArgs(cfg, knownKeys);

    const entries = filterAndMapConfig(cfg['entries'], (e) => ({
        threshold: Number(e['threshold'] ?? 0),
        model: createItemModel(e['model']),
    }));

    return new RangeDispatchItemModel(property, propertyArgs, scale, entries, parseFallback(cfg));
}

/**
 * 创建特殊模型
 */
function createSpecialItemModel(cfg: Record<string, unknown>): SpecialItemModel {
    const model = (cfg['model'] as Record<string, unknown>) ?? {};
    const base = cfg['base'] ? String(cfg['base']) : undefined;
    return new SpecialItemModel(model, base);
}
