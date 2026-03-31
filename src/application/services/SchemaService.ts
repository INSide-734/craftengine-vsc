import { type EditorExtensionContext } from '../../core/types/EditorTypes';
import { type ILogger } from '../../core/interfaces/ILogger';
import { type IConfiguration } from '../../core/interfaces/IConfiguration';
import { type IDataStoreService } from '../../core/interfaces/IDataStoreService';
import { type IEventBus } from '../../core/interfaces/IEventBus';
import { type IWorkspaceService } from '../../core/interfaces/IWorkspaceService';
import { type IFileWatcherFactory } from '../../core/interfaces/IFileWatcherFactory';
import { type IExtensionRegistry } from '../../core/interfaces/IExtensionRegistry';
import { type ISchemaFileLoader } from '../../core/interfaces/ISchemaFileLoader';
import { type IJsonSchemaNode } from '../../core/types/JsonSchemaTypes';
import { type ISchemaService, type IJsonSchema } from '../../core/interfaces/ISchemaService';
import { type IPerformanceMonitor } from '../../core/interfaces/IPerformanceMonitor';
import { ServiceNotInitializedError } from '../../core/errors/ExtensionErrors';
import {
    SchemaLoaderService,
    SchemaPropertyExtractor,
    SchemaQueryService,
    SchemaPathNavigator,
    type SchemaPropertyDetails,
    type SchemaProperty,
} from './schema';

/**
 * Schema 服务实现
 *
 * 作为应用层的核心服务，负责管理 YAML Schema 的加载、查询和补全建议。
 * 采用门面模式和委托模式，将复杂功能分解到专门的子服务中。
 *
 * @remarks
 * **架构设计**：
 *
 * 采用委托模式，SchemaService 作为门面（Facade），将职责分配给专门的子服务：
 *
 * 1. **SchemaLoaderService** - Schema 加载服务
 *    - 从文件系统、内置定义、模板等多种来源加载 Schema
 *    - 动态生成模板相关的 Schema
 *    - 管理 Schema 的生命周期
 *
 * 2. **SchemaPropertyExtractor** - 属性提取器
 *    - 从 Schema 定义中提取属性信息
 *    - 解析属性的类型、描述、约束等元数据
 *    - 支持递归提取嵌套属性
 *
 * 3. **SchemaQueryService** - 查询服务
 *    - 根据路径查询可用的属性
 *    - 管理查询缓存以提高性能
 *    - 提供属性详情和补全建议
 *
 * 4. **SchemaPathNavigator** - 路径导航器
 *    - 在 Schema 树中导航到指定路径
 *    - 处理路径解析和验证
 *
 * **主要功能**：
 * - Schema 注册：将 Schema 注册到 VSCode
 * - 属性查询：根据路径获取可用属性
 * - 补全建议：提供智能的属性补全
 * - 动态生成：根据模板动态生成 Schema
 * - 缓存管理：优化查询性能
 * - 事件监听：监听模板变化更新 Schema
 *
 * **使用场景**：
 * - 智能补全提供者：获取当前路径的可用属性
 * - 悬停提示：显示属性的详细信息
 * - 语法验证：验证 YAML 结构的正确性
 * - 文档大纲：构建文档结构树
 *
 * @example
 * ```typescript
 * // 创建 Schema 服务
 * const schemaService = new SchemaService(
 *     logger,
 *     templateRepository,
 *     eventBus,
 *     performanceMonitor
 * );
 *
 * // 注册 Schema 提供者
 * await schemaService.registerSchemaProvider(context);
 *
 * // 查询可用属性
 * const properties = await schemaService.getAvailableProperties(['items', 'my-item']);
 * console.log('Available properties:', properties.map(p => p.name));
 *
 * // 获取属性详情
 * const details = await schemaService.getPropertyDetails(['items', 'my-item'], 'template');
 * console.log('Property description:', details?.description);
 *
 * // 重新加载 Schema
 * await schemaService.reloadSchema();
 *
 * // 清理资源
 * schemaService.dispose();
 * ```
 */
export class SchemaService implements ISchemaService {
    /** 日志记录器 */
    private readonly logger: ILogger;
    /** 性能监控器 */
    private readonly performanceMonitor?: IPerformanceMonitor;

