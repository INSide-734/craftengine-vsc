/**
 * 模型生成器接口
 *
 * 定义从 CraftEngine YAML 配置生成 Minecraft 模型 JSON 的接口。
 * 移植自 craft-engine 的完整模型生成系统。
 *
 * @remarks
 * 该接口用于将 CraftEngine 的物品配置转换为标准的 Minecraft 模型 JSON 格式，
 * 以便渲染器可以正确渲染物品模型。
 *
 * 数据类型定义已提取至 {@link ../types/MinecraftModelTypes}，
 * 此文件通过 re-export 保持向后兼容。
 *
 * 支持的模型类型：
 * - minecraft:empty - 空模型
 * - minecraft:model - 基础模型
 * - minecraft:composite - 复合模型
 * - minecraft:condition - 条件模型
 * - minecraft:range_dispatch - 范围分发模型
 * - minecraft:select - 选择模型
 * - minecraft:special - 特殊模型
 * - minecraft:bundle/selected_item - 捆绑选中物品模型
 */

import type { IItemModel, IModelGeneration, IModelGenerationResult } from '../types/MinecraftModelTypes';

// 重新导出所有类型，保持向后兼容
export * from '../types/MinecraftModelTypes';

/**
 * 模型生成器接口
 *
 * 负责从 CraftEngine YAML 物品配置生成 Minecraft 模型 JSON。
 */
export interface IModelGenerator {
    /**
     * 从物品配置生成模型
     *
     * @param itemConfig - 物品 YAML 配置对象
     * @param itemId - 物品 ID（如 mynamespace:my_item）
     * @returns 模型生成结果
     */
    generateModel(itemConfig: unknown, itemId: string): Promise<IModelGenerationResult>;

    /**
     * 检查配置是否包含模型定义
     *
     * @param itemConfig - 物品配置对象
     * @returns 如果配置包含可渲染的模型定义则返回 true
     */
    hasModelDefinition(itemConfig: unknown): boolean;

    /**
     * 从配置中提取模型路径
     *
     * @param itemConfig - 物品配置对象
     * @returns 模型路径，如果没有则返回 undefined
     */
    extractModelPath(itemConfig: unknown): string | undefined;

    /**
     * 从配置创建 ItemModel 实例
     *
     * @param config - 模型配置对象
     * @returns ItemModel 实例
     */
    createItemModel(config: unknown): IItemModel | undefined;

    /**
     * 收集所有需要生成的模型
     *
     * @param itemModel - ItemModel 实例
     * @returns 需要生成的 ModelGeneration 列表
     */
    collectModelsToGenerate(itemModel: IItemModel): IModelGeneration[];
}
