/**
 * 简化模型读取器接口
 *
 * 移植自 craft-engine 的 SimplifiedModelReader
 */

import { Key } from '../utils/Key';

/**
 * 简化模型读取器接口
 * 用于将简化的模型配置转换为完整的模型定义
 */
export interface SimplifiedModelReader {
    /**
     * 从纹理和可选模型路径转换为模型定义
     * @param textures 纹理列表
     * @param optionalModelPaths 可选的模型路径列表
     * @param id 资源标识符
     * @returns 模型定义对象，如果无法转换则返回 null
     */
    convertFromTextures(
        textures: string[],
        optionalModelPaths: string[],
        id: Key
    ): Record<string, unknown> | null;

    /**
     * 从模型路径列表转换为模型定义
     * @param models 模型路径列表
     * @returns 模型定义对象，如果无法转换则返回 null
     */
    convertFromModels(models: string[]): Record<string, unknown> | null;
}
