import { CancellationToken, workspace } from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ILogger } from '../../../../core/interfaces/ILogger';
import { INamespaceDiscoveryService } from '../../../../core/interfaces/INamespaceDiscoveryService';
import { IFilePathCompletionOptions } from '../FilePathCompletionStrategy';

/**
 * 带命名空间的文件信息
 */
export interface INamespacedFile {
    /** 命名空间 */
    namespace: string;
    /** 相对路径 */
    relativePath: string;
}

/**
 * 文件系统扫描器
 *
 * 负责扫描工作区中的 Minecraft 资源包文件，支持命名空间发现、
 * 递归目录扫描、路径安全检查和通配符排除模式。
 *
 * @remarks
 * 此类从 FilePathCompletionStrategy 中提取，专注于文件系统扫描逻辑。
 * 扫描结果通过内部缓存避免重复 I/O 操作。
 * 所有文件系统操作均为异步，避免阻塞主线程。
 */
export class FileScanner {
    private readonly logger: ILogger;
    private readonly namespaceService: INamespaceDiscoveryService;

    /** 缓存已扫描的文件路径 */
    private readonly fileCache = new Map<string, { files: string[]; timestamp: number }>();

    /** 缓存 TTL（毫秒） */
    private cacheTTL: number;

    /** 最大并发数 */
    private static readonly MAX_CONCURRENCY = 4;

    constructor(
        logger: ILogger,
        namespaceService: INamespaceDiscoveryService,
        cacheTTL: number
    ) {
        this.logger = logger;
        this.namespaceService = namespaceService;
        this.cacheTTL = cacheTTL;
    }

    /**
     * 更新缓存 TTL
     *
     * @param ttl 新的 TTL 值（毫秒）
     */
    setCacheTTL(ttl: number): void {
        this.cacheTTL = ttl;
    }

    /**
     * 扫描所有命名空间的文件
     *
     * 根据 Minecraft 资源包结构自动检测命名空间：
     * - assets/{namespace}/models/...
     * - data/{namespace}/loot_tables/...
     *
     * @param options 补全选项
     * @param token 取消令牌
     * @returns 带命名空间的文件列表
     */
    async scanAllNamespaceFiles(
        options: IFilePathCompletionOptions,
        token?: CancellationToken
    ): Promise<INamespacedFile[]> {
        if (!options.basePath) {
            return [];
        }

        // 生成缓存键（不包含特定命名空间，因为我们扫描所有）
        const cacheKey = `all:${options.basePath}:${options.fileExtensions?.join(',')}`;

        // 检查缓存
        const cached = this.fileCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            this.logger.debug('Using cached file list', { cacheKey, count: cached.files.length });
            // 缓存的格式是 "namespace:path"，需要解析
            return cached.files.map(f => {
                const colonIdx = f.indexOf(':');
                return {
                    namespace: f.substring(0, colonIdx),
                    relativePath: f.substring(colonIdx + 1)
                };
            });
        }

        const results: INamespacedFile[] = [];

        try {
            const workspaceFolders = workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return [];
            }

            // 解析 basePath 模板，提取命名空间目录的父路径
            // 例如 "assets/{namespace}/models" -> parentDir = "assets", subPath = "models"
            const basePathParts = options.basePath.split('{namespace}');
            if (basePathParts.length !== 2) {
                this.logger.warn('Invalid basePath format, missing {namespace} placeholder', {
                    basePath: options.basePath
                });
                return [];
            }

