/**
 * 基准测试共享配置
 *
 * 提供统一的基准测试选项，确保所有测试有足够的迭代次数
 * 来生成有效的性能数据。
 */
import { type BenchOptions } from 'vitest';

/**
 * 默认基准测试选项
 * 用于快速操作（< 10ms）
 */
export const defaultBenchOptions: BenchOptions = {
    iterations: 100,
    warmupIterations: 10,
};

/**
 * 快速测试选项
 * 用于中等耗时操作（10-100ms）
 */
export const fastBenchOptions: BenchOptions = {
    iterations: 50,
    warmupIterations: 5,
};

/**
 * 慢速测试选项
 * 用于耗时操作（> 100ms）
 */
export const slowBenchOptions: BenchOptions = {
    iterations: 20,
    warmupIterations: 3,
};

/**
 * 超慢速测试选项
 * 用于非常耗时的操作（> 500ms）
 */
export const verySlowBenchOptions: BenchOptions = {
    iterations: 10,
    warmupIterations: 2,
};
