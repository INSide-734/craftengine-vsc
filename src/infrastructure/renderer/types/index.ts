import type { Vector3d } from '../vector/Vector3d';

// 导出物品定义类型
export * from './item-definition';

/**
 * 坐标轴枚举
 */
export enum Axis {
  X = 'x',
  Y = 'y',
  Z = 'z'
}

/**
 * 方向枚举
 */
export enum Direction {
  NORTH = 'north',
  EAST = 'east',
  SOUTH = 'south',
  WEST = 'west',
  UP = 'up',
  DOWN = 'down'
}

/**
 * 元素旋转信息
 */
export interface ElementRotation {
  origin: Vector3d;
  axis: Axis;
  angle: number;
  rescale: boolean;
}

/**
 * 图像数据 (替代 Java 的 BufferedImage)
 */
export interface ImageData {
  width: number;
  height: number;
  data: Buffer; // RGBA 格式
}

/**
 * 模型元素
 */
export interface Element {
  from: Vector3d;
  to: Vector3d;
  rotation: ElementRotation | null;
  faces: Map<Direction, ImageData>;
}

/**
 * 光线
 */
export interface Ray {
  origin: Vector3d;
  direction: Vector3d;
}

/**
 * 光线与物体的交点
 */
export interface Intersection {
  multiplier: number; // 环境光遮蔽系数
  t: number;          // 光线参数（距离）
  color: number;      // ARGB 格式颜色
}

/**
 * 渲染器选项
 */
export interface RenderOptions {
  renderWidth?: number;
  renderHeight?: number;
  exportWidth?: number;
  exportHeight?: number;
  resourcePacks?: string[];
  useInternalResources?: boolean;
  cameraDistance?: number;
  fov?: number;
  cropVertical?: number;
  cropHorizontal?: number;
}

/**
 * JSON 模型文件结构
 */
export interface ModelJson {
  parent?: string;
  textures?: Record<string, string>;
  elements?: ElementJson[];
  ambientocclusion?: boolean;
  display?: {
    gui?: {
      rotation?: [number, number, number];
      translation?: [number, number, number];
      scale?: [number, number, number];
    };
  };
}

export interface ElementJson {
  from: [number, number, number];
  to: [number, number, number];
  rotation?: {
    origin: [number, number, number];
    axis: string;
    angle: number;
    rescale?: boolean;
  };
  faces?: Record<string, FaceJson>;
}

export interface FaceJson {
  texture: string;
  uv?: [number, number, number, number];
  rotation?: number;
  tintindex?: number;
}