            const parentDir = basePathParts[0].replace(/\/$/, ''); // 例如 "assets"
            const subPath = basePathParts[1].replace(/^\//, '');   // 例如 "models"

            for (const folder of workspaceFolders) {
                if (token?.isCancellationRequested) {
                    break;
                }

                const parentPath = path.join(folder.uri.fsPath, parentDir);

                // 异步检查目录是否存在
                if (!await this.directoryExistsAsync(parentPath)) {
                    continue;
                }

                // 读取所有命名空间目录（使用异步版本）
                const namespaces: string[] = this.namespaceService.discoverNamespacesAsync
                    ? await this.namespaceService.discoverNamespacesAsync(parentPath)
                    : this.namespaceService.discoverNamespaces(parentPath);

                this.logger.debug('Discovered namespaces', {
                    parentPath,
                    namespaces
                });

                // 并行扫描每个命名空间目录下的文件（限制并发数）
                for (let i = 0; i < namespaces.length; i += FileScanner.MAX_CONCURRENCY) {
                    if (token?.isCancellationRequested) {
                        break;
                    }

                    const batch = namespaces.slice(i, i + FileScanner.MAX_CONCURRENCY);
                    const batchPromises = batch.map(async (namespace) => {
                        const searchPath = path.join(parentPath, namespace, subPath);

                        if (!await this.directoryExistsAsync(searchPath)) {
                            return [];
                        }

                        const foundFiles = await this.scanDirectory(
                            searchPath,
                            '',
                            options,
                            0,
                            token
                        );

                        // 为每个文件添加命名空间
                        return foundFiles.map(file => ({
                            namespace,
                            relativePath: file
                        }));
                    });

                    const batchResults = await Promise.all(batchPromises);
                    for (const files of batchResults) {
                        results.push(...files);
                    }
                }
            }

            // 缓存结果（以 "namespace:path" 格式存储）
            this.fileCache.set(cacheKey, {
                files: results.map(r => `${r.namespace}:${r.relativePath}`),
                timestamp: Date.now()
            });

        } catch (error) {
            this.logger.error('Failed to scan files', error as Error, {
                basePath: options.basePath
            });
        }

