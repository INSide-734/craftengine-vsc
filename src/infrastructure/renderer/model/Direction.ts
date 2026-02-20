import { Axis, Direction } from '../types/index';
import { Vector3d } from '../vector/Vector3d';

/**
 * 每个方向的法向量
 */
export const DirectionNormals: Record<Direction, Vector3d> = {
    [Direction.NORTH]: new Vector3d(0, 0, -1),
    [Direction.EAST]: new Vector3d(1, 0, 0),
    [Direction.SOUTH]: new Vector3d(0, 0, 1),
    [Direction.WEST]: new Vector3d(-1, 0, 0),
    [Direction.UP]: new Vector3d(0, 1, 0),
    [Direction.DOWN]: new Vector3d(0, -1, 0),
};

/**
 * 每个方向对应的轴
 */
export const DirectionAxis: Record<Direction, Axis> = {
    [Direction.NORTH]: Axis.Z,
    [Direction.EAST]: Axis.X,
    [Direction.SOUTH]: Axis.Z,
    [Direction.WEST]: Axis.X,
    [Direction.UP]: Axis.Y,
    [Direction.DOWN]: Axis.Y,
};

/**
 * 所有方向列表
 */
export const ALL_DIRECTIONS: Direction[] = [
    Direction.NORTH,
    Direction.EAST,
    Direction.SOUTH,
    Direction.WEST,
    Direction.UP,
    Direction.DOWN,
];
