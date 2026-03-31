import {
    type TextDocument,
    type DiagnosticCollection,
    Diagnostic,
    Range,
    Position,
    languages,
    type Disposable,
    Uri,
} from 'vscode';
import * as path from 'path';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { type ILogger } from '../../core/interfaces/ILogger';
import { type IConfiguration } from '../../core/interfaces/IConfiguration';
import { type IEventBus } from '../../core/interfaces/IEventBus';
import { type ISchemaService, type IJsonSchema } from '../../core/interfaces/ISchemaService';
import { type IYamlPathParser } from '../../core/interfaces/IYamlPathParser';
import { type IDataConfigLoader } from '../../core/interfaces/IDataConfigLoader';
import { type IFileReader, FileType } from '../../core/interfaces/IFileReader';
import { type IWorkspaceService } from '../../core/interfaces/IWorkspaceService';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { type PerformanceMonitor } from '../../infrastructure/performance/PerformanceMonitor';
import { calculateSimilarity } from '../../infrastructure/utils';
import { DiagnosticCache } from '../../infrastructure/cache/DiagnosticCache';
import {
    FILE_NOT_FOUND,
    INVALID_FILE_PATH,
    INVALID_NAMESPACE,
    INVALID_PATH,
} from '../../core/constants/DiagnosticCodes';
import { TYPE_VALIDATION_MESSAGES } from '../../core/constants/DiagnosticMessages';
import { DiagnosticSeverityConfig } from '../../infrastructure/config/DiagnosticSeverityConfig';

/** Diagnostic 扩展类型，支持 data 属性 */
type DiagnosticWithData = Diagnostic & { data: unknown };

/**
 * 文件路径诊断信息
 */
export interface IFilePathDiagnosticData {
    /** 诊断类型 */
    type: 'file-not-found' | 'namespace-not-found' | 'invalid-format';
    /** 输入的路径 */
    inputPath: string;
    /** 命名空间 */
    namespace?: string;
    /** 相对路径 */
    relativePath?: string;
    /** 资源类型 */
    resourceType?: string;
    /** 基础路径模板 */
    basePath?: string;
    /** 相似路径建议 */
    suggestions?: string[];
}

/**
 * 文件路径诊断提供者
 *
 * 提供基于 Schema 配置的文件路径验证功能：
 * - 检测文件是否存在
 * - 验证命名空间是否有效
 * - 验证路径格式是否正确
 * - 提供相似路径建议
 *
 * @example
 * ```typescript
 * const provider = new FilePathDiagnosticProvider();
 * context.subscriptions.push(provider);
 * await provider.updateDiagnostics(document);
 * ```
 */
export class FilePathDiagnosticProvider implements Disposable {
    private readonly diagnosticCollection: DiagnosticCollection;
    private readonly logger: ILogger;
    private readonly configuration: IConfiguration;
    private readonly eventBus: IEventBus;
    private readonly schemaService: ISchemaService;
    private readonly pathParser: IYamlPathParser;
    private readonly performanceMonitor: PerformanceMonitor;
    private readonly configLoader: IDataConfigLoader;
    private readonly severityConfig: DiagnosticSeverityConfig;
    private readonly fileReader: IFileReader;
    private readonly workspaceService: IWorkspaceService;

    /** 默认诊断缓存配置 */
    private static readonly DEFAULT_CACHE_CAPACITY = 100;
    private static readonly DEFAULT_CACHE_TTL = 60000; // 60秒

    /** 默认文件存在性缓存 TTL */
    private static readonly DEFAULT_FILE_EXISTS_CACHE_TTL_FALLBACK = 10000; // 10秒

    // 使用通用诊断缓存
    private readonly diagnosticCache: DiagnosticCache<Diagnostic[]>;

    // 文件存在性缓存
    private readonly fileExistsCache = new Map<string, { exists: boolean; timestamp: number }>();

    // 配置
    private configLoaded = false;
    private fileExistsCacheTTL = FilePathDiagnosticProvider.DEFAULT_FILE_EXISTS_CACHE_TTL_FALLBACK;

    // 事件订阅句柄（用于 dispose 时清理）
    private readonly subscriptions: Array<{ unsubscribe: () => void }> = [];
    private readonly disposeFns: Array<() => void> = [];

