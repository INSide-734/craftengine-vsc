/**
 * 模型生成器接口
 *
 * 移植自 craft-engine 的 ModelGenerator 接口
 */

import { type ModelGeneration } from './ModelGeneration';

/**
 * 模型生成器接口
 */
export interface ModelGenerator {
    /**
     * 获取待生成的模型集合
     */
    modelsToGenerate(): ModelGeneration[];

    /**
     * 清空待生成的模型
     */
    clearModelsToGenerate(): void;
}
