/**
 * 抽象模型生成器
 *
 * 移植自 craft-engine 的 AbstractModelGenerator，包含验证逻辑
 */

import { type ModelGeneration } from './ModelGeneration';
import { type IModelGenerator } from './ModelGenerator';
import { isValidResourceLocation } from '../utils/ResourceLocation';

/**
 * 模型生成错误
 */
export class ModelGenerationError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'ModelGenerationError';
    }
}

/**
 * 抽象模型生成器
 */
export abstract class AbstractModelGenerator implements IModelGenerator {
    protected readonly _modelsToGenerate: Map<string, ModelGeneration> = new Map();

    modelsToGenerate(): ModelGeneration[] {
        return Array.from(this._modelsToGenerate.values());
    }

    clearModelsToGenerate(): void {
        this._modelsToGenerate.clear();
    }

    /**
     * 准备模型生成（包含验证）
     */
    prepareModelGeneration(model: ModelGeneration): void {
        const pathKey = model.path.asString();

        // 1. 冲突检测
        const conflict = this._modelsToGenerate.get(pathKey);
        if (conflict) {
            if (conflict.equals(model)) {
                return;
            }
            throw new ModelGenerationError(`Model generation conflict at path: ${pathKey}`, 'MODEL_CONFLICT', {
                path: pathKey,
            });
        }

        // 2. 验证父模型路径
        if (!isValidResourceLocation(model.parentModelPath)) {
            throw new ModelGenerationError(
                `Invalid parent model path: ${model.parentModelPath}`,
                'INVALID_PARENT_PATH',
                { parentPath: model.parentModelPath },
            );
        }

        // 3. 验证纹理路径
        if (model.texturesOverride) {
            for (const [key, value] of Object.entries(model.texturesOverride)) {
                // 跳过以 # 开头的引用
                if (value.charAt(0) !== '#') {
                    if (!isValidResourceLocation(value)) {
                        throw new ModelGenerationError(
                            `Invalid texture path for '${key}': ${value}`,
                            'INVALID_TEXTURE_PATH',
                            { textureKey: key, texturePath: value },
                        );
                    }
                }
            }
        }

        // 4. 加入生成队列
        this._modelsToGenerate.set(pathKey, model);
    }
}
