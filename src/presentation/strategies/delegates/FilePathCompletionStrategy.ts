import { CompletionItem, CompletionItemKind, MarkdownString, type CancellationToken } from 'vscode';
import * as fs from 'fs';
import { ServiceContainer } from '../../../infrastructure/ServiceContainer';
import {
    type ICompletionStrategy,
    type ICompletionContextInfo,
    type ICompletionResult,
} from '../../../core/interfaces/ICompletionStrategy';
import { type ILogger } from '../../../core/interfaces/ILogger';
import {
    type IDataConfigLoader,
    type IResourceTypePresetsConfig,
    type IResourceTypePreset,
} from '../../../core/interfaces/IDataConfigLoader';
import { SERVICE_TOKENS } from '../../../core/constants/ServiceTokens';
import { type INamespaceDiscoveryService } from '../../../core/interfaces/INamespaceDiscoveryService';
import { type CompletionItemWithStrategy, type FilePathCompletionItem } from '../../types/CompletionTypes';
import { FileScanner } from './helpers/FileScanner';

/**
 * 文件路径补全选项接口
 *
 * 这些选项从 Schema 的 x-completion-options 中读取
 */
export interface IFilePathCompletionOptions {
    /** 资源类型（用于预设配置） */
    resourceType?:
        | 'model'
        | 'texture'
        | 'sound'
        | 'loot_table'
        | 'recipe'
        | 'advancement'
        | 'function'
        | 'structure'
        | 'custom';
    /** 基础路径模板，支持 {namespace} 占位符 */
    basePath?: string;
    /** 允许的文件扩展名 */
    fileExtensions?: string[];
    /** 是否在补全结果中包含命名空间前缀 */
    includeNamespace?: boolean;
    /** 默认命名空间 */
    defaultNamespace?: string;
    /** 是否移除文件扩展名 */
    stripExtension?: boolean;
    /** 最大搜索深度 */
    searchDepth?: number;
    /** 路径分隔符 */
    pathSeparator?: string;
    /** 排除的模式 */
    excludePatterns?: string[];
    /** 是否包含子目录结构 */
    includeSubdirectories?: boolean;
    /** 是否自动检测工作区 */
    autoDetectWorkspace?: boolean;
}

/**
 * 文件路径补全委托策略
 *
 * 提供基于 Schema 配置的文件路径补全功能，支持 Minecraft 资源包路径格式。
 * 此策略由 SchemaAwareCompletionStrategy 委托调用，不直接激活。
 *
 * 支持从 JSON 配置文件动态加载资源类型预设
 *
 * @remarks
 * **Schema 配置示例**：
 * ```json
 * {
 *   "path": {
 *     "type": "string",
 *     "x-completion-provider": "craftengine.filePath",
 *     "x-completion-options": {
 *       "resourceType": "model",
 *       "includeNamespace": true
 *     }
 *   }
 * }
 * ```
 *
 * **支持的资源类型**：
 * - model: 模型文件 (assets/{namespace}/models)
 * - texture: 贴图文件 (assets/{namespace}/textures)
 * - sound: 音效文件 (assets/{namespace}/sounds)
 * - loot_table: 战利品表 (data/{namespace}/loot_tables)
 * - recipe: 配方文件 (data/{namespace}/recipes)
 * - advancement: 进度文件 (data/{namespace}/advancements)
 * - function: 函数文件 (data/{namespace}/functions)
 * - structure: 结构文件 (data/{namespace}/structures)
 * - custom: 自定义路径
 *
 * **路径格式**：
 * - 完整格式: `minecraft:item/custom/my_item`
 * - 简短格式: `item/custom/my_item` (使用默认命名空间)
 *
 * @example
 * ```yaml
 * model:
 *   path: minecraft:item/custom/my_sword  # 触发文件路径补全
 * ```
 */
export class FilePathCompletionStrategy implements ICompletionStrategy {
    readonly name = 'file-path-delegate';
    readonly priority: number;
    readonly triggerCharacters: string[] = [':', '/'];

    private readonly logger: ILogger;
    private readonly namespaceService: INamespaceDiscoveryService;
    private readonly configLoader: IDataConfigLoader;
    private readonly fileScanner: FileScanner;

