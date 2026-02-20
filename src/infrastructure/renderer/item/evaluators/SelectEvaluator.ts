import type { SelectItemModel, ItemModel, RenderContext } from '../../types/item-definition';

/**
 * Select 条件求值器
 */
export class SelectEvaluator {
    /**
     * 评估 select 模型，返回匹配的子模型
     */
    evaluate(model: SelectItemModel, context: RenderContext): ItemModel | null {
        const propertyValue = this.getPropertyValue(model.property, model, context);

        if (propertyValue === null || propertyValue === undefined) {
            return null;
        }

        const valueStr = String(propertyValue);

        for (const caseItem of model.cases) {
            const whenValues = Array.isArray(caseItem.when) ? caseItem.when : [caseItem.when];
            if (whenValues.includes(valueStr)) {
                return caseItem.model;
            }
        }

        return null;
    }

    /**
     * 获取属性值
     */
    private getPropertyValue(property: string, model: SelectItemModel, context: RenderContext): string | number | null {
        const prop = property.replace(/^minecraft:/, '');

        switch (prop) {
            case 'local_time':
                if (!context.localTime) {
                    return null;
                }
                const pattern = model.pattern || 'HH:mm';
                return this.formatTime(context.localTime, pattern);

            case 'block_state':
                // 支持两种方式：
                // 1. block_state_map: 映射方块状态键到结果键
                // 2. block_state_property: 直接读取指定的方块状态属性
                if (model.block_state_property) {
                    // 直接读取指定的属性
                    return context.blockState?.[model.block_state_property] || null;
                } else if (model.block_state_map) {
                    // 使用映射表
                    if (!context.blockState) {
                        return null;
                    }
                    for (const [stateKey, _resultKey] of Object.entries(model.block_state_map)) {
                        if (context.blockState[stateKey]) {
                            return context.blockState[stateKey];
                        }
                    }
                }
                return null;

            case 'display_context':
                return context.displayContext || 'gui';

            case 'context_dimension':
                return context.dimension || null;

            case 'charge_type':
                return context.chargeType || 'none';

            case 'trim_material':
                return context.trimMaterial || null;

            case 'custom_model_data':
                if (context.customModelData?.strings && model.cases.length > 0) {
                    const index = 0;
                    return context.customModelData.strings[index] || null;
                }
                return null;

            default:
                return null;
        }
    }

    /**
     * 格式化时间
     */
    private formatTime(date: Date, pattern: string): string {
        const pad = (n: number) => n.toString().padStart(2, '0');

        return pattern
            .replace('yyyy', date.getFullYear().toString())
            .replace('MM', pad(date.getMonth() + 1))
            .replace('dd', pad(date.getDate()))
            .replace('HH', pad(date.getHours()))
            .replace('mm', pad(date.getMinutes()))
            .replace('ss', pad(date.getSeconds()));
    }
}
