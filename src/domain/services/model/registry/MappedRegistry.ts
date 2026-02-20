/**
 * 映射注册表实现
 *
 * 移植自 craft-engine 的 AbstractMappedRegistry
 */

import { Key } from '../utils/Key';
import { type ResourceKey } from './ResourceKey';
import { type Registry } from './Registry';
import { type WritableRegistry } from './WritableRegistry';
import { type HolderOwner } from './Holder';
import { type HolderReference } from './HolderReference';

/**
 * 抽象映射注册表
 */
export abstract class AbstractMappedRegistry<T> implements WritableRegistry<T> {
    protected readonly _key: ResourceKey<Registry<T>>;
    protected readonly byResourceLocation: Map<string, HolderReference<T>>;
    protected readonly byResourceKey: Map<string, HolderReference<T>>;
    protected readonly byId: HolderReference<T>[];
    protected readonly valueToId: Map<T, number>;
    protected readonly valueToKey: Map<T, Key>;

    constructor(key: ResourceKey<Registry<T>>) {
        this._key = key;
        this.byResourceLocation = new Map();
        this.byResourceKey = new Map();
        this.byId = [];
        this.valueToId = new Map();
        this.valueToKey = new Map();
    }

    key(): ResourceKey<Registry<T>> {
        return this._key;
    }

    getValueByResourceKey(key: ResourceKey<T>): T | undefined {
        const ref = this.byResourceKey.get(key.hashCode());
        return ref?.isBound() ? ref.value() : undefined;
    }

    getValue(id: Key): T | undefined {
        const ref = this.byResourceLocation.get(id.asString());
        return ref?.isBound() ? ref.value() : undefined;
    }

    getValueById(id: number): T | undefined {
        if (id < 0 || id >= this.byId.length) {
            return undefined;
        }
        const ref = this.byId[id];
        return ref?.isBound() ? ref.value() : undefined;
    }

    getId(value: T): number {
        return this.valueToId.get(value) ?? -1;
    }

    getKey(value: T): Key | undefined {
        return this.valueToKey.get(value);
    }

    get(id: Key): HolderReference<T> | undefined {
        return this.byResourceLocation.get(id.asString());
    }

    getByResourceKey(key: ResourceKey<T>): HolderReference<T> | undefined {
        return this.byResourceKey.get(key.hashCode());
    }

    keySet(): Set<Key> {
        const keys = new Set<Key>();
        for (const keyStr of this.byResourceLocation.keys()) {
            keys.add(Key.of(keyStr));
        }
        return keys;
    }

    registryKeySet(): Set<ResourceKey<T>> {
        const keys = new Set<ResourceKey<T>>();
        for (const ref of this.byResourceKey.values()) {
            const key = ref.keyOptional();
            if (key) {
                keys.add(key);
            }
        }
        return keys;
    }

    entrySet(): Map<ResourceKey<T>, T> {
        const entries = new Map<ResourceKey<T>, T>();
        for (const ref of this.byResourceKey.values()) {
            const key = ref.keyOptional();
            if (key && ref.isBound()) {
                entries.set(key, ref.value());
            }
        }
        return entries;
    }

    containsKey(id: Key): boolean {
        return this.byResourceLocation.has(id.asString());
    }

    containsResourceKey(key: ResourceKey<T>): boolean {
        return this.byResourceKey.has(key.hashCode());
    }

    isEmpty(): boolean {
        return this.byResourceKey.size === 0;
    }

    canSerializeIn(other: HolderOwner<T>): boolean {
        return other === this;
    }

    abstract registerForHolder(key: ResourceKey<T>): HolderReference<T>;

    getOrRegisterForHolder(key: ResourceKey<T>): HolderReference<T> {
        const existing = this.getByResourceKey(key);
        if (existing) {
            return existing;
        }
        return this.registerForHolder(key);
    }

    abstract register(key: ResourceKey<T>, value: T): HolderReference<T>;
}