    // 配置缓存
    private configLoaded = false;
    private configLoadPromise: Promise<void> | null = null;
    private cacheTTL: number;
    private resourceTypePresetsCache: IResourceTypePresetsConfig | null = null;

    constructor() {
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild(
            'FilePathCompletionStrategy',
        );
        this.namespaceService = ServiceContainer.getService<INamespaceDiscoveryService>(
            SERVICE_TOKENS.NamespaceDiscoveryService,
        );
        this.configLoader = ServiceContainer.getService<IDataConfigLoader>(SERVICE_TOKENS.DataConfigLoader);

        // 从配置文件加载优先级
        this.priority = this.configLoader.getCompletionPrioritySync('filePath', true);

        // 从配置文件加载缓存 TTL
        const timingConfig = this.configLoader.getTimingConfigSync();
        this.cacheTTL = timingConfig?.cache.filePathCacheTTL ?? 30000;

        // 初始化文件扫描器
        this.fileScanner = new FileScanner(
            this.logger.createChild('FileScanner'),
            this.namespaceService,
            this.cacheTTL,
        );
    }

    /**
     * 确保配置已加载
     */
    private async ensureConfigLoaded(): Promise<void> {
        if (this.configLoaded) {
            return;
        }

        if (this.configLoadPromise) {
            return this.configLoadPromise;
        }

        this.configLoadPromise = this.loadConfig().catch((err) => {
            this.configLoadPromise = null; // 允许重试
            throw err;
        });
        await this.configLoadPromise;
    }

    /**
     * 加载配置文件
     */
    private async loadConfig(): Promise<void> {
        // 并行加载两个配置
        const [timingConfig, resourceTypePresets] = await Promise.all([
            this.configLoader.loadTimingConfig(),
            this.configLoader.loadResourceTypePresetsConfig(),
        ]);

        this.cacheTTL = timingConfig.cache.filePathCacheTTL;
        this.fileScanner.setCacheTTL(this.cacheTTL);
        this.resourceTypePresetsCache = resourceTypePresets;
        this.configLoaded = true;

        this.logger.debug('Config loaded', {
            cacheTTL: this.cacheTTL,
            resourceTypes: resourceTypePresets.resourceTypes,
        });
    }

    /**
     * 获取资源类型预设
     */
    private getResourceTypePreset(resourceType: string): IResourceTypePreset | undefined {
        if (!this.resourceTypePresetsCache) {
            throw new Error('FilePathCompletionStrategy not initialized. Call ensureConfigLoaded() first.');
        }
        return this.resourceTypePresetsCache.presets[resourceType];
    }

    /**
     * 获取默认配置
     */
    private getDefaults(): IResourceTypePresetsConfig['defaults'] {
        if (!this.resourceTypePresetsCache) {
            throw new Error('FilePathCompletionStrategy not initialized. Call ensureConfigLoaded() first.');
        }
        return this.resourceTypePresetsCache.defaults;
    }

    /**
     * 获取排除模式
     */
    private getExcludePatterns(resourceType?: string): string[] {
        if (!this.resourceTypePresetsCache) {
            throw new Error('FilePathCompletionStrategy not initialized. Call ensureConfigLoaded() first.');
        }
        const patterns = this.resourceTypePresetsCache.excludePatterns;
        if (resourceType && patterns[resourceType]) {
            return patterns[resourceType];
        }
        return patterns['default'] || [];
    }

    /**
     * 此策略不直接激活，由 SchemaAwareCompletionStrategy 委托调用
     */
    shouldActivate(_context: ICompletionContextInfo): boolean {
        return false;
    }

