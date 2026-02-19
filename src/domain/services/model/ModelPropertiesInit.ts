/**
 * 模型属性统一初始化入口
 *
 * 从 data/minecraft/model-properties.json 配置初始化所有模型属性模块。
 * 必须在使用任何模型属性常量或注册表之前调用 initializeModelProperties()。
 */

import { IModelPropertiesConfig } from '../../../core/types/ConfigTypes';
import { initializeModelTypes } from './ItemModelTypes';
import { initializeItemModelTypes } from './ItemModels';
import { initializeConditionProperties } from './condition/ConditionProperty';
import { initializeSelectProperties } from './select/SelectProperty';
import { initializeRangeDispatchProperties } from './rangedispatch/RangeDispatchProperty';
import { initializeSpecialModelTypes } from './special/SpecialModel';
import { initializeTintFactories } from './Tint';

/**
 * 从 JSON 配置初始化所有模型属性模块
 *
 * @param config - 模型属性配置
 */
export function initializeModelProperties(config: IModelPropertiesConfig): void {
    initializeModelTypes(config.modelTypes);
    initializeItemModelTypes(config.modelTypes);
    initializeConditionProperties(config.conditionProperties);
    initializeSelectProperties(config.selectProperties);
    initializeRangeDispatchProperties(config.rangeDispatchProperties);
    initializeSpecialModelTypes(config.specialModelTypes);
    if (config.tintTypes) {
        initializeTintFactories(config.tintTypes);
    }
}
