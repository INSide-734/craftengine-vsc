import { IMinecraftModelJson } from './IModelGenerator';

/**
 * 渲染器初始化选项
 */
export interface IRendererOptions {
    /** 渲染图像尺寸（像素） */
    renderSize?: number;
    /** 资源包路径数组 */
    resourcePacks?: string[];
    /** 是否使用内置资源 */
    useInternalResources?: boolean;
}

/**
 * 渲染器适配器接口
 *
 * 抽象 Minecraft 模型渲染能力，解耦应用层对基础设施层的直接依赖。
 */
export interface IRendererAdapter {
    /** 初始化渲染器 */
    initialize(options?: IRendererOptions, forceReinit?: boolean): Promise<void>;

    /** 渲染模型路径 */
    renderModel(modelPath: string): Promise<Buffer>;

    /** 从 JSON 渲染模型 */
    renderModelFromJson(modelJson: IMinecraftModelJson): Promise<Buffer>;

    /** 渲染物品 */
    renderItem(itemId: string): Promise<Buffer>;

    /** 是否已初始化 */
    isInitialized(): boolean;

    /** 是否支持 JSON 渲染 */
    supportsJsonRendering(): boolean;

    /** 释放资源 */
    dispose(): void;
}
