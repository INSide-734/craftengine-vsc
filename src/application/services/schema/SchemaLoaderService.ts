import { ExtensionContext, window } from 'vscode';
import * as path from 'path';
import { SCHEMA_CACHE } from './SchemaConstants';
import { ILogger } from '../../../core/interfaces/ILogger';
import { IDataStoreService } from '../../../core/interfaces/IDataStoreService';
import { IEventBus, IEventSubscription } from '../../../core/interfaces/IEventBus';
import { IPerformanceMonitor } from '../../../core/interfaces/IPerformanceMonitor';
import { IConfiguration } from '../../../core/interfaces/IConfiguration';
import { IFileReader } from '../../../core/interfaces/IFileReader';
import { IWorkspaceService } from '../../../core/interfaces/IWorkspaceService';
import { JsonSchemaNode } from '../../../core/types/JsonSchemaTypes';
import { ServiceNotInitializedError } from '../../../core/errors/ExtensionErrors';
import { Debouncer } from '../../../core/utils';
import {
    SchemaFileLoader,
    SchemaReferenceResolver,
    SchemaDynamicGenerator,
    SchemaDeploymentService,
    SchemaFileWatcherManager
} from './index';
import { YamlExtensionIntegrator } from './YamlExtensionIntegrator';

/**
 * Schema 加载服务
 * 
 * 作为 Schema 管理的核心服务，负责 Schema 的加载、生成、注册和更新。
 * 协调文件加载器、引用解析器和动态生成器等子组件。
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
 * - SchemaFileLoader: 文件系统 Schema 加载
 * - SchemaReferenceResolver: $ref 引用解析
 * - SchemaDynamicGenerator: 动态 Schema 生成
 * - Debouncer: 防抖处理，优化更新频率
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
 *     templateRepository,
 *     eventBus,
 *     performanceMonitor,
 *     () => console.log('Schema reloaded')
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
    /** 根 Schema 对象 */
    private rootSchema: JsonSchemaNode | null = null;
    /** YAML 扩展集成器 */
    private readonly yamlIntegrator: YamlExtensionIntegrator;
    /** Schema 文件加载器 */
    private loader!: SchemaFileLoader;
    /** Schema 引用解析器 */
    private resolver!: SchemaReferenceResolver;
    /** 动态 Schema 生成器 */
    private generator!: SchemaDynamicGenerator;
    /** Schema 部署服务 */
    private deploymentService!: SchemaDeploymentService;
    /** Schema 文件监控管理器 */
    private fileWatcherManager!: SchemaFileWatcherManager;
    /** 防抖器，用于优化 Schema 更新频率 */
    private readonly debouncer: Debouncer;
    /** 事件订阅句柄 */
    private readonly subscriptions: IEventSubscription[] = [];
    
    /**
     * 构造 Schema 加载服务实例
     * 
     * @param logger - 日志记录器
     * @param dataStoreService - 数据存储服务，用于获取模板信息生成动态 Schema
     * @param eventBus - 事件总线，用于监听模板变更事件
     * @param configuration - 配置服务
     * @param performanceMonitor - 性能监控器（可选）
     * @param onSchemaReloaded - Schema 重新加载回调（可选）
     * 
     * @remarks
     * 构造函数只初始化防抖器，其他组件在 initialize 方法中初始化。
     * 这样可以延迟初始化，需要 ExtensionContext 时才进行。
     */
    constructor(
        private readonly logger: ILogger,
        private readonly dataStoreService: IDataStoreService,
        private readonly eventBus: IEventBus,
        private readonly configuration: IConfiguration,
        private readonly fileReader: IFileReader,
        private readonly workspaceService: IWorkspaceService,
        private readonly performanceMonitor?: IPerformanceMonitor,
        private readonly onSchemaReloaded?: () => void
    ) {
        this.debouncer = new Debouncer();
        this.yamlIntegrator = new YamlExtensionIntegrator(logger, performanceMonitor);
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
     * 1. 创建子组件实例（加载器、解析器、生成器）
     * 2. 加载根 Schema 文件
     * 3. 检测并连接 YAML 扩展
     * 4. 生成并注册动态 Schema
     * 5. 设置模板变更事件监听器
     * 
     * 性能优化：
     * - 使用性能监控器记录耗时
     * - 异步加载，不阻塞扩展激活
     * - 失败时记录详细错误但不中断扩展
     * 
     * @example
     * ```typescript
     * export async function activate(context: vscode.ExtensionContext) {
     *     const loaderService = new SchemaLoaderService(
     *         logger,
     *         templateRepository,
     *         eventBus
     *     );
     *     
     *     try {
     *         await loaderService.initialize(context);
     *         console.log('Schema loader initialized');
     *     } catch (error) {
     *         console.error('Schema initialization failed:', error);
     *         // 扩展仍可继续运行，只是没有 Schema 支持
     *     }
     * }
     * ```
     */
    async initialize(context: ExtensionContext): Promise<void> {
        const timer = this.performanceMonitor?.startTimer('schema.loader.initialize');
        
        try {
            this.logger.info('Initializing Schema loader');
            
            // 初始化部署服务
            this.deploymentService = new SchemaDeploymentService(
                this.logger,
                this.configuration,
                this.eventBus,
                this.fileReader,
                this.workspaceService
            );
            await this.deploymentService.initialize(context.extensionPath);
            
            // 部署 Schema 到工作区
            const deployResult = await this.deploymentService.deploySchemas();
            if (deployResult.deployedCount > 0) {
                this.logger.info('Schema files deployed to workspace', {
                    deployed: deployResult.deployedCount,
                    skipped: deployResult.skippedCount
                });
                
                // 显示通知
                window.showInformationMessage(
                    `CraftEngine: Deployed ${deployResult.deployedCount} schema files to workspace`
                );
            }
            
            // 初始化文件监控管理器
            this.fileWatcherManager = new SchemaFileWatcherManager(
                this.logger,
                this.eventBus,
                this.configuration
            );
            await this.fileWatcherManager.initialize();
            
            // 初始化子组件（使用工作区 Schema 目录）
            const schemasDir = path.join(context.extensionPath, 'schemas');
            const workspaceSchemaDir = this.deploymentService.getWorkspaceSchemaDir();
            
            this.loader = new SchemaFileLoader(
                schemasDir,
                this.logger,
                SCHEMA_CACHE.FILE_CACHE_SIZE,
                workspaceSchemaDir
            );
            this.resolver = new SchemaReferenceResolver(this.loader, this.logger);
            this.generator = new SchemaDynamicGenerator(this.dataStoreService, this.logger);
            
            // 加载根 Schema
            await this.loadRootSchema();
            
            // 设置 YAML 扩展
            await this.yamlIntegrator.setup();

            // 注册动态 Schema
            if (this.yamlIntegrator.isAvailable()) {
                await this.yamlIntegrator.registerDynamicSchema(this.generator);
            }
            
            // 设置事件监听器
            this.setupEventListeners();
            
            this.logger.info('Schema loader initialized successfully', {
                schemaSource: await this.deploymentService.getSchemaSource()
            });
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
    getRootSchema(): JsonSchemaNode | null {
        return this.rootSchema;
    }
    
    /**
     * 获取文件加载器
     */
    getLoader(): SchemaFileLoader {
        return this.loader;
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
    async loadSchemaFile(filename: string): Promise<JsonSchemaNode> {
        if (!this.loader) {
            throw new ServiceNotInitializedError('SchemaLoaderService');
        }
        
        return this.loader.loadSchema(filename);
    }
    
    /**
     * 重新加载根 Schema
     */
    async reloadRootSchema(): Promise<void> {
        await this.loadRootSchema();
        
        // 通知 Schema 已重新加载
        this.onSchemaReloaded?.();
        
        // 重新注册动态 Schema
        if (this.yamlIntegrator.isAvailable()) {
            await this.yamlIntegrator.registerDynamicSchema(this.generator);
        }
    }
    
    // ==================== 私有方法 ====================
    
    /**
     * 加载根 Schema
     */
    private async loadRootSchema(): Promise<void> {
        try {
            this.rootSchema = await this.loader.loadSchema('index.schema.json');
            
            this.logger.info('Root schema loaded successfully', {
                schemaKeys: Object.keys(this.rootSchema || {}).slice(0, 5)
            });
        } catch (error) {
            this.logger.error('Failed to load root schema', error as Error);
            this.rootSchema = null;
            throw error;
        }
    }
    
    /**
     * 设置事件监听器
     */
    private setupEventListeners(): void {
        // 监听模板变更，使用防抖避免频繁更新
        const templateSub = this.eventBus.subscribe('template.*', async () => {
            this.debouncer.debounce(
                'schema-update',
                async () => {
                    try {
                        this.logger.debug('Updating schema after template change');
                        await this.yamlIntegrator.registerDynamicSchema(this.generator);
                        this.onSchemaReloaded?.();
                    } catch (error) {
                        this.logger.error('Error updating schema', error as Error);
                    }
                },
                1000 // 1秒防抖
            );
        });
        this.subscriptions.push(templateSub);

        // 监听 Schema 文件热重载事件
        const hotReloadSub = this.eventBus.subscribe('schema.hot.reloaded', async () => {
            this.debouncer.debounce(
                'schema-hot-reload',
                async () => {
                    try {
                        this.logger.info('Hot reloading schema files');

                        // 清除缓存
                        this.loader.clearCache();

                        // 重新加载根 Schema
                        await this.loadRootSchema();

                        // 重新注册动态 Schema
                        if (this.yamlIntegrator.isAvailable()) {
                            await this.yamlIntegrator.registerDynamicSchema(this.generator);
                        }

                        this.onSchemaReloaded?.();

                        this.logger.info('Schema hot reload completed');
                    } catch (error) {
                        this.logger.error('Error during schema hot reload', error as Error);
                    }
                },
                500 // 500ms 防抖
            );
        });
        this.subscriptions.push(hotReloadSub);

        // 监听 Schema 版本不匹配事件
        const versionMismatchSub = this.eventBus.subscribe('schema.version.mismatch', async (event: Record<string, unknown>) => {
            const result = await window.showWarningMessage(
                `CraftEngine schema version mismatch. Workspace: ${event.workspaceVersion}, Extension: ${event.extensionVersion}`,
                'Update Schemas',
                'Keep Current'
            );

            if (result === 'Update Schemas') {
                const deployResult = await this.deploymentService.forceRedeploy();
                if (deployResult.success) {
                    window.showInformationMessage(
                        `Updated ${deployResult.deployedCount} schema files`
                    );

                    // 触发热重载
                    await this.eventBus.publish('schema.hot.reloaded', {
                        id: 'manual-update',
                        type: 'schema.hot.reloaded',
                        timestamp: new Date(),
                        changes: []
                    });
                }
            }
        });
        this.subscriptions.push(versionMismatchSub);

        this.logger.debug('Schema event listeners setup completed');
    }
    
    /**
     * 获取部署服务
     */
    getDeploymentService(): SchemaDeploymentService {
        return this.deploymentService;
    }
    
    /**
     * 获取文件监控管理器
     */
    getFileWatcherManager(): SchemaFileWatcherManager {
        return this.fileWatcherManager;
    }
    
    /**
     * 清理资源
     */
    dispose(): void {
        this.logger.info('Disposing SchemaLoaderService');

        // 取消所有事件订阅
        for (const sub of this.subscriptions) {
            sub.unsubscribe();
        }
        this.subscriptions.length = 0;

        this.debouncer.clear();
        this.yamlIntegrator.reset();

        // 清理子组件
        this.deploymentService?.dispose();
        this.fileWatcherManager?.dispose();
    }
}

