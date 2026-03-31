import { Vector3d } from '../vector/Vector3d';
import { Axis, type IElement, type IImageData } from '../types/index';
import type { Scene } from '../scene/Scene';
import type { Cuboid } from '../scene/geometry/Cuboid';

/**
 * Model 类型（联合类型）
 */
export type Model = GeometricalModel | LayeredModel;

/**
 * 几何模型（3D 方块模型）
 */
export class GeometricalModel {
    constructor(
        public readonly elements: IElement[],
        public readonly ambientOcclusion: boolean,
        public readonly rotation: Vector3d,
        public readonly translation: Vector3d,
        public readonly scale: Vector3d,
    ) {}

    /**
     * 转换为场景几何体
     */
    async toSceneGeometry(scene: Scene): Promise<Cuboid[]> {
        // 延迟导入避免循环依赖
        const { Cuboid } = await import('../scene/geometry/Cuboid.js');

        const translation = Vector3d.HALF.negate().mul(this.scale);

        const cuboids: Cuboid[] = [];
        for (const element of this.elements) {
            const cuboid = new Cuboid(
                scene,
                element.from.mul(this.scale).add(translation),
                element.to.sub(element.from).mul(this.scale),
                element.faces,
                element.rotation
                    ? {
                          ...element.rotation,
                          origin: element.rotation.origin.mul(this.scale).add(translation),
                      }
                    : null,
                this.ambientOcclusion,
            );

            // 应用 Z 轴旋转
            cuboid.applyRotation({
                origin: Vector3d.ZERO,
                axis: Axis.Z,
                angle: this.rotation.z,
                rescale: false,
            });

            cuboids.push(cuboid);
        }

        return cuboids;
    }
}

/**
 * 层叠模型（2D 物品模型）
 */
export class LayeredModel {
    constructor(public readonly layers: IImageData[]) {}

    /**
     * 合成所有图层为单个图像
     */
    toImageData(): IImageData {
        if (this.layers.length === 0) {
            return {
                width: 16,
                height: 16,
                data: Buffer.alloc(16 * 16 * 4),
            };
        }

        const width = Math.max(...this.layers.map((l) => l.width), 16);
        const height = Math.max(...this.layers.map((l) => l.height), 16);
        const result = Buffer.alloc(width * height * 4);

        // 逐层合成
        for (const layer of this.layers) {
            for (let y = 0; y < layer.height; y++) {
                for (let x = 0; x < layer.width; x++) {
                    const srcIdx = (y * layer.width + x) * 4;
                    const dstIdx = (y * width + x) * 4;

                    const srcA = layer.data[srcIdx + 3] / 255;
                    const dstA = result[dstIdx + 3] / 255;

                    if (srcA === 0) {
                        continue;
                    }

                    if (dstA === 0) {
                        // 目标透明，直接复制
                        result[dstIdx] = layer.data[srcIdx];
                        result[dstIdx + 1] = layer.data[srcIdx + 1];
                        result[dstIdx + 2] = layer.data[srcIdx + 2];
                        result[dstIdx + 3] = layer.data[srcIdx + 3];
                    } else {
                        // Alpha 混合
                        const outA = srcA + dstA * (1 - srcA);
                        result[dstIdx] = Math.round(
                            (layer.data[srcIdx] * srcA + result[dstIdx] * dstA * (1 - srcA)) / outA,
                        );
                        result[dstIdx + 1] = Math.round(
                            (layer.data[srcIdx + 1] * srcA + result[dstIdx + 1] * dstA * (1 - srcA)) / outA,
                        );
                        result[dstIdx + 2] = Math.round(
                            (layer.data[srcIdx + 2] * srcA + result[dstIdx + 2] * dstA * (1 - srcA)) / outA,
                        );
                        result[dstIdx + 3] = Math.round(outA * 255);
                    }
                }
            }
        }

        return { width, height, data: result };
    }
}
