import { type EditorExtensionContext } from '../../../core/types/EditorTypes';
import { type ILogger } from '../../../core/interfaces/ILogger';
import { type IDataStoreService } from '../../../core/interfaces/IDataStoreService';
import { type IEventBus } from '../../../core/interfaces/IEventBus';
import { type IPerformanceMonitor } from '../../../core/interfaces/IPerformanceMonitor';
import { type IConfiguration } from '../../../core/interfaces/IConfiguration';
import { type IWorkspaceService } from '../../../core/interfaces/IWorkspaceService';
import { type IFileWatcherFactory } from '../../../core/interfaces/IFileWatcherFactory';
import { type IExtensionRegistry } from '../../../core/interfaces/IExtensionRegistry';
import { type IJsonSchemaNode } from '../../../core/types/JsonSchemaTypes';
import { ServiceNotInitializedError } from '../../../core/errors/ExtensionErrors';
import { type ISchemaFileLoader } from '../../../core/interfaces/ISchemaFileLoader';
import { SchemaReferenceResolver, SchemaDynamicGenerator, SchemaFileWatcherManager } from './index';
import { YamlExtensionIntegrator } from './YamlExtensionIntegrator';
import { SchemaFileManager, SchemaEventHandler, SchemaUpdateCoordinator } from './loaders';

/**
 * Schema 加载服务
 *
 * 作为 Schema 管理的核心服务，负责 Schema 的加载、生成、注册和更新。
 * 协调文件管理器、事件处理器和更新协调器等子组件。
 *
 * @remarks
 * **核心职责**：
 *
 * 1. **Schema 加载**
 *    - 从文件系统加载静态 Schema 定义
 *    - 解析 JSON Schema 文件
 *    - 处理 Schema 引用和依赖
 *
 * 2. **动态 Schema 生成**
 *    - 根据当前模板库动态生成 Schema
 *    - 为模板名称生成枚举约束
 *    - 为参数生成验证规则
 *
 * 3. **YAML 扩展集成**
 *    - 检测并连接 VSCode YAML 扩展
 *    - 注册自定义 Schema 提供者
 *    - 处理 Schema 关联和匹配
 *
 * 4. **Schema 更新管理**
 *    - 监听模板变更事件
 *    - 使用防抖机制优化更新频率
 *    - 触发 Schema 重新生成和注册
 *
 * 5. **缓存管理**
 *    - 缓存已加载的 Schema
 *    - 避免重复加载和解析
 *    - 提供缓存失效机制
 *
 * **子组件协调**：
 * - SchemaFileManager: 文件系统 Schema 加载
 * - SchemaEventHandler: 事件监听和处理
 * - SchemaUpdateCoordinator: Schema 更新协调
 * - SchemaReferenceResolver: $ref 引用解析
 * - SchemaDynamicGenerator: 动态 Schema 生成
 *
 * **工作流程**：
 * ```
 * 初始化 → 加载根 Schema → 连接 YAML 扩展 → 生成动态 Schema →
 * 注册 Schema → 监听事件 → 动态更新
 * ```
 *
 * @example
 * ```typescript
 * const loaderService = new SchemaLoaderService(
 *     logger,
 *     dataStoreService,
 *     eventBus,
 *     configuration,
 *     workspaceService,
 *     extensionRegistry,
 *     schemaFileLoader
 * );
 *
 * // 初始化服务
 * await loaderService.initialize(context);
 *
 * // 获取根 Schema
 * const rootSchema = loaderService.getRootSchema();
 * console.log(rootSchema.title);
 *
 * // 手动重新加载
 * await loaderService.reloadSchema();
 *
 * // 清理资源
 * loaderService.dispose();
 * ```
 */
export class SchemaLoaderService {
    /** YAML 扩展集成器 */
    private readonly yamlIntegrator: YamlExtensionIntegrator;
    /** Schema 引用解析器 */
    private resolver!: SchemaReferenceResolver;
    /** 动态 Schema 生成器 */
    private generator!: SchemaDynamicGenerator;
    /** Schema 文件监控管理器 */
    private fileWatcherManager: SchemaFileWatcherManager | null = null;

    // 子组件
    private fileManager!: SchemaFileManager;
    private eventHandler!: SchemaEventHandler;
    private updateCoordinator!: SchemaUpdateCoordinator;

    /**
     * 构造 Schema 加载服务实例
     *
     * @param logger - 日志记录器
     * @param dataStoreService - 数据存储服务，用于获取模板信息生成动态 Schema
     * @param eventBus - 事件总线，用于监听模板变更事件
     * @param configuration - 配置服务
     * @param workspaceService - 工作区服务
     * @param extensionRegistry - 扩展注册表
     * @param schemaFileLoader - Schema 文件加载器
     * @param fileWatcherFactory - 文件监控工厂（可选）
     * @param performanceMonitor - 性能监控器（可选）
     * @param onSchemaReloaded - Schema 重新加载回调（可选）
     *
     * @remarks
     * 构造函数只初始化 YAML 集成器，其他组件在 initialize 方法中初始化。
     * 这样可以延迟初始化，需要 ExtensionContext 时才进行。
     */
    constructor(
        private readonly logger: ILogger,
        private readonly dataStoreService: IDataStoreService,
        private readonly eventBus: IEventBus,
        private readonly configuration: IConfiguration,
        private readonly workspaceService: IWorkspaceService,
        extensionRegistry: IExtensionRegistry,
        private readonly schemaFileLoader: ISchemaFileLoader,
        private readonly fileWatcherFactory?: IFileWatcherFactory,
        private readonly performanceMonitor?: IPerformanceMonitor,
        private readonly onSchemaReloaded?: () => void,
    ) {
        this.yamlIntegrator = new YamlExtensionIntegrator(
            logger,
            extensionRegistry,
            workspaceService,
            performanceMonitor,
        );
    }

