/**
 * 模型预览服务接口
 *
 * 定义物品模型预览功能的服务接口。
 *
 * @remarks
 * 该服务负责编排模型生成和渲染流程，提供完整的预览功能。
 */

import { IMinecraftModelJson } from './IModelGenerator';

// ============================================
// 预览选项
// ============================================

/**
 * 预览选项
 */
export interface PreviewOptions {
    /** 渲染图像尺寸（像素） */
    renderSize?: number;
    /** 资源包路径数组 */
    resourcePacks?: string[];
    /** 是否使用内置资源作为后备 */
    useInternalResources?: boolean;
}

// ============================================
// 预览结果
// ============================================

/**
 * 预览结果
 */
export interface PreviewResult {
    /** 是否成功 */
    success: boolean;
    /** 渲染的图像 Buffer（PNG 格式） */
    imageBuffer?: Buffer;
    /** 错误信息 */
    error?: string;
    /** 使用的模型路径 */
    modelPath?: string;
    /** 物品 ID */
    itemId?: string;
}

// ============================================
// 模型预览服务接口
// ============================================

/**
 * 模型预览服务接口
 *
 * 提供物品模型的预览功能，包括从物品 ID 预览、从模型路径预览、
 * 以及从自定义模型 JSON 预览。
 */
export interface IModelPreviewService {
    /**
     * 预览物品模型
     *
     * 根据物品 ID 查找配置并渲染预览图像。
     *
     * @param itemId - 物品 ID（如 mynamespace:my_item）
     * @param options - 预览选项
     * @returns 预览结果
     */
    previewItem(itemId: string, options?: PreviewOptions): Promise<PreviewResult>;

    /**
     * 预览原始模型路径
     *
     * 直接渲染指定路径的模型。
     *
     * @param modelPath - 模型路径（如 item/diamond_sword）
     * @param options - 预览选项
     * @returns 预览结果
     */
    previewModel(modelPath: string, options?: PreviewOptions): Promise<PreviewResult>;

    /**
     * 预览自定义模型 JSON
     *
     * 渲染自定义的模型 JSON 对象。
     *
     * @param modelJson - Minecraft 模型 JSON 对象
     * @param options - 预览选项
     * @returns 预览结果
     */
    previewCustomModel(
        modelJson: IMinecraftModelJson,
        options?: PreviewOptions
    ): Promise<PreviewResult>;

    /**
     * 检查预览服务是否可用
     *
     * @returns 如果服务已正确初始化则返回 true
     */
    isAvailable(): boolean;

    /**
     * 释放资源
     */
    dispose(): void;
}
