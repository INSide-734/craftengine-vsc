import { Vector3d } from '../../vector/Vector3d';
import { Direction, Axis, ElementRotation, ImageData } from '../../types/index';
import { DirectionNormals } from '../../model/Direction';
import { Rectangle } from './rectangle/Rectangle';
import { TexturedRectangle } from './rectangle/TexturedRectangle';
import type { Ray } from '../camera/Ray';
import { Intersection } from '../camera/Ray';
import type { Scene } from '../Scene';

// 旋转补偿缩放因子
const RESCALE_22_5 = 1.0 / Math.cos(Math.PI / 8.0);
const RESCALE_45 = 1.0 / Math.cos(Math.PI / 4.0);

/**
 * 立方体几何体
 * 由 6 个纹理矩形组成
 */
export class Cuboid {
  private readonly rectangles: Rectangle[] = [];

  constructor(
    public readonly scene: Scene,
    private origin: Vector3d,
    private size: Vector3d,
    textures: Map<Direction, ImageData>,
    rotation: ElementRotation | null,
    ambientOcclusion: boolean
  ) {
    // 处理 rescale（旋转补偿缩放）
    if (rotation !== null && rotation.rescale) {
      const multiplier = Math.abs(rotation.angle) === 22.5 ? RESCALE_22_5 : RESCALE_45;

      const newSize = (() => {
        switch (rotation.axis) {
          case Axis.X:
            return new Vector3d(this.size.x, this.size.y * multiplier, this.size.z * multiplier);
          case Axis.Y:
            return new Vector3d(this.size.x * multiplier, this.size.y, this.size.z * multiplier);
          case Axis.Z:
            return new Vector3d(this.size.x * multiplier, this.size.y * multiplier, this.size.z);
        }
      })();

      this.origin = this.origin.sub(newSize.sub(this.size).div(2));
      this.size = newSize;
    }

    // 获取纹理（带默认值）
    const getTexture = (dir: Direction): ImageData => {
      return textures.get(dir) ?? { width: 1, height: 1, data: Buffer.from([0, 0, 0, 0]) };
    };

    // 创建矩形面
    if (this.size.x === 0) {
      // X 轴扁平
      this.rectangles.push(new TexturedRectangle(
        scene,
        this.origin,
        new Vector3d(0, 0, this.size.z),
        new Vector3d(0, this.size.y, 0),
        DirectionNormals[Direction.WEST],
        getTexture(Direction.WEST),
        getTexture(Direction.EAST),
        ambientOcclusion,
        rotation
      ));
    } else if (this.size.y === 0) {
      // Y 轴扁平
      this.rectangles.push(new TexturedRectangle(
        scene,
        this.origin.addYZ(this.size.y, this.size.z),
        new Vector3d(this.size.x, 0, 0),
        new Vector3d(0, 0, -this.size.z),
        DirectionNormals[Direction.UP],
        getTexture(Direction.UP),
        getTexture(Direction.DOWN),
        ambientOcclusion,
        rotation
      ));
    } else if (this.size.z === 0) {
      // Z 轴扁平
      this.rectangles.push(new TexturedRectangle(
        scene,
        this.origin.addX(this.size.x),
        new Vector3d(-this.size.x, 0, 0),
        new Vector3d(0, this.size.y, 0),
        DirectionNormals[Direction.NORTH],
        getTexture(Direction.NORTH),
        getTexture(Direction.SOUTH),
        ambientOcclusion,
        rotation
      ));
    } else {
      // 完整的 6 面立方体
      // North (Z-)
      this.rectangles.push(new TexturedRectangle(
        scene,
        this.origin.addX(this.size.x),
        new Vector3d(-this.size.x, 0, 0),
        new Vector3d(0, this.size.y, 0),
        DirectionNormals[Direction.NORTH],
        getTexture(Direction.NORTH),
        getTexture(Direction.NORTH),
        ambientOcclusion,
        rotation
      ));

      // East (X+)
      this.rectangles.push(new TexturedRectangle(
        scene,
        this.origin.addXZ(this.size.x, this.size.z),
        new Vector3d(0, 0, -this.size.z),
        new Vector3d(0, this.size.y, 0),
        DirectionNormals[Direction.EAST],
        getTexture(Direction.EAST),
        getTexture(Direction.EAST),
        ambientOcclusion,
        rotation
      ));

      // South (Z+)
      this.rectangles.push(new TexturedRectangle(
        scene,
        this.origin.addZ(this.size.z),
        new Vector3d(this.size.x, 0, 0),
        new Vector3d(0, this.size.y, 0),
        DirectionNormals[Direction.SOUTH],
        getTexture(Direction.SOUTH),
        getTexture(Direction.SOUTH),
        ambientOcclusion,
        rotation
      ));

      // West (X-)
      this.rectangles.push(new TexturedRectangle(
        scene,
        this.origin,
        new Vector3d(0, 0, this.size.z),
        new Vector3d(0, this.size.y, 0),
        DirectionNormals[Direction.WEST],
        getTexture(Direction.WEST),
        getTexture(Direction.WEST),
        ambientOcclusion,
        rotation
      ));

      // Up (Y+)
      this.rectangles.push(new TexturedRectangle(
        scene,
        this.origin.addYZ(this.size.y, this.size.z),
        new Vector3d(this.size.x, 0, 0),
        new Vector3d(0, 0, -this.size.z),
        DirectionNormals[Direction.UP],
        getTexture(Direction.UP),
        getTexture(Direction.UP),
        ambientOcclusion,
        rotation
      ));

      // Down (Y-)
      this.rectangles.push(new TexturedRectangle(
        scene,
        this.origin,
        new Vector3d(this.size.x, 0, 0),
        new Vector3d(0, 0, this.size.z),
        DirectionNormals[Direction.DOWN],
        getTexture(Direction.DOWN),
        getTexture(Direction.DOWN),
        ambientOcclusion,
        rotation
      ));
    }
  }

  /**
   * 应用旋转到所有矩形面
   */
  applyRotation(rotation: ElementRotation): void {
    for (const rect of this.rectangles) {
      rect.applyRotation(rotation);
    }
  }

  /**
   * 追踪光线与立方体的交点
   * @returns 最近的交点，或 null
   */
  trace(ray: Ray): Intersection | null {
    let nearest: Intersection | null = null;

    for (const rect of this.rectangles) {
      const hit = rect.trace(ray);
      if (hit && (nearest === null || hit.t < nearest.t)) {
        nearest = hit;
      }
    }

    return nearest;
  }

  toString(): string {
    return `Cuboid(origin=${this.origin}, size=${this.size}, rectangles=${this.rectangles.length})`;
  }
}
