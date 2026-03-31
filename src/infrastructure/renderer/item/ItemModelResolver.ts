import type {
    ItemModel,
    IItemDefinition,
    ISimpleItemModel,
    ISpecialItemModel,
    ICompositeItemModel,
    ISelectItemModel,
    IConditionItemModel,
    IRangeDispatchItemModel,
    IRenderContext,
    TintSource,
} from '../types/item-definition';
import type { ResolvedModelCache } from '../model/cache/ResolvedModelCache';
import type { Model } from '../model/Model';
import { SelectEvaluator } from './evaluators/SelectEvaluator';
import { ConditionEvaluator } from './evaluators/ConditionEvaluator';
import { RangeDispatchEvaluator } from './evaluators/RangeDispatchEvaluator';
import { resolveTintColor } from '../util/tint';

/**
 * 解析后的模型信息
 */
export interface IResolvedModelInfo {
    path: string;
    tints?: number[];
}

/**
 * 物品模型解析器
 * 负责解析 ItemDefinition 中的模型，处理条件逻辑
 */
export class ItemModelResolver {
    private readonly selectEvaluator: SelectEvaluator;
    private readonly conditionEvaluator: ConditionEvaluator;
    private readonly rangeDispatchEvaluator: RangeDispatchEvaluator;

    constructor(private readonly resolvedModelCache: ResolvedModelCache) {
        this.selectEvaluator = new SelectEvaluator();
        this.conditionEvaluator = new ConditionEvaluator();
        this.rangeDispatchEvaluator = new RangeDispatchEvaluator();
    }

    /**
     * 解析物品模型，返回可渲染的 Model 列表
     * @param definition 物品定义
     * @param context 渲染上下文
     * @returns 解析后的模型列表
     */
    async resolve(definition: IItemDefinition, context: IRenderContext = {}): Promise<Model[]> {
        const modelInfos = this.resolveItemModel(definition.model, context);

        const models: Model[] = [];
        for (const info of modelInfos) {
            let model: Model;
            if (info.tints && info.tints.length > 0) {
                model = await this.resolvedModelCache.getWithTints(info.path, info.tints);
            } else {
                model = await this.resolvedModelCache.get(info.path);
            }
            models.push(model);
        }

        return models;
    }

    /**
     * 递归解析 ItemModel，返回模型信息列表（包含路径和 tints）
     */
    private resolveItemModel(itemModel: ItemModel, context: IRenderContext): IResolvedModelInfo[] {
        const type = this.normalizeType(itemModel.type);

        switch (type) {
            case 'model':
                return this.resolveSimpleModel(itemModel as ISimpleItemModel, context);

            case 'special':
                return this.resolveSpecialModel(itemModel as ISpecialItemModel, context);

            case 'composite':
                return this.resolveCompositeModel(itemModel as ICompositeItemModel, context);

            case 'select':
                return this.resolveSelectModel(itemModel as ISelectItemModel, context);

            case 'condition':
                return this.resolveConditionModel(itemModel as IConditionItemModel, context);

            case 'range_dispatch':
                return this.resolveRangeDispatchModel(itemModel as IRangeDispatchItemModel, context);

            case 'empty':
                return [];

            case 'bundle/selected_item':
                if (context.selectedItem) {
                    return [{ path: context.selectedItem }];
                }
                return [];

            default:
                return [];
        }
    }

    /**
     * 标准化类型名（移除 minecraft: 前缀）
     */
    private normalizeType(type: string): string {
        return type.replace(/^minecraft:/, '');
    }

    /**
     * 解析 TintSource 数组为颜色数组
     */
    private resolveTints(tintSources: TintSource[] | undefined, context: IRenderContext): number[] | undefined {
        if (!tintSources || tintSources.length === 0) {
            return undefined;
        }

        const tints: number[] = [];
        for (const source of tintSources) {
            const color = resolveTintColor(source, context);
            if (color !== null) {
                tints.push(color);
            }
        }

        return tints.length > 0 ? tints : undefined;
    }

    /**
     * 解析简单模型引用
     */
    private resolveSimpleModel(model: ISimpleItemModel, context: IRenderContext): IResolvedModelInfo[] {
        const modelPath = model.model.replace(/^minecraft:/, '');
        const tints = this.resolveTints(model.tints, context);
        return [{ path: modelPath, tints }];
    }

    /**
     * 解析特殊模型
     * 特殊模型（箱子、潜影盒、床等）需要使用 block/ 路径
     */
    private resolveSpecialModel(model: ISpecialItemModel, context: IRenderContext): IResolvedModelInfo[] {
        const basePath = model.base.replace(/^minecraft:/, '');
        const tints = this.resolveTints(model.tints, context);

        // 特殊模型类型映射到对应的 block 模型
        const specialType = model.model.type.replace(/^minecraft:/, '');

        // 根据特殊模型类型确定实际的模型路径
        let modelPath = basePath;

        switch (specialType) {
            case 'copper_golem_statue':
                // 铜傀儡雕像使用固定的 block 模型
                modelPath = 'block/copper_golem_statue';
                break;
            case 'chest':
            case 'shulker_box':
            case 'bed':
            case 'banner':
            case 'conduit':
            case 'decorated_pot':
            case 'shield':
            case 'trident':
            case 'standing_sign':
            case 'hanging_sign':
                // 这些特殊模型使用 block/ 路径
                // 例如: item/shulker_box -> block/shulker_box
                modelPath = basePath.replace(/^item\//, 'block/');
                break;
            case 'head':
                // 头颅模型使用特定的 block 路径
                modelPath = basePath.replace(/^item\//, 'block/');
                break;
            default:
                // 其他情况保持原路径
                break;
        }

        return [{ path: modelPath, tints }];
    }

    /**
     * 解析复合模型
     */
    private resolveCompositeModel(model: ICompositeItemModel, context: IRenderContext): IResolvedModelInfo[] {
        const infos: IResolvedModelInfo[] = [];
        for (const subModel of model.models) {
            infos.push(...this.resolveItemModel(subModel, context));
        }
        return infos;
    }

    /**
     * 解析选择模型
     */
    private resolveSelectModel(model: ISelectItemModel, context: IRenderContext): IResolvedModelInfo[] {
        const selectedModel = this.selectEvaluator.evaluate(model, context);
        if (selectedModel) {
            return this.resolveItemModel(selectedModel, context);
        }
        if (model.fallback) {
            return this.resolveItemModel(model.fallback, context);
        }
        return [];
    }

    /**
     * 解析条件模型
     */
    private resolveConditionModel(model: IConditionItemModel, context: IRenderContext): IResolvedModelInfo[] {
        const condition = this.conditionEvaluator.evaluate(model, context);
        const selectedModel = condition ? model.on_true : model.on_false;
        return this.resolveItemModel(selectedModel, context);
    }

    /**
     * 解析范围分发模型
     */
    private resolveRangeDispatchModel(model: IRangeDispatchItemModel, context: IRenderContext): IResolvedModelInfo[] {
        const selectedModel = this.rangeDispatchEvaluator.evaluate(model, context);
        if (selectedModel) {
            return this.resolveItemModel(selectedModel, context);
        }
        if (model.fallback) {
            return this.resolveItemModel(model.fallback, context);
        }
        return [];
    }
}
