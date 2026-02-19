/**
 * 弩模型读取器
 *
 * 移植自 craft-engine 的 CrossbowModelReader
 */

import { Key } from '../utils/Key';
import { SimplifiedModelReader } from './SimplifiedModelReader';
import { SimplifiedModelConfigError } from './GeneratedModelReader';

/** 弩模型所需的纹理/模型数量 */
const CROSSBOW_REQUIRED_COUNT = 6;

/**
 * 创建带纹理生成的模型配置
 */
function createModelWithGeneration(
    path: string,
    parent: string,
    texture: string
): Record<string, unknown> {
    return {
        type: 'model',
        path,
        generation: {
            parent,
            textures: { layer0: texture },
        },
    };
}
export class CrossbowModelReader implements SimplifiedModelReader {
    convertFromTextures(
        textures: string[],
        optionalModelPaths: string[],
        id: Key
    ): Record<string, unknown> {
        if (textures.length !== CROSSBOW_REQUIRED_COUNT) {
            throw new SimplifiedModelConfigError(
                'warning.config.item.simplified_model.invalid_texture',
                String(CROSSBOW_REQUIRED_COUNT),
                String(textures.length)
            );
        }

        const autoModel = optionalModelPaths.length === 0;
        if (!autoModel && optionalModelPaths.length !== CROSSBOW_REQUIRED_COUNT) {
            throw new SimplifiedModelConfigError(
                'warning.config.item.simplified_model.invalid_model',
                String(CROSSBOW_REQUIRED_COUNT),
                String(optionalModelPaths.length)
            );
        }

        const { namespace, value } = id;
        const getPath = (suffix: string, index: number) =>
            autoModel ? `${namespace}:item/${value}${suffix}` : optionalModelPaths[index];

        return {
            type: 'condition',
            property: 'using_item',
            'on-false': {
                type: 'select',
                property: 'charge_type',
                cases: [
                    { when: 'arrow', model: createModelWithGeneration(getPath('_arrow', 4), 'item/crossbow_arrow', textures[4]) },
                    { when: 'rocket', model: createModelWithGeneration(getPath('_firework', 5), 'item/crossbow_firework', textures[5]) },
                ],
                fallback: createModelWithGeneration(getPath('', 0), 'item/crossbow', textures[0]),
            },
            'on-true': {
                type: 'range_dispatch',
                property: 'crossbow/pull',
                entries: [
                    { model: createModelWithGeneration(getPath('_pulling_1', 2), 'item/crossbow_pulling_1', textures[2]), threshold: 0.58 },
                    { model: createModelWithGeneration(getPath('_pulling_2', 3), 'item/crossbow_pulling_2', textures[3]), threshold: 1.0 },
                ],
                fallback: createModelWithGeneration(getPath('_pulling_0', 1), 'item/crossbow_pulling_0', textures[1]),
            },
        };
    }

    convertFromModels(models: string[]): Record<string, unknown> {
        if (models.length !== CROSSBOW_REQUIRED_COUNT) {
            throw new SimplifiedModelConfigError(
                'warning.config.item.simplified_model.invalid_model',
                String(CROSSBOW_REQUIRED_COUNT),
                String(models.length)
            );
        }

        return {
            type: 'condition',
            property: 'using_item',
            'on-false': {
                type: 'select',
                property: 'charge_type',
                cases: [
                    { when: 'arrow', model: { type: 'model', path: models[4] } },
                    { when: 'rocket', model: { type: 'model', path: models[5] } },
                ],
                fallback: { type: 'model', path: models[0] },
            },
            'on-true': {
                type: 'range_dispatch',
                property: 'crossbow/pull',
                entries: [
                    { model: { type: 'model', path: models[2] }, threshold: 0.58 },
                    { model: { type: 'model', path: models[3] }, threshold: 1.0 },
                ],
                fallback: { type: 'model', path: models[1] },
            },
        };
    }
}

export const CrossbowModelReaderInstance = new CrossbowModelReader();
