import { Vector3d } from '../../../vector/Vector3d';
import { type IIntersection, type IRay } from '../../camera/Ray';
import type { IElementRotation } from '../../../types/index';
import type { Scene } from '../../Scene';

const BRIGHTNESS_MULTIPLIER = 1.0;
const DARKNESS_MULTIPLIER = 0.3;

/**
 * 矩形基类
 * 处理光线-平面相交和环境光遮蔽
 */
export abstract class Rectangle {
    protected a = 0;
    protected b = 0;
    protected c = 0;
    protected d = 0;
    protected multiplier = 0;
    public ambientOcclusion = false;

    constructor(
        public scene: Scene,
        public origin: Vector3d,
        public uVec: Vector3d,
        public vVec: Vector3d,
        public normal: Vector3d,
        rot: IElementRotation | null,
        _ambientOcclusion: boolean,
    ) {
        // 如果有旋转且角度非零，禁用环境光遮蔽
        this.ambientOcclusion = !(rot !== null && rot.angle !== 0);
        this.applyRotation(rot);
    }

    /**
     * 应用旋转变换
     */
    applyRotation(rot: IElementRotation | null): void {
        if (rot !== null) {
            const { origin: rotOrigin, axis, angle } = rot;

            const uPoint = this.uVec.add(this.origin);
            const vPoint = this.vVec.add(this.origin);
            const normalPoint = this.normal.add(this.origin);

            this.origin = this.origin.rotate(rotOrigin, axis, angle);
            this.uVec = uPoint.rotate(rotOrigin, axis, angle).sub(this.origin);
            this.vVec = vPoint.rotate(rotOrigin, axis, angle).sub(this.origin);
            this.normal = normalPoint.rotate(rotOrigin, axis, angle).sub(this.origin);
        }

        // 计算平面方程系数: ax + by + cz = d
        const n = this.uVec.cross(this.vVec);
        this.a = n.x;
        this.b = n.y;
        this.c = n.z;
        this.d = this.a * this.origin.x + this.b * this.origin.y + this.c * this.origin.z;

        // 计算光照乘数（环境光遮蔽）
        if (this.ambientOcclusion) {
            const dif = Math.acos(this.normal.dot(this.scene.camera.right)) % Math.PI;
            this.multiplier = dif < Math.PI / 2 ? dif / Math.PI + DARKNESS_MULTIPLIER : BRIGHTNESS_MULTIPLIER;
        } else {
            this.multiplier = BRIGHTNESS_MULTIPLIER;
        }
    }

    /**
     * 计算光线与平面的交点
     * @returns 交点坐标和 t 参数，或 null（如果无交点）
     */
    protected traceToVector(ray: IRay): { point: Vector3d; t: number } | null {
        const { origin: start, direction } = ray;

        const denominator = this.a * direction.x + this.b * direction.y + this.c * direction.z;
        if (denominator === 0) {
            return null;
        }

        const t = (this.d - this.a * start.x - this.b * start.y - this.c * start.z) / denominator;

        if (t < 0 || !isFinite(t)) {
            return null;
        }

        return {
            point: new Vector3d(start.x + direction.x * t, start.y + direction.y * t, start.z + direction.z * t),
            t,
        };
    }

    /**
     * 追踪光线与矩形的交点
     */
    abstract trace(ray: IRay): IIntersection | null;

    toString(): string {
        return `Rectangle(origin=${this.origin}, uVec=${this.uVec}, vVec=${this.vVec})`;
    }
}
