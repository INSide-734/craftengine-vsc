/**
 * 弓模型读取器
 *
 * 移植自 craft-engine 的 BowModelReader
 */

import { Key } from '../utils/Key';
import { SimplifiedModelReader } from './SimplifiedModelReader';
import { SimplifiedModelConfigError } from './GeneratedModelReader';

/** 弓模型所需的纹理/模型数量 */
const BOW_REQUIRED_COUNT = 4;

/**
 * 创建带纹理生成的模型配置
 */
function createModelWithGeneration(
    path: string,
    parent: string,
    texture: string
): Record<string, unknown> {
    return {
        path,
        generation: {
            parent,
            textures: { layer0: texture },
        },
    };
}

/**
 * 弓模型读取器
 */
export class BowModelReader implements SimplifiedModelReader {
    convertFromTextures(
        textures: string[],
        optionalModelPaths: string[],
        id: Key
    ): Record<string, unknown> {
        if (textures.length !== BOW_REQUIRED_COUNT) {
            throw new SimplifiedModelConfigError(
                'warning.config.item.simplified_model.invalid_texture',
                String(BOW_REQUIRED_COUNT),
                String(textures.length)
            );
        }

        const autoModel = optionalModelPaths.length === 0;
        if (!autoModel && optionalModelPaths.length !== BOW_REQUIRED_COUNT) {
            throw new SimplifiedModelConfigError(
                'warning.config.item.simplified_model.invalid_model',
                String(BOW_REQUIRED_COUNT),
                String(optionalModelPaths.length)
            );
        }

        const { namespace, value } = id;
        const getPath = (suffix: string, index: number) =>
            autoModel ? `${namespace}:item/${value}${suffix}` : optionalModelPaths[index];

        return {
            type: 'condition',
            property: 'using_item',
            'on-false': createModelWithGeneration(
                getPath('', 0),
                'item/bow',
                textures[0]
            ),
            'on-true': {
                type: 'range_dispatch',
                property: 'use_duration',
                scale: 0.05,
                entries: [
                    { model: createModelWithGeneration(getPath('_pulling_1', 2), 'item/bow_pulling_1', textures[2]), threshold: 0.65 },
                    { model: createModelWithGeneration(getPath('_pulling_2', 3), 'item/bow_pulling_2', textures[3]), threshold: 0.9 },
                ],
                fallback: createModelWithGeneration(getPath('_pulling_0', 1), 'item/bow_pulling_0', textures[1]),
            },
        };
    }

    convertFromModels(models: string[]): Record<string, unknown> {
        if (models.length !== BOW_REQUIRED_COUNT) {
            throw new SimplifiedModelConfigError(
                'warning.config.item.simplified_model.invalid_model',
                String(BOW_REQUIRED_COUNT),
                String(models.length)
            );
        }

        return {
            type: 'condition',
            property: 'using_item',
            'on-false': { path: models[0] },
            'on-true': {
                type: 'range_dispatch',
                property: 'use_duration',
                scale: 0.05,
                entries: [
                    { model: { path: models[2] }, threshold: 0.65 },
                    { model: { path: models[3] }, threshold: 0.9 },
                ],
                fallback: { path: models[1] },
            },
        };
    }
}

export const BowModelReaderInstance = new BowModelReader();
