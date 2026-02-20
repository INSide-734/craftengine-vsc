import * as fs from 'fs/promises';
import * as path from 'path';
import { workspace } from 'vscode';

/**
 * 资源包发现结果
 */
export interface IResourcePackInfo {
    /** 资源包根目录路径 */
    path: string;
    /** 资源包所在的工作区文件夹 */
    workspaceFolder: string;
}

/**
 * 资源包发现选项
 */
export interface IResourcePackDiscoveryOptions {
    /** 最大搜索深度（默认 4） */
    maxDepth?: number;
    /** 要跳过的目录名称 */
    skipDirectories?: string[];
}

/**
 * 默认跳过的目录
 */
let DEFAULT_SKIP_DIRECTORIES = ['node_modules', '.git', 'out', 'dist', '.vscode', '.idea', 'build', 'target'];

/**
 * 有效命名空间的正则表达式
 * 根据 Minecraft Wiki：必须以小写字母开头，只能包含 [a-z0-9_.-]
 */
const VALID_NAMESPACE_PATTERN = /^[a-z][a-z0-9_.-]*$/;

/**
 * 缓存条目
 */
interface ICacheEntry {
    /** 资源包列表 */
    packs: IResourcePackInfo[];
    /** 缓存时间戳 */
    timestamp: number;
}

/**
 * 缓存 TTL（默认 5 分钟）
 */
let CACHE_TTL = 300000;

/**
 * 资源包发现工具类
 *
 * 通过 assets/minecraft 目录结构识别有效的资源包目录。
 * 所有文件系统操作均为异步，避免阻塞主线程。
 *
 * @remarks
 * 资源包识别规则：包含 assets/minecraft 目录结构的目录
 *
 * @example
 * ```typescript
 * // 发现工作区中的所有资源包
 * const packs = await ResourcePackDiscovery.discoverInWorkspaceAsync();
 *
 * // 发现指定目录下的资源包
 * const packs = await ResourcePackDiscovery.discoverInDirectoryAsync('/path/to/project');
 *
 * // 清除缓存
 * ResourcePackDiscovery.clearCache();
 * ```
 */
export class ResourcePackDiscovery {
    /**
     * 工作区资源包缓存
     */
    private static workspaceCache: ICacheEntry | null = null;

    /**
     * 从配置设置文件系统参数
     *
     * @param config 文件系统配置
     */
    static configure(config: {
        skipDirectories?: string[];
        resourcePackCacheTTL?: number;
        concurrencyLimit?: number;
    }): void {
        if (config.skipDirectories) {
            DEFAULT_SKIP_DIRECTORIES = config.skipDirectories;
        }
        if (config.resourcePackCacheTTL !== undefined) {
            CACHE_TTL = config.resourcePackCacheTTL;
        }
    }

    /**
     * 在工作区中发现所有资源包（异步）
     *
     * @param options - 发现选项
     * @returns 资源包信息数组
     */
    static async discoverInWorkspaceAsync(options?: IResourcePackDiscoveryOptions): Promise<IResourcePackInfo[]> {
        // 检查缓存是否有效
        if (this.workspaceCache && Date.now() - this.workspaceCache.timestamp < CACHE_TTL) {
            return this.workspaceCache.packs;
        }

        const workspaceFolders = workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return [];
        }

        const results: IResourcePackInfo[] = [];

        for (const folder of workspaceFolders) {
            const rootPath = folder.uri.fsPath;
            const paths = await this.discoverInDirectoryAsync(rootPath, options);

            for (const packPath of paths) {
                results.push({
                    path: packPath,
                    workspaceFolder: rootPath,
                });
            }
        }

        // 更新缓存
        this.workspaceCache = {
            packs: results,
            timestamp: Date.now(),
        };

