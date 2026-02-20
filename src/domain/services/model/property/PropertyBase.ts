/**
 * 属性系统基础模块
 *
 * 提供通用的属性接口、工厂和注册表实现。
 */

import { Key } from '../utils/Key';

// ============================================
// 通用属性接口
// ============================================

/** 通用属性接口 */
export interface Property {
    readonly type: Key;
    apply(json: Record<string, unknown>): void;
    toJson(): Record<string, unknown>;
}

/** 属性工厂接口 */
export interface PropertyFactory<T extends Property> {
    create(arguments_: Record<string, unknown>): T;
}

/** 属性读取器接口 */
export interface PropertyReader<T extends Property> {
    read(json: Record<string, unknown>): T;
}

// ============================================
// 简单属性实现
// ============================================

/** 简单属性基类 */
export class SimpleProperty implements Property {
    readonly type: Key;
    protected readonly propertyKey: string;

    constructor(type: Key, propertyKey = 'property') {
        this.type = type;
        this.propertyKey = propertyKey;
    }

    apply(json: Record<string, unknown>): void {
        json[this.propertyKey] = this.type.toString();
    }

    toJson(): Record<string, unknown> {
        return { [this.propertyKey]: this.type.toString() };
    }
}

/** 简单属性工厂 */
export class SimplePropertyFactory<T extends Property> implements PropertyFactory<T> {
    private readonly propertyKey: string;
    private readonly createFn: (type: Key) => T;

    constructor(createFn: (type: Key) => T, propertyKey = 'property') {
        this.createFn = createFn;
        this.propertyKey = propertyKey;
    }

    create(arguments_: Record<string, unknown>): T {
        return this.createFn(Key.of(String(arguments_[this.propertyKey])));
    }
}

/** 简单属性读取器 */
export class SimplePropertyReader<T extends Property> implements PropertyReader<T> {
    private readonly propertyKey: string;
    private readonly createFn: (type: Key) => T;

    constructor(createFn: (type: Key) => T, propertyKey = 'property') {
        this.createFn = createFn;
        this.propertyKey = propertyKey;
    }

    read(json: Record<string, unknown>): T {
        return this.createFn(Key.of(String(json[this.propertyKey])));
    }
}

// ============================================
// 通用注册表
// ============================================

/** 属性注册表 */
export class PropertyRegistry<T extends Property> {
    private readonly factoryRegistry = new Map<string, PropertyFactory<T>>();
    private readonly readerRegistry = new Map<string, PropertyReader<T>>();
    private readonly propertyKey: string;
    private readonly typeName: string;

    constructor(typeName: string, propertyKey = 'property') {
        this.typeName = typeName;
        this.propertyKey = propertyKey;
    }

    registerFactory(key: Key, factory: PropertyFactory<T>): void {
        this.factoryRegistry.set(key.asString(), factory);
    }

    registerReader(key: Key, reader: PropertyReader<T>): void {
        this.readerRegistry.set(key.asString(), reader);
    }

    /** 批量注册简单属性 */
    registerSimpleTypes(types: Key[], factory: PropertyFactory<T>, reader: PropertyReader<T>): void {
        for (const type of types) {
            this.registerFactory(type, factory);
            this.registerReader(type, reader);
        }
    }

    /** 从 Map 创建属性 */
    fromMap(map: Record<string, unknown>): T {
        return this.createFromRegistry(map, this.factoryRegistry, (f, m) => f.create(m));
    }

    /** 从 JSON 创建属性 */
    fromJson(json: Record<string, unknown>): T {
        return this.createFromRegistry(json, this.readerRegistry, (r, j) => r.read(j));
    }

    private createFromRegistry<R>(
        data: Record<string, unknown>,
        registry: Map<string, R>,
        creator: (handler: R, data: Record<string, unknown>) => T,
    ): T {
        const type = String(data[this.propertyKey] ?? '');
        const key = Key.withDefaultNamespace(type, 'minecraft');
        const handler = registry.get(key.asString());
        if (!handler) {
            throw new Error(`Invalid ${this.typeName} type: ${key.asString()}`);
        }
        return creator(handler, data);
    }
}
