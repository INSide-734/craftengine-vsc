/**
 * 资源键类型
 *
 * 移植自 craft-engine 的 ResourceKey
 */

import { Key } from '../utils/Key';

/**
 * 资源键
 * 用于唯一标识注册表中的资源
 * 泛型参数 T 用于类型安全，标记资源类型
 */
export class ResourceKey<_T> {
    private readonly registryName: Key;
    private readonly location: Key;

    private constructor(registryName: Key, location: Key) {
        this.registryName = registryName;
        this.location = location;
    }

    /**
     * 创建资源键
     * @param registryName 注册表名称
     * @param location 资源位置
     */
    static create<T>(registryName: Key, location: Key): ResourceKey<T> {
        return new ResourceKey<T>(registryName, location);
    }

    /**
     * 创建注册表键
     * @param location 注册表位置
     */
    static createRegistryKey<T>(location: Key): ResourceKey<Registry<T>> {
        return ResourceKey.create<Registry<T>>(Key.of('minecraft:root'), location);
    }

    /**
     * 获取注册表名称
     */
    registry(): Key {
        return this.registryName;
    }

    /**
     * 获取资源位置
     */
    getLocation(): Key {
        return this.location;
    }

    /**
     * 转换为字符串
     */
    toString(): string {
        return `ResourceKey[${this.registryName.asString()} / ${this.location.asString()}]`;
    }

    /**
     * 比较两个资源键是否相等
     */
    equals(other: ResourceKey<unknown>): boolean {
        return this.registryName.equals(other.registryName) && this.location.equals(other.location);
    }

    /**
     * 获取哈希码
     */
    hashCode(): string {
        return `${this.registryName.asString()}:${this.location.asString()}`;
    }
}

// 前向声明，避免循环依赖

interface Registry<_T> {}