    /**
     * 提供文件路径补全项
     */
    async provideCompletionItems(
        context: ICompletionContextInfo,
        token?: CancellationToken,
    ): Promise<ICompletionResult | undefined> {
        try {
            if (token?.isCancellationRequested) {
                return undefined;
            }

            // 确保配置已加载
            await this.ensureConfigLoaded();

            // 从 Schema 获取补全选项
            const options = this.getCompletionOptions(context);

            this.logger.debug('Providing file path completions', {
                position: `${context.position.line}:${context.position.character}`,
                linePrefix: context.linePrefix,
                resourceType: options.resourceType,
                basePath: options.basePath,
            });

            // 解析已输入的前缀，提取命名空间过滤器和路径前缀
            const { namespaceFilter, pathPrefix } = this.parseInputPrefix(context.linePrefix);

            // 扫描所有命名空间的文件
            const allFiles = await this.fileScanner.scanAllNamespaceFiles(options, token);

            if (token?.isCancellationRequested) {
                return undefined;
            }

            // 过滤匹配的文件
            const filteredFiles = this.fileScanner.filterNamespacedFiles(allFiles, namespaceFilter, pathPrefix);

            // 创建补全项
            const completionItems = filteredFiles.map((file) =>
                this.createCompletionItem(file.relativePath, file.namespace, options),
            );

            this.logger.debug('File path completions provided', {
                total: allFiles.length,
                filtered: completionItems.length,
                namespaceFilter,
                pathPrefix,
            });

            return {
                items: completionItems,
                isIncomplete: false,
                completionType: 'file-path',
                priority: this.priority,
            };
        } catch (error) {
            this.logger.error('Failed to provide file path completions', error as Error, {
                linePrefix: context.linePrefix,
            });
            return {
                items: [],
                isIncomplete: false,
                completionType: 'file-path',
                priority: this.priority,
            };
        }
    }

    /**
     * 解析补全项，提供详细信息
     */
    async resolveCompletionItem(item: CompletionItem, token?: CancellationToken): Promise<CompletionItem | undefined> {
        try {
            if (token?.isCancellationRequested) {
                return item;
            }

            const data = (item as FilePathCompletionItem)._filePathData;
            if (!data) {
                return item;
            }

            const md = new MarkdownString();
            md.isTrusted = true;

            // 标题
            md.appendMarkdown(`## 📁 ${data.resourceType || 'File'}: \`${data.relativePath}\`\n\n`);

            // 文件信息
            if (data.absolutePath) {
                try {
                    const stats = await fs.promises.stat(data.absolutePath);
                    md.appendMarkdown(`**Size:** ${this.formatFileSize(stats.size)}\n\n`);
                    md.appendMarkdown(`**Modified:** ${stats.mtime.toLocaleDateString()}\n\n`);
                } catch {
                    // 文件不可访问，跳过
                }
            }

            // 完整路径
            md.appendMarkdown(`**Full path:** \`${data.fullPath}\`\n\n`);

            // 使用示例
            md.appendMarkdown('---\n\n');
            md.appendMarkdown('### 📋 Usage\n\n');
            md.appendMarkdown('```yaml\n');
            md.appendMarkdown(`path: ${data.fullPath}\n`);
            md.appendMarkdown('```\n');

            item.documentation = md;

            return item;
        } catch (error) {
            this.logger.error('Failed to resolve file path completion item', error as Error);
            return item;
        }
    }

    /**
     * 从 Schema 获取补全选项
     *
     * 优先使用 Schema 的 x-completion-options，
     * 然后使用资源类型预设配置，最后使用默认值
     */
    private getCompletionOptions(context: ICompletionContextInfo): IFilePathCompletionOptions {
        const defaults = this.getDefaults();

        // 基础默认值
        const defaultOptions: IFilePathCompletionOptions = {
            resourceType: 'custom',
            includeNamespace: defaults.includeNamespace,
            defaultNamespace: this.namespaceService.getDefaultNamespace() || defaults.defaultNamespace,
            stripExtension: defaults.stripExtension,
            searchDepth: defaults.searchDepth,
            pathSeparator: defaults.pathSeparator,
            includeSubdirectories: defaults.includeSubdirectories,
            autoDetectWorkspace: defaults.autoDetectWorkspace,
        };

        if (!context.schema) {
            this.logger.debug('No schema available, using default options');
            return defaultOptions;
        }

        // 从 schema 读取 x-completion-options
        const schemaOptions = (context.schema['x-completion-options'] || {}) as Record<string, unknown>;

        // 如果指定了 resourceType，从预设配置中获取默认值
        const resourceType = (schemaOptions['resourceType'] as string) || 'custom';
        const preset = this.getResourceTypePreset(resourceType);

        // 获取排除模式
        const excludePatterns = (schemaOptions['excludePatterns'] as string[]) || this.getExcludePatterns(resourceType);

        this.logger.debug('Loading completion options from schema', {
            schemaOptions,
            resourceType,
            hasPreset: !!preset,
            hasBasePath: !!schemaOptions['basePath'],
        });

        // 合并选项：默认值 < 预设配置 < Schema 配置值
        return {
            ...defaultOptions,
            ...(preset
                ? {
                      basePath: preset.basePath,
                      fileExtensions: preset.fileExtensions,
                      includeNamespace: preset.includeNamespace,
                      stripExtension: preset.stripExtension,
                      searchDepth: preset.searchDepth,
                      pathSeparator: preset.pathSeparator,
                      includeSubdirectories: preset.includeSubdirectories,
                  }
                : {}),
            excludePatterns,
            ...schemaOptions,
            resourceType: resourceType as IFilePathCompletionOptions['resourceType'],
        };
    }

