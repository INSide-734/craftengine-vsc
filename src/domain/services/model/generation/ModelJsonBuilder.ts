/**
 * 模型 JSON 构建器
 *
 * 从配置和生成信息构建 Minecraft 模型 JSON 对象。
 */

import { type ILogger } from '../../../../core/interfaces/ILogger';
import {
    type IMinecraftModelJson,
    type IDisplayTransform,
    type DisplayPosition,
    type IModelGenerationConfig,
    type IModelGeneration,
} from '../../../../core/interfaces/IModelGenerator';

/**
 * 模型 JSON 构建器
 *
 * 将模型配置转换为 Minecraft 模型 JSON 格式。
 *
 * @remarks
 * **支持的构建来源**：
 * - `IModelGenerationConfig`：从 YAML generation 配置构建
 * - `IModelGeneration`：从 ItemModel 收集的生成信息构建
 *
 * **纹理推断**：
 * - 从 parent 路径自动推断纹理路径
 * - block/ 路径推断 all 纹理
 * - item/ 路径推断 layer0 纹理
 */
export class ModelJsonBuilder {
    /**
     * 构造模型 JSON 构建器实例
     *
     * @param logger - 日志记录器
     */
    constructor(private readonly logger: ILogger) {}

    /**
     * 从 generation 配置构建模型 JSON
     *
     * @param gen - 模型生成配置
     * @returns Minecraft 模型 JSON 对象
     */
    buildModelFromGeneration(gen: IModelGenerationConfig): IMinecraftModelJson {
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
     * 从 ModelGeneration 构建模型 JSON
     *
     * @param gen - 模型生成信息
     * @returns Minecraft 模型 JSON 对象
     */
    buildModelFromModelGeneration(gen: IModelGeneration): IMinecraftModelJson {
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
     * 从 parent 路径推断纹理
     *
     * 对于自定义模型路径（如 block/custom/xxx），推断对应的纹理路径。
     *
     * @param parent - 父模型路径
     * @returns 纹理映射，如果无法推断则返回 undefined
     */
    inferTexturesFromParent(parent: string): Record<string, string> | undefined {
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
     *
     * @param display - 显示位置配置
     * @returns Minecraft 模型 JSON 中的 display 配置
     */
    buildDisplayConfig(
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
}
