/**
 * 模型路径提取器
 *
 * 从物品配置中提取模型路径。
 * 支持多种路径格式：item-model、model（字符串/对象）、默认路径。
 */

import { type ILogger } from '../../../../core/interfaces/ILogger';
import { type IMinecraftDataService } from '../../../../core/interfaces/IMinecraftDataService';
import { normalizeModelPath } from '../ItemModel';

/**
 * 物品配置结构（路径提取所需字段）
 */
interface IItemConfigForPath {
    /** 基础材质 */
    material?: string;
    /** 模型配置 */
    model?: unknown;
    /** 物品模型路径（1.21+ 格式） */
    'item-model'?: string;
}

/**
 * 模型路径提取器
 *
 * 从 CraftEngine YAML 物品配置中提取或生成模型路径。
 *
 * @remarks
 * **提取优先级**：
 * 1. `item-model` 字段（1.21+ 格式）
 * 2. `model` 字段（字符串或对象中的 path/model 字段）
 *
 * **默认路径生成**：
 * - 如果有 `material` 字段，尝试使用 Minecraft 原版物品模型路径
 */
export class ModelPathExtractor {
    /**
     * 构造模型路径提取器实例
     *
     * @param logger - 日志记录器
     * @param minecraftDataService - Minecraft 数据服务
     */
    constructor(
        private readonly logger: ILogger,
        private readonly minecraftDataService: IMinecraftDataService,
    ) {}

    /**
     * 从配置中提取模型路径
     *
     * @param config - 物品配置对象
     * @returns 模型路径，如果无法提取则返回 undefined
     */
    extractModelPath(config: IItemConfigForPath): string | undefined {
        // 1. 检查 item-model 字段（1.21+ 格式）
        if (config['item-model']) {
            return normalizeModelPath(config['item-model']);
        }

        // 2. 检查 model 字段
        if (config.model) {
            // 字符串形式的模型引用
            if (typeof config.model === 'string') {
                return normalizeModelPath(config.model);
            }

            // 对象形式的模型配置
            const modelConfig = config.model as Record<string, unknown>;

            // 检查 path 字段
            if (modelConfig.path && typeof modelConfig.path === 'string') {
                return normalizeModelPath(modelConfig.path);
            }

            // 检查 model 字段（嵌套引用）
            if (modelConfig.model && typeof modelConfig.model === 'string') {
                return normalizeModelPath(modelConfig.model);
            }
        }

        return undefined;
    }

    /**
     * 获取默认模型路径
     *
     * 如果有材质定义，尝试使用 Minecraft 原版物品模型。
     *
     * @param config - 物品配置
     * @param itemId - 物品 ID
     * @returns 默认模型路径，如果无法生成则返回 undefined
     */
    getDefaultModelPath(config: IItemConfigForPath, itemId: string): string | undefined {
        // 如果有材质定义，尝试使用 Minecraft 原版物品模型
        if (config.material) {
            const material = config.material.toLowerCase().replace('minecraft:', '');

            // 验证材质是否是有效的 Minecraft 物品
            if (this.minecraftDataService.isLoaded() && !this.minecraftDataService.isValidItem(material)) {
                this.logger.warn('Invalid material for default model path', {
                    material: config.material,
                    itemId,
                });
                return undefined;
            }

            return `item/${material}`;
        }

        return undefined;
    }
}
