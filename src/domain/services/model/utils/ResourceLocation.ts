/**
 * 资源位置验证工具
 *
 * 移植自 craft-engine 的 ResourceLocation 类，用于验证 Minecraft 资源路径格式。
 */

// ============================================
// 字符验证常量
// ============================================

/** 有效的命名空间字符：a-z, 0-9, _, -, . */
const VALID_NAMESPACE_CHARS = /^[a-z0-9_.-]+$/;

/** 有效的路径字符：a-z, 0-9, _, -, /, . */
const VALID_PATH_CHARS = /^[a-z0-9_./-]+$/;

// ============================================
// 验证函数
// ============================================

/**
 * 检查字符是否为有效的路径字符
 */
export function validPathChar(character: string): boolean {
    return VALID_PATH_CHARS.test(character);
}

/**
 * 检查字符是否为有效的命名空间字符
 */
export function validNamespaceChar(character: string): boolean {
    return VALID_NAMESPACE_CHARS.test(character);
}

/**
 * 检查命名空间是否有效
 */
export function isValidNamespace(namespace: string): boolean {
    return namespace.length > 0 && VALID_NAMESPACE_CHARS.test(namespace);
}

/**
 * 检查路径是否有效
 */
export function isValidPath(path: string): boolean {
    return path.length > 0 && VALID_PATH_CHARS.test(path);
}

/**
 * 检查资源位置是否有效
 *
 * @example
 * isValidResourceLocation("minecraft:item/diamond") // true
 * isValidResourceLocation("Invalid:Path") // false
 */
export function isValidResourceLocation(resourceLocation: string): boolean {
    const index = resourceLocation.indexOf(':');
    if (index === -1) {
        return isValidPath(resourceLocation);
    }
    return (
        isValidNamespace(resourceLocation.substring(0, index)) &&
        isValidPath(resourceLocation.substring(index + 1))
    );
}

/**
 * ResourceLocation 类
 *
 * 表示 Minecraft 资源位置，包含命名空间和路径。
 */
export class ResourceLocation {
    readonly namespace: string;
    readonly path: string;

    constructor(namespace: string, path: string) {
        this.namespace = namespace;
        this.path = path;
    }

    /**
     * 从字符串解析资源位置
     */
    static parse(location: string, defaultNamespace = 'minecraft'): ResourceLocation | null {
        const index = location.indexOf(':');
        const namespace = index === -1 ? defaultNamespace : location.substring(0, index);
        const path = index === -1 ? location : location.substring(index + 1);

        if (!isValidNamespace(namespace) || !isValidPath(path)) {
            return null;
        }
        return new ResourceLocation(namespace, path);
    }

    /**
     * 检查资源位置是否有效（静态方法）
     */
    static isValid(resourceLocation: string): boolean {
        return isValidResourceLocation(resourceLocation);
    }

    toString(): string {
        return `${this.namespace}:${this.path}`;
    }

    equals(other: ResourceLocation | null | undefined): boolean {
        if (!other) {return false;}
        return this.namespace === other.namespace && this.path === other.path;
    }
}
