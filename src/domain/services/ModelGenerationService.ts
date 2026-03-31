/**
 * 模型生成服务
 *
 * 从 CraftEngine YAML 配置生成 Minecraft 模型 JSON。
 * 移植自 craft-engine 的完整模型生成系统。
 *
 * 协调 ModelPathExtractor、ModelJsonBuilder 和 SimplifiedConfigConverter
 * 等子组件完成模型生成工作。
 *
 * @remarks
 * 该服务负责解析物品配置中的模型定义，并生成或提取模型路径。
 * 支持所有 craft-engine 的模型类型：
 * - minecraft:empty - 空模型
 * - minecraft:model - 基础模型
 * - minecraft:composite - 复合模型
 * - minecraft:condition - 条件模型
 * - minecraft:range_dispatch - 范围分发模型
 * - minecraft:select - 选择模型
 * - minecraft:special - 特殊模型
 * - minecraft:bundle/selected_item - 捆绑选中物品模型
 *
 * 支持简化模型配置：
 * - texture/textures: 使用简化模型读取器自动生成模型配置
 * - model/models (字符串或列表): 简化模型引用
 */

import { type ILogger } from '../../core/interfaces/ILogger';
import { type IMinecraftDataService } from '../../core/interfaces/IMinecraftDataService';
import {
    type IDataConfigLoader,
    type IModelPropertiesConfig,
    type IModelPropertyDefinition,
} from '../../core/interfaces/IDataConfigLoader';
import {
    type IModelGenerator,
    type IModelGenerationResult,
    type IModelGenerationConfig,
    type IItemModel,
    type IModelGeneration,
} from '../../core/interfaces/IModelGenerator';
import { ServiceNotInitializedError } from '../../core/errors/ExtensionErrors';
import { createAsyncInitializer, type IAsyncInitializer } from '../../core/utils';
import { createItemModel, normalizeModelPath } from './model/ItemModel';
import { Key } from './model/utils/Key';
import { ModelPathExtractor } from './model/generation/ModelPathExtractor';
import { ModelJsonBuilder } from './model/generation/ModelJsonBuilder';
import { SimplifiedConfigConverter } from './model/generation/SimplifiedConfigConverter';

// ============================================
// 配置类型定义
// ============================================

/**
 * 物品配置结构
 */
interface IItemConfig {
    /** 基础材质 */
    material?: string;
    /** 自定义模型数据 */
    'custom-model-data'?: number;
    /** 模型配置 */
    model?: unknown;
    /** 模型配置（复数形式） */
    models?: unknown;
    /** 物品模型路径（1.21+ 格式） */
    'item-model'?: string;
    /** 纹理配置 */
    texture?: string | string[];
    /** 纹理配置（复数形式） */
    textures?: string[];
}

/**
 * ItemConfig 类型守卫
 *
 * 验证 unknown 值是否为有效的对象结构，可安全作为 ItemConfig 访问
 */
function isItemConfig(value: unknown): value is IItemConfig {
    return typeof value === 'object' && value !== null;
}

// ============================================
// 模型生成服务
// ============================================

/**
 * 模型生成服务
 *
 * 将 CraftEngine YAML 配置转换为 Minecraft 模型 JSON。
 * 支持从 JSON 配置文件动态加载模型属性定义。
 */
export class ModelGenerationService implements IModelGenerator {
    private readonly logger: ILogger;
    private readonly configLoader: IDataConfigLoader;

    // 配置缓存
    private modelPropertiesConfig: IModelPropertiesConfig | null = null;

    // 异步初始化器
    private readonly initializer: IAsyncInitializer;

    // 子组件
    private readonly pathExtractor: ModelPathExtractor;
    private readonly jsonBuilder: ModelJsonBuilder;
    private readonly simplifiedConverter: SimplifiedConfigConverter;

    constructor(logger: ILogger, minecraftDataService: IMinecraftDataService, configLoader: IDataConfigLoader) {
        this.logger = logger.createChild('ModelGenerationService');
        this.configLoader = configLoader;

        // 初始化子组件
        this.pathExtractor = new ModelPathExtractor(this.logger, minecraftDataService);
        this.jsonBuilder = new ModelJsonBuilder(this.logger);
        this.simplifiedConverter = new SimplifiedConfigConverter(this.logger, minecraftDataService);

        this.initializer = createAsyncInitializer(async () => {
            this.modelPropertiesConfig = await this.configLoader.loadModelPropertiesConfig();
            this.logger.debug('Model properties config loaded from JSON');
        });
    }

    /**
     * 确保配置已加载
     */
    private async ensureConfigLoaded(): Promise<void> {
        await this.initializer.ensure();
    }

    // ============================================
    // 配置访问方法
    // ============================================

    /**
     * 获取模型类型映射
     */
    getModelTypes(): Record<string, string> {
        if (!this.modelPropertiesConfig) {
            throw new ServiceNotInitializedError('ModelGenerationService');
        }
        return this.modelPropertiesConfig.modelTypes;
    }

    /**
     * 获取条件属性列表
     */
    getConditionProperties(): IModelPropertyDefinition[] {
        if (!this.modelPropertiesConfig) {
            throw new ServiceNotInitializedError('ModelGenerationService');
        }
        return this.modelPropertiesConfig.conditionProperties;
    }

    /**
     * 获取选择属性列表
     */
    getSelectProperties(): IModelPropertyDefinition[] {
        if (!this.modelPropertiesConfig) {
            throw new ServiceNotInitializedError('ModelGenerationService');
        }
        return this.modelPropertiesConfig.selectProperties;
    }

