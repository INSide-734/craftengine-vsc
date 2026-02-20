import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { workspace } from 'vscode';
import { type ILogger } from '../../core/interfaces/ILogger';
import {
    type INamespaceDiscoveryService,
    type IResourceLocation,
} from '../../core/interfaces/INamespaceDiscoveryService';
import { type IDataConfigLoader } from '../../core/interfaces/IDataConfigLoader';
import { ResourcePackDiscovery } from './ResourcePackDiscovery';
import { LRUCache } from '../utils/LRUCache';

// 重新导出接口，保持向后兼容
export { INamespaceDiscoveryService, IResourceLocation } from '../../core/interfaces/INamespaceDiscoveryService';

/**
 * 命名空间缓存条目
 */
interface INamespaceCacheEntry {
    /** 命名空间列表 */
    namespaces: string[];
    /** 缓存时间戳 */
    timestamp: number;
}

/**
 * 命名空间发现服务实现
 *
 * 提供 Minecraft 资源包命名空间的自动发现、验证和解析功能。
 *
 * @remarks
 * **Minecraft 资源位置格式**（根据 https://minecraft.wiki/w/Resource_location）：
 *
 * 格式: `namespace:path`
 * - **namespace**: 只能包含 `[a-z0-9_.-]`，必须以字母开头
 * - **path**: 可以包含 `[a-z0-9_.-/]`，斜杠作为目录分隔符
 *
 * **资源包目录结构**：
 * ```
 * assets/
 * ├── minecraft/           <- 命名空间
 * │   ├── models/
 * │   ├── textures/
 * │   └── sounds/
 * ├── custom_pack/         <- 自定义命名空间
 * │   └── models/
 * └── mymod/               <- 模组命名空间
 *     └── textures/
 *
 * data/
 * ├── minecraft/           <- 命名空间
 * │   ├── loot_tables/
 * │   ├── recipes/
 * │   └── advancements/
 * └── custom_pack/         <- 自定义命名空间
 *     └── loot_tables/
 * ```
 *
 * @example
 * ```typescript
 * const service = new NamespaceDiscoveryService(logger);
 *
 * // 发现命名空间
 * const namespaces = service.discoverNamespacesInWorkspace('assets/{namespace}/models');
 * // 返回: ['minecraft', 'custom_pack', 'mymod']
 *
 * // 验证命名空间
 * service.isValidNamespace('minecraft');     // true
 * service.isValidNamespace('my_mod');        // true
 * service.isValidNamespace('MyMod');         // false (大写字母)
 * service.isValidNamespace('my mod');        // false (空格)
 *
 * // 解析资源位置
 * const location = service.parseResourceLocation('minecraft:item/sword');
 * // 返回: { namespace: 'minecraft', path: 'item/sword', isValid: true }
 *
 * // 规范化资源位置
 * service.normalizeResourceLocation('Minecraft:Item/Sword');
 * // 返回: 'minecraft:item/sword'
 * ```
 */
export class NamespaceDiscoveryService implements INamespaceDiscoveryService {
    /**
     * 有效命名空间的正则表达式
     *
     * 根据 Minecraft Wiki：
     * - 必须以小写字母开头
     * - 只能包含小写字母、数字、下划线、连字符、点
     */
    private static readonly VALID_NAMESPACE_PATTERN = /^[a-z][a-z0-9_.-]*$/;

    /**
     * 有效资源路径的正则表达式
     *
     * 路径可以包含斜杠作为目录分隔符
     */
    private static readonly VALID_PATH_PATTERN = /^[a-z0-9_.-][a-z0-9_./-]*$/;

    /**
     * 资源位置解析正则表达式
     *
     * 格式: namespace:path
     */
    private static readonly RESOURCE_LOCATION_PATTERN = /^([a-z][a-z0-9_.-]*):(.+)$/;

    /**
     * 默认命名空间
     */
    private static readonly DEFAULT_NAMESPACE = 'minecraft';

    /**
     * 默认缓存 TTL（毫秒）
     */
    private static readonly DEFAULT_CACHE_TTL_FALLBACK = 300000; // 5分钟

    /**
     * 默认命名空间缓存最大容量
     */
    private static readonly DEFAULT_MAX_CACHE_SIZE = 50;

    /**
     * 命名空间缓存（使用 LRUCache 自动管理容量）
     */
    private readonly namespaceCache: LRUCache<string, INamespaceCacheEntry>;

    /**
     * 配置是否已加载
     */
    private configLoaded = false;

