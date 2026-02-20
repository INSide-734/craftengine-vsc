/**
 * 可写注册表接口
 *
 * 移植自 craft-engine 的 WritableRegistry
 */

import { type ResourceKey } from './ResourceKey';
import { type Registry } from './Registry';
import { type HolderReference } from './HolderReference';

/**
 * 可写注册表接口
 */
export interface WritableRegistry<T> extends Registry<T> {
    /**
     * 注册持有者引用
     */
    registerForHolder(key: ResourceKey<T>): HolderReference<T>;

    /**
     * 获取或注册持有者引用
     */
    getOrRegisterForHolder(key: ResourceKey<T>): HolderReference<T>;

    /**
     * 注册值
     */
    register(key: ResourceKey<T>, value: T): HolderReference<T>;

    /**
     * 检查是否为空
     */
    isEmpty(): boolean;
}
