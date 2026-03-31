/**
 * 模型生成数据结构
 *
 * 移植自 craft-engine 的 ModelGeneration 类，包含缓存和验证功能。
 */

import { type Key } from '../utils/Key';
import {
    type DisplayPosition,
    type IDisplayMeta,
    type GuiLight,
    type IModelGenerationConfig,
} from '../../../../core/interfaces/IModelGenerator';
import { ModelGenerationError } from '../../../../core/errors/ExtensionErrors';

/**
 * 模型生成类
 *
 * 包含缓存机制和 JSON 生成功能
 */
export class ModelGeneration {
    readonly path: Key;
    readonly parentModelPath: string;
    readonly texturesOverride?: Record<string, string>;
    readonly displays?: Partial<Record<DisplayPosition, IDisplayMeta>>;
    readonly guiLight?: GuiLight;
    readonly ambientOcclusion?: boolean;

    private _cachedModel?: Record<string, unknown>;

    constructor(
        path: Key,
        parentModelPath: string,
        texturesOverride?: Record<string, string>,
        displays?: Partial<Record<DisplayPosition, IDisplayMeta>>,
        guiLight?: GuiLight,
        ambientOcclusion?: boolean,
    ) {
        this.path = path;
        this.parentModelPath = parentModelPath;
        this.texturesOverride = texturesOverride;
        this.displays = displays;
        this.guiLight = guiLight;
        this.ambientOcclusion = ambientOcclusion;
    }

    /**
     * 获取生成的模型 JSON（带缓存）
     */
    get(): Record<string, unknown> {
        if (!this._cachedModel) {
            this._cachedModel = this.buildModel();
        }
        return this._cachedModel;
    }

    /**
     * 构建模型 JSON
     */
    private buildModel(): Record<string, unknown> {
        const model: Record<string, unknown> = {
            parent: this.parentModelPath,
        };

        if (this.texturesOverride) {
            model['textures'] = { ...this.texturesOverride };
        }

        if (this.displays) {
            const displayObj: Record<string, unknown> = {};
            for (const [pos, meta] of Object.entries(this.displays)) {
                if (meta) {
                    const displayMeta: Record<string, unknown> = {};
                    if (meta.rotation) {
                        displayMeta['rotation'] = [...meta.rotation];
                    }
                    if (meta.translation) {
                        displayMeta['translation'] = [...meta.translation];
                    }
                    if (meta.scale) {
                        displayMeta['scale'] = [...meta.scale];
                    }
                    displayObj[pos] = displayMeta;
                }
            }
            model['display'] = displayObj;
        }

        if (this.guiLight) {
            model['gui_light'] = this.guiLight;
        }

        return model;
    }

    /**
     * 检查是否相等
     */
    equals(other: ModelGeneration | null | undefined): boolean {
        if (!other) {
            return false;
        }
        return (
            this.path.equals(other.path) &&
            this.parentModelPath === other.parentModelPath &&
            JSON.stringify(this.texturesOverride) === JSON.stringify(other.texturesOverride) &&
            JSON.stringify(this.displays) === JSON.stringify(other.displays) &&
            this.guiLight === other.guiLight &&
            this.ambientOcclusion === other.ambientOcclusion
        );
    }

    /**
     * 获取哈希码
     */
    hashCode(): number {
        let result = this.path.hashCode();
        result = 31 * result + this.parentModelPath.length;
        return result;
    }

    /**
     * 从配置创建 ModelGeneration
     */
    static of(path: Key, config: IModelGenerationConfig): ModelGeneration {
        return ModelGeneration.builder()
            .path(path)
            .parentModelPath(config.parent ?? 'minecraft:item/generated')
            .texturesOverride(config.textures)
            .displays(config.display)
            .guiLight(config['gui-light'])
            .ambientOcclusion(config['ambient-occlusion'])
            .build();
    }

    /**
     * 创建 Builder
     */
    static builder(): ModelGenerationBuilder {
        return new ModelGenerationBuilder();
    }
}

/**
 * ModelGeneration 构建器
 */
export class ModelGenerationBuilder {
    private _path?: Key;
    private _parentModelPath?: string;
    private _texturesOverride?: Record<string, string>;
    private _displays?: Partial<Record<DisplayPosition, IDisplayMeta>>;
    private _guiLight?: GuiLight;
    private _ambientOcclusion?: boolean;

    path(path: Key): this {
        this._path = path;
        return this;
    }

    parentModelPath(parentModelPath: string): this {
        this._parentModelPath = parentModelPath;
        return this;
    }

    texturesOverride(textures?: Record<string, string>): this {
        this._texturesOverride = textures;
        return this;
    }

    displays(displays?: Partial<Record<DisplayPosition, IDisplayMeta>>): this {
        this._displays = displays;
        return this;
    }

    guiLight(guiLight?: GuiLight): this {
        this._guiLight = guiLight;
        return this;
    }

    ambientOcclusion(ambientOcclusion?: boolean): this {
        this._ambientOcclusion = ambientOcclusion;
        return this;
    }

    build(): ModelGeneration {
        if (!this._path) {
            throw new ModelGenerationError('Path is required for ModelGeneration');
        }
        if (!this._parentModelPath) {
            throw new ModelGenerationError('Parent model path is required for ModelGeneration');
        }
        return new ModelGeneration(
            this._path,
            this._parentModelPath,
            this._texturesOverride,
            this._displays,
            this._guiLight,
            this._ambientOcclusion,
        );
    }
}
