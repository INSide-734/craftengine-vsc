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
import { NamespaceValidator, ResourceLocationParser, NamespaceCache } from './namespace';

// 重新导出接口，保持向后兼容
export { INamespaceDiscoveryService, IResourceLocation } from '../../core/interfaces/INamespaceDiscoveryService';

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
    /** 命名空间验证器 */
    private readonly validator: NamespaceValidator;
    /** 资源位置解析器 */
    private readonly parser: ResourceLocationParser;
    /** 命名空间缓存 */
    private readonly cache: NamespaceCache;
    /** 配置是否已加载 */
    private configLoaded = false;
    /** 配置加载器 */
    private configLoader: IDataConfigLoader | null = null;

    constructor(
        private readonly logger?: ILogger,
        configLoader?: IDataConfigLoader,
    ) {
        this.validator = new NamespaceValidator();
        this.parser = new ResourceLocationParser(this.validator);
        this.cache = new NamespaceCache(logger);
        this.configLoader = configLoader || null;
        // 异步加载配置（fire and forget）
        if (this.configLoader) {
            void this.loadConfig();
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
            this.cache.setCacheTTL(timingConfig.cache.namespaceDiscoveryCacheTTL);
            this.configLoaded = true;

            this.logger?.debug('Config loaded', { cacheTTL: this.cache.getCacheTTL() });
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
        const cached = this.cache.get(parentPath);
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
                .filter((name) => this.validator.isValidNamespace(name))
                .sort();

            // 缓存结果
            this.cache.set(parentPath, namespaces);

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
        const cached = this.cache.get(parentPath);
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
                .filter((name) => this.validator.isValidNamespace(name))
                .sort();

            // 缓存结果
            this.cache.set(parentPath, namespaces);

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
        const cached = this.cache.get(cacheKey);
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
            this.cache.set(cacheKey, result);

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
        if (!this.validator.isValidNamespace(namespace)) {
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
        if (!this.validator.isValidNamespace(namespace)) {
            return [];
        }

        // 生成缓存键
        const cacheKey = `paths:${namespace}:${basePathTemplate}`;
        const cached = this.cache.get(cacheKey);
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
            this.cache.set(cacheKey, paths);
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
        if (!this.validator.isValidNamespace(namespace)) {
            return [];
        }

        // 生成缓存键
        const cacheKey = `paths:${namespace}:${basePathTemplate}`;
        const cached = this.cache.get(cacheKey);
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
            this.cache.set(cacheKey, paths);
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

    // ==================== 验证方法（委托给 validator） ====================

    /**
     * 检查名称是否是有效的 Minecraft 命名空间
     */
    isValidNamespace(name: string): boolean {
        return this.validator.isValidNamespace(name);
    }

    /**
     * 检查路径是否是有效的 Minecraft 资源路径
     */
    isValidPath(resourcePath: string): boolean {
        return this.validator.isValidPath(resourcePath);
    }

    /**
     * 检查资源位置字符串是否有效
     */
    isValidResourceLocation(resourceLocation: string): boolean {
        return this.parser.isValidResourceLocation(resourceLocation);
    }

    // ==================== 资源位置操作（委托给 parser） ====================

    /**
     * 解析资源位置字符串
     */
    parseResourceLocation(resourceLocation: string): IResourceLocation {
        return this.parser.parseResourceLocation(resourceLocation);
    }

    /**
     * 构建资源位置字符串
     */
    buildResourceLocation(namespace: string, resourcePath: string): string {
        return this.parser.buildResourceLocation(namespace, resourcePath);
    }

    /**
     * 规范化资源位置字符串
     */
    normalizeResourceLocation(resourceLocation: string, addDefaultNamespace: boolean = true): string | null {
        return this.parser.normalizeResourceLocation(resourceLocation, addDefaultNamespace);
    }

    /**
     * 比较两个资源位置是否相等
     */
    compareResourceLocations(location1: string, location2: string): boolean {
        return this.parser.compareResourceLocations(location1, location2);
    }

    /**
     * 解析资源的完整文件系统路径（同步版本）
     *
     * @remarks
     * 优先返回缓存结果，如果缓存未命中则同步执行文件系统操作。
     * 对于性能敏感的场景，建议使用 resolveResourcePathsAsync。
     */
    resolveResourcePaths(resourceLocation: string, basePathTemplate: string, fileExtension?: string): string[] {
        const parsed = this.parser.parseResourceLocation(resourceLocation);
        if (!parsed.isValid) {
            return [];
        }

        // 生成缓存键
        const cacheKey = `resource:${resourceLocation}:${basePathTemplate}:${fileExtension || ''}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const namespace = parsed.namespace || this.parser.getDefaultNamespace();
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
            this.cache.set(cacheKey, paths);
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
        const parsed = this.parser.parseResourceLocation(resourceLocation);
        if (!parsed.isValid) {
            return [];
        }

        // 生成缓存键
        const cacheKey = `resource:${resourceLocation}:${basePathTemplate}:${fileExtension || ''}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const namespace = parsed.namespace || this.parser.getDefaultNamespace();
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
            this.cache.set(cacheKey, paths);
        } catch (error) {
            this.logger?.error('Failed to resolve resource paths', error as Error, {
                resourceLocation,
                basePathTemplate,
            });
        }

        return paths;
    }

    // ==================== 规范化方法（委托给 validator） ====================

    /**
     * 规范化命名空间名称
     */
    normalizeNamespace(name: string): string | null {
        return this.validator.normalizeNamespace(name);
    }

    /**
     * 规范化资源路径
     */
    normalizePath(resourcePath: string): string | null {
        return this.validator.normalizePath(resourcePath);
    }

    // ==================== 默认值和缓存 ====================

    /**
     * 获取默认命名空间
     */
    getDefaultNamespace(): string {
        return this.parser.getDefaultNamespace();
    }

    /**
     * 清除命名空间缓存
     */
    clearCache(): void {
        this.cache.clear();
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
}
