import { Rectangle } from './Rectangle';
import { Vector3d } from '../../../vector/Vector3d';
import type { Ray } from '../../camera/Ray';
import { Intersection } from '../../camera/Ray';
import type { ElementRotation, ImageData } from '../../../types/index';
import type { Scene } from '../../Scene';

/**
 * 带纹理的矩形
 * 实现纹理采样和背面剔除
 */
export class TexturedRectangle extends Rectangle {
  constructor(
    scene: Scene,
    origin: Vector3d,
    uVec: Vector3d,
    vVec: Vector3d,
    normal: Vector3d,
    public readonly textureFront: ImageData,
    public readonly textureBack: ImageData,
    ambientOcclusion: boolean,
    rot: ElementRotation | null
  ) {
    super(scene, origin, uVec, vVec, normal, rot, ambientOcclusion);
  }

  /**
   * 追踪光线与纹理矩形的交点
   */
  trace(ray: Ray): Intersection | null {
    const intersection = this.traceToVector(ray);
    if (!intersection) {return null;}

    const rel = intersection.point.sub(this.origin);

    // 计算 UV 坐标
    const uLenSq = this.uVec.lengthSquared();
    const vLenSq = this.vVec.lengthSquared();

    const u = (this.uVec.x * rel.x + this.uVec.y * rel.y + this.uVec.z * rel.z) / uLenSq;
    const v = (this.vVec.x * rel.x + this.vVec.y * rel.y + this.vVec.z * rel.z) / vLenSq;

    // 边界检查（只保留在矩形内的点）
    if (u < 0 || u > 1 || v < 0 || v > 1) {
      return null;
    }

    // 根据法线方向选择正面/背面纹理
    const isFront = this.normal.dot(this.scene.camera.forward) < 0;
    const texture = isFront ? this.textureFront : this.textureBack;
    const invertX = !isFront;

    // UV 到纹理坐标的映射
    const texX = Math.min(
      invertX
        ? Math.floor(texture.width - u * texture.width)
        : Math.floor(u * texture.width),
      texture.width - 1
    );
    const texY = Math.min(
      Math.floor(texture.height - v * texture.height),
      texture.height - 1
    );

    // 从 RGBA Buffer 读取颜色 -> 转换为 ARGB int
    const idx = (texY * texture.width + texX) * 4;
    const r = texture.data[idx];
    const g = texture.data[idx + 1];
    const b = texture.data[idx + 2];
    const a = texture.data[idx + 3];

    // ARGB 格式（与 Java 的 BufferedImage.getRGB 兼容）
    const color = ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;

    return new Intersection(this.multiplier, intersection.t, color);
  }

  toString(): string {
    return `TexturedRectangle(origin=${this.origin}, uVec=${this.uVec}, vVec=${this.vVec})`;
  }
}
