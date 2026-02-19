/**
 * 资源键类型
 *
 * 移植自 craft-engine 的 Key 类，表示带命名空间的资源标识符。
 */

import { IResourceKey } from '../../../../core/interfaces/IModelGenerator';

export const DEFAULT_NAMESPACE = 'craftengine';

/**
 * 分解命名空间ID
 */
function decompose(id: string, defaultNamespace: string): [string, string] {
    const i = id.indexOf(':');
    if (i >= 0) {
        const namespace = i >= 1 ? id.substring(0, i) : defaultNamespace;
        return [namespace, id.substring(i + 1)];
    }
    return [defaultNamespace, id];
}

/**
 * Key 类 - 带命名空间的资源标识符
 * 实现 ResourceKey 接口以支持与 IModelGenerator 的兼容性
 */
export class Key implements IResourceKey {
    readonly namespace: string;
    readonly value: string;

    constructor(namespace: string, value: string) {
        this.namespace = namespace;
        this.value = value;
    }

    /**
     * 获取路径（ResourceKey 接口兼容）
     * 等同于 value 属性
     */
    get path(): string {
        return this.value;
    }

    /** 使用默认命名空间创建 Key */
    static withDefaultNamespace(value: string): Key;
    static withDefaultNamespace(namespacedId: string, defaultNamespace: string): Key;
    static withDefaultNamespace(arg1: string, arg2?: string): Key {
        if (arg2 !== undefined) {
            return Key.of(decompose(arg1, arg2));
        }
        return new Key(DEFAULT_NAMESPACE, arg1);
    }

    /** 从命名空间和值创建 Key */
    static of(namespace: string, value: string): Key;
    static of(id: [string, string]): Key;
    static of(namespacedId: string): Key;
    static of(arg1: string | [string, string], arg2?: string): Key {
        if (Array.isArray(arg1)) {
            return new Key(arg1[0], arg1[1]);
        }
        if (arg2 !== undefined) {
            return new Key(arg1, arg2);
        }
        return Key.of(decompose(arg1, 'minecraft'));
    }

    /** 从字符串解析 Key（from 是 of 的别名） */
    static from(namespacedId: string): Key {
        return Key.of(namespacedId);
    }

    /** 从命名空间和路径创建 Key（fromNamespaceAndPath 是 of 的别名） */
    static fromNamespaceAndPath(namespace: string, path: string): Key {
        return new Key(namespace, path);
    }

    decompose(): [string, string] {
        return [this.namespace, this.value];
    }

    hashCode(): number {
        let hash = 0;
        const str = this.asString();
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return hash;
    }

    equals(other: Key | null | undefined): boolean {
        if (!other) {return false;}
        return this.namespace === other.namespace && this.value === other.value;
    }

    toString(): string {
        return this.asString();
    }

    asString(): string {
        return `${this.namespace}:${this.value}`;
    }

    /** 获取最小字符串表示（minecraft 命名空间省略） */
    asMinimalString(): string {
        return this.namespace === 'minecraft' ? this.value : this.asString();
    }
}
