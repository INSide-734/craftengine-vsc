/**
 * 版本修订系统
 *
 * 移植自 craft-engine 的 Revision 系统，用于管理模型的版本兼容性。
 */

import { MinecraftVersion, MinecraftVersions } from './MinecraftVersion';
import { type IRevision, type IMinecraftVersionInfo } from '../../../../core/interfaces/IModelGenerator';

/**
 * 未来版本常量
 */
export const FUTURE_VERSION = new MinecraftVersion('1.99.99');

/**
 * Revision 接口
 *
 * 定义版本修订的基本操作，扩展自 IModelGenerator 的 Revision 接口
 */
export interface Revision extends IRevision {
    /** 最小资源包版本 */
    readonly minPackVersion: number;
    /** 最大资源包版本 */
    readonly maxPackVersion: number;
    /** 版本字符串 */
    readonly versionString: string;
    /** 最小 Minecraft 版本 */
    readonly minVersion: MinecraftVersion;
    /** 最大 Minecraft 版本 */
    readonly maxVersion: MinecraftVersion;

    /**
     * 检查是否匹配指定版本范围
     */
    matches(min: MinecraftVersion, max: MinecraftVersion): boolean;
}

/**
 * Since 修订类型
 *
 * 表示从某个版本开始的修订
 */
export class SinceRevision implements Revision {
    private readonly _minVersion: MinecraftVersion;
    private _versionString?: string;

    constructor(minVersion: MinecraftVersion) {
        this._minVersion = minVersion;
    }

    get maxVersion(): MinecraftVersion {
        return FUTURE_VERSION;
    }

    get minVersion(): MinecraftVersion {
        return this._minVersion;
    }

    get versionString(): string {
        if (!this._versionString) {
            this._versionString = this._minVersion.version.replace(/\./g, '_');
        }
        return this._versionString;
    }

    /**
     * 检查版本是否适用（实现 IRevision 接口）
     */
    isApplicable(version: IMinecraftVersionInfo): boolean {
        return this._minVersion.isAtOrBelow(version);
    }

    matches(min: MinecraftVersion, max: MinecraftVersion): boolean {
        return this._minVersion.isAtOrBelow(max) && min.isBelow(this._minVersion);
    }

    get maxPackVersion(): number {
        return FUTURE_VERSION.packFormat;
    }

    get minPackVersion(): number {
        return this._minVersion.packFormat;
    }

    equals(other: Revision | null | undefined): boolean {
        if (!other || !(other instanceof SinceRevision)) {
            return false;
        }
        return this._minVersion.equals(other._minVersion);
    }

    hashCode(): number {
        return this._minVersion.hashCode();
    }

    toString(): string {
        return `Since{minVersion=${this._minVersion}}`;
    }
}

/**
 * FromTo 修订类型
 *
 * 表示从某个版本到另一个版本的修订
 */
export class FromToRevision implements Revision {
    private readonly _minVersion: MinecraftVersion;
    private readonly _maxVersion: MinecraftVersion;
    private _versionString?: string;

    constructor(minVersion: MinecraftVersion, maxVersion: MinecraftVersion) {
        this._minVersion = minVersion;
        this._maxVersion = maxVersion;
    }

    get maxVersion(): MinecraftVersion {
        return this._maxVersion;
    }

    get minVersion(): MinecraftVersion {
        return this._minVersion;
    }

    /**
     * 检查版本是否适用（实现 IRevision 接口）
     */
    isApplicable(version: IMinecraftVersionInfo): boolean {
        return this._minVersion.isAtOrBelow(version) && this._maxVersion.isAtOrAbove(version);
    }

    matches(min: MinecraftVersion, max: MinecraftVersion): boolean {
        return !min.isAbove(this._maxVersion) || !max.isBelow(this._minVersion);
    }

    get minPackVersion(): number {
        return this._minVersion.packFormat;
    }

    get maxPackVersion(): number {
        return this._maxVersion.packFormat;
    }

    get versionString(): string {
        if (!this._versionString) {
            const minStr = this._minVersion.version.replace(/\./g, '_');
            const maxStr = this._maxVersion.version.replace(/\./g, '_');
            this._versionString = `${minStr}-${maxStr}`;
        }
        return this._versionString;
    }

    equals(other: Revision | null | undefined): boolean {
        if (!other || !(other instanceof FromToRevision)) {
            return false;
        }
        return this._minVersion.equals(other._minVersion) && this._maxVersion.equals(other._maxVersion);
    }

    hashCode(): number {
        let result = this._minVersion.hashCode();
        result = 31 * result + this._maxVersion.hashCode();
        return result;
    }

    toString(): string {
        return `FromTo{minVersion=${this._minVersion}, maxVersion=${this._maxVersion}}`;
    }
}

/**
 * 创建 Since 修订
 */
export function since(minecraftVersion: MinecraftVersion): Revision {
    return new SinceRevision(minecraftVersion);
}

/**
 * 创建 FromTo 修订
 */
export function fromTo(from: MinecraftVersion, to: MinecraftVersion): Revision {
    return new FromToRevision(from, to);
}

/**
 * 预定义的修订常量
 *
 * SINCE_1_21_4 和 SINCE_1_21_2 使用 getter 延迟求值，
 * 避免在模块加载时访问尚未初始化的 MinecraftVersions。
 */
export const Revisions = {
    since,
    fromTo,
    /** 从 1.21.4 开始 */
    get SINCE_1_21_4(): Revision {
        return since(MinecraftVersions.V1_21_4);
    },
    /** 从 1.21.2 开始 */
    get SINCE_1_21_2(): Revision {
        return since(MinecraftVersions.V1_21_2);
    },
};