    /**
     * 获取范围分发属性列表
     */
    getRangeDispatchProperties(): IModelPropertyDefinition[] {
        if (!this.modelPropertiesConfig) {
            throw new ServiceNotInitializedError('ModelGenerationService');
        }
        return this.modelPropertiesConfig.rangeDispatchProperties;
    }

    /**
     * 获取特殊模型类型列表
     */
    getSpecialModelTypes(): IModelPropertyDefinition[] {
        if (!this.modelPropertiesConfig) {
            throw new ServiceNotInitializedError('ModelGenerationService');
        }
        return this.modelPropertiesConfig.specialModelTypes;
    }

    /**
     * 获取已知键列表
     */
    getKnownKeys(modelType: string): string[] {
        if (!this.modelPropertiesConfig) {
            throw new ServiceNotInitializedError('ModelGenerationService');
        }
        return this.modelPropertiesConfig.knownKeys[modelType] ?? [];
    }

    /**
     * 初始化服务（预加载配置）
     */
    async initialize(): Promise<void> {
        await this.ensureConfigLoaded();
    }

    /**
     * 从物品配置生成模型
     *
     * @param itemConfig - 物品 YAML 配置对象
     * @param itemId - 物品 ID
     * @returns 模型生成结果
     */
    async generateModel(itemConfig: unknown, itemId: string): Promise<IModelGenerationResult> {
        try {
            if (!isItemConfig(itemConfig)) {
                return { success: false, error: 'Invalid item config: expected an object' };
            }
            const config = itemConfig;
            const id = Key.of(itemId);

            // 1. 尝试处理简化模型配置（texture/textures）
            const simplifiedModelConfig = this.simplifiedConverter.processSimplifiedConfig(config, id);
            if (simplifiedModelConfig) {
                this.logger.debug('Processed simplified model config', { itemId });

                // 创建 ItemModel 实例
                const itemModel = this.createItemModel(simplifiedModelConfig);
                if (itemModel) {
                    // 收集需要生成的模型
                    const modelsToGenerate = this.collectModelsToGenerate(itemModel);

                    // 如果有需要生成的模型，取第一个的路径
                    if (modelsToGenerate.length > 0) {
                        const firstModel = modelsToGenerate[0];
                        const modelJson = this.jsonBuilder.buildModelFromModelGeneration(firstModel);
                        return {
                            success: true,
                            modelJson,
                            modelPath: firstModel.path,
                        };
                    }

                    // 从配置中提取路径
                    const modelCfg = simplifiedModelConfig as Record<string, unknown>;
                    if (modelCfg.path && typeof modelCfg.path === 'string') {
                        return {
                            success: true,
                            modelPath: normalizeModelPath(modelCfg.path),
                        };
                    }
                }
            }

            // 2. 优先尝试生成自定义模型 JSON（从 generation 配置）
            // generation 配置优先级高于 path，因为它包含完整的模型生成信息
            const modelJson = this.generateCustomModelJson(config);
            if (modelJson) {
                this.logger.debug('Generated custom model JSON', { itemId });
                return {
                    success: true,
                    modelJson,
                };
            }

            // 3. 尝试提取模型路径（model 为对象或字符串）
            const modelPath = this.extractModelPath(config);
            if (modelPath) {
                this.logger.debug('Extracted model path', { itemId, modelPath });
                return {
                    success: true,
                    modelPath,
                };
            }

            // 4. 尝试从材质生成默认模型路径
            const defaultPath = this.pathExtractor.getDefaultModelPath(config, itemId);
            if (defaultPath) {
                this.logger.debug('Using default model path', { itemId, modelPath: defaultPath });
                return {
                    success: true,
                    modelPath: defaultPath,
                };
            }

            return {
                success: false,
                error: `No model definition found for item: ${itemId}`,
            };
        } catch (error) {
            this.logger.error('Failed to generate model', error as Error, { itemId });
            return {
                success: false,
                error: (error as Error).message,
            };
        }
    }

    /**
     * 检查配置是否包含模型定义
     */
    hasModelDefinition(itemConfig: unknown): boolean {
        if (!isItemConfig(itemConfig)) {
            return false;
        }
        const config = itemConfig;
        return !!(
            config.model ||
            config.models ||
            config['item-model'] ||
            config.texture ||
            config.textures ||
            config.material
        );
    }

    /**
     * 从配置中提取模型路径
     */
    extractModelPath(itemConfig: unknown): string | undefined {
        if (!isItemConfig(itemConfig)) {
            return undefined;
        }
        return this.pathExtractor.extractModelPath(itemConfig);
    }

    // ============================================
    // 私有方法
    // ============================================

    /**
     * 生成自定义模型 JSON
     */
    private generateCustomModelJson(
        config: IItemConfig,
    ): ReturnType<ModelJsonBuilder['buildModelFromGeneration']> | undefined {
        // 检查是否有 generation 配置
        if (typeof config.model === 'object' && config.model !== null) {
            const modelConfig = config.model as Record<string, unknown>;
            if (modelConfig.generation) {
                return this.jsonBuilder.buildModelFromGeneration(modelConfig.generation as IModelGenerationConfig);
            }
        }

        return undefined;
    }

    /**
     * 从配置创建 ItemModel 实例
     *
     * @param config - 模型配置对象
     * @returns ItemModel 实例
     */
    createItemModel(config: unknown): IItemModel | undefined {
        if (!config) {
            return undefined;
        }
        try {
            return createItemModel(config);
        } catch (error) {
            this.logger.warn('Failed to create ItemModel', { error });
            return undefined;
        }
    }

    /**
     * 收集所有需要生成的模型
     *
     * @param itemModel - ItemModel 实例
     * @returns 需要生成的 ModelGeneration 列表
     */
    collectModelsToGenerate(itemModel: IItemModel): IModelGeneration[] {
        return itemModel.modelsToGenerate();
    }
}
