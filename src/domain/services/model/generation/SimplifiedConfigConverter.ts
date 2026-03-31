/**
 * 简化配置转换器
 *
 * 处理 CraftEngine YAML 中的简化模型配置（texture/textures、model/models），
 * 将其转换为完整的模型配置对象。
 */

import { type ILogger } from '../../../../core/interfaces/ILogger';
import { type IMinecraftDataService } from '../../../../core/interfaces/IMinecraftDataService';
import { type ISimplifiedModelReader } from '../simplified/SimplifiedModelReader';
import { GeneratedModelReaderInstances } from '../simplified/GeneratedModelReader';
import { BowModelReaderInstance } from '../simplified/BowModelReader';
import { CrossbowModelReaderInstance } from '../simplified/CrossbowModelReader';
import { ConditionModelReaderInstances } from '../simplified/ConditionModelReader';
import { type Key } from '../utils/Key';

/**
 * 物品配置结构（简化配置所需字段）
 */
interface IItemConfigForSimplified {
    /** 基础材质 */
    material?: string;
    /** 模型配置 */
    model?: unknown;
    /** 模型配置（复数形式） */
    models?: unknown;
    /** 纹理配置 */
    texture?: string | string[];
    /** 纹理配置（复数形式） */
    textures?: string[];
}

// ============================================
// 简化模型读取器注册表
// ============================================

/**
 * 简化模型读取器注册表
 *
 * 根据物品材质类型选择对应的模型读取器
 */
const SIMPLIFIED_MODEL_READERS = new Map<string, ISimplifiedModelReader>([
    // 弓类
    ['minecraft:bow', BowModelReaderInstance],
    ['bow', BowModelReaderInstance],

    // 弩类
    ['minecraft:crossbow', CrossbowModelReaderInstance],
    ['crossbow', CrossbowModelReaderInstance],

    // 钓鱼竿类
    ['minecraft:fishing_rod', ConditionModelReaderInstances.FISHING_ROD],
    ['fishing_rod', ConditionModelReaderInstances.FISHING_ROD],

    // 鞘翅类
    ['minecraft:elytra', ConditionModelReaderInstances.ELYTRA],
    ['elytra', ConditionModelReaderInstances.ELYTRA],

    // 盾牌类
    ['minecraft:shield', ConditionModelReaderInstances.SHIELD],
    ['shield', ConditionModelReaderInstances.SHIELD],
]);

/**
 * 简化配置转换器
 *
 * 将 texture/textures 和简化的 model/models 配置转换为完整的模型配置。
 *
 * @remarks
 * **支持的简化配置**：
 * - `texture/textures`：使用 SimplifiedModelReader 自动生成模型配置
 * - `model/models`（字符串或列表）：简化模型引用
 *
 * **材质类型适配**：
 * - 弓类 (bow)：使用 BowModelReader
 * - 弩类 (crossbow)：使用 CrossbowModelReader
 * - 钓鱼竿类 (fishing_rod)：使用 ConditionModelReader
 * - 鞘翅类 (elytra)：使用 ConditionModelReader
 * - 盾牌类 (shield)：使用 ConditionModelReader
 * - 默认：使用 GeneratedModelReader
 */
export class SimplifiedConfigConverter {
    /**
     * 构造简化配置转换器实例
     *
     * @param logger - 日志记录器
     * @param minecraftDataService - Minecraft 数据服务
     */
    constructor(
        private readonly logger: ILogger,
        private readonly minecraftDataService: IMinecraftDataService,
    ) {}

    /**
     * 处理简化模型配置
     *
     * 支持 texture/textures 和简化的 model/models 配置
     *
     * @param config - 物品配置
     * @param id - 物品 Key
     * @returns 转换后的完整模型配置，如果不适用则返回 undefined
     */
    processSimplifiedConfig(config: IItemConfigForSimplified, id: Key): Record<string, unknown> | undefined {
        // 如果 model 已经是完整的对象配置，直接返回
        if (config.model && typeof config.model === 'object' && !Array.isArray(config.model)) {
            const modelObj = config.model as Record<string, unknown>;
            // 检查是否有 type 字段，如果有则是完整配置
            if (modelObj.type) {
                return config.model as Record<string, unknown>;
            }
        }

        // 获取材质类型用于选择 SimplifiedModelReader
        const material = config.material?.toLowerCase() ?? 'minecraft:paper';

        // 获取简化模型读取器
        const simplifiedReader = this.getSimplifiedModelReader(material);

        // 处理 texture/textures 配置
        const textureConfig = config.texture ?? config.textures;
        if (textureConfig) {
            const textures = Array.isArray(textureConfig) ? textureConfig : [textureConfig];

            if (textures.length > 0) {
                // 获取可选的模型路径列表
                const modelConfig = config.model ?? config.models;
                const modelPaths = this.getAsStringList(modelConfig);

                try {
                    const result = simplifiedReader.convertFromTextures(textures, modelPaths, id);
                    if (result) {
                        return result;
                    }
                } catch (error) {
                    this.logger.warn('Failed to convert from textures', {
                        error: (error as Error).message,
                        itemId: id.toString(),
                    });
                }
            }
        }

        // 处理简化的 model/models 配置（字符串或列表）
        const modelConfig = config.model ?? config.models;
        if (modelConfig && (typeof modelConfig === 'string' || Array.isArray(modelConfig))) {
            const models = this.getAsStringList(modelConfig);
            if (models.length > 0) {
                try {
                    const result = simplifiedReader.convertFromModels(models);
                    if (result) {
                        return result;
                    }
                } catch (error) {
                    this.logger.warn('Failed to convert from models', {
                        error: (error as Error).message,
                        itemId: id.toString(),
                    });
                }
            }
        }

        return undefined;
    }

    /**
     * 获取简化模型读取器
     *
     * @param material - 物品材质类型
     * @returns 对应的 ISimplifiedModelReader
     */
    private getSimplifiedModelReader(material: string): ISimplifiedModelReader {
        // 尝试从注册表获取特定材质的读取器
        const reader = SIMPLIFIED_MODEL_READERS.get(material);
        if (reader) {
            return reader;
        }

        // 验证材质是否是有效的 Minecraft 物品
        if (this.minecraftDataService.isLoaded() && !this.minecraftDataService.isValidItem(material)) {
            this.logger.warn('Unknown material type, using default model reader', {
                material,
                validMaterials: 'use IMinecraftDataService.getItemNames() to get valid materials',
            });
        }

        // 默认使用 GENERATED 读取器
        return GeneratedModelReaderInstances.GENERATED;
    }

    /**
     * 将值转换为字符串列表
     *
     * @param value - 要转换的值
     * @returns 字符串数组
     */
    getAsStringList(value: unknown): string[] {
        if (!value) {
            return [];
        }
        if (typeof value === 'string') {
            return [value];
        }
        if (Array.isArray(value)) {
            return value.filter((v): v is string => typeof v === 'string');
        }
        return [];
    }
}
