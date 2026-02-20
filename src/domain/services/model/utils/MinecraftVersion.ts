/**
 * Minecraft 版本工具类
 *
 * 数据来源：data/minecraft/versions.json
 * 此模块从 JSON 配置文件加载版本定义。
 * 必须在使用前调用 initializeMinecraftVersions() 初始化。
 */

import { type IMinecraftVersionInfo } from '../../../../core/interfaces/IModelGenerator';
import { type IMinecraftVersionsConfig } from '../../../../core/types/ConfigTypes';

// ============================================================================
// 模块私有状态（由 initializeMinecraftVersions 填充）
// ============================================================================

/** 版本整数 -> pack_format 映射 */
let packFormatsMap: Map<number, number> | null = null;

/** 版本别名 -> MinecraftVersion 实例映射 */
let versionsMap: Record<string, MinecraftVersion> | null = null;

/** 默认版本 */
let defaultVer: MinecraftVersion | null = null;

/**
 * 将版本字符串解析为整数
 *
 * @param versionString - 版本字符串，如 "1.21.4"
 * @returns 版本整数，如 12104
 *
 * @example
 * parseVersionToInteger("1.20.1") // 返回 12001
 * parseVersionToInteger("1.21.4") // 返回 12104
 */
export function parseVersionToInteger(versionString: string): number {
    let major = 0;
    let minor = 0;
    let currentNumber = 0;
    let part = 0;

    for (let i = 0; i < versionString.length; i++) {
        const c = versionString.charAt(i);
        if (c >= '0' && c <= '9') {
            currentNumber = currentNumber * 10 + (c.charCodeAt(0) - '0'.charCodeAt(0));
        } else if (c === '.') {
            if (part === 1) {
                major = currentNumber;
            }
            part++;
            currentNumber = 0;
            if (part > 2) {
                break;
            }
        }
    }

    if (part === 1) {
        major = currentNumber;
    } else if (part === 2) {
        minor = currentNumber;
    }

    return 10000 + major * 100 + minor;
}

/**
 * Minecraft 版本类
 *
 * 用于版本比较和资源包格式获取。
 * 实现 IMinecraftVersionInfo 接口以支持 ItemModel 系统。
 */
export class MinecraftVersion implements IMinecraftVersionInfo {
    /** 版本整数表示 */
    private readonly _version: number;
    /** 版本字符串 */
    private readonly _versionString: string;
    /** 资源包格式 */
    private readonly _packFormat: number;
    /** 主版本号 */
    readonly major: number;
    /** 次版本号 */
    readonly minor: number;
    /** 修订版本号 */
    readonly patch: number;

    /**
     * 从版本字符串解析 MinecraftVersion
     *
     * @param version - 版本字符串
     * @returns MinecraftVersion 实例
     */
    static parse(version: string): MinecraftVersion {
        return new MinecraftVersion(version);
    }

    /**
     * 创建 MinecraftVersion 实例
     *
     * @param version - 版本字符串，如 "1.21.4"
     */
    constructor(version: string) {
        this._version = parseVersionToInteger(version);
        this._versionString = version;
        this._packFormat = packFormatsMap?.get(this._version) ?? 0;

        // 解析 major, minor, patch
        const parts = version.split('.');
        this.major = parseInt(parts[0] ?? '1', 10);
        this.minor = parseInt(parts[1] ?? '0', 10);
        this.patch = parseInt(parts[2] ?? '0', 10);
    }

    /**
     * 获取版本字符串
     */
    get version(): string {
        return this._versionString;
    }

    /**
     * 获取资源包格式
     */
    get packFormat(): number {
        return this._packFormat;
    }

    /**
     * 获取版本整数
     */
    get versionInt(): number {
        return this._version;
    }

    /**
     * 检查是否大于等于指定版本
     */
    isAtOrAbove(other: IMinecraftVersionInfo): boolean {
        return this.compareTo(other) >= 0;
    }

    /**
     * 检查是否小于等于指定版本
     */
    isAtOrBelow(other: IMinecraftVersionInfo): boolean {
        return this.compareTo(other) <= 0;
    }

    /**
     * 检查是否等于指定版本
     */
    isAt(other: IMinecraftVersionInfo): boolean {
        return this.compareTo(other) === 0;
    }

    /**
     * 检查是否小于指定版本
     */
    isBelow(other: IMinecraftVersionInfo): boolean {
        return this.compareTo(other) < 0;
    }

    /**
     * 检查是否大于指定版本
     */
    isAbove(other: IMinecraftVersionInfo): boolean {
        return this.compareTo(other) > 0;
    }

    /**
     * 比较两个版本
     *
     * @returns 负数表示小于，0表示等于，正数表示大于
     */
    compareTo(other: IMinecraftVersionInfo): number {
        if (this.major !== other.major) {
            return this.major - other.major;
        }
        if (this.minor !== other.minor) {
            return this.minor - other.minor;
        }
        return this.patch - other.patch;
    }

    /**
     * 检查是否相等
     */
    equals(other: IMinecraftVersionInfo | null | undefined): boolean {
        if (!other) {
            return false;
        }
        return this.compareTo(other) === 0;
    }

    /**
     * 获取哈希码
     */
    hashCode(): number {
        return this._version;
    }

    /**
     * 转换为字符串
     */
    toString(): string {
        return this._versionString;
    }
}

// ============================================================================
// 从 JSON 配置初始化
// ============================================================================

/**
 * 确保模块已初始化
 */
function ensureInitialized(): void {
    if (!versionsMap) {
        throw new Error('MinecraftVersions not initialized. Call initializeMinecraftVersions() first.');
    }
}

/**
 * 从 JSON 配置初始化 Minecraft 版本数据
 *
 * @param config - Minecraft 版本配置
 */
export function initializeMinecraftVersions(config: IMinecraftVersionsConfig): void {
    // 构建 pack_format 映射
    packFormatsMap = new Map<number, number>();
    for (const [versionStr, packFormat] of Object.entries(config.packFormats)) {
        packFormatsMap.set(parseVersionToInteger(versionStr), packFormat);
    }
    // 添加未来版本哨兵值
    packFormatsMap.set(parseVersionToInteger('1.99.99'), 1000);

    // 构建版本别名映射
    versionsMap = {};
    for (const [alias, versionStr] of Object.entries(config.versionAliases)) {
        versionsMap[alias] = new MinecraftVersion(versionStr);
    }

    // 设置默认版本
    defaultVer = new MinecraftVersion(config.defaultVersion);
}

/**
 * 预定义的 Minecraft 版本常量
 *
 * 通过 Proxy 延迟访问，未初始化时抛出错误。
 */
export const MinecraftVersions: Record<string, MinecraftVersion> = new Proxy({} as Record<string, MinecraftVersion>, {
    get(_target, prop: string): MinecraftVersion {
        ensureInitialized();
        const ver = versionsMap![prop];
        if (!ver) {
            throw new Error(`Unknown MinecraftVersion alias: ${prop}`);
        }
        return ver;
    },
});

/**
 * 默认版本（用于 VSCode 扩展）
 *
 * 通过 Proxy 延迟访问，未初始化时抛出错误。
 */
export const DEFAULT_VERSION: MinecraftVersion = new Proxy({} as MinecraftVersion, {
    get(_target, prop: string | symbol): unknown {
        ensureInitialized();
        return (defaultVer as unknown as Record<string | symbol, unknown>)[prop];
    },
}) as MinecraftVersion;
