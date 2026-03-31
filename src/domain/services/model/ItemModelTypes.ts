/**
 * ItemModel 类型定义与模型类
 *
 * 包含模型类型常量、工具函数和所有 ItemModel 实现类。
 * 与工厂函数分离以避免循环依赖。
 */

import {
    type IItemModel,
    type IModelGeneration,
    type IModelGenerationConfig,
    type DisplayPosition,
    type IDisplayMeta,
    type IMinecraftVersionInfo,
    type IRevision,
    type ISelectCase,
    type IRangeDispatchEntry,
} from '../../../core/interfaces/IModelGenerator';
import { type ITint } from './Tint';

// ============================================
// 模型类型常量（从 JSON 配置初始化）
// ============================================

/** 模型类型数据（由 initializeModelTypes 填充） */
let modelTypesData: Record<string, string> | null = null;

/**
 * 从 JSON 配置初始化模型类型常量
 *
 * @param types - modelTypes 映射（如 { EMPTY: "minecraft:empty", ... }）
 */
export function initializeModelTypes(types: Record<string, string>): void {
    modelTypesData = { ...types };
}

/**
 * 模型类型常量
 *
 * 通过 Proxy 延迟访问，未初始化时抛出错误。
 */
export const MODEL_TYPES: Record<string, string> = new Proxy({} as Record<string, string>, {
    get(_target, prop: string): string {
        if (!modelTypesData) {
            throw new Error('MODEL_TYPES not initialized. Call initializeModelTypes() first.');
        }
        const val = modelTypesData[prop];
        if (val === undefined) {
            throw new Error(`Unknown MODEL_TYPES key: ${prop}`);
        }
        return val;
    },
});

// ============================================
// 辅助函数：收集子模型数据
// ============================================

/**
 * 从多个子模型收集 ModelGeneration
 */
export function collectModelsToGenerate(models: IItemModel[]): IModelGeneration[] {
    return models.flatMap((m) => m.modelsToGenerate());
}

/**
 * 从多个子模型收集 Revision
 */
export function collectRevisions(models: IItemModel[]): IRevision[] {
    return models.flatMap((m) => m.revisions());
}

// ============================================
// 工具函数
// ============================================

/**
 * 规范化模型路径
 *
 * @param path - 原始路径
 * @param defaultNamespace - 默认命名空间
 * @returns 规范化后的路径
 */
export function normalizeModelPath(path: string, defaultNamespace = 'minecraft'): string {
    const namespaceMatch = path.match(/^(\w+):(.+)$/);

    if (namespaceMatch) {
        const namespace = namespaceMatch[1];
        let modelPath = namespaceMatch[2];
        if (!modelPath.includes('/')) {
            modelPath = `item/${modelPath}`;
        }
        return `${namespace}:${modelPath}`;
    }

    let normalized = path;
    if (!normalized.includes('/')) {
        normalized = `item/${normalized}`;
    }
    return `${defaultNamespace}:${normalized}`;
}

/**
 * 从配置创建 ModelGeneration
 */
export function createModelGeneration(path: string, config: IModelGenerationConfig): IModelGeneration {
    const displays: Partial<Record<DisplayPosition, IDisplayMeta>> = {};

    if (config.display) {
        for (const [pos, meta] of Object.entries(config.display)) {
            if (meta) {
                displays[pos as DisplayPosition] = meta;
            }
        }
    }

    return {
        path: normalizeModelPath(path),
        parentModelPath: config.parent ?? 'minecraft:item/generated',
        texturesOverride: config.textures,
        displays: Object.keys(displays).length > 0 ? displays : undefined,
        guiLight: config['gui-light'],
        ambientOcclusion: config['ambient-occlusion'],
    };
}

// ============================================
// ItemModel 实现类
// ============================================

/**
 * 空模型
 */
export class EmptyItemModel implements IItemModel {
    readonly type = MODEL_TYPES.EMPTY;

    apply(_version?: IMinecraftVersionInfo): Record<string, unknown> {
        return { type: this.type };
    }

    toJson(): Record<string, unknown> {
        return { type: this.type };
    }

    modelsToGenerate(): IModelGeneration[] {
        return [];
    }

