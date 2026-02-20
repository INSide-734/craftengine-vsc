/**
 * 对象工具函数
 *
 * 提供常用的对象操作功能，包括嵌套值访问、深度合并、克隆等。
 */

/**
 * 获取对象的嵌套值
 *
 * 通过点号分隔的路径获取对象的嵌套属性值。
 *
 * @param obj - 要访问的对象
 * @param path - 点号分隔的属性路径
 * @param defaultValue - 默认值，当路径不存在时返回
 * @returns 属性值或默认值
 *
 * @example
 * ```typescript
 * const obj = { a: { b: { c: 1 } } };
 * getNestedValue(obj, 'a.b.c'); // 1
 * getNestedValue(obj, 'a.b.d', 'default'); // 'default'
 * getNestedValue(obj, 'x.y.z'); // undefined
 * ```
 */
export function getNestedValue<T = unknown>(
    obj: Record<string, unknown>,
    path: string,
    defaultValue?: T,
): T | undefined {
    const keys = path.split('.');
    let current: unknown = obj;

    for (const key of keys) {
        if (current === null || current === undefined) {
            return defaultValue;
        }
        if (typeof current !== 'object' || !(key in (current as Record<string, unknown>))) {
            return defaultValue;
        }
        current = (current as Record<string, unknown>)[key];
    }

    return (current as T) ?? defaultValue;
}

/**
 * 设置对象的嵌套值
 *
 * 通过点号分隔的路径设置对象的嵌套属性值，会自动创建中间对象。
 *
 * @param obj - 要修改的对象
 * @param path - 点号分隔的属性路径
 * @param value - 要设置的值
 *
 * @example
 * ```typescript
 * const obj = {};
 * setNestedValue(obj, 'a.b.c', 1);
 * // obj = { a: { b: { c: 1 } } }
 * ```
 */
export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    let current = obj;

    for (const key of keys) {
        if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
            current[key] = {};
        }
        current = current[key] as Record<string, unknown>;
    }

    current[lastKey] = value;
}

/**
 * 删除对象的嵌套值
 *
 * 通过点号分隔的路径删除对象的嵌套属性。
 *
 * @param obj - 要修改的对象
 * @param path - 点号分隔的属性路径
 * @returns 是否成功删除
 *
 * @example
 * ```typescript
 * const obj = { a: { b: { c: 1 } } };
 * deleteNestedValue(obj, 'a.b.c'); // true
 * // obj = { a: { b: {} } }
 * ```
 */
export function deleteNestedValue(obj: Record<string, unknown>, path: string): boolean {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    let current: unknown = obj;

    for (const key of keys) {
        if (
            current === null ||
            current === undefined ||
            typeof current !== 'object' ||
            !(key in (current as Record<string, unknown>))
        ) {
            return false;
        }
        current = (current as Record<string, unknown>)[key];
    }

    if (
        current !== null &&
        current !== undefined &&
        typeof current === 'object' &&
        lastKey in (current as Record<string, unknown>)
    ) {
        delete (current as Record<string, unknown>)[lastKey];
        return true;
    }

    return false;
}

/**
 * 检查对象是否包含嵌套路径
 *
 * @param obj - 要检查的对象
 * @param path - 点号分隔的属性路径
 * @returns 是否存在该路径
 *
 * @example
 * ```typescript
 * const obj = { a: { b: 1 } };
 * hasNestedPath(obj, 'a.b'); // true
 * hasNestedPath(obj, 'a.c'); // false
 * ```
 */
export function hasNestedPath(obj: Record<string, unknown>, path: string): boolean {
    const keys = path.split('.');
    let current: unknown = obj;

    for (const key of keys) {
        if (
            current === null ||
            current === undefined ||
            typeof current !== 'object' ||
            !(key in (current as Record<string, unknown>))
        ) {
            return false;
        }
        current = (current as Record<string, unknown>)[key];
    }

    return true;
}

/**
 * 深度克隆对象
 *
 * 创建对象的深度副本，支持嵌套对象和数组。
 *
 * @param obj - 要克隆的对象
 * @returns 克隆后的对象
 *
 * @remarks
 * - 使用 JSON 序列化方式，不支持函数、Symbol、循环引用等
 * - 对于复杂对象，考虑使用专门的深度克隆库
 *
 * @example
 * ```typescript
 * const original = { a: { b: [1, 2, 3] } };
 * const cloned = deepClone(original);
 * cloned.a.b.push(4); // 不影响原对象
 * ```
 */
export function deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    try {
        return JSON.parse(JSON.stringify(obj));
    } catch {
        // 如果 JSON 序列化失败，返回原对象
        return obj;
    }
}

