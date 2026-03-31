import type { IRangeDispatchItemModel, IRenderContext, ItemModel } from '../../types/item-definition';

/**
 * RangeDispatch 条件求值器
 */
export class RangeDispatchEvaluator {
    /**
     * 评估范围分发，返回匹配的模型
     */
    evaluate(model: IRangeDispatchItemModel, context: IRenderContext): ItemModel | null {
        const value = this.getPropertyValue(model.property, model, context);

        if (value === null) {
            return null;
        }

        // 应用缩放因子
        const scale = model.scale ?? 1.0;
        const scaledValue = value * scale;

        // 按阈值降序排序，找到第一个 <= 当前值的条目
        const sortedEntries = [...model.entries].sort((a, b) => b.threshold - a.threshold);

        for (const entry of sortedEntries) {
            if (scaledValue >= entry.threshold) {
                return entry.model;
            }
        }

        return null;
    }

    /**
     * 获取属性值
     */
    private getPropertyValue(property: string, _model: IRangeDispatchItemModel, context: IRenderContext): number | null {
        const prop = property.replace(/^minecraft:/, '');

        switch (prop) {
            case 'damage':
                return context.damage ?? null;

            case 'count':
                return 1;

            case 'cooldown':
                return 0;

            case 'time':
                return context.timeOfDay ?? null;

            case 'compass':
                return context.compassAngle ?? null;

            case 'use_duration':
                return context.useDuration ?? null;

            case 'use_cycle':
                return context.useCycle ?? null;

            case 'bundle/fullness':
                return context.bundleFullness ?? 0;

            case 'crossbow/pull':
            case 'bow/pull':
                return context.pull ?? 0;

            case 'custom_model_data':
                const index = 0;
                return context.customModelData?.floats?.[index] ?? null;

            default:
                return null;
        }
    }
}
