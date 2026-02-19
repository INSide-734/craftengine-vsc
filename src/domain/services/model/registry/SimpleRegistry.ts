/**
 * 简单注册表实现
 *
 * 移植自 craft-engine 的 ConstantBoundRegistry
 */

import { ResourceKey } from './ResourceKey';
import { Registry } from './Registry';
import { AbstractMappedRegistry } from './MappedRegistry';
import { HolderReference } from './HolderReference';

/**
 * 简单注册表
 * 用于存储常量绑定的注册表项
 */
export class SimpleRegistry<T> extends AbstractMappedRegistry<T> {
    constructor(key: ResourceKey<Registry<T>>) {
        super(key);
    }

    registerForHolder(key: ResourceKey<T>): HolderReference<T> {
        const ref = HolderReference.create<T>(this, key);
        this.byResourceKey.set(key.hashCode(), ref);
        this.byResourceLocation.set(key.getLocation().asString(), ref);
        return ref;
    }

    register(key: ResourceKey<T>, value: T): HolderReference<T> {
        const id = this.byId.length;
        const ref = HolderReference.createConstant<T>(this, key, value);

        this.byResourceKey.set(key.hashCode(), ref);
        this.byResourceLocation.set(key.getLocation().asString(), ref);
        this.byId.push(ref);
        this.valueToId.set(value, id);
        this.valueToKey.set(value, key.getLocation());

        return ref;
    }
}
