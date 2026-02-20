/**
 * Minecraft 模型渲染器适配器
 *
 * 封装 minecraft-model-renderer-ts 库，提供统一的渲染接口。
 *
 * @remarks
 * 该适配器负责：
 * - 初始化和管理渲染器实例
 * - 处理资源包路径解析
 * - 提供模型渲染功能
 * - 管理渲染器生命周期
 */

import { type ILogger } from '../../core/interfaces/ILogger';
import { type IRendererAdapter } from '../../core/interfaces/IRendererAdapter';
import { MinecraftModelRenderer } from './core/MinecraftModelRenderer';
import { type IMinecraftModelJson } from '../../core/interfaces/IModelGenerator';

// ============================================
// 类型定义
// ============================================

/**
 * 渲染选项
 */
export interface RenderOptions {
    /** 渲染图像尺寸（像素） */
    renderSize?: number;
    /** 资源包路径数组 */
    resourcePacks?: string[];
    /** 是否使用内置资源 */
    useInternalResources?: boolean;
}

/**
 * 默认渲染选项
 */
const DEFAULT_RENDER_OPTIONS: Required<RenderOptions> = {
    renderSize: 256,
    resourcePacks: [],
    useInternalResources: true,
};

// ============================================
// 渲染器适配器
// ============================================

/**
 * Minecraft 模型渲染器适配器
 *
 * 封装 minecraft-model-renderer-ts，提供统一的渲染接口。
 */
export class MinecraftRendererAdapter implements IRendererAdapter {
    private readonly logger: ILogger;
    private renderer: MinecraftModelRenderer | null = null;
    private currentOptions: RenderOptions | null = null;
    private initialized = false;

    constructor(logger: ILogger) {
        this.logger = logger.createChild('MinecraftRendererAdapter');
    }

    /**
     * 初始化渲染器
     *
     * @param options - 渲染选项
     * @param forceReinit - 强制重新初始化（默认 false，仅在选项变化时重新初始化）
     */
    async initialize(options: RenderOptions = {}, forceReinit = false): Promise<void> {
        const mergedOptions = { ...DEFAULT_RENDER_OPTIONS, ...options };

        // 检查选项是否变化，避免重复初始化
        if (!forceReinit && this.renderer && this.optionsEqual(mergedOptions)) {
            this.logger.debug('Renderer already initialized with same options');
            return;
        }

        try {
            // 创建渲染器实例
            // 使用 4x 超采样抗锯齿：以 4 倍分辨率渲染，然后缩小到目标尺寸
            const supersampleFactor = 4;
            this.renderer = new MinecraftModelRenderer({
                renderWidth: mergedOptions.renderSize * supersampleFactor,
                renderHeight: mergedOptions.renderSize * supersampleFactor,
                exportWidth: mergedOptions.renderSize,
                exportHeight: mergedOptions.renderSize,
                resourcePacks: mergedOptions.resourcePacks,
                useInternalResources: mergedOptions.useInternalResources,
            });

            this.currentOptions = mergedOptions;
            this.initialized = true;

            this.logger.info('Renderer initialized', {
                renderSize: mergedOptions.renderSize,
                resourcePackCount: mergedOptions.resourcePacks.length,
                useInternalResources: mergedOptions.useInternalResources,
            });
        } catch (error) {
            this.logger.error('Failed to initialize renderer', error as Error);
            throw new Error(`Failed to initialize renderer: ${(error as Error).message}`);
        }
    }

    /**
     * 渲染模型
     *
     * @param modelPath - 模型路径（如 block/chest, item/diamond_sword）
     * @returns PNG 图像 Buffer
     */
    async renderModel(modelPath: string): Promise<Buffer> {
        if (!this.renderer || !this.initialized) {
            throw new Error('Renderer not initialized. Call initialize() first.');
        }

        const startTime = performance.now();

        try {
            // 调用渲染器的 renderModel 方法
            const buffer = await this.renderer.renderModel(modelPath);

            const duration = performance.now() - startTime;
            this.logger.debug('Model rendered', { modelPath, duration: `${duration.toFixed(2)}ms` });

            return buffer;
        } catch (error) {
            this.logger.error('Failed to render model', error as Error, { modelPath });
            throw new Error(`Failed to render model '${modelPath}': ${(error as Error).message}`);
        }
    }

    /**
     * 从 JSON 渲染模型
     *
     * 支持动态生成的模型，无需模型文件存在于资源包中。
     * 模型的 parent 引用会被正确解析。
     *
     * @param modelJson - 模型 JSON 定义
     * @returns PNG 图像 Buffer
     */
    async renderModelFromJson(modelJson: IMinecraftModelJson): Promise<Buffer> {
        if (!this.renderer || !this.initialized) {
            throw new Error('Renderer not initialized. Call initialize() first.');
        }

        const startTime = performance.now();

        try {
            // 直接使用渲染器的 renderModelFromJson 方法
            const buffer = await this.renderer.renderModelFromJson(modelJson);

            const duration = performance.now() - startTime;
            this.logger.debug('Model rendered from JSON', {
                parent: modelJson.parent,
                duration: `${duration.toFixed(2)}ms`,
            });

            return buffer;
        } catch (error) {
            this.logger.error('Failed to render model from JSON', error as Error, {
                parent: modelJson.parent,
            });
            throw new Error(`Failed to render model from JSON: ${(error as Error).message}`);
        }
    }

    /**
     * 渲染物品
     *
     * @param itemId - 物品 ID（如 diamond_sword）
     * @returns PNG 图像 Buffer
     */
    async renderItem(itemId: string): Promise<Buffer> {
        if (!this.renderer || !this.initialized) {
            throw new Error('Renderer not initialized. Call initialize() first.');
        }

        const startTime = performance.now();

        try {
            // 调用渲染器的 renderItem 方法
            const buffer = await this.renderer.renderItem(itemId);

            const duration = performance.now() - startTime;
            this.logger.debug('Item rendered', { itemId, duration: `${duration.toFixed(2)}ms` });

            return buffer;
        } catch (error) {
            this.logger.error('Failed to render item', error as Error, { itemId });
            throw new Error(`Failed to render item '${itemId}': ${(error as Error).message}`);
        }
    }

    /**
     * 检查渲染器是否已初始化
     */
    isInitialized(): boolean {
        return this.initialized && this.renderer !== null;
    }

    /**
     * 获取当前渲染选项
     */
    getCurrentOptions(): RenderOptions | null {
        return this.currentOptions ? { ...this.currentOptions } : null;
    }

    /**
     * 检查是否支持从 JSON 渲染
     *
     * 当前实现通过渲染父模型来支持基本的 JSON 渲染。
     */
    supportsJsonRendering(): boolean {
        return this.initialized && this.renderer !== null;
    }

    /**
     * 释放资源
     *
     * 清理渲染器持有的缓存和内部状态。
     */
    dispose(): void {
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }
        this.currentOptions = null;
        this.initialized = false;
        this.logger.info('Renderer disposed');
    }

    /**
     * 比较两个选项是否相等
     */
    private optionsEqual(newOptions: RenderOptions): boolean {
        if (!this.currentOptions) {
            return false;
        }

        return (
            this.currentOptions.renderSize === newOptions.renderSize &&
            this.currentOptions.useInternalResources === newOptions.useInternalResources &&
            this.arraysEqual(this.currentOptions.resourcePacks ?? [], newOptions.resourcePacks ?? [])
        );
    }

    /**
     * 比较两个数组是否相等
     */
    private arraysEqual(a: string[], b: string[]): boolean {
        if (a.length !== b.length) {
            return false;
        }
        return a.every((val, idx) => val === b[idx]);
    }
}
