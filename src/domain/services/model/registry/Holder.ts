/**
 * 持有者接口
 *
 * 移植自 craft-engine 的 Holder
 */

import { type Key } from '../utils/Key';
import { type ResourceKey } from './ResourceKey';

/**
 * 持有者类型
 */
export enum HolderKind {
    REFERENCE = 'REFERENCE',
    DIRECT = 'DIRECT',
}

/**
 * 持有者所有者接口
 */
export interface IHolderOwner<T> {
    canSerializeIn(other: IHolderOwner<T>): boolean;
}

/**
 * 持有者接口
 */
export interface IHolder<T> {
    value(): T;
    isBound(): boolean;
    matchesKey(id: Key): boolean;
    matchesResourceKey(key: ResourceKey<T>): boolean;
    keyOptional(): ResourceKey<T> | undefined;
    kind(): HolderKind;
    serializableIn(owner: IHolderOwner<T>): boolean;
    registeredName(): string;
}
