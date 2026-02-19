/**
 * 生成模型读取器
 *
 * 移植自 craft-engine 的 GeneratedModelReader
 */

import { Key } from '../utils/Key';
import { SimplifiedModelReader } from './SimplifiedModelReader';

/**
 * 简化模型配置错误
 */
export class SimplifiedModelConfigError extends Error {
    constructor(
        public readonly errorKey: string,
        public readonly expected: string,
        public readonly actual: string
    ) {
        super(`Invalid simplified model config: expected ${expected}, got ${actual}`);
        this.name = 'SimplifiedModelConfigError';
    }
}

/**
 * 生成模型读取器
 * 用于处理 generated 和 handheld 类型的简化模型
 */
export class GeneratedModelReader implements SimplifiedModelReader {
    private readonly model: string;

    constructor(model: string) {
        this.model = model;
    }

    convertFromTextures(
        textures: string[],
        optionalModelPaths: string[],
        id: Key
    ): Record<string, unknown> {
        if (optionalModelPaths.length >= 2) {
            throw new SimplifiedModelConfigError(
                'warning.config.item.simplified_model.invalid_model',
                '1',
                String(optionalModelPaths.length)
            );
        }

        const autoModelPath = optionalModelPaths.length !== 1;
        let texturesProperty: Record<string, string>;

        switch (textures.length) {
            case 1:
                texturesProperty = { layer0: textures[0] };
                break;
            case 2:
                texturesProperty = {
                    layer0: textures[0],
                    layer1: textures[1],
                };
                break;
            default:
                texturesProperty = {};
                for (let i = 0; i < textures.length; i++) {
                    texturesProperty[`layer${i}`] = textures[i];
                }
        }

        return {
            type: 'model',
            path: autoModelPath
                ? `${id.namespace}:item/${id.value}`
                : optionalModelPaths[0],
            generation: {
                parent: `item/${this.model}`,
                textures: texturesProperty,
            },
        };
    }

    convertFromModels(optionalModelPaths: string[]): Record<string, unknown> | null {
        if (optionalModelPaths.length >= 2) {
            return {
                type: 'composite',
                models: optionalModelPaths,
            };
        } else {
            return { path: optionalModelPaths[0] };
        }
    }
}

/**
 * 预定义的生成模型读取器实例
 */
export const GeneratedModelReaderInstances = {
    GENERATED: new GeneratedModelReader('generated'),
    HANDHELD: new GeneratedModelReader('handheld'),
} as const;