    /**
     * 缓存 TTL（从配置加载）
     */
    private cacheTTL = NamespaceDiscoveryService.DEFAULT_CACHE_TTL_FALLBACK;

    /**
     * 配置加载器
     */
    private configLoader: IDataConfigLoader | null = null;

    constructor(
        private readonly logger?: ILogger,
        configLoader?: IDataConfigLoader,
    ) {
        this.namespaceCache = new LRUCache<string, INamespaceCacheEntry>(
            NamespaceDiscoveryService.DEFAULT_MAX_CACHE_SIZE,
        );
        this.configLoader = configLoader || null;
        // 异步加载配置（fire and forget）
        if (this.configLoader) {
            this.loadConfig();
        }
    }

    /**
     * 异步加载配置（内部使用）
     */
    private async loadConfig(): Promise<void> {
        if (this.configLoaded || !this.configLoader) {
            return;
        }

        try {
            const timingConfig = await this.configLoader.loadTimingConfig();
            this.cacheTTL = timingConfig.cache.namespaceDiscoveryCacheTTL;
            this.configLoaded = true;

            this.logger?.debug('Config loaded', { cacheTTL: this.cacheTTL });
        } catch (error) {
            this.logger?.warn('Failed to load config, using defaults', { error });
        }
    }

    // ==================== 命名空间发现 ====================

    /**
     * 发现指定目录下的所有有效命名空间（同步版本）
     *
     * @remarks
     * 优先返回缓存结果，如果缓存未命中则同步执行文件系统操作。
     * 对于性能敏感的场景，建议使用 discoverNamespacesAsync。
     */
    discoverNamespaces(parentPath: string): string[] {
        // 检查缓存
        const cached = this.getCachedNamespaces(parentPath);
        if (cached) {
            return cached;
        }

        try {
            if (!fs.existsSync(parentPath)) {
                this.logger?.debug('Parent path does not exist', { parentPath });
                return [];
            }

            const entries = fs.readdirSync(parentPath, { withFileTypes: true });

            const namespaces = entries
                .filter((entry) => entry.isDirectory())
                .map((entry) => entry.name)
                .filter((name) => this.isValidNamespace(name))
                .sort();

            // 缓存结果
            this.setCachedNamespaces(parentPath, namespaces);

            this.logger?.debug('Discovered namespaces', {
                parentPath,
                count: namespaces.length,
                namespaces,
            });

            return namespaces;
        } catch (error) {
            this.logger?.error('Failed to discover namespaces', error as Error, {
                parentPath,
            });
            return [];
        }
    }

    /**
     * 发现指定目录下的所有有效命名空间（异步版本）
     *
     * @remarks
     * 推荐在性能敏感的场景使用此方法，避免阻塞主线程。
     *
     * @param parentPath 父目录路径
     * @returns 命名空间列表
     */
    async discoverNamespacesAsync(parentPath: string): Promise<string[]> {
        // 检查缓存
        const cached = this.getCachedNamespaces(parentPath);
        if (cached) {
            return cached;
        }

        try {
            // 异步检查目录是否存在
            try {
                await fsPromises.access(parentPath);
            } catch {
                this.logger?.debug('Parent path does not exist', { parentPath });
                return [];
            }

            const entries = await fsPromises.readdir(parentPath, { withFileTypes: true });

            const namespaces = entries
                .filter((entry) => entry.isDirectory())
                .map((entry) => entry.name)
                .filter((name) => this.isValidNamespace(name))
                .sort();

            // 缓存结果
            this.setCachedNamespaces(parentPath, namespaces);

            this.logger?.debug('Discovered namespaces (async)', {
                parentPath,
                count: namespaces.length,
                namespaces,
            });

            return namespaces;
        } catch (error) {
            this.logger?.error('Failed to discover namespaces', error as Error, {
                parentPath,
            });
            return [];
        }
    }

