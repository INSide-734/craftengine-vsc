import type { ConditionItemModel, RenderContext } from '../../types/item-definition';

/**
 * Condition 条件求值器
 */
export class ConditionEvaluator {
  /**
   * 评估条件，返回 true 或 false
   */
  evaluate(model: ConditionItemModel, context: RenderContext): boolean {
    const prop = model.property.replace(/^minecraft:/, '');

    switch (prop) {
      case 'using_item':
        return context.usingItem === true;

      case 'broken':
        return context.broken === true;

      case 'damaged':
        return (context.damage ?? 0) > 0;

      case 'has_component':
        if (!model.slot_id || !context.components) {return false;}
        return model.slot_id in context.components;

      case 'fishing_rod/cast':
        return context.cast === true;

      case 'selected':
        return context.selectedItem !== undefined;

      case 'carried':
        return true;

      case 'extended_view':
        return context.usingItem === true;

      case 'view_entity':
        return true;

      case 'keybind_down':
        return false;

      case 'custom_model_data':
        const index = model.index ?? 0;
        return context.customModelData?.flags?.[index] === true;

      default:
        return false;
    }
  }
}
