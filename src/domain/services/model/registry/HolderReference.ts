/**
 * 持有者引用实现
 *
 * 移植自 craft-engine 的 Holder.Reference
 */

import { type Key } from '../utils/Key';
import { type ResourceKey } from './ResourceKey';
import { type IHolder, HolderKind, type IHolderOwner } from './Holder';

/**
 * 持有者引用
 */
export class HolderReference<T> implements IHolder<T> {
    private readonly owner: IHolderOwner<T>;
    private _key: ResourceKey<T> | undefined;
    private _value: T | undefined;

    constructor(owner: IHolderOwner<T>, key?: ResourceKey<T>, value?: T) {
        this.owner = owner;
        this._key = key;
        this._value = value;
    }

    /**
     * 创建持有者引用
     */
    static create<T>(owner: IHolderOwner<T>, registryKey: ResourceKey<T>): HolderReference<T> {
        return new HolderReference<T>(owner, registryKey, undefined);
    }

    /**
     * 创建常量持有者引用
     */
    static createConstant<T>(owner: IHolderOwner<T>, registryKey: ResourceKey<T>, value: T): HolderReference<T> {
        return new ConstantHolderReference<T>(owner, registryKey, value);
    }

    /**
     * 获取资源键
     */
    key(): ResourceKey<T> {
        if (this._key === undefined) {
            throw new Error(`Trying to access unbound value '${this._value}' from registry`);
        }
        return this._key;
    }

    value(): T {
        if (this._value === undefined) {
            throw new Error(`Trying to access unbound value '${this._key}' from registry`);
        }
        return this._value;
    }

    matchesKey(id: Key): boolean {
        return this.key().getLocation().equals(id);
    }

    matchesResourceKey(key: ResourceKey<T>): boolean {
        return this.key().equals(key);
    }

    serializableIn(owner: IHolderOwner<T>): boolean {
        return this.owner.canSerializeIn(owner);
    }

    keyOptional(): ResourceKey<T> | undefined {
        return this._key;
    }

    kind(): HolderKind {
        return HolderKind.REFERENCE;
    }

    isBound(): boolean {
        return this._key !== undefined && this._value !== undefined;
    }

    /**
     * 绑定资源键
     */
    bindKey(registryKey: ResourceKey<T>): void {
        if (this._key !== undefined && !registryKey.equals(this._key)) {
            throw new Error(`Can't change holder key: existing=${this._key}, new=${registryKey}`);
        }
        this._key = registryKey;
    }

    /**
     * 绑定值
     */
    bindValue(value: T): void {
        this._value = value;
    }

    registeredName(): string {
        const key = this.keyOptional();
        return key ? key.getLocation().asString() : '[unregistered]';
    }

    toString(): string {
        return `Reference{${this._key}=${this._value}}`;
    }
}

/**
 * 常量持有者引用
 */
class ConstantHolderReference<T> extends HolderReference<T> {
    constructor(owner: IHolderOwner<T>, key: ResourceKey<T>, value: T) {
        super(owner, key, value);
    }

    override bindValue(_value: T): void {
        throw new Error('Cannot bind value to constant holder');
    }
}