        return results;
    }

    /**
     * 递归扫描目录
     *
     * @param basePath 基础路径（已验证安全）
     * @param relativePath 相对路径
     * @param options 补全选项
     * @param depth 当前深度
     * @param token 取消令牌
     * @returns 匹配的文件相对路径列表
     */
    async scanDirectory(
        basePath: string,
        relativePath: string,
        options: IFilePathCompletionOptions,
        depth: number,
        token?: CancellationToken
    ): Promise<string[]> {
        if (token?.isCancellationRequested) {
            return [];
        }

        if (depth >= (options.searchDepth || 5)) {
            return [];
        }

        const files: string[] = [];

        // 安全检查：验证相对路径不包含路径遍历
        if (this.containsPathTraversal(relativePath)) {
            this.logger.warn('Path traversal detected in scan', { relativePath });
            return [];
        }

        const currentPath = path.join(basePath, relativePath);

        // 安全检查：确保解析后的路径仍在基础路径内
        const normalizedBase = path.normalize(basePath);
        const normalizedCurrent = path.normalize(currentPath);
        if (!normalizedCurrent.startsWith(normalizedBase)) {
            this.logger.warn('Path traversal detected after resolution', {
                basePath: normalizedBase,
                currentPath: normalizedCurrent
            });
            return [];
        }

        try {
            const entries = await fs.readdir(currentPath, { withFileTypes: true });

            for (const entry of entries) {
                if (token?.isCancellationRequested) {
                    break;
                }

                // 安全检查：验证文件名不包含路径遍历字符
                if (this.containsPathTraversal(entry.name)) {
                    continue;
                }

                const entryRelativePath = relativePath
                    ? `${relativePath}${options.pathSeparator || '/'}${entry.name}`
                    : entry.name;

                if (entry.isDirectory()) {
                    // 检查是否应该排除
                    if (this.shouldExclude(entryRelativePath, options.excludePatterns)) {
                        continue;
                    }

                    if (options.includeSubdirectories !== false) {
                        const subFiles = await this.scanDirectory(
                            basePath,
                            entryRelativePath,
                            options,
                            depth + 1,
                            token
                        );
                        files.push(...subFiles);
                    }
                } else if (entry.isFile()) {
                    // 检查文件扩展名
                    const ext = path.extname(entry.name).toLowerCase();
                    if (options.fileExtensions && !options.fileExtensions.includes(ext)) {
                        continue;
                    }

                    // 检查是否应该排除
                    if (this.shouldExclude(entryRelativePath, options.excludePatterns)) {
                        continue;
                    }

                    // 根据选项处理路径
                    let resultPath = entryRelativePath;
                    if (options.stripExtension) {
                        resultPath = resultPath.replace(/\.[^/.]+$/, '');
                    }

                    files.push(resultPath);
                }
            }
        } catch (error) {
            this.logger.debug('Failed to scan directory', {
                path: currentPath,
                error: (error as Error).message
            });
        }

        return files;
    }

    /**
     * 检查路径是否包含路径遍历字符
     *
     * @param pathStr 要检查的路径
     * @returns 如果包含路径遍历字符返回 true
     */
    private containsPathTraversal(pathStr: string): boolean {
        if (!pathStr) {
            return false;
        }
        // 检查 .. 和绝对路径
        const normalized = path.normalize(pathStr);
        return normalized.includes('..') || path.isAbsolute(pathStr);
    }

    /**
     * 检查是否应该排除
     *
     * @param filePath 文件路径
     * @param patterns 排除模式列表
     * @returns 如果应该排除返回 true
     */
    shouldExclude(filePath: string, patterns?: string[]): boolean {
        if (!patterns || patterns.length === 0) {
            return false;
        }

        // 简单的通配符匹配
        for (const pattern of patterns) {
            // 处理 ** 模式
            if (pattern.includes('**')) {
                const regexPattern = pattern
                    .replace(/\*\*/g, '.*')
                    .replace(/\*/g, '[^/]*')
                    .replace(/\?/g, '.');
                if (new RegExp(`^${regexPattern}$`).test(filePath)) {
                    return true;
                }
            } else if (pattern.startsWith('*')) {
                // 后缀匹配
                if (filePath.endsWith(pattern.substring(1))) {
                    return true;
                }
            } else if (pattern.endsWith('*')) {
                // 前缀匹配
                if (filePath.startsWith(pattern.substring(0, pattern.length - 1))) {
                    return true;
                }
            } else if (filePath.includes(pattern)) {
                return true;
            }
        }

        return false;
    }

    /**
     * 过滤带命名空间的文件
     *
     * 使用 NamespaceDiscoveryService.isValidNamespace 验证命名空间
     * 使用 NamespaceDiscoveryService.buildResourceLocation 构建完整路径
     *
     * @param files 所有文件（带命名空间）
     * @param namespaceFilter 命名空间过滤器（如果用户已输入命名空间）
     * @param pathPrefix 路径前缀
     * @returns 过滤后的文件列表
     */
    filterNamespacedFiles(
        files: INamespacedFile[],
        namespaceFilter: string | null,
        pathPrefix: string
    ): INamespacedFile[] {
        return files.filter(file => {
            // 验证文件的命名空间是否有效
            if (!this.namespaceService.isValidNamespace(file.namespace)) {
                return false;
            }

            // 如果指定了命名空间过滤器，必须匹配
            if (namespaceFilter) {
                if (!file.namespace.toLowerCase().startsWith(namespaceFilter.toLowerCase())) {
                    return false;
                }
            }

            // 如果有路径前缀，检查路径是否匹配
            if (pathPrefix) {
                const lowerPrefix = pathPrefix.toLowerCase();
                // 检查路径是否以前缀开始
                if (!file.relativePath.toLowerCase().startsWith(lowerPrefix)) {
                    // 如果没有命名空间过滤器，也检查完整路径（namespace:path）
                    if (!namespaceFilter) {
                        // 使用服务构建完整路径
                        const fullPath = this.namespaceService.buildResourceLocation(
                            file.namespace,
                            file.relativePath
                        ).toLowerCase();
                        if (!fullPath.startsWith(lowerPrefix)) {
                            return false;
                        }
                    } else {
                        return false;
                    }
                }
            }

            return true;
        });
    }

    /**
     * 清除缓存
     */
    clearCache(): void {
        this.fileCache.clear();
        this.logger.debug('File scanner cache cleared');
    }

    /**
     * 异步检查目录是否存在
     *
     * @param dirPath 目录路径
     * @returns 如果目录存在返回 true
     */
    private async directoryExistsAsync(dirPath: string): Promise<boolean> {
        try {
            const stat = await fs.stat(dirPath);
            return stat.isDirectory();
        } catch {
            return false;
        }
    }
}
