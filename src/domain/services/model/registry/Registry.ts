/**
 * 注册表接口
 *
 * 移植自 craft-engine 的 Registry
 */

import { type Key } from '../utils/Key';
import { type ResourceKey } from './ResourceKey';
import { type IHolderOwner } from './Holder';
import { type HolderReference } from './HolderReference';

/**
 * 注册表接口
 */
export interface IRegistry<T> extends IHolderOwner<T> {
    /**
     * 获取注册表键
     */
    key(): ResourceKey<IRegistry<T>>;

    /**
     * 通过资源键获取值
     */
    getValueByResourceKey(key: ResourceKey<T>): T | undefined;

    /**
     * 通过Key获取值
     */
    getValue(id: Key): T | undefined;

    /**
     * 通过ID获取值
     */
    getValueById(id: number): T | undefined;

    /**
     * 获取值的ID
     */
    getId(value: T): number;

    /**
     * 获取值的Key
     */
    getKey(value: T): Key | undefined;

    /**
     * 获取所有键
     */
    keySet(): Set<Key>;

    /**
     * 获取所有条目
     */
    entrySet(): Map<ResourceKey<T>, T>;

    /**
     * 获取所有资源键
     */
    registryKeySet(): Set<ResourceKey<T>>;

    /**
     * 检查是否包含指定Key
     */
    containsKey(id: Key): boolean;

    /**
     * 检查是否包含指定资源键
     */
    containsResourceKey(key: ResourceKey<T>): boolean;

    /**
     * 通过Key获取持有者引用
     */
    get(id: Key): HolderReference<T> | undefined;

    /**
     * 通过资源键获取持有者引用
     */
    getByResourceKey(key: ResourceKey<T>): HolderReference<T> | undefined;
}
