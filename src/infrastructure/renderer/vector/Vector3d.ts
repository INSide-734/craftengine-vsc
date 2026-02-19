import { Axis } from '../types/index';

/**
 * 3D 向量类
 * 不可变设计 - 所有操作返回新实例
 */
export class Vector3d {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number
  ) {}

  // 静态常量
  static readonly ZERO = new Vector3d(0, 0, 0);
  static readonly ONE = new Vector3d(1, 1, 1);
  static readonly HALF = new Vector3d(0.5, 0.5, 0.5);

  /**
   * 创建所有分量相同的向量
   */
  static all(value: number): Vector3d {
    return new Vector3d(value, value, value);
  }

  // ==================== 加法 ====================

  add(other: Vector3d): Vector3d {
    return new Vector3d(this.x + other.x, this.y + other.y, this.z + other.z);
  }

  addScalar(value: number): Vector3d {
    return new Vector3d(this.x + value, this.y + value, this.z + value);
  }

  addX(dx: number): Vector3d {
    return new Vector3d(this.x + dx, this.y, this.z);
  }

  addY(dy: number): Vector3d {
    return new Vector3d(this.x, this.y + dy, this.z);
  }

  addZ(dz: number): Vector3d {
    return new Vector3d(this.x, this.y, this.z + dz);
  }

  addXZ(dx: number, dz: number): Vector3d {
    return new Vector3d(this.x + dx, this.y, this.z + dz);
  }

  addYZ(dy: number, dz: number): Vector3d {
    return new Vector3d(this.x, this.y + dy, this.z + dz);
  }

  addXY(dx: number, dy: number): Vector3d {
    return new Vector3d(this.x + dx, this.y + dy, this.z);
  }

  // ==================== 减法 ====================

  sub(other: Vector3d): Vector3d {
    return new Vector3d(this.x - other.x, this.y - other.y, this.z - other.z);
  }

  // ==================== 乘法 ====================

  mul(other: Vector3d): Vector3d;
  mul(scalar: number): Vector3d;
  mul(arg: Vector3d | number): Vector3d {
    if (typeof arg === 'number') {
      return new Vector3d(this.x * arg, this.y * arg, this.z * arg);
    }
    return new Vector3d(this.x * arg.x, this.y * arg.y, this.z * arg.z);
  }

  // ==================== 除法 ====================

  div(other: Vector3d): Vector3d;
  div(scalar: number): Vector3d;
  div(arg: Vector3d | number): Vector3d {
    if (typeof arg === 'number') {
      return new Vector3d(this.x / arg, this.y / arg, this.z / arg);
    }
    return new Vector3d(this.x / arg.x, this.y / arg.y, this.z / arg.z);
  }

  // ==================== 一元运算 ====================

  negate(): Vector3d {
    return new Vector3d(-this.x, -this.y, -this.z);
  }

  // ==================== 向量运算 ====================

  /**
   * 计算向量长度
   */
  length(): number {
    return Math.sqrt(this.lengthSquared());
  }

  /**
   * 计算向量长度的平方
   */
  lengthSquared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  /**
   * 返回归一化向量
   */
  normalize(): Vector3d {
    return this.div(this.length());
  }

  /**
   * 计算点积
   */
  dot(other: Vector3d): number {
    return this.x * other.x + this.y * other.y + this.z * other.z;
  }

  /**
   * 计算叉积
   */
  cross(other: Vector3d): Vector3d {
    return new Vector3d(
      this.y * other.z - this.z * other.y,
      this.z * other.x - this.x * other.z,
      this.x * other.y - this.y * other.x
    );
  }

  /**
   * 计算到另一个点的距离
   */
  distance(other: Vector3d): number {
    return this.sub(other).length();
  }

  /**
   * 计算到另一个点的距离的平方
   */
  distanceSquared(other: Vector3d): number {
    return this.sub(other).lengthSquared();
  }

  // ==================== 旋转 ====================

  /**
   * 绕指定轴旋转
   * @param origin 旋转中心点
   * @param axis 旋转轴
   * @param degrees 旋转角度（度数）
   */
  rotate(origin: Vector3d, axis: Axis, degrees: number): Vector3d {
    const radians = degrees * Math.PI / 180;

    const x = this.x - origin.x;
    const y = this.y - origin.y;
    const z = this.z - origin.z;

    switch (axis) {
      case Axis.X: {
        const angle = Math.atan2(z, y) + radians;
        const h = Math.sqrt(y * y + z * z);
        return new Vector3d(
          x + origin.x,
          h * Math.cos(angle) + origin.y,
          h * Math.sin(angle) + origin.z
        );
      }

      case Axis.Y: {
        const angle = Math.atan2(x, z) + radians;
        const h = Math.sqrt(x * x + z * z);
        return new Vector3d(
          h * Math.sin(angle) + origin.x,
          y + origin.y,
          h * Math.cos(angle) + origin.z
        );
      }

      case Axis.Z: {
        const angle = Math.atan2(y, x) + radians;
        const h = Math.sqrt(x * x + y * y);
        return new Vector3d(
          h * Math.cos(angle) + origin.x,
          h * Math.sin(angle) + origin.y,
          z + origin.z
        );
      }
    }
  }

  // ==================== 转换 ====================

  /**
   * 转换为数组
   */
  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  toString(): string {
    return `(${this.x}, ${this.y}, ${this.z})`;
  }

  /**
   * 判断两个向量是否相等
   */
  equals(other: Vector3d): boolean {
    return this.x === other.x && this.y === other.y && this.z === other.z;
  }
}

// 类型别名
export type Point3d = Vector3d;
