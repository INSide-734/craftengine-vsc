import type { Vector3d } from '../../vector/Vector3d';

/**
 * 光线
 */
export interface IRay {
    origin: Vector3d;
    direction: Vector3d;
}

/**
 * 光线与物体的交点
 */
export interface IIntersection {
    multiplier: number; // 环境光遮蔽系数
    t: number; // 光线参数（距离）
    color: number; // ARGB 格式颜色
}

/**
 * 光线与物体的交点实现类
 */
export class Intersection implements IIntersection {
    constructor(
        public readonly multiplier: number, // 环境光遮蔽系数
        public readonly t: number, // 光线参数（距离）
        public readonly color: number, // ARGB 格式颜色
    ) {}

    /**
     * 按距离比较（用于排序）
     */
    compareTo(other: Intersection): number {
        return this.t - other.t;
    }
}