    /** Schema 加载服务 */
    private loaderService!: SchemaLoaderService;
    /** 属性提取器 */
    private extractor!: SchemaPropertyExtractor;
    /** 查询服务 */
    private queryService!: SchemaQueryService;

    /** 服务是否已初始化 */
    private initialized = false;

    /** 初始化 Promise（并发安全，防止重复初始化） */
    private initPromise: Promise<void> | null = null;

    /**
     * 构造 Schema 服务实例
     *
     * @param logger - 日志记录器
     * @param dataStoreService - 数据存储服务，用于获取模板信息生成动态 Schema
     * @param eventBus - 事件总线，用于监听模板变化事件
     * @param configuration - 配置服务，用于读取 Schema 部署相关配置
     * @param workspaceService
     * @param extensionRegistry
     * @param fileWatcherFactory
     * @param performanceMonitor - 性能监控器（可选），用于监控操作性能
     *
     * @remarks
     * 构造函数不执行任何初始化逻辑，实际的初始化在 registerSchemaProvider 中进行。
     * 这样可以：
     * - 延迟初始化，提高扩展激活速度
     * - 需要 ExtensionContext 时才初始化
     * - 便于依赖注入和测试
     */
    constructor(
        logger: ILogger,
        private readonly dataStoreService: IDataStoreService,
        private readonly eventBus: IEventBus,
        private readonly configuration: IConfiguration,
        private readonly workspaceService: IWorkspaceService,
        private readonly extensionRegistry: IExtensionRegistry,
        private readonly schemaFileLoader: ISchemaFileLoader,
        private readonly fileWatcherFactory?: IFileWatcherFactory,
        performanceMonitor?: IPerformanceMonitor,
    ) {
        this.logger = logger.createChild('SchemaService');
        this.performanceMonitor = performanceMonitor;
    }

    /**
     * 注册 Schema 提供者
     *
     * 初始化所有子服务并将 Schema 注册到 VSCode。
     * 这是 SchemaService 的主要初始化方法，应在扩展激活时调用。
     *
     * @param context - VSCode 扩展上下文
     * @returns Promise，表示注册完成
     * @throws {Error} 如果初始化失败
     *
     * @remarks
     * 注册流程：
     * 1. 初始化所有子服务（加载器、提取器、查询服务）
     * 2. 加载 Schema 定义（内置 + 动态生成）
     * 3. 注册到 VSCode 的 Schema 存储
     * 4. 设置事件监听器（监听模板变化）
     * 5. 标记服务为已初始化
     *
     * 性能考虑：
     * - 异步初始化，不阻塞扩展激活
     * - 使用性能监控器记录耗时
     * - 失败时记录详细错误信息
     *
     * @example
     * ```typescript
     * export async function activate(context: vscode.ExtensionContext) {
     *     const schemaService = ServiceContainer.getService<ISchemaService>(
     *         SERVICE_TOKENS.SchemaService
     *     );
     *
     *     await schemaService.registerSchemaProvider(context);
     *     console.log('Schema provider registered');
     * }
     * ```
     */
    async registerSchemaProvider(context: EditorExtensionContext): Promise<void> {
        // 并发安全：已在初始化中或已完成，直接返回缓存的 Promise
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this.doRegisterSchemaProvider(context);

        try {
            await this.initPromise;
        } catch (error) {
            // 失败时重置，允许重试
            this.initPromise = null;
            throw error;
        }
    }

    /**
     * 执行实际的 Schema 提供者注册逻辑
     */
    private async doRegisterSchemaProvider(context: EditorExtensionContext): Promise<void> {
        const timer = this.performanceMonitor?.startTimer('schema.register');

        try {
            this.logger.info('Registering YAML schema provider');

            // 初始化子服务
            await this.initializeSubServices(context);

            this.initialized = true;
            this.logger.info('YAML schema provider registered successfully');
            timer?.stop({ success: true });
        } catch (error) {
            this.logger.error('Failed to register schema provider', error as Error);
            timer?.stop({ success: false, error: (error as Error).message });
            throw error;
        }
    }

    /**
     * 根据 YAML 路径获取对应的 Schema 定义
     */
    async getSchemaForPath(path: string[]): Promise<IJsonSchema | undefined> {
        this.ensureInitialized();

        const rootSchema = this.loaderService.getRootSchema();
        if (!rootSchema) {
            return undefined;
        }
        return (await this.queryService.getSchemaForPath(rootSchema, path)) as IJsonSchema | undefined;
    }

