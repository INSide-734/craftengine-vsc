/**
 * 模型生成服务
 *
 * 从 CraftEngine YAML 配置生成 Minecraft 模型 JSON。
 * 移植自 craft-engine 的完整模型生成系统。
 *
 * 支持从 JSON 配置文件动态加载模型属性定义
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
    type IMinecraftModelJson,
    type IDisplayTransform,
    type DisplayPosition,
    type IModelGenerationConfig,
    type IItemModel,
    type IModelGeneration,
} from '../../core/interfaces/IModelGenerator';
import { ServiceNotInitializedError } from '../../core/errors/ExtensionErrors';
import { createAsyncInitializer, type AsyncInitializer } from '../../core/utils';
import { createItemModel, normalizeModelPath } from './model/ItemModel';
import { type SimplifiedModelReader } from './model/simplified/SimplifiedModelReader';
import { GeneratedModelReaderInstances } from './model/simplified/GeneratedModelReader';
import { BowModelReaderInstance } from './model/simplified/BowModelReader';
import { CrossbowModelReaderInstance } from './model/simplified/CrossbowModelReader';
import { ConditionModelReaderInstances } from './model/simplified/ConditionModelReader';
import { Key } from './model/utils/Key';

// ============================================
// 配置类型定义
// ============================================

/**
 * 物品配置结构
 */
