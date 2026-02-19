/**
 * 持有者接口
 *
 * 移植自 craft-engine 的 Holder
 */

import { Key } from '../utils/Key';
import { ResourceKey } from './ResourceKey';

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
export interface HolderOwner<T> {
    canSerializeIn(other: HolderOwner<T>): boolean;
}

/**
 * 持有者接口
 */
export interface Holder<T> {
    value(): T;
    isBound(): boolean;
    matchesKey(id: Key): boolean;
    matchesResourceKey(key: ResourceKey<T>): boolean;
    keyOptional(): ResourceKey<T> | undefined;
    kind(): HolderKind;
    serializableIn(owner: HolderOwner<T>): boolean;
    registeredName(): string;
}