    // Minecraft 资源位置格式正则
    // 根据 https://minecraft.wiki/w/Resource_location
    private readonly RESOURCE_LOCATION_PATTERN = /^([a-z][a-z0-9_.-]*):([a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*)$/;
    private readonly NAMESPACE_PATTERN = /^[a-z][a-z0-9_.-]*$/;
    private readonly PATH_PATTERN = /^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*$/;

    constructor() {
        this.diagnosticCollection = languages.createDiagnosticCollection('craftengine-filepath');
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild(
            'FilePathDiagnosticProvider',
        );
        this.configuration = ServiceContainer.getService<IConfiguration>(SERVICE_TOKENS.Configuration);
        this.eventBus = ServiceContainer.getService<IEventBus>(SERVICE_TOKENS.EventBus);
        this.schemaService = ServiceContainer.getService<ISchemaService>(SERVICE_TOKENS.SchemaService);
        this.pathParser = ServiceContainer.getService<IYamlPathParser>(SERVICE_TOKENS.YamlPathParser);
        this.performanceMonitor = ServiceContainer.getService<PerformanceMonitor>(SERVICE_TOKENS.PerformanceMonitor);
        this.configLoader = ServiceContainer.getService<IDataConfigLoader>(SERVICE_TOKENS.DataConfigLoader);
        this.fileReader = ServiceContainer.getService<IFileReader>(SERVICE_TOKENS.FileReader);
        this.workspaceService = ServiceContainer.getService<IWorkspaceService>(SERVICE_TOKENS.WorkspaceService);
        this.severityConfig = new DiagnosticSeverityConfig();

        // 初始化诊断缓存
        this.diagnosticCache = new DiagnosticCache<Diagnostic[]>(
            {
                capacity: FilePathDiagnosticProvider.DEFAULT_CACHE_CAPACITY,
                ttl: FilePathDiagnosticProvider.DEFAULT_CACHE_TTL,
                name: 'FilePathDiagnosticCache',
            },
            this.logger,
        );

        this.setupEventListeners();
    }

    /**
     * 确保配置已加载
     */
    private async ensureConfigLoaded(): Promise<void> {
        if (this.configLoaded) {
            return;
        }

        try {
            const timingConfig = await this.configLoader.loadTimingConfig();
            this.fileExistsCacheTTL = timingConfig.cache.fileExistsCacheTTL;
            this.configLoaded = true;

            this.logger.debug('Config loaded', { fileExistsCacheTTL: this.fileExistsCacheTTL });
        } catch (error) {
            this.logger.warn('Failed to load config, using defaults', { error });
        }
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners(): void {
        // 监听文件系统变更，清除缓存
        this.subscriptions.push(
            this.eventBus.subscribe('file.modified', () => {
                this.fileExistsCache.clear();
                this.diagnosticCache.clear();
            }),
        );

        // 监听配置变更
        this.disposeFns.push(
            this.configuration.onChange((event) => {
                if (event.key.startsWith('craftengine.diagnostics')) {
                    this.diagnosticCache.clear();
                }
            }),
        );
    }

    /**
     * 更新文档的诊断信息
     *
     * @param document 要验证的文档
     * @param _parsedDoc 预解析的文档（可选，当前未使用）
     */
    async updateDiagnostics(document: TextDocument, _parsedDoc?: unknown): Promise<void> {
        // 确保配置已加载
        await this.ensureConfigLoaded();
        const timer = this.performanceMonitor.startTimer('filepath-diagnostics.update');

        try {
            // 检查功能是否启用
            if (!this.configuration.get('craftengine.diagnostics.filePathValidation', true)) {
                this.logger.debug('File path validation is disabled');
                return;
            }

            // 只处理 YAML 文件
            if (document.languageId !== 'yaml') {
                return;
            }

            // 检查缓存
            const cacheKey = document.uri.toString();
            const cached = this.diagnosticCache.get(cacheKey, document.version);
            if (cached) {
                // 即使使用缓存，也要确保 UI 更新（修复诊断残留问题）
                this.diagnosticCollection.set(document.uri, cached);
                timer.stop({ success: 'true', fromCache: 'true' });
                return;
            }

            this.logger.debug('Updating file path diagnostics', {
                file: document.fileName,
                version: document.version,
            });

            const diagnostics: Diagnostic[] = [];

            // 扫描文档中的所有文件路径引用
            const pathReferences = await this.findFilePathReferences(document);

            // 验证每个路径
            for (const ref of pathReferences) {
                const pathDiagnostics = await this.validateFilePath(ref, document);
                diagnostics.push(...pathDiagnostics);
            }

            // 设置诊断
            this.diagnosticCollection.set(document.uri, diagnostics);

            // 缓存结果
            this.diagnosticCache.set(cacheKey, diagnostics, document.version);

            timer.stop({
                success: 'true',
                diagnosticsCount: diagnostics.length.toString(),
                pathsChecked: pathReferences.length.toString(),
            });
        } catch (error) {
            this.logger.error('Failed to update file path diagnostics', error as Error);
            timer.stop({ success: 'false', error: (error as Error).message });
        }
    }

    /**
     * 查找文档中的所有文件路径引用
     */
    private async findFilePathReferences(document: TextDocument): Promise<
        Array<{
            range: Range;
            value: string;
            yamlPath: string[];
            schema: IJsonSchema;
        }>
    > {
        const references: Array<{
            range: Range;
            value: string;
            yamlPath: string[];
            schema: IJsonSchema;
        }> = [];

        try {
            const text = document.getText();
            const lines = text.split('\n');

            for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                const line = lines[lineIndex];

                // 跳过注释和空行
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) {
                    continue;
                }

                // 查找键值对
                const colonIndex = line.indexOf(':');
                if (colonIndex === -1) {
                    continue;
                }

                const value = line.substring(colonIndex + 1).trim();
                if (!value) {
                    continue;
                }

                // 检查是否像是资源位置格式
                // 移除可能的引号
                const cleanValue = value.replace(/^["']|["']$/g, '');

                if (!this.looksLikeResourceLocation(cleanValue)) {
                    continue;
                }

                // 解析 YAML 路径
                const position = new Position(lineIndex, colonIndex + 1);
                const yamlPath = this.pathParser.parsePath(document, position);

                if (yamlPath.length === 0) {
                    continue;
                }

                // 获取 Schema
                const schema = await this.schemaService.getSchemaForPath(yamlPath);

                // 检查是否有 x-completion-provider: craftengine.filePath
                if (
                    !schema ||
                    this.schemaService.getCustomProperty(schema, 'completion-provider') !== 'craftengine.filePath'
                ) {
                    continue;
                }

                // 计算值的范围
                const valueStart =
                    colonIndex +
                    1 +
                    (line.substring(colonIndex + 1).length - line.substring(colonIndex + 1).trimStart().length);
                const valueEnd = valueStart + value.length;

                references.push({
                    range: new Range(lineIndex, valueStart, lineIndex, valueEnd),
                    value: cleanValue,
                    yamlPath,
                    schema,
                });
            }
        } catch (error) {
            this.logger.error('Failed to find file path references', error as Error);
        }

        return references;
    }

    /**
     * 检查字符串是否看起来像资源位置
     */
    private looksLikeResourceLocation(value: string): boolean {
        // 包含冒号（命名空间分隔符）或斜杠（路径分隔符）
        return value.includes(':') || value.includes('/');
    }

    /**
     * 验证文件路径
     */
    private async validateFilePath(
        ref: {
            range: Range;
            value: string;
            yamlPath: string[];
            schema: IJsonSchema;
        },
        _document: TextDocument,
    ): Promise<Diagnostic[]> {
        const diagnostics: Diagnostic[] = [];

        try {
            const options = (ref.schema['x-completion-options'] || {}) as {
                basePath?: string;
                fileExtensions?: string[];
                stripExtension?: boolean;
                resourceType?: string;
            };

            // 解析资源位置
            const parsed = this.parseResourceLocation(ref.value);

            if (!parsed) {
                // 格式错误
                const severity = this.severityConfig.getSeverity(INVALID_FILE_PATH.code);
                if (severity !== null) {
                    const diagnostic = new Diagnostic(
                        ref.range,
                        TYPE_VALIDATION_MESSAGES.invalidFilePath(ref.value),
                        severity,
                    );
                    diagnostic.code = INVALID_FILE_PATH.code;
                    diagnostic.source = 'CraftEngine File Path';
                    (diagnostic as DiagnosticWithData).data = {
                        type: 'invalid-format',
                        inputPath: ref.value,
                    } as IFilePathDiagnosticData;

                    diagnostics.push(diagnostic);
                }
                return diagnostics;
            }

            const { namespace, relativePath } = parsed;

            // 验证命名空间格式
            if (!this.NAMESPACE_PATTERN.test(namespace)) {
                const severity = this.severityConfig.getSeverity(INVALID_NAMESPACE.code);
                if (severity !== null) {
                    const diagnostic = new Diagnostic(
                        ref.range,
                        TYPE_VALIDATION_MESSAGES.invalidNamespace(namespace),
                        severity,
                    );
                    diagnostic.code = INVALID_NAMESPACE.code;
                    diagnostic.source = 'CraftEngine File Path';
                    (diagnostic as DiagnosticWithData).data = {
                        type: 'invalid-format',
                        inputPath: ref.value,
                        namespace,
                    } as IFilePathDiagnosticData;

                    diagnostics.push(diagnostic);
                }
                return diagnostics;
            }

            // 验证路径格式
            if (!this.PATH_PATTERN.test(relativePath)) {
                const severity = this.severityConfig.getSeverity(INVALID_PATH.code);
                if (severity !== null) {
                    const diagnostic = new Diagnostic(
                        ref.range,
                        TYPE_VALIDATION_MESSAGES.invalidPath(relativePath),
                        severity,
                    );
                    diagnostic.code = INVALID_PATH.code;
                    diagnostic.source = 'CraftEngine File Path';
                    (diagnostic as DiagnosticWithData).data = {
                        type: 'invalid-format',
                        inputPath: ref.value,
                        namespace,
                        relativePath,
                    } as IFilePathDiagnosticData;

                    diagnostics.push(diagnostic);
                }
                return diagnostics;
            }

            // 检查文件是否存在
            if (options.basePath) {
                const fileExists = await this.checkFileExists(namespace, relativePath, options);

                if (!fileExists.exists) {
                    const severity = this.severityConfig.getSeverity(FILE_NOT_FOUND.code);
                    if (severity !== null) {
                        // 查找相似路径
                        const suggestions = await this.findSimilarPaths(namespace, relativePath, options);

                        const suggestionText =
                            suggestions.length > 0 ? ` Did you mean: ${suggestions.slice(0, 3).join(', ')}?` : '';

                        const diagnostic = new Diagnostic(
                            ref.range,
                            TYPE_VALIDATION_MESSAGES.fileNotFound(ref.value) + suggestionText,
                            severity,
                        );
                        diagnostic.code = FILE_NOT_FOUND.code;
                        diagnostic.source = 'CraftEngine File Path';
                        (diagnostic as DiagnosticWithData).data = {
                            type: 'file-not-found',
                            inputPath: ref.value,
                            namespace,
                            relativePath,
                            resourceType: options.resourceType,
                            basePath: options.basePath,
                            suggestions,
                        } as IFilePathDiagnosticData;

                        diagnostics.push(diagnostic);
                    }
                }
            }
        } catch (error) {
            this.logger.error('Failed to validate file path', error as Error, {
                value: ref.value,
            });
        }

        return diagnostics;
    }

    /**
     * 解析资源位置
     */
    private parseResourceLocation(value: string): { namespace: string; relativePath: string } | null {
        const match = value.match(this.RESOURCE_LOCATION_PATTERN);
        if (match) {
            return {
                namespace: match[1],
                relativePath: match[2],
            };
        }

        // 尝试解析没有命名空间的格式（使用默认 minecraft）
        if (this.PATH_PATTERN.test(value)) {
            return {
                namespace: 'minecraft',
                relativePath: value,
            };
        }

        return null;
    }

    /**
     * 检查文件是否存在
     *
     * @param namespace 命名空间
     * @param relativePath 相对路径
     * @param options 选项
     */
    private async checkFileExists(
        namespace: string,
        relativePath: string,
        options: { basePath?: string; fileExtensions?: string[]; stripExtension?: boolean },
    ): Promise<{ exists: boolean; absolutePath?: string }> {
        const workspaceFolders = this.workspaceService.getWorkspaceFolders();
        if (workspaceFolders.length === 0) {
            return { exists: false };
        }

        // 安全检查：验证命名空间和路径不包含路径遍历
        if (this.containsPathTraversal(namespace) || this.containsPathTraversal(relativePath)) {
            this.logger.warn('Path traversal detected in file check', { namespace, relativePath });
            return { exists: false };
        }

        // 构建文件路径
        const basePath = (options.basePath || '').replace('{namespace}', namespace);
        const fileExtensions = options.fileExtensions || ['.json'];
        const stripExtension = options.stripExtension !== false;

        for (const folder of workspaceFolders) {
            for (const ext of fileExtensions) {
                const fileName = stripExtension ? `${relativePath}${ext}` : relativePath;
                const absolutePath = path.join(folder.uri.fsPath, basePath, fileName);

                // 安全检查：确保解析后的路径仍在工作区内
                const normalizedWorkspace = path.normalize(folder.uri.fsPath);
                const normalizedAbsolute = path.normalize(absolutePath);
                if (!normalizedAbsolute.startsWith(normalizedWorkspace)) {
                    this.logger.warn('Path traversal detected after resolution', {
                        workspace: normalizedWorkspace,
                        absolutePath: normalizedAbsolute,
                    });
                    continue;
                }

                // 检查缓存
                const cacheKey = absolutePath;
                const cached = this.fileExistsCache.get(cacheKey);
                if (cached && Date.now() - cached.timestamp < this.fileExistsCacheTTL) {
                    if (cached.exists) {
                        return { exists: true, absolutePath };
                    }
                    continue;
                }

                // 检查文件
                const fileUri = Uri.file(absolutePath);
                const exists = await this.fileReader.exists(fileUri);

                // 更新缓存
                this.fileExistsCache.set(cacheKey, {
                    exists,
                    timestamp: Date.now(),
                });

                if (exists) {
                    return { exists: true, absolutePath };
                }
            }
        }

        return { exists: false };
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
     * 查找相似路径
     */
    private async findSimilarPaths(
        namespace: string,
        relativePath: string,
        options: { basePath?: string; fileExtensions?: string[]; stripExtension?: boolean },
    ): Promise<string[]> {
        const suggestions: string[] = [];

        try {
            const workspaceFolders = this.workspaceService.getWorkspaceFolders();
            if (workspaceFolders.length === 0) {
                return suggestions;
            }

            const basePath = (options.basePath || '').replace('{namespace}', namespace);
            const fileExtensions = options.fileExtensions || ['.json'];
            const stripExtension = options.stripExtension !== false;

            // 获取路径的目录部分和文件名部分
            const pathParts = relativePath.split('/');
            const fileName = pathParts.pop() || '';
            const dirPath = pathParts.join('/');

            for (const folder of workspaceFolders) {
                const searchDir = path.join(folder.uri.fsPath, basePath, dirPath);
                const searchDirUri = Uri.file(searchDir);

                // 检查目录是否存在
                const dirExists = await this.fileReader.exists(searchDirUri);
                if (!dirExists) {
                    continue;
                }

                try {
                    const entries = await this.fileReader.readDirectory(searchDirUri);

                    for (const entry of entries) {
                        if (entry.type !== FileType.File) {
                            continue;
                        }

                        // 检查文件扩展名
                        const ext = path.extname(entry.name);
                        if (!fileExtensions.includes(ext)) {
                            continue;
                        }

                        // 计算相似度
                        const entryName = stripExtension ? entry.name.replace(/\.[^/.]+$/, '') : entry.name;

                        const similarity = calculateSimilarity(fileName, entryName);

                        if (similarity > 0.5) {
                            const suggestionPath = dirPath
                                ? `${namespace}:${dirPath}/${entryName}`
                                : `${namespace}:${entryName}`;
                            suggestions.push(suggestionPath);
                        }
                    }
                } catch {
                    // 忽略读取错误
                }
            }

            // 按相似度排序
            suggestions.sort((a, b) => {
                const aName = a.split('/').pop() || '';
                const bName = b.split('/').pop() || '';
                return calculateSimilarity(fileName, bName) - calculateSimilarity(fileName, aName);
            });
        } catch (error) {
            this.logger.error('Failed to find similar paths', error as Error);
        }

        return suggestions.slice(0, 5);
    }

    /**
     * 清除所有缓存
     */
    clearCache(): void;
    /**
     * 清除指定文档的诊断缓存（不清除 UI 上的诊断）
     *
     * 用于强制下次更新时重新验证
     */
    clearCache(uri: Uri): void;
    clearCache(uri?: Uri): void {
        if (uri) {
            this.diagnosticCache.delete(uri.toString());
        } else {
            this.diagnosticCache.clear();
            this.fileExistsCache.clear();
            this.logger.debug('File path diagnostic cache cleared');
        }
    }

    /**
     * 清除指定文档的诊断
     */
    clearDiagnostics(uri: Uri): void {
        this.diagnosticCollection.delete(uri);
        this.diagnosticCache.delete(uri.toString());
    }

    /**
     * 获取缓存统计信息
     */
    getCacheStats(): { size: number; hits: number; misses: number; hitRate: number } {
        return this.diagnosticCache.getStats();
    }

    /**
     * 释放资源
     */
    dispose(): void {
        // 取消事件订阅
        for (const sub of this.subscriptions) {
            sub.unsubscribe();
        }
        this.subscriptions.length = 0;
        for (const fn of this.disposeFns) {
            fn();
        }
        this.disposeFns.length = 0;

        this.diagnosticCollection.dispose();
        this.diagnosticCache.clear();
        this.fileExistsCache.clear();
    }
}