interface ItemConfig {
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
function isItemConfig(value: unknown): value is ItemConfig {
    return typeof value === 'object' && value !== null;
}

// ============================================
// 简化模型读取器注册表
// ============================================

/**
 * 简化模型读取器注册表
 *
 * 根据物品材质类型选择对应的模型读取器
 */
const SIMPLIFIED_MODEL_READERS = new Map<string, SimplifiedModelReader>([
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
    private readonly minecraftDataService: IMinecraftDataService;
    private readonly configLoader: IDataConfigLoader;

    // 配置缓存
    private modelPropertiesConfig: IModelPropertiesConfig | null = null;

    // 异步初始化器
    private readonly initializer: AsyncInitializer;

    constructor(logger: ILogger, minecraftDataService: IMinecraftDataService, configLoader: IDataConfigLoader) {
        this.logger = logger.createChild('ModelGenerationService');
        this.minecraftDataService = minecraftDataService;
        this.configLoader = configLoader;

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
            const simplifiedModelConfig = this.processSimplifiedConfig(config, id);
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
                        const modelJson = this.buildModelFromModelGeneration(firstModel);
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
            const modelJson = this.generateCustomModelJson(config, itemId);
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
            const defaultPath = this.getDefaultModelPath(config, itemId);
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
     * 处理简化模型配置
     *
     * 支持 texture/textures 和简化的 model/models 配置
     *
     * @param config - 物品配置
     * @param id - 物品 Key
     * @returns 转换后的完整模型配置，如果不适用则返回 undefined
     */
    private processSimplifiedConfig(config: ItemConfig, id: Key): Record<string, unknown> | undefined {
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
     * @returns 对应的 SimplifiedModelReader
     */
    private getSimplifiedModelReader(material: string): SimplifiedModelReader {
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
     */
    private getAsStringList(value: unknown): string[] {
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

    /**
     * 从 ModelGeneration 构建模型 JSON
     */
    private buildModelFromModelGeneration(gen: IModelGeneration): IMinecraftModelJson {
        const model: IMinecraftModelJson = {
            parent: gen.parentModelPath,
        };

        if (gen.texturesOverride) {
            model.textures = gen.texturesOverride;
        } else if (gen.parentModelPath) {
            // 如果没有显式指定纹理，尝试从 parent 路径推断
            const inferredTextures = this.inferTexturesFromParent(gen.parentModelPath);
            if (inferredTextures) {
                model.textures = inferredTextures;
            }
        }

        if (gen.displays) {
            model.display = gen.displays as IMinecraftModelJson['display'];
        }

        if (gen.guiLight) {
            model.gui_light = gen.guiLight;
        }

        if (gen.ambientOcclusion !== undefined) {
            model.ambientocclusion = gen.ambientOcclusion;
        }

        return model;
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
        const config = itemConfig;

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
     */
    private getDefaultModelPath(config: ItemConfig, _itemId: string): string | undefined {
        // 如果有材质定义，尝试使用 Minecraft 原版物品模型
        if (config.material) {
            const material = config.material.toLowerCase().replace('minecraft:', '');

            // 验证材质是否是有效的 Minecraft 物品
            if (this.minecraftDataService.isLoaded() && !this.minecraftDataService.isValidItem(material)) {
                this.logger.warn('Invalid material for default model path', {
                    material: config.material,
                    itemId: _itemId,
                });
                return undefined;
            }

            return `item/${material}`;
        }

        return undefined;
    }

    /**
     * 生成自定义模型 JSON
     */
    private generateCustomModelJson(config: ItemConfig, _itemId: string): IMinecraftModelJson | undefined {
        // 检查是否有 generation 配置
        if (typeof config.model === 'object' && config.model !== null) {
            const modelConfig = config.model as Record<string, unknown>;
            if (modelConfig.generation) {
                return this.buildModelFromGeneration(modelConfig.generation as IModelGenerationConfig);
            }
        }

        return undefined;
    }

    /**
     * 从 generation 配置构建模型 JSON
     */
    private buildModelFromGeneration(gen: IModelGenerationConfig): IMinecraftModelJson {
        const model: IMinecraftModelJson = {
            parent: gen.parent ?? 'minecraft:item/generated',
        };

        // 纹理覆盖
        if (gen.textures) {
            model.textures = gen.textures;
            this.logger.debug('Using explicit textures from generation config', {
                textures: gen.textures,
            });
        } else if (gen.parent) {
            // 如果没有显式指定纹理，尝试从 parent 路径推断
            const inferredTextures = this.inferTexturesFromParent(gen.parent);
            this.logger.debug('Inferring textures from parent', {
                parent: gen.parent,
                inferredTextures,
            });
            if (inferredTextures) {
                model.textures = inferredTextures;
            }
        }

        // 显示位置配置
        if (gen.display) {
            model.display = this.buildDisplayConfig(gen.display);
        }

        // GUI 光照
        if (gen['gui-light']) {
            model.gui_light = gen['gui-light'];
        }

        // 环境光遮蔽
        if (gen['ambient-occlusion'] !== undefined) {
            model.ambientocclusion = gen['ambient-occlusion'];
        }

        return model;
    }

    /**
     * 从 parent 路径推断纹理
     *
     * 对于自定义模型路径（如 block/custom/xxx），推断对应的纹理路径
     */
    private inferTexturesFromParent(parent: string): Record<string, string> | undefined {
        // 移除 minecraft: 前缀
        const path = parent.replace('minecraft:', '');

        // block/custom/xxx -> 推断纹理为 block/custom/xxx
        if (path.startsWith('block/custom/')) {
            return {
                all: `minecraft:${path}`,
            };
        }

        // block/xxx（非 custom）-> 推断纹理为 block/xxx
        if (path.startsWith('block/')) {
            return {
                all: `minecraft:${path}`,
            };
        }

        // item/custom/xxx -> 推断纹理为 item/custom/xxx
        if (path.startsWith('item/custom/')) {
            return {
                layer0: `minecraft:${path}`,
            };
        }

        // item/xxx（非 custom）-> 推断纹理为 item/xxx
        if (path.startsWith('item/')) {
            return {
                layer0: `minecraft:${path}`,
            };
        }

        return undefined;
    }

    /**
     * 构建显示位置配置
     */
    private buildDisplayConfig(
        display: Partial<Record<DisplayPosition, IDisplayTransform>>,
    ): IMinecraftModelJson['display'] {
        const result: Record<string, IDisplayTransform> = {};

        for (const [position, transform] of Object.entries(display)) {
            if (transform) {
                result[position] = transform;
            }
        }

        return result as IMinecraftModelJson['display'];
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
