import { type Vector3d } from '../../vector/Vector3d';
import type { Ray } from './Ray';

/**
 * 相机类
 * 生成每个像素的光线，实现透视投影
 */
export class Camera {
    readonly forward: Vector3d;
    readonly up: Vector3d;
    readonly right: Vector3d;
    readonly w: number;
    readonly h: number;

    private readonly rayCache: Ray[][];

    constructor(
        public readonly origin: Vector3d,
        fov: number,
        target: Vector3d,
        upHint: Vector3d,
        width: number,
        height: number,
    ) {
        // 计算相机坐标系
        this.forward = target.sub(this.origin).normalize();
        this.right = this.forward.cross(upHint).normalize();
        this.up = this.right.cross(this.forward);

        // 计算视口大小
        this.h = Math.atan((fov * Math.PI) / 180);
        this.w = (width / height) * this.h;

        // 预计算所有光线
        this.rayCache = this.createRayCache(width, height);
    }

    /**
     * 创建光线缓存
     */
    private createRayCache(width: number, height: number): Ray[][] {
        const cache: Ray[][] = [];
        for (let x = 0; x < width; x++) {
            cache[x] = [];
            for (let y = 0; y < height; y++) {
                cache[x][y] = this.makeRay(x, y, width, height);
            }
        }
        return cache;
    }

    /**
     * 获取指定像素的光线
     */
    getRay(pixelX: number, pixelY: number): Ray {
        return this.rayCache[pixelX][pixelY];
    }

    /**
     * 创建从相机原点到指定像素的光线
     */
    private makeRay(pixelX: number, pixelY: number, imageWidth: number, imageHeight: number): Ray {
        // 归一化像素坐标到 [-1, 1]
        const x = (2.0 * pixelX) / imageWidth - 1.0;
        const y = (2.0 * (imageHeight - pixelY)) / imageHeight - 1.0;

        // 计算光线方向
        const direction = this.forward
            .add(this.right.mul(this.w * x))
            .add(this.up.mul(this.h * y))
            .normalize();

        return { origin: this.origin, direction };
    }

    toString(): string {
        return `Camera(origin=${this.origin}, forward=${this.forward}, up=${this.up}, right=${this.right}, w=${this.w}, h=${this.h})`;
    }
}