    /**
     * 在工作区中发现所有命名空间
     */
    discoverNamespacesInWorkspace(basePathTemplate: string): string[] {
        // 检查缓存
        const cacheKey = `workspace:${basePathTemplate}`;
        const cached = this.getCachedNamespaces(cacheKey);
        if (cached) {
            return cached;
        }

        const allNamespaces = new Set<string>();

        try {
            const workspaceFolders = workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return [];
            }

            // 解析路径模板，提取命名空间目录的父路径
            const parentDir = this.extractParentDir(basePathTemplate);
            if (!parentDir) {
                return [];
            }

            // 1. 首先在发现的资源包中搜索命名空间
            const resourcePacks = ResourcePackDiscovery.discoverInWorkspace();
            for (const pack of resourcePacks) {
                const parentPath = path.join(pack.path, parentDir);
                const namespaces = this.discoverNamespaces(parentPath);
                namespaces.forEach((ns) => allNamespaces.add(ns));
            }

            // 2. 然后在工作区根目录中搜索（保持向后兼容）
            for (const folder of workspaceFolders) {
                const parentPath = path.join(folder.uri.fsPath, parentDir);
                const namespaces = this.discoverNamespaces(parentPath);
                namespaces.forEach((ns) => allNamespaces.add(ns));
            }

            const result = Array.from(allNamespaces).sort();

            // 缓存结果
            this.setCachedNamespaces(cacheKey, result);

            this.logger?.debug('Discovered namespaces in workspace', {
                basePathTemplate,
                count: result.length,
                namespaces: result,
                resourcePackCount: resourcePacks.length,
            });

            return result;
        } catch (error) {
            this.logger?.error('Failed to discover namespaces in workspace', error as Error, {
                basePathTemplate,
            });
            return [];
        }
    }

    /**
     * 检查命名空间是否存在于工作区中
     */
    namespaceExists(namespace: string, basePathTemplate: string): boolean {
        if (!this.isValidNamespace(namespace)) {
            return false;
        }

        const namespaces = this.discoverNamespacesInWorkspace(basePathTemplate);
        return namespaces.includes(namespace);
    }

    /**
     * 获取命名空间在工作区中的绝对路径（同步版本）
     *
     * @remarks
     * 优先返回缓存结果，如果缓存未命中则同步执行文件系统操作。
     * 对于性能敏感的场景，建议使用 getNamespacePathsAsync。
     */
    getNamespacePaths(namespace: string, basePathTemplate: string): string[] {
        if (!this.isValidNamespace(namespace)) {
            return [];
        }

        // 生成缓存键
        const cacheKey = `paths:${namespace}:${basePathTemplate}`;
        const cached = this.getCachedNamespaces(cacheKey);
        if (cached) {
            return cached;
        }

        const paths: string[] = [];

        try {
            const workspaceFolders = workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return [];
            }

            // 将 {namespace} 替换为实际命名空间
            const resolvedPath = basePathTemplate.replace('{namespace}', namespace);

            // 1. 首先在发现的资源包中搜索
            const resourcePacks = ResourcePackDiscovery.discoverInWorkspace();
            for (const pack of resourcePacks) {
                const fullPath = path.join(pack.path, resolvedPath);
                if (fs.existsSync(fullPath) && !paths.includes(fullPath)) {
                    paths.push(fullPath);
                }
            }

            // 2. 然后在工作区根目录中搜索（保持向后兼容）
            for (const folder of workspaceFolders) {
                const fullPath = path.join(folder.uri.fsPath, resolvedPath);
                if (fs.existsSync(fullPath) && !paths.includes(fullPath)) {
                    paths.push(fullPath);
                }
            }

            // 缓存结果
            this.setCachedNamespaces(cacheKey, paths);
        } catch (error) {
            this.logger?.error('Failed to get namespace paths', error as Error, {
                namespace,
                basePathTemplate,
            });
        }

        return paths;
    }

    /**
     * 获取命名空间在工作区中的绝对路径（异步版本）
     *
     * @remarks
     * 推荐在性能敏感的场景使用此方法，避免阻塞主线程。
     *
     * @param namespace 命名空间
     * @param basePathTemplate 路径模板
     * @returns 路径列表
     */
    async getNamespacePathsAsync(namespace: string, basePathTemplate: string): Promise<string[]> {
        if (!this.isValidNamespace(namespace)) {
            return [];
        }

        // 生成缓存键
        const cacheKey = `paths:${namespace}:${basePathTemplate}`;
        const cached = this.getCachedNamespaces(cacheKey);
        if (cached) {
            return cached;
        }

        const paths: string[] = [];

        try {
            const workspaceFolders = workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return [];
            }

            // 将 {namespace} 替换为实际命名空间
            const resolvedPath = basePathTemplate.replace('{namespace}', namespace);

            // 并行检查所有路径
            const checkPromises: Promise<string | null>[] = [];

            // 1. 首先在发现的资源包中搜索
            const resourcePacks = ResourcePackDiscovery.discoverInWorkspace();
            for (const pack of resourcePacks) {
                const fullPath = path.join(pack.path, resolvedPath);
                checkPromises.push(this.checkPathExistsAsync(fullPath));
            }

            // 2. 然后在工作区根目录中搜索（保持向后兼容）
            for (const folder of workspaceFolders) {
                const fullPath = path.join(folder.uri.fsPath, resolvedPath);
                checkPromises.push(this.checkPathExistsAsync(fullPath));
            }

            // 并行等待所有检查完成
            const results = await Promise.all(checkPromises);
            for (const result of results) {
                if (result && !paths.includes(result)) {
                    paths.push(result);
                }
            }

            // 缓存结果
            this.setCachedNamespaces(cacheKey, paths);
        } catch (error) {
            this.logger?.error('Failed to get namespace paths', error as Error, {
                namespace,
                basePathTemplate,
            });
        }

        return paths;
    }

    /**
     * 异步检查路径是否存在
     *
     * @param fullPath 完整路径
     * @returns 如果存在返回路径，否则返回 null
     */
    private async checkPathExistsAsync(fullPath: string): Promise<string | null> {
        try {
            await fsPromises.access(fullPath);
            return fullPath;
        } catch {
            return null;
        }
    }

    // ==================== 验证方法 ====================

    /**
     * 检查名称是否是有效的 Minecraft 命名空间
     */
    isValidNamespace(name: string): boolean {
        if (!name || typeof name !== 'string') {
            return false;
        }
        return NamespaceDiscoveryService.VALID_NAMESPACE_PATTERN.test(name);
    }

    /**
     * 检查路径是否是有效的 Minecraft 资源路径
     */
    isValidPath(resourcePath: string): boolean {
        if (!resourcePath || typeof resourcePath !== 'string') {
            return false;
        }
        if (resourcePath.length === 0) {
            return false;
        }
        return NamespaceDiscoveryService.VALID_PATH_PATTERN.test(resourcePath);
    }

    /**
     * 检查资源位置字符串是否有效
     */
    isValidResourceLocation(resourceLocation: string): boolean {
        const parsed = this.parseResourceLocation(resourceLocation);
        return parsed.isValid;
    }

    // ==================== 资源位置操作 ====================

    /**
     * 解析资源位置字符串
     */
    parseResourceLocation(resourceLocation: string): IResourceLocation {
        if (!resourceLocation || typeof resourceLocation !== 'string') {
            return {
                namespace: null,
                path: '',
                isValid: false,
                error: 'Resource location is empty or not a string',
            };
        }

        const trimmed = resourceLocation.trim();

        // 检查是否包含命名空间
        const match = trimmed.match(NamespaceDiscoveryService.RESOURCE_LOCATION_PATTERN);

        if (match) {
            const namespace = match[1];
            const resourcePath = match[2];

            // 验证命名空间
            if (!this.isValidNamespace(namespace)) {
                return {
                    namespace,
                    path: resourcePath,
                    isValid: false,
                    error: `Invalid namespace: "${namespace}". Namespace must start with a lowercase letter and contain only [a-z0-9_.-]`,
                };
            }

            // 验证路径
            if (!this.isValidPath(resourcePath)) {
                return {
                    namespace,
                    path: resourcePath,
                    isValid: false,
                    error: `Invalid path: "${resourcePath}". Path must contain only [a-z0-9_./-]`,
                };
            }

            return {
                namespace,
                path: resourcePath,
                isValid: true,
            };
        }

        // 没有命名空间，只有路径
        if (!this.isValidPath(trimmed)) {
            return {
                namespace: null,
                path: trimmed,
                isValid: false,
                error: `Invalid path: "${trimmed}". Path must contain only [a-z0-9_./-]`,
            };
        }

        return {
            namespace: null,
            path: trimmed,
            isValid: true,
        };
    }

    /**
     * 构建资源位置字符串
     */
    buildResourceLocation(namespace: string, resourcePath: string): string {
        if (!namespace) {
            return resourcePath;
        }
        return `${namespace}:${resourcePath}`;
    }

    /**
     * 规范化资源位置字符串
     */
    normalizeResourceLocation(resourceLocation: string, addDefaultNamespace: boolean = true): string | null {
        if (!resourceLocation || typeof resourceLocation !== 'string') {
            return null;
        }

        const trimmed = resourceLocation.trim().toLowerCase();

        // 规范化路径分隔符（将反斜杠转换为斜杠）
        const normalized = trimmed.replace(/\\/g, '/');

        // 解析资源位置
        const colonIndex = normalized.indexOf(':');

        let namespace: string;
        let resourcePath: string;

        if (colonIndex !== -1) {
            namespace = normalized.substring(0, colonIndex);
            resourcePath = normalized.substring(colonIndex + 1);
        } else {
            namespace = addDefaultNamespace ? this.getDefaultNamespace() : '';
            resourcePath = normalized;
        }

        // 规范化命名空间
        const normalizedNamespace = this.normalizeNamespace(namespace);
        if (namespace && !normalizedNamespace) {
            return null;
        }

        // 规范化路径
        const normalizedPath = this.normalizePath(resourcePath);
        if (!normalizedPath) {
            return null;
        }

        return this.buildResourceLocation(normalizedNamespace || '', normalizedPath);
    }

    /**
     * 比较两个资源位置是否相等
     */
    compareResourceLocations(location1: string, location2: string): boolean {
        const normalized1 = this.normalizeResourceLocation(location1, true);
        const normalized2 = this.normalizeResourceLocation(location2, true);

        if (!normalized1 || !normalized2) {
            return false;
        }

        return normalized1 === normalized2;
    }

    /**
     * 解析资源的完整文件系统路径（同步版本）
     *
     * @remarks
     * 优先返回缓存结果，如果缓存未命中则同步执行文件系统操作。
     * 对于性能敏感的场景，建议使用 resolveResourcePathsAsync。
     */
    resolveResourcePaths(resourceLocation: string, basePathTemplate: string, fileExtension?: string): string[] {
        const parsed = this.parseResourceLocation(resourceLocation);
        if (!parsed.isValid) {
            return [];
        }

        // 生成缓存键
        const cacheKey = `resource:${resourceLocation}:${basePathTemplate}:${fileExtension || ''}`;
        const cached = this.getCachedNamespaces(cacheKey);
        if (cached) {
            return cached;
        }

        const namespace = parsed.namespace || this.getDefaultNamespace();
        const resourcePath = parsed.path;

        const paths: string[] = [];

        try {
            const workspaceFolders = workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return [];
            }

            // 构建完整路径
            const resolvedTemplate = basePathTemplate.replace('{namespace}', namespace);
            const fileName = fileExtension
                ? `${resourcePath}${fileExtension.startsWith('.') ? fileExtension : '.' + fileExtension}`
                : resourcePath;

            // 1. 首先在发现的资源包中搜索
            const resourcePacks = ResourcePackDiscovery.discoverInWorkspace();
            for (const pack of resourcePacks) {
                const fullPath = path.join(pack.path, resolvedTemplate, fileName);
                if (fs.existsSync(fullPath) && !paths.includes(fullPath)) {
                    paths.push(fullPath);
                }
            }

            // 2. 然后在工作区根目录中搜索（保持向后兼容）
            for (const folder of workspaceFolders) {
                const fullPath = path.join(folder.uri.fsPath, resolvedTemplate, fileName);
                if (fs.existsSync(fullPath) && !paths.includes(fullPath)) {
                    paths.push(fullPath);
                }
            }

            // 缓存结果
            this.setCachedNamespaces(cacheKey, paths);
        } catch (error) {
            this.logger?.error('Failed to resolve resource paths', error as Error, {
                resourceLocation,
                basePathTemplate,
            });
        }

        return paths;
    }

    /**
     * 解析资源的完整文件系统路径（异步版本）
     *
     * @remarks
     * 推荐在性能敏感的场景使用此方法，避免阻塞主线程。
     *
     * @param resourceLocation 资源位置
     * @param basePathTemplate 路径模板
     * @param fileExtension 文件扩展名
     * @returns 路径列表
     */
    async resolveResourcePathsAsync(
        resourceLocation: string,
        basePathTemplate: string,
        fileExtension?: string,
    ): Promise<string[]> {
        const parsed = this.parseResourceLocation(resourceLocation);
        if (!parsed.isValid) {
            return [];
        }

        // 生成缓存键
        const cacheKey = `resource:${resourceLocation}:${basePathTemplate}:${fileExtension || ''}`;
        const cached = this.getCachedNamespaces(cacheKey);
        if (cached) {
            return cached;
        }

        const namespace = parsed.namespace || this.getDefaultNamespace();
        const resourcePath = parsed.path;

        const paths: string[] = [];

        try {
            const workspaceFolders = workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return [];
            }

            // 构建完整路径
            const resolvedTemplate = basePathTemplate.replace('{namespace}', namespace);
            const fileName = fileExtension
                ? `${resourcePath}${fileExtension.startsWith('.') ? fileExtension : '.' + fileExtension}`
                : resourcePath;

            // 并行检查所有路径
            const checkPromises: Promise<string | null>[] = [];

            // 1. 首先在发现的资源包中搜索
            const resourcePacks = ResourcePackDiscovery.discoverInWorkspace();
            for (const pack of resourcePacks) {
                const fullPath = path.join(pack.path, resolvedTemplate, fileName);
                checkPromises.push(this.checkPathExistsAsync(fullPath));
            }

            // 2. 然后在工作区根目录中搜索（保持向后兼容）
            for (const folder of workspaceFolders) {
                const fullPath = path.join(folder.uri.fsPath, resolvedTemplate, fileName);
                checkPromises.push(this.checkPathExistsAsync(fullPath));
            }

            // 并行等待所有检查完成
            const results = await Promise.all(checkPromises);
            for (const result of results) {
                if (result && !paths.includes(result)) {
                    paths.push(result);
                }
            }

            // 缓存结果
            this.setCachedNamespaces(cacheKey, paths);
        } catch (error) {
            this.logger?.error('Failed to resolve resource paths', error as Error, {
                resourceLocation,
                basePathTemplate,
            });
        }

        return paths;
    }

    // ==================== 规范化方法 ====================

    /**
     * 规范化命名空间名称
     */
    normalizeNamespace(name: string): string | null {
        if (!name || typeof name !== 'string') {
            return null;
        }

        // 去除前后空格并转换为小写
        let normalized = name.trim().toLowerCase();

        // 替换空格和无效字符为下划线
        normalized = normalized.replace(/[\s]+/g, '_');
        normalized = normalized.replace(/[^a-z0-9_.-]/g, '_');

        // 确保以字母开头
        if (!/^[a-z]/.test(normalized)) {
            // 尝试添加前缀
            normalized = 'ns_' + normalized;
        }

        // 清理连续的下划线
        normalized = normalized.replace(/_+/g, '_');

        // 验证最终结果
        if (!this.isValidNamespace(normalized)) {
            return null;
        }

        return normalized;
    }

    /**
     * 规范化资源路径
     */
    normalizePath(resourcePath: string): string | null {
        if (!resourcePath || typeof resourcePath !== 'string') {
            return null;
        }

        // 去除前后空格并转换为小写
        let normalized = resourcePath.trim().toLowerCase();

        // 规范化路径分隔符
        normalized = normalized.replace(/\\/g, '/');

        // 移除开头和结尾的斜杠
        normalized = normalized.replace(/^\/+|\/+$/g, '');

        // 清理连续的斜杠
        normalized = normalized.replace(/\/+/g, '/');

        // 替换无效字符
        normalized = normalized.replace(/[^a-z0-9_./-]/g, '_');

        // 验证最终结果
        if (!normalized || !this.isValidPath(normalized)) {
            return null;
        }

        return normalized;
    }

    // ==================== 默认值和缓存 ====================

    /**
     * 获取默认命名空间
     */
    getDefaultNamespace(): string {
        return NamespaceDiscoveryService.DEFAULT_NAMESPACE;
    }

    /**
     * 清除命名空间缓存
     */
    clearCache(): void {
        this.namespaceCache.clear();
        this.logger?.debug('Namespace cache cleared');
    }

    // ==================== 私有辅助方法 ====================

    /**
     * 从路径模板提取父目录
     */
    private extractParentDir(basePathTemplate: string): string | null {
        const namespaceIndex = basePathTemplate.indexOf('{namespace}');
        if (namespaceIndex === -1) {
            this.logger?.warn('Invalid basePathTemplate, missing {namespace} placeholder', {
                basePathTemplate,
            });
            return null;
        }

        return basePathTemplate.substring(0, namespaceIndex).replace(/\/$/, '');
    }

    /**
     * 从缓存获取命名空间
     */
    private getCachedNamespaces(key: string): string[] | null {
        const cached = this.namespaceCache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            this.logger?.debug('Using cached namespaces', { key, count: cached.namespaces.length });
            return cached.namespaces;
        }
        return null;
    }

    /**
     * 设置命名空间缓存（LRUCache 自动处理容量淘汰）
     */
    private setCachedNamespaces(key: string, namespaces: string[]): void {
        this.namespaceCache.set(key, {
            namespaces,
            timestamp: Date.now(),
        });
    }
}