        return results;
    }

    /**
     * 在工作区中发现所有资源包（同步包装器，用于向后兼容）
     *
     * @deprecated 使用 discoverInWorkspaceAsync 代替
     * @param options - 发现选项
     * @returns 资源包信息数组（从缓存返回，如果缓存无效则返回空数组）
     */
    static discoverInWorkspace(options?: IResourcePackDiscoveryOptions): IResourcePackInfo[] {
        // 如果缓存有效，直接返回
        if (this.workspaceCache && Date.now() - this.workspaceCache.timestamp < CACHE_TTL) {
            return this.workspaceCache.packs;
        }

        // 触发异步发现，但不等待结果
        this.discoverInWorkspaceAsync(options).catch(() => {
            // 忽略错误，下次调用会重试
        });

        // 返回空数组或过期的缓存
        return this.workspaceCache?.packs ?? [];
    }

    /**
     * 在指定目录中发现所有资源包（异步）
     *
     * @param rootDir - 根目录路径
     * @param options - 发现选项
     * @returns 资源包路径数组
     */
    static async discoverInDirectoryAsync(rootDir: string, options?: IResourcePackDiscoveryOptions): Promise<string[]> {
        const maxDepth = options?.maxDepth ?? 4;
        const skipDirectories = options?.skipDirectories ?? DEFAULT_SKIP_DIRECTORIES;

        const results: string[] = [];
        await this.findResourcePackDirsAsync(rootDir, 0, maxDepth, results, skipDirectories);

        return results;
    }

    /**
     * 检查目录是否是有效的资源包（异步）
     *
     * @param dir - 目录路径
     * @returns 是否是有效的资源包
     */
    static async isResourcePackAsync(dir: string): Promise<boolean> {
        const assetsPath = path.join(dir, 'assets');

        try {
            await fs.access(assetsPath);
        } catch {
            return false;
        }

        // 检查 assets 目录下是否存在有效命名空间目录（包含 models 或 textures）
        try {
            const entries = await fs.readdir(assetsPath, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory() || !VALID_NAMESPACE_PATTERN.test(entry.name)) {
                    continue;
                }
                const namespacePath = path.join(assetsPath, entry.name);

                // 并行检查多个子目录
                const checks = await Promise.all([
                    this.directoryExistsAsync(path.join(namespacePath, 'models')),
                    this.directoryExistsAsync(path.join(namespacePath, 'textures')),
                    this.directoryExistsAsync(path.join(namespacePath, 'items')),
                ]);

                if (checks.some((exists) => exists)) {
                    return true;
                }
            }
        } catch {
            // 忽略无法访问的目录
        }

        return false;
    }

    /**
     * 检查目录是否是有效的资源包（同步包装器，用于向后兼容）
     *
     * @deprecated 使用 isResourcePackAsync 代替
     * @param dir - 目录路径
     * @returns 是否是有效的资源包
     */
    static isResourcePack(dir: string): boolean {
        // 同步检查基本结构
        const assetsPath = path.join(dir, 'assets');
        try {
            // 使用同步检查作为快速路径
            const stat = require('fs').statSync(assetsPath);
            if (!stat.isDirectory()) {
                return false;
            }

            const entries = require('fs').readdirSync(assetsPath, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory() || !VALID_NAMESPACE_PATTERN.test(entry.name)) {
                    continue;
                }
                const namespacePath = path.join(assetsPath, entry.name);
                const fsSync = require('fs');
                if (
                    fsSync.existsSync(path.join(namespacePath, 'models')) ||
                    fsSync.existsSync(path.join(namespacePath, 'textures')) ||
                    fsSync.existsSync(path.join(namespacePath, 'items'))
                ) {
                    return true;
                }
            }
        } catch {
            return false;
        }

        return false;
    }

    /**
     * 获取资源包中的 assets 目录路径
     *
     * @param resourcePackPath - 资源包根目录路径
     * @returns assets 目录路径
     */
    static getAssetsPath(resourcePackPath: string): string {
        return path.join(resourcePackPath, 'assets');
    }

    /**
     * 获取资源包中指定命名空间的目录路径
     *
     * @param resourcePackPath - 资源包根目录路径
     * @param namespace - 命名空间
     * @returns 命名空间目录路径，如果命名空间无效则返回 null
     */
    static getNamespacePath(resourcePackPath: string, namespace: string): string | null {
        // 验证命名空间格式
        if (!namespace || !VALID_NAMESPACE_PATTERN.test(namespace)) {
            return null;
        }
        return path.join(resourcePackPath, 'assets', namespace);
    }

    /**
     * 验证命名空间是否有效
     *
     * @param namespace - 命名空间
     * @returns 是否有效
     */
    static isValidNamespace(namespace: string): boolean {
        return !!namespace && VALID_NAMESPACE_PATTERN.test(namespace);
    }

    /**
     * 清除缓存
     */
    static clearCache(): void {
        this.workspaceCache = null;
    }

    /**
     * 检查目录是否存在（异步）
     */
    private static async directoryExistsAsync(dirPath: string): Promise<boolean> {
        try {
            const stat = await fs.stat(dirPath);
            return stat.isDirectory();
        } catch {
            return false;
        }
    }

    /**
     * 递归查找资源包目录（异步）
     *
     * 资源包识别规则：包含 assets/minecraft 目录结构的目录
     */
    private static async findResourcePackDirsAsync(
        dir: string,
        depth: number,
        maxDepth: number,
        results: string[],
        skipDirectories: string[],
    ): Promise<void> {
        if (depth > maxDepth) {
            return;
        }

        try {
            // 检查是否有 assets/minecraft 目录结构
            if (await this.isResourcePackAsync(dir)) {
                results.push(dir);
                return; // 找到资源包后不再递归搜索子目录
            }

            // 递归搜索子目录
            const entries = await fs.readdir(dir, { withFileTypes: true });

            // 并行处理子目录（限制并发数）
            const subdirs: string[] = [];
            for (const entry of entries) {
                // 跳过符号链接，防止路径遍历攻击
                if (entry.isSymbolicLink()) {
                    continue;
                }

                if (!entry.isDirectory()) {
                    continue;
                }

                // 跳过指定的目录
                if (skipDirectories.includes(entry.name) || entry.name.startsWith('.')) {
                    continue;
                }

                subdirs.push(path.join(dir, entry.name));
            }

            // 并行处理子目录，但限制并发数为 4
            const CONCURRENCY_LIMIT = 4;
            for (let i = 0; i < subdirs.length; i += CONCURRENCY_LIMIT) {
                const batch = subdirs.slice(i, i + CONCURRENCY_LIMIT);
                await Promise.all(
                    batch.map((subdir) =>
                        this.findResourcePackDirsAsync(subdir, depth + 1, maxDepth, results, skipDirectories),
                    ),
                );
            }
        } catch {
            // 忽略无法访问的目录（权限不足、符号链接损坏等）
            // 这是预期行为，不需要记录日志
        }
    }
}
