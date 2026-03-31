import * as fs from 'fs/promises';
import sharp from 'sharp';
import { ResourceLoader } from '../model/resource/ResourceLoader';
import { ResourceId } from '../model/resource/ResourceId';
import { ModelCache } from '../model/cache/ModelCache';
import { TextureCache } from '../model/cache/TextureCache';
import { ResolvedModelCache } from '../model/cache/ResolvedModelCache';
import { GeometricalModel, LayeredModel, type Model } from '../model/Model';
import { Scene } from '../scene/Scene';
import { ItemDefinitionCache } from '../item/ItemDefinitionCache';
import { ItemModelResolver } from '../item/ItemModelResolver';
import type { IRenderOptions, IModelJson } from '../types/index';
import type { IRenderContext } from '../types/item-definition';

/**
 * 默认渲染选项
 */
const DEFAULT_OPTIONS: Required<IRenderOptions> = {
    renderWidth: 512,
    renderHeight: 512,
    exportWidth: 128,
    exportHeight: 128,
    resourcePacks: [],
    useInternalResources: true,
    cameraDistance: 40,
    fov: 0.95,
    cropVertical: 0.1,
    cropHorizontal: 0.1,
};

/**
 * Minecraft 模型渲染器
 * 将 Minecraft 方块/物品模型渲染为 2D 图像
 */
export class MinecraftModelRenderer {
    private readonly options: Required<IRenderOptions>;
    private readonly loader: ResourceLoader;
    private readonly modelCache: ModelCache;
    private readonly resolvedModelCache: ResolvedModelCache;
    private readonly itemDefinitionCache: ItemDefinitionCache;
    private readonly itemModelResolver: ItemModelResolver;

    constructor(options: IRenderOptions = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.loader = new ResourceLoader(this.options.resourcePacks, this.options.useInternalResources);
        // TextureCache 初始化后自动注册到 loader，通过 loader 间接使用
        new TextureCache(this.loader);
        this.modelCache = new ModelCache(this.loader);
        this.resolvedModelCache = new ResolvedModelCache(this.modelCache);
        // 初始化物品定义支持
        this.itemDefinitionCache = new ItemDefinitionCache(this.loader);
        this.itemModelResolver = new ItemModelResolver(this.resolvedModelCache);
    }

    /**
     * 渲染模型
     * @param modelPath 模型路径，例如 "block/chest", "item/diamond_sword"
     * @returns PNG 格式的 Buffer
     */
    async renderModel(modelPath: string): Promise<Buffer> {
        // 使用 ResolvedModelCache 避免重复解析
        const model = await this.resolvedModelCache.get(modelPath);
        return this.renderResolvedModel(model);
    }

    /**
     * 渲染层叠模型（2D 物品）
     */
    private async renderLayeredModel(model: LayeredModel): Promise<Buffer> {
        const imageData = model.toImageData();

        let image = sharp(imageData.data, {
            raw: { width: imageData.width, height: imageData.height, channels: 4 },
        });

        // 缩放到导出尺寸（使用最近邻插值保持像素风格）
        if (imageData.width !== this.options.exportWidth || imageData.height !== this.options.exportHeight) {
            image = image.resize(this.options.exportWidth, this.options.exportHeight, {
                kernel: 'nearest',
            });
        }

        return image.png().toBuffer();
    }

    /**
     * 渲染模型并保存到文件
     * @param modelPath 模型路径
     * @param outputPath 输出文件路径
     */
    async renderModelToFile(modelPath: string, outputPath: string): Promise<void> {
        const buffer = await this.renderModel(modelPath);
        await fs.writeFile(outputPath, buffer);
    }

    /**
     * 从 JSON 渲染模型
     * 支持动态生成的模型，无需模型文件存在于资源包中
     *
     * @param modelJson 模型 JSON 定义
     * @returns PNG 格式的 Buffer
     */
    async renderModelFromJson(modelJson: IModelJson): Promise<Buffer> {
        // 从 JSON 创建 UnresolvedModel
        const unresolved = await this.modelCache.createFromJson(modelJson);
        const model = await unresolved.resolve();
        return this.renderResolvedModel(model);
    }

    /**
     * 渲染物品
     * 优先使用 1.21+ 物品定义格式，回退到传统模型路径
     *
     * @param itemId 物品 ID，如 "diamond_sword", "minecraft:chest"
     * @param context 可选的渲染上下文，用于条件模型
     * @returns PNG 格式的 Buffer
     *
     * @example
     * // 渲染钻石剑
     * await renderer.renderItem('diamond_sword');
     *
     * // 渲染带条件的弓（拉弓状态）
     * await renderer.renderItem('bow', { pull: 0.9, usingItem: true });
     *
     * // 渲染特定时间的时钟
     * await renderer.renderItem('clock', { timeOfDay: 0.5 });
     */
    async renderItem(itemId: string, context: IRenderContext = {}): Promise<Buffer> {
        // 1. 尝试加载 1.21+ 物品定义
        const definition = this.itemDefinitionCache.get(itemId);

        if (definition) {
            // 使用新格式
            const models = await this.itemModelResolver.resolve(definition, context);

            if (models.length === 0) {
                throw new Error(`No model resolved for item: ${itemId}`);
            }

            // 处理复合模型
            if (models.length === 1) {
                return this.renderResolvedModel(models[0]);
            } else {
                return this.renderCompositeModels(models);
            }
        }

        // 2. 回退到传统模型路径
        const resourceId = ResourceId.of(itemId);
        const itemPath = `item/${resourceId.path}`;
        const blockPath = `block/${resourceId.path}`;

        try {
            return await this.renderModel(itemPath);
        } catch {
            try {
                return await this.renderModel(blockPath);
            } catch {
                throw new Error(`Model not found for item: ${itemId}`);
            }
        }
    }

    /**
     * 渲染已解析的模型
     */
    private async renderResolvedModel(model: Model): Promise<Buffer> {
        if (model instanceof GeometricalModel) {
            const scene = new Scene(
                model,
                this.options.renderWidth,
                this.options.renderHeight,
                this.options.cameraDistance,
                this.options.fov,
                this.options.cropVertical,
                this.options.cropHorizontal,
            );

            return scene.render(this.options.exportWidth, this.options.exportHeight);
        } else if (model instanceof LayeredModel) {
            return this.renderLayeredModel(model);
        }

        throw new Error('Unknown model type');
    }

    /**
     * 渲染复合模型（多个模型合成）
     */
    private async renderCompositeModels(models: Model[]): Promise<Buffer> {
        const buffers: Buffer[] = [];
        for (const model of models) {
            buffers.push(await this.renderResolvedModel(model));
        }

        if (buffers.length === 1) {
            return buffers[0];
        }

        let composite = sharp(buffers[0]);
        for (let i = 1; i < buffers.length; i++) {
            composite = composite.composite([{ input: buffers[i] }]);
        }

        return composite.png().toBuffer();
    }

    /**
     * 渲染物品并保存到文件
     */
    async renderItemToFile(itemId: string, outputPath: string, context: IRenderContext = {}): Promise<void> {
        const buffer = await this.renderItem(itemId, context);
        await fs.writeFile(outputPath, buffer);
    }

    /**
     * 检查物品是否有 1.21+ 格式的定义
     */
    hasItemDefinition(itemId: string): boolean {
        return this.itemDefinitionCache.has(itemId);
    }

    /**
     * 释放渲染器持有的所有缓存资源
     */
    dispose(): void {
        this.modelCache.clear();
        this.resolvedModelCache.clear();
        this.itemDefinitionCache.clear();
    }
}

export default MinecraftModelRenderer;