    revisions(): IRevision[] {
        return [];
    }
}

/**
 * 基础模型
 */
export class BaseItemModel implements IItemModel {
    readonly type = MODEL_TYPES.MODEL;
    private readonly path: string;
    private readonly tints: ITint[];
    private readonly modelGeneration?: IModelGeneration;

    constructor(path: string, tints: ITint[] = [], modelGeneration?: IModelGeneration) {
        this.path = path;
        this.tints = tints;
        this.modelGeneration = modelGeneration;
    }

    apply(_version?: IMinecraftVersionInfo): Record<string, unknown> {
        return this.toJson();
    }

    toJson(): Record<string, unknown> {
        const json: Record<string, unknown> = {
            type: this.type,
            model: this.path,
        };
        if (this.tints.length > 0) {
            json['tints'] = this.tints.map((t) => t.toJson());
        }
        return json;
    }

    modelsToGenerate(): IModelGeneration[] {
        return this.modelGeneration ? [this.modelGeneration] : [];
    }

    revisions(): IRevision[] {
        return [];
    }
}

/**
 * 复合模型
 */
export class CompositeItemModel implements IItemModel {
    readonly type = MODEL_TYPES.COMPOSITE;
    private readonly models: IItemModel[];

    constructor(models: IItemModel[]) {
        this.models = models;
    }

    apply(version?: IMinecraftVersionInfo): Record<string, unknown> {
        return {
            type: this.type,
            models: this.models.map((m) => m.apply(version)),
        };
    }

    toJson(): Record<string, unknown> {
        return {
            type: this.type,
            models: this.models.map((m) => m.toJson()),
        };
    }

    modelsToGenerate(): IModelGeneration[] {
        return collectModelsToGenerate(this.models);
    }

    revisions(): IRevision[] {
        return collectRevisions(this.models);
    }
}

/**
 * 条件模型
 */
export class ConditionItemModel implements IItemModel {
    readonly type = MODEL_TYPES.CONDITION;
    private readonly property: string;
    private readonly propertyArgs: Record<string, unknown>;
    private readonly onTrue: IItemModel;
    private readonly onFalse: IItemModel;

    constructor(property: string, propertyArgs: Record<string, unknown>, onTrue: IItemModel, onFalse: IItemModel) {
        this.property = property;
        this.propertyArgs = propertyArgs;
        this.onTrue = onTrue;
        this.onFalse = onFalse;
    }

    apply(version?: IMinecraftVersionInfo): Record<string, unknown> {
        return {
            type: this.type,
            property: this.property,
            ...this.propertyArgs,
            on_true: this.onTrue.apply(version),
            on_false: this.onFalse.apply(version),
        };
    }

    toJson(): Record<string, unknown> {
        return {
            type: this.type,
            property: this.property,
            ...this.propertyArgs,
            on_true: this.onTrue.toJson(),
            on_false: this.onFalse.toJson(),
        };
    }

    modelsToGenerate(): IModelGeneration[] {
        return collectModelsToGenerate([this.onTrue, this.onFalse]);
    }

    revisions(): IRevision[] {
        return collectRevisions([this.onTrue, this.onFalse]);
    }
}

/**
 * 选择模型
 */
export class SelectItemModel implements IItemModel {
    readonly type = MODEL_TYPES.SELECT;
    private readonly property: string;
    private readonly propertyArgs: Record<string, unknown>;
    private readonly cases: ISelectCase[];
    private readonly fallback?: IItemModel;

    constructor(property: string, propertyArgs: Record<string, unknown>, cases: ISelectCase[], fallback?: IItemModel) {
        this.property = property;
        this.propertyArgs = propertyArgs;
        this.cases = cases;
        this.fallback = fallback;
    }

    apply(version?: IMinecraftVersionInfo): Record<string, unknown> {
        const json: Record<string, unknown> = {
            type: this.type,
            property: this.property,
            ...this.propertyArgs,
            cases: this.cases.map((c) => ({
                when: c.when,
                model: c.model.apply(version),
            })),
        };
        if (this.fallback) {
            json['fallback'] = this.fallback.apply(version);
        }
        return json;
    }