/**
 * 深度合并对象
 *
 * 将多个对象深度合并为一个新对象，后面的对象会覆盖前面的同名属性。
 *
 * @param target - 目标对象
 * @param sources - 源对象数组
 * @returns 合并后的新对象
 *
 * @example
 * ```typescript
 * const obj1 = { a: { b: 1, c: 2 } };
 * const obj2 = { a: { b: 3, d: 4 } };
 * const merged = deepMerge(obj1, obj2);
 * // { a: { b: 3, c: 2, d: 4 } }
 * ```
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, ...sources: Partial<T>[]): T {
    if (!sources.length) {
        return deepClone(target);
    }

    const result = deepClone(target);

    for (const source of sources) {
        if (source === null || source === undefined) {
            continue;
        }

        for (const key of Object.keys(source)) {
            const sourceValue = source[key];
            const targetValue = (result as Record<string, unknown>)[key];

            if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
                (result as Record<string, unknown>)[key] = deepMerge(
                    targetValue as Record<string, unknown>,
                    sourceValue as Record<string, unknown>,
                );
            } else {
                (result as Record<string, unknown>)[key] = deepClone(sourceValue);
            }
        }
    }

    return result;
}

/**
 * 检查值是否为普通对象
 *
 * @param value - 要检查的值
 * @returns 是否为普通对象
 *
 * @example
 * ```typescript
 * isPlainObject({}); // true
 * isPlainObject({ a: 1 }); // true
 * isPlainObject([]); // false
 * isPlainObject(null); // false
 * isPlainObject(new Date()); // false
 * ```
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== 'object') {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * 选择对象的指定属性
 *
 * 从对象中选择指定的属性，返回只包含这些属性的新对象。
 *
 * @param obj - 源对象
 * @param keys - 要选择的属性名数组
 * @returns 包含指定属性的新对象
 *
 * @example
 * ```typescript
 * const obj = { a: 1, b: 2, c: 3 };
 * pick(obj, ['a', 'c']); // { a: 1, c: 3 }
 * ```
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
    const result = {} as Pick<T, K>;
    for (const key of keys) {
        if (key in obj) {
            result[key] = obj[key];
        }
    }
    return result;
}

/**
 * 排除对象的指定属性
 *
 * 从对象中排除指定的属性，返回不包含这些属性的新对象。
 *
 * @param obj - 源对象
 * @param keys - 要排除的属性名数组
 * @returns 不包含指定属性的新对象
 *
 * @example
 * ```typescript
 * const obj = { a: 1, b: 2, c: 3 };
 * omit(obj, ['b']); // { a: 1, c: 3 }
 * ```
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
    const result = { ...obj };
    for (const key of keys) {
        delete result[key];
    }
    return result as Omit<T, K>;
}

/**
 * 检查对象是否为空
 *
 * @param obj - 要检查的对象
 * @returns 是否为空对象
 *
 * @example
 * ```typescript
 * isEmpty({}); // true
 * isEmpty({ a: 1 }); // false
 * isEmpty(null); // true
 * ```
 */
export function isEmpty(obj: Record<string, unknown> | null | undefined): boolean {
    if (obj === null || obj === undefined) {
        return true;
    }
    return Object.keys(obj).length === 0;
}

/**
 * 获取对象所有键的路径（扁平化）
 *
 * 获取嵌套对象的所有叶子节点路径。
 *
 * @param obj - 要处理的对象
 * @param prefix - 路径前缀
 * @returns 所有路径数组
 *
 * @example
 * ```typescript
 * const obj = { a: { b: 1, c: { d: 2 } }, e: 3 };
 * getAllPaths(obj); // ['a.b', 'a.c.d', 'e']
 * ```
 */
export function getAllPaths(obj: Record<string, unknown>, prefix: string = ''): string[] {
    const paths: string[] = [];

    for (const key of Object.keys(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];

        if (isPlainObject(value)) {
            paths.push(...getAllPaths(value as Record<string, unknown>, path));
        } else {
            paths.push(path);
        }
    }

    return paths;
}

/**
 * 将扁平对象转换为嵌套对象
 *
 * @param obj - 扁平对象（键为点号分隔的路径）
 * @returns 嵌套对象
 *
 * @example
 * ```typescript
 * const flat = { 'a.b.c': 1, 'a.d': 2 };
 * unflatten(flat); // { a: { b: { c: 1 }, d: 2 } }
 * ```
 */
export function unflatten(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [path, value] of Object.entries(obj)) {
        setNestedValue(result, path, value);
    }

    return result;
}

/**
 * 将嵌套对象转换为扁平对象
 *
 * @param obj - 嵌套对象
 * @param prefix - 路径前缀
 * @returns 扁平对象
 *
 * @example
 * ```typescript
 * const nested = { a: { b: { c: 1 }, d: 2 } };
 * flatten(nested); // { 'a.b.c': 1, 'a.d': 2 }
 * ```
 */
export function flatten(obj: Record<string, unknown>, prefix: string = ''): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];

        if (isPlainObject(value)) {
            Object.assign(result, flatten(value as Record<string, unknown>, path));
        } else {
            result[path] = value;
        }
    }

    return result;
}
