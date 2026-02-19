/**
 * 条件模型读取器
 *
 * 移植自 craft-engine 的 ConditionModelReader
 */

import { Key } from '../utils/Key';
import { SimplifiedModelReader } from './SimplifiedModelReader';
import { SimplifiedModelConfigError } from './GeneratedModelReader';

/**
 * 条件模型读取器
 * 用于处理基于条件的简化模型配置（如钓鱼竿、鞘翅、盾牌等）
 */
export class ConditionModelReader implements SimplifiedModelReader {
    private readonly model: string;
    private readonly property: string;
    private readonly suffix: string;

    constructor(model: string, property: string, suffix: string) {
        this.model = model;
        this.property = property;
        this.suffix = suffix;
    }

    convertFromTextures(
        textures: string[],
        optionalModelPaths: string[],
        id: Key
    ): Record<string, unknown> | null {
        // 如果 model 为空，返回 null
        if (this.model === '') {
            return null;
        }

        if (textures.length !== 2) {
            throw new SimplifiedModelConfigError(
                'warning.config.item.simplified_model.invalid_texture',
                '2',
                String(textures.length)
            );
        }

        const autoModel = optionalModelPaths.length === 0;
        if (!autoModel && optionalModelPaths.length !== 2) {
            throw new SimplifiedModelConfigError(
                'warning.config.item.simplified_model.invalid_model',
                '2',
                String(optionalModelPaths.length)
            );
        }

        const namespace = id.namespace;
        const value = id.value;

        return {
            type: 'condition',
            property: this.property,
            'on-false': {
                path: autoModel
                    ? `${namespace}:item/${value}`
                    : optionalModelPaths[0],
                generation: {
                    parent: `item/${this.model}`,
                    textures: { layer0: textures[0] },
                },
            },
            'on-true': {
                path: autoModel
                    ? `${namespace}:item/${value}${this.suffix}`
                    : optionalModelPaths[1],
                generation: {
                    parent: `item/${this.model}`,
                    textures: { layer0: textures[1] },
                },
            },
        };
    }

    convertFromModels(models: string[]): Record<string, unknown> {
        if (models.length !== 2) {
            throw new SimplifiedModelConfigError(
                'warning.config.item.simplified_model.invalid_model',
                '2',
                String(models.length)
            );
        }

        return {
            type: 'condition',
            property: this.property,
            'on-false': { path: models[0] },
            'on-true': { path: models[1] },
        };
    }
}

/**
 * 预定义的条件模型读取器实例
 */
export const ConditionModelReaderInstances = {
    FISHING_ROD: new ConditionModelReader('fishing_rod', 'fishing_rod/cast', '_cast'),
    ELYTRA: new ConditionModelReader('generated', 'broken', '_broken'),
    SHIELD: new ConditionModelReader('', 'using_item', '_blocking'),
} as const;