    /**
     * 初始化 Schema 加载器
     *
     * 执行完整的初始化流程，包括加载 Schema、连接扩展和设置监听器。
     *
     * @param context - VSCode 扩展上下文
     * @returns Promise，表示初始化完成
     * @throws {Error} 如果初始化失败
     *
     * @remarks
     * 初始化步骤：
     * 1. 创建子组件实例（文件管理器、事件处理器、更新协调器）
     * 2. 加载根 Schema 文件
     * 3. 检测并连接 YAML 扩展
     * 4. 生成并注册动态 Schema
     * 5. 设置模板变更事件监听器
     *
     * 性能优化：
     * - 使用性能监控器记录耗时
     * - 异步加载，不阻塞扩展激活
     * - 失败时记录详细错误但不中断扩展
     */
    async initialize(_context: EditorExtensionContext): Promise<void> {
        const timer = this.performanceMonitor?.startTimer('schema.loader.initialize');

        try {
            this.logger.info('Initializing Schema loader');

            // 初始化文件监控管理器（仅在 fileWatcherFactory 可用时）
            if (this.fileWatcherFactory) {
                this.fileWatcherManager = new SchemaFileWatcherManager(
                    this.logger,
                    this.eventBus,
                    this.configuration,
                    this.workspaceService,
                    this.fileWatcherFactory,
                );
                await this.fileWatcherManager.initialize();
            } else {
                this.logger.debug('FileWatcherFactory not available, schema hot reload disabled');
            }

            // 初始化子组件
            this.fileManager = new SchemaFileManager(this.logger, this.schemaFileLoader, this.workspaceService);
            this.fileManager.setWorkspaceSchemaDir();

            this.resolver = new SchemaReferenceResolver(this.schemaFileLoader, this.logger);
            this.generator = new SchemaDynamicGenerator(this.dataStoreService, this.logger);

            this.updateCoordinator = new SchemaUpdateCoordinator(
                this.logger,
                this.fileManager,
                this.generator,
                this.yamlIntegrator,
                this.performanceMonitor,
                this.onSchemaReloaded,
            );

            // 加载根 Schema
            await this.updateCoordinator.loadRootSchema();

            // 设置 YAML 扩展
            await this.yamlIntegrator.setup();

            // 注册动态 Schema
            await this.updateCoordinator.registerDynamicSchema();

            // 初始化事件处理器并设置监听器
            this.eventHandler = new SchemaEventHandler(
                this.logger,
                this.eventBus,
                this.fileManager,
                this.generator,
                this.yamlIntegrator,
                () => {
                    // Schema 重新加载回调
                    void this.updateCoordinator.reloadSchema();
                },
            );
            this.eventHandler.setupEventListeners();

            this.logger.info('Schema loader initialized successfully');
            timer?.stop({ success: true });
        } catch (error) {
            this.logger.error('Failed to initialize schema loader', error as Error);
            timer?.stop({ success: false, error: (error as Error).message });
            throw error;
        }
    }

    /**
     * 获取根 Schema
     */
    getRootSchema(): IJsonSchemaNode | null {
        return this.updateCoordinator?.getRootSchema() ?? null;
    }

    /**
     * 获取文件加载器
     */
    getLoader(): ISchemaFileLoader {
        return this.schemaFileLoader;
    }

    /**
     * 获取引用解析器
     */
    getResolver(): SchemaReferenceResolver {
        return this.resolver;
    }

    /**
     * 加载指定的 Schema 文件
     */
    async loadSchemaFile(filename: string): Promise<IJsonSchemaNode> {
        if (!this.fileManager) {
            throw new ServiceNotInitializedError('SchemaLoaderService');
        }

        return this.fileManager.loadSchema(filename);
    }

    /**
     * 重新加载根 Schema
     */
    async reloadRootSchema(): Promise<void> {
        if (!this.updateCoordinator) {
            throw new ServiceNotInitializedError('SchemaLoaderService');
        }

        await this.updateCoordinator.reloadSchema();
    }

    /**
     * 获取文件监控管理器
     */
    getFileWatcherManager(): SchemaFileWatcherManager | null {
        return this.fileWatcherManager;
    }

    /**
     * 清理资源
     */
    dispose(): void {
        this.logger.info('Disposing SchemaLoaderService');

        // 清理子组件
        this.eventHandler?.dispose();
        this.yamlIntegrator.reset();
        this.fileWatcherManager?.dispose();
    }
}
