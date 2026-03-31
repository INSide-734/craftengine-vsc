import type { Vector3d } from '../vector/Vector3d';

// 导出物品定义类型
export * from './item-definition';

/**
 * 坐标轴枚举
 */
export enum Axis {
    X = 'x',
    Y = 'y',
    Z = 'z',
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
    DOWN = 'down',
}

/**
 * 元素旋转信息
 */
export interface IElementRotation {
    origin: Vector3d;
    axis: Axis;
    angle: number;
    rescale: boolean;
}

/**
 * 图像数据 (替代 Java 的 BufferedImage)
 */
export interface IImageData {
    width: number;
    height: number;
    data: Buffer; // RGBA 格式
}

/**
 * 模型元素
 */
export interface IElement {
    from: Vector3d;
    to: Vector3d;
    rotation: IElementRotation | null;
    faces: Map<Direction, IImageData>;
}

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
 * 渲染器选项
 */
export interface IRenderOptions {
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
export interface IModelJson {
    parent?: string;
    textures?: Record<string, string>;
    elements?: IElementJson[];
    ambientocclusion?: boolean;
    display?: {
        gui?: {
            rotation?: [number, number, number];
            translation?: [number, number, number];
            scale?: [number, number, number];
        };
    };
}

export interface IElementJson {
    from: [number, number, number];
    to: [number, number, number];
    rotation?: {
        origin: [number, number, number];
        axis: string;
        angle: number;
        rescale?: boolean;
    };
    faces?: Record<string, IFaceJson>;
}

export interface IFaceJson {
    texture: string;
    uv?: [number, number, number, number];
    rotation?: number;
    tintindex?: number;
}
