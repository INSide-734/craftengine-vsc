/**
 * 深冻结工具函数
 *
 * 递归冻结对象及其所有嵌套属性，确保完全不可变性。
 * 使用 WeakSet 防止循环引用导致的无限递归。
 *
 * @param obj - 要冻结的对象
 * @returns 冻结后的对象（与输入相同引用）
 *
 * @example
 * ```typescript
 * const data = { nested: { value: 1 } };
 * deepFreeze(data);
 * data.nested.value = 2; // TypeError: Cannot assign to read only property
 * ```
 */
export function deepFreeze<T>(obj: T): T {
    if (obj === null || obj === undefined || typeof obj !== 'object') {
        return obj;
    }

    // 已冻结则直接返回
    if (Object.isFrozen(obj)) {
        return obj;
    }

    return deepFreezeInternal(obj, new WeakSet());
}

/**
 * 内部递归冻结实现
 *
 * @param obj - 要冻结的对象
 * @param seen - 已访问对象集合（防循环引用）
 */
function deepFreezeInternal<T>(obj: T, seen: WeakSet<object>): T {
    if (obj === null || obj === undefined || typeof obj !== 'object') {
        return obj;
    }

    const objRef = obj as object;

    // 防止循环引用
    if (seen.has(objRef)) {
        return obj;
    }
    seen.add(objRef);

    // 冻结当前对象
    Object.freeze(obj);

    // 递归冻结所有属性
    const propNames = Object.getOwnPropertyNames(obj);
    for (const name of propNames) {
        const value = (obj as Record<string, unknown>)[name];
        if (value !== null && value !== undefined && typeof value === 'object') {
            deepFreezeInternal(value, seen);
        }
    }

    return obj;
}