    /**
     * 解析输入前缀，提取命名空间过滤器和路径前缀
     *
     * 根据 Minecraft 资源位置格式 (https://minecraft.wiki/w/Resource_location)
     * 格式: namespace:path
     * - namespace: 只能包含小写字母、数字、下划线、连字符、点
     * - path: 可以包含斜杠作为目录分隔符
     *
     * 使用 NamespaceDiscoveryService.parseResourceLocation 进行解析
     */
    private parseInputPrefix(linePrefix: string): { namespaceFilter: string | null; pathPrefix: string } {
        const trimmed = linePrefix.trim();

        // 找到 YAML 键值分隔符
        const yamlColonMatch = trimmed.match(/^[a-zA-Z_-]+:\s*/);
        let value = trimmed;

        if (yamlColonMatch) {
            value = trimmed.substring(yamlColonMatch[0].length).trim();
        }

        // 使用服务解析资源位置
        const resourceLocation = this.namespaceService.parseResourceLocation(value);

        // 如果解析出命名空间，返回命名空间和路径
        if (resourceLocation.namespace) {
            return {
                namespaceFilter: resourceLocation.namespace,
                pathPrefix: resourceLocation.path,
            };
        }

        // 没有命名空间，可能正在输入命名空间或路径
        return {
            namespaceFilter: null,
            pathPrefix: resourceLocation.path || value,
        };
    }

    /**
     * 创建补全项
     *
     * 使用 NamespaceDiscoveryService.buildResourceLocation 构建资源位置
     */
    private createCompletionItem(
        relativePath: string,
        namespace: string,
        options: IFilePathCompletionOptions,
    ): CompletionItem {
        // 使用服务构建资源位置字符串
        const fullPath = options.includeNamespace
            ? this.namespaceService.buildResourceLocation(namespace, relativePath)
            : relativePath;

        const item = new CompletionItem(fullPath, CompletionItemKind.File);
        item.insertText = fullPath;

        // 设置详情
        const resourceTypeName = this.getResourceTypeName(options.resourceType);
        item.detail = `📁 ${resourceTypeName}`;

        // 设置排序和过滤
        item.sortText = relativePath;
        item.filterText = fullPath;

        // 设置基础文档
        item.documentation = new MarkdownString()
            .appendMarkdown(`**${resourceTypeName}:** \`${fullPath}\`\n\n`)
            .appendMarkdown(`_Path:_ \`${relativePath}\``);

        // 存储数据用于延迟解析
        (item as FilePathCompletionItem)._filePathData = {
            relativePath,
            fullPath,
            namespace,
            resourceType: options.resourceType,
        };

        // 设置策略标识
        (item as CompletionItemWithStrategy)._strategy = this.name;

        return item;
    }

    /**
     * 获取资源类型显示名称
     */
    private getResourceTypeName(resourceType?: string): string {
        const names: Record<string, string> = {
            model: 'Model',
            texture: 'Texture',
            sound: 'Sound',
            loot_table: 'Loot Table',
            recipe: 'Recipe',
            advancement: 'Advancement',
            function: 'Function',
            structure: 'Structure',
            custom: 'File',
        };
        return names[resourceType || 'custom'] || 'File';
    }

    /**
     * 格式化文件大小
     */
    private formatFileSize(bytes: number): string {
        if (bytes < 1024) {
            return `${bytes} B`;
        } else if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        } else {
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        }
    }

    /**
     * 清除缓存
     */
    clearCache(): void {
        this.fileScanner.clearCache();
        this.logger.debug('File path cache cleared');
    }
}