    /**
     * 快速检查指定路径是否有可用的 Schema
     */
    hasSchemaForPath(path: string[]): boolean {
        if (!this.initialized) {
            return false;
        }

        const rootSchema = this.loaderService.getRootSchema();
        if (!rootSchema) {
            return false;
        }
        return this.queryService.hasSchemaForPath(rootSchema, path);
    }

    /**
     * 加载指定的 Schema 文件
     */
    async loadSchemaFile(filename: string): Promise<IJsonSchema> {
        this.ensureInitialized();
        return (await this.loaderService.loadSchemaFile(filename)) as IJsonSchema;
    }

    /**
     * 解析 Schema 中的 $ref 引用
     */
    async resolveReferences(schema: IJsonSchema, maxDepth: number = 5): Promise<IJsonSchema> {
        this.ensureInitialized();

        const resolver = this.loaderService.getResolver();
        return (await resolver.resolveReferences(
            schema as unknown as IJsonSchemaNode,
            maxDepth,
        )) as unknown as IJsonSchema;
    }

    /**
     * 获取 Schema 中的自定义属性（x- 开头）
     */
    getCustomProperty(schema: IJsonSchema, property: string): unknown {
        if (!schema) {
            return undefined;
        }

        const propertyName = (property.startsWith('x-') ? property : `x-${property}`) as `x-${string}`;
        return schema[propertyName];
    }

    /**
     * 获取根 Schema 中定义的顶级字段名称
     */
    async getTopLevelFields(): Promise<string[]> {
        this.ensureInitialized();

        const rootSchema = this.loaderService.getRootSchema();
        if (!rootSchema) {
            return [];
        }
        return this.queryService.getTopLevelFields(rootSchema);
    }

    /**
     * 获取指定路径下可用的属性键名
     */
    async getAvailableProperties(path: string[]): Promise<SchemaProperty[]> {
        this.ensureInitialized();

        const rootSchema = this.loaderService.getRootSchema();
        if (!rootSchema) {
            return [];
        }
        return this.queryService.getAvailableProperties(rootSchema, path);
    }

    /**
     * 获取指定路径的属性详情
     */
    async getPropertyDetails(path: string[]): Promise<SchemaPropertyDetails | undefined> {
        this.ensureInitialized();

        const rootSchema = this.loaderService.getRootSchema();
        if (!rootSchema) {
            return undefined;
        }
        return this.queryService.getPropertyDetails(rootSchema, path);
    }

    /**
     * 清理资源
     */
    dispose(): void {
        this.logger.info('Disposing SchemaService');

        if (this.loaderService) {
            this.loaderService.dispose();
        }

        if (this.queryService) {
            this.queryService.clearCaches();
        }

        this.initialized = false;
        this.initPromise = null;
    }

    /**
     * 获取 Schema 加载服务实例
     */
    getLoaderService(): SchemaLoaderService | undefined {
        return this.initialized ? this.loaderService : undefined;
    }

    // ==================== 私有方法 ====================

    /**
     * 初始化子服务
     */
    private async initializeSubServices(context: EditorExtensionContext): Promise<void> {
        // 创建加载服务
        this.loaderService = new SchemaLoaderService(
            this.logger,
            this.dataStoreService,
            this.eventBus,
            this.configuration,
            this.workspaceService,
            this.extensionRegistry,
            this.schemaFileLoader,
            this.fileWatcherFactory,
            this.performanceMonitor,
            () => this.onSchemaReloaded(),
        );

        await this.loaderService.initialize(context);

        // 创建属性提取器
        const resolver = this.loaderService.getResolver();
        this.extractor = new SchemaPropertyExtractor(resolver, this.logger);

        // 创建查询服务
        const navigator = new SchemaPathNavigator(resolver, this.logger);
        this.queryService = new SchemaQueryService(navigator, this.extractor, this.logger, this.performanceMonitor);

        this.logger.debug('Sub-services initialized successfully');
    }

    /**
     * Schema 重新加载时的回调
     */
    private onSchemaReloaded(): void {
        this.logger.debug('Schema reloaded, clearing caches');
        this.queryService.clearCaches();
    }

    /**
     * 确保服务已初始化
     */
    private ensureInitialized(): void {
        if (!this.initialized) {
            throw new ServiceNotInitializedError('SchemaService');
        }
    }
}