    toJson(): Record<string, unknown> {
        const json: Record<string, unknown> = {
            type: this.type,
            property: this.property,
            ...this.propertyArgs,
            cases: this.cases.map((c) => ({
                when: c.when,
                model: c.model.toJson(),
            })),
        };
        if (this.fallback) {
            json['fallback'] = this.fallback.toJson();
        }
        return json;
    }

    modelsToGenerate(): IModelGeneration[] {
        const models = this.cases.map((c) => c.model);
        if (this.fallback) {
            models.push(this.fallback);
        }
        return collectModelsToGenerate(models);
    }

    revisions(): IRevision[] {
        const models = this.cases.map((c) => c.model);
        if (this.fallback) {
            models.push(this.fallback);
        }
        return collectRevisions(models);
    }
}

/**
 * 范围分发模型
 */
export class RangeDispatchItemModel implements IItemModel {
    readonly type = MODEL_TYPES.RANGE_DISPATCH;
    private readonly property: string;
    private readonly propertyArgs: Record<string, unknown>;
    private readonly scale: number;
    private readonly entries: IRangeDispatchEntry[];
    private readonly fallback?: IItemModel;

    constructor(
        property: string,
        propertyArgs: Record<string, unknown>,
        scale: number,
        entries: IRangeDispatchEntry[],
        fallback?: IItemModel,
    ) {
        this.property = property;
        this.propertyArgs = propertyArgs;
        this.scale = scale;
        this.entries = entries;
        this.fallback = fallback;
    }

    apply(version?: IMinecraftVersionInfo): Record<string, unknown> {
        const json: Record<string, unknown> = {
            type: this.type,
            property: this.property,
            ...this.propertyArgs,
            entries: this.entries.map((e) => ({
                threshold: e.threshold,
                model: e.model.apply(version),
            })),
        };
        if (this.scale !== 1) {
            json['scale'] = this.scale;
        }
        if (this.fallback) {
            json['fallback'] = this.fallback.apply(version);
        }
        return json;
    }

    toJson(): Record<string, unknown> {
        const json: Record<string, unknown> = {
            type: this.type,
            property: this.property,
            ...this.propertyArgs,
            entries: this.entries.map((e) => ({
                threshold: e.threshold,
                model: e.model.toJson(),
            })),
        };
        if (this.scale !== 1) {
            json['scale'] = this.scale;
        }
        if (this.fallback) {
            json['fallback'] = this.fallback.toJson();
        }
        return json;
    }

    modelsToGenerate(): IModelGeneration[] {
        const models = this.entries.map((e) => e.model);
        if (this.fallback) {
            models.push(this.fallback);
        }
        return collectModelsToGenerate(models);
    }

    revisions(): IRevision[] {
        const models = this.entries.map((e) => e.model);
        if (this.fallback) {
            models.push(this.fallback);
        }
        return collectRevisions(models);
    }
}

/**
 * 特殊模型
 */
export class SpecialItemModel implements IItemModel {
    readonly type = MODEL_TYPES.SPECIAL;
    private readonly model: Record<string, unknown>;
    private readonly base?: string;

    constructor(model: Record<string, unknown>, base?: string) {
        this.model = model;
        this.base = base;
    }

    apply(_version?: IMinecraftVersionInfo): Record<string, unknown> {
        return this.toJson();
    }

    toJson(): Record<string, unknown> {
        const json: Record<string, unknown> = {
            type: this.type,
            model: this.model,
        };
        if (this.base) {
            json['base'] = this.base;
        }
        return json;
    }

    modelsToGenerate(): IModelGeneration[] {
        return [];
    }

    revisions(): IRevision[] {
        return [];
    }
}

/**
 * 捆绑选中物品模型
 */
export class BundleSelectedItemModel implements IItemModel {
    readonly type = MODEL_TYPES.BUNDLE_SELECTED_ITEM;

    apply(_version?: IMinecraftVersionInfo): Record<string, unknown> {
        return { type: this.type };
    }

    toJson(): Record<string, unknown> {
        return { type: this.type };
    }

    modelsToGenerate(): IModelGeneration[] {
        return [];
    }

    revisions(): IRevision[] {
        return [];
    }
}
