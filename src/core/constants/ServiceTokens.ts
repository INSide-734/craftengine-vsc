/**
 * 服务令牌常量
 * 
 * 定义所有服务的唯一标识符，用于依赖注入容器中的服务注册和解析。
 * 使用 Symbol 作为服务标识符，确保全局唯一性，避免字符串键冲突。
 * 
 * @remarks
 * **设计原则**：
 * 
 * 1. **类型安全**：使用 Symbol 而非字符串，防止拼写错误
 * 2. **全局唯一**：每个 Symbol 都是唯一的，不会有命名冲突
 * 3. **可读性好**：Symbol 描述清楚表达服务用途
 * 4. **易于维护**：所有服务令牌集中管理
 * 
 * **服务分类**：
 * 
 * - **基础设施服务**：Logger, Configuration, EventBus, PerformanceMonitor
 * - **缓存服务**：Cache, TemplateCache
 * - **文件服务**：FileWatcher, YamlParser, YamlScanner
 * - **Schema 服务**：SchemaParser, SchemaValidator, SchemaService
 * - **领域服务**：TemplateService, TemplateParser, DocumentParser
 * - **数据存储**：DataStoreService
 * - **应用服务**：ExtensionService, SchemaService
 * - **补全服务**：CompletionManager, DelegateStrategyRegistry
 * 
 * **使用模式**：
 * 
 * ```typescript
 * // 服务注册
 * container.register(
 *     SERVICE_TOKENS.TemplateService,
 *     TemplateService,
 *     ServiceLifetime.Singleton
 * );
 * 
 * // 服务解析
 * const templateService = container.resolve<ITemplateService>(
 *     SERVICE_TOKENS.TemplateService
 * );
 * ```
 * 
 * **扩展指南**：
 * 
 * 添加新服务时：
 * 1. 在合适的分类下添加新的 Symbol
 * 2. 使用描述性的名称
 * 3. 在 ServiceContainer 中注册服务
 * 4. 更新相关文档
 * 
 * @example
 * ```typescript
 * import { SERVICE_TOKENS } from './core/constants/ServiceTokens';
 * 
 * // 注册服务
 * container.register(
 *     SERVICE_TOKENS.Logger,
 *     Logger,
 *     ServiceLifetime.Singleton
 * );
 * 
 * // 获取服务
 * const logger = ServiceContainer.getService<ILogger>(
 *     SERVICE_TOKENS.Logger
 * );
 * 
 * // 在构造函数中注入
 * export class MyService {
 *     constructor(
 *         private readonly logger = ServiceContainer.getService<ILogger>(
 *             SERVICE_TOKENS.Logger
 *         )
 *     ) {}
 * }
 * ```
 */

// ============================================
// 基础设施服务
// ============================================

export const SERVICE_TOKENS = {
    // ----------------------------------------
    // 核心基础设施
    // ----------------------------------------
    
    /** 日志服务 - 提供结构化日志记录功能 */
    Logger: Symbol('Logger'),
    
    /** 配置服务 - 管理扩展配置的读取和写入 */
    Configuration: Symbol('Configuration'),
    
    /** 事件总线 - 实现发布-订阅模式的事件通信 */
    EventBus: Symbol('EventBus'),
    
    /** 性能监控 - 收集和记录性能指标 */
    PerformanceMonitor: Symbol('PerformanceMonitor'),
    
    // ----------------------------------------
    // 缓存服务
    // ----------------------------------------
    
    /** 通用缓存服务 - 提供通用的缓存功能 */
    Cache: Symbol('Cache'),
    
    /** 模板缓存 - 专门用于模板的缓存管理 */
    TemplateCache: Symbol('TemplateCache'),
    
    // ----------------------------------------
    // 文件系统服务
    // ----------------------------------------
    
    /** 文件监控服务 - 监视文件变更并触发事件 */
    FileWatcher: Symbol('FileWatcher'),

    /** 文件读取器 - 抽象文件读取操作 */
    FileReader: Symbol('FileReader'),

    /** 工作区服务 - 抽象工作区访问操作 */
    WorkspaceService: Symbol('WorkspaceService'),

    /** 命名空间发现服务 - 自动发现 Minecraft 资源包命名空间 */
    NamespaceDiscoveryService: Symbol('NamespaceDiscoveryService'),
    
    // ----------------------------------------
    // Schema 相关服务
    // ----------------------------------------
    
    /** Schema 解析器 - 解析 JSON Schema 文件 */
    SchemaParser: Symbol('SchemaParser'),
    
    /** Schema 验证器 - 验证数据是否符合 Schema */
    SchemaValidator: Symbol('SchemaValidator'),
    
    /** Schema 部署服务 - 将 Schema 文件部署到工作区 */
    SchemaDeploymentService: Symbol('SchemaDeploymentService'),
    
    /** Schema 文件监控管理器 - 监控工作区 Schema 文件变更 */
    SchemaFileWatcherManager: Symbol('SchemaFileWatcherManager'),
    
    // ----------------------------------------
    // 领域服务
    // ----------------------------------------
    
    /** 模板服务 - 模板的核心业务逻辑 */
    TemplateService: Symbol('TemplateService'),
    
    /** 模板展开器 - 展开模板引用用于 Schema 验证 */
    TemplateExpander: Symbol('TemplateExpander'),
    
    /** 模板解析器 - 解析模板定义 */
    TemplateParser: Symbol('TemplateParser'),
    
    /** 文档解析器 - 解析 YAML 文档 */
    DocumentParser: Symbol('DocumentParser'),
    
    // ----------------------------------------
    // 数据存储服务
    // ----------------------------------------

    /** 统一数据存储服务 - 管理模板和翻译键的存储、查询和更新 */
    DataStoreService: Symbol('DataStoreService'),

    /** 数据存储生命周期 - 初始化、重载、清理等生命周期操作 */
    DataStoreLifecycle: Symbol('DataStoreLifecycle'),

    /** 模板仓储 - 模板数据的存储和查询 */
    TemplateRepository: Symbol('TemplateRepository'),

    /** 翻译仓储 - 翻译键数据的存储和查询 */
    TranslationRepository: Symbol('TranslationRepository'),

    /** 物品 ID 仓储 - 物品 ID 数据的存储和查询 */
    ItemIdRepository: Symbol('ItemIdRepository'),

    /** 内置物品加载器 - 从外部数据源加载 Minecraft 内置物品 */
    BuiltinItemLoader: Symbol('BuiltinItemLoader'),

    /** 分类仓储 - 分类数据的存储和查询 */
    CategoryRepository: Symbol('CategoryRepository'),

    /** 数据配置加载器 - 从 JSON 配置文件加载各种配置数据 */
    DataConfigLoader: Symbol('DataConfigLoader'),
    
    // ----------------------------------------
    // 应用服务
    // ----------------------------------------
    
    /** 扩展服务 - 管理扩展的生命周期和核心功能 */
    ExtensionService: Symbol('ExtensionService'),
    
    /** Schema 服务 - Schema 的加载、查询和补全 */
    SchemaService: Symbol('SchemaService'),
    
    // ----------------------------------------
    // 补全系统
    // ----------------------------------------
    
    /** 补全管理器 - 管理所有补全策略 */
    CompletionManager: Symbol('CompletionManager'),
    
    /** 委托策略注册表 - 注册和管理委托补全策略 */
    DelegateStrategyRegistry: Symbol('DelegateStrategyRegistry'),
    
    // ----------------------------------------
    // 数据服务
    // ----------------------------------------

    /** Minecraft 版本服务 - 获取 Minecraft 版本列表 */
    MinecraftVersionService: Symbol('MinecraftVersionService'),

    /** Minecraft 数据服务 - 加载和查询 Minecraft 原版数据（附魔、实体、粒子等） */
    MinecraftDataService: Symbol('MinecraftDataService'),
    
    // ----------------------------------------
    // YAML 处理服务
    // ----------------------------------------
    
    /** YAML 路径解析器 - 解析 YAML 文档中的路径 */
    YamlPathParser: Symbol('YamlPathParser'),
    
    /** YAML 解析器 - 解析 YAML 文本为结构化数据 */
    YamlParser: Symbol('YamlParser'),
    
    /** YAML 扫描器 - 扫描工作区中的 YAML 文件 */
    YamlScanner: Symbol('YamlScanner'),
    
    /** 工作区扫描缓存 - 缓存工作区扫描结果，避免重复扫描 */
    WorkspaceScanCache: Symbol('WorkspaceScanCache'),

    /** 文档解析缓存 - 缓存 YAML 文档解析结果，避免重复解析 */
    DocumentParseCache: Symbol('DocumentParseCache'),

    // ----------------------------------------
    // 模型预览服务
    // ----------------------------------------

    /** 模型生成器 - 从 YAML 配置生成 Minecraft 模型 JSON */
    ModelGenerator: Symbol('ModelGenerator'),

    /** 渲染器适配器 - 封装 minecraft-model-renderer-ts */
    RendererAdapter: Symbol('RendererAdapter'),

    /** 模型预览服务 - 编排模型生成和渲染 */
    ModelPreviewService: Symbol('ModelPreviewService'),

    /** 扩展参数类型服务 - 提供扩展参数类型的查询和验证 */
    ExtendedTypeService: Symbol('ExtendedTypeService'),

    // ----------------------------------------
    // 通知服务
    // ----------------------------------------

    /** 错误通知管理器 - 管理诊断错误的用户通知 */
    ErrorNotificationManager: Symbol('ErrorNotificationManager'),
} as const;

/**
 * 事件类型常量
 * 
 * 定义系统中所有标准事件的类型字符串。
 * 用于事件总线的发布和订阅，确保事件类型的一致性。
 * 
 * @remarks
 * **命名约定**：
 * - 使用点号分隔的层次化命名：`namespace.entity.action`
 * - 使用过去式动词表示已发生的事件
 * - 保持简洁和可读性
 * 
 * **事件分类**：
 * 
 * 1. **扩展生命周期事件**：
 *    - ExtensionActivated: 扩展激活完成
 *    - ExtensionDeactivating: 扩展即将停用
 * 
 * 2. **配置事件**：
 *    - ConfigurationChanged: 配置项发生变更
 * 
 * 3. **模板事件**：
 *    - TemplateCreated: 新模板创建
 *    - TemplateUpdated: 模板更新
 *    - TemplateDeleted: 模板删除
 * 
 * 4. **文件事件**：
 *    - FileCreated: 文件创建
 *    - FileModified: 文件修改
 *    - FileDeleted: 文件删除
 * 
 * 5. **性能事件**：
 *    - PerformanceMetric: 性能指标记录
 * 
 * **使用模式**：
 * 
 * ```typescript
 * // 发布事件
 * await eventBus.publish(EVENT_TYPES.TemplateCreated, {
 *     id: generateId(),
 *     type: EVENT_TYPES.TemplateCreated,
 *     timestamp: new Date(),
 *     template: newTemplate
 * });
 * 
 * // 订阅事件
 * eventBus.subscribe(EVENT_TYPES.TemplateCreated, (event) => {
 *     console.log('Template created:', event.template.name);
 * });
 * 
 * // 模式订阅（订阅所有模板事件）
 * eventBus.subscribe('template.*', (event) => {
 *     console.log('Template event:', event.type);
 * });
 * ```
 * 
 * @example
 * ```typescript
 * import { EVENT_TYPES } from './core/constants/ServiceTokens';
 * import { IEventBus } from './core/interfaces/IEventBus';
 * 
 * export class TemplateService {
 *     constructor(private readonly eventBus: IEventBus) {}
 *     
 *     async createTemplate(data: TemplateData): Promise<ITemplate> {
 *         const template = new Template(data);
 *         await this.repository.add(template);
 *         
 *         // 发布模板创建事件
 *         await this.eventBus.publish(EVENT_TYPES.TemplateCreated, {
 *             id: generateId(),
 *             type: EVENT_TYPES.TemplateCreated,
 *             timestamp: new Date(),
 *             source: 'TemplateService',
 *             template
 *         });
 *         
 *         return template;
 *     }
 * }
 * ```
 */
/**
 * 事件类型常量
 *
 * 命名约定：
 * - 两级命名：entity.action（如 template.created）— 用于单一实体的事件
 * - 三级命名：namespace.entity.action（如 schema.file.changed）— 用于同一命名空间下有多个实体的情况
 */
export const EVENT_TYPES = {
    // ----------------------------------------
    // 扩展生命周期事件
    // ----------------------------------------
    
    /** 扩展已激活 - 扩展激活完成，所有服务已初始化 */
    ExtensionActivated: 'extension.activated',
    
    /** 扩展即将停用 - 扩展即将停用，开始清理资源 */
    ExtensionDeactivating: 'extension.deactivating',
    
    // ----------------------------------------
    // 配置事件
    // ----------------------------------------
    
    /** 配置已变更 - 某个配置项的值发生变更 */
    ConfigurationChanged: 'extension.configuration.changed',
    
    // ----------------------------------------
    // 模板事件
    // ----------------------------------------
    
    /** 模板已创建 - 新模板添加到系统中 */
    TemplateCreated: 'template.created',
    
    /** 模板已更新 - 现有模板被修改 */
    TemplateUpdated: 'template.updated',
    
    /** 模板已删除 - 模板从系统中移除 */
    TemplateDeleted: 'template.deleted',
    
    // ----------------------------------------
    // 文件事件
    // ----------------------------------------
    
    /** 文件已创建 - 新文件被创建 */
    FileCreated: 'file.created',
    
    /** 文件已修改 - 文件内容发生变更 */
    FileModified: 'file.modified',
    
    /** 文件已删除 - 文件被删除 */
    FileDeleted: 'file.deleted',
    
    // ----------------------------------------
    // 性能事件
    // ----------------------------------------
    
    /** 性能指标 - 记录性能相关的度量数据 */
    PerformanceMetric: 'extension.performance.metric',
    
    // ----------------------------------------
    // Schema 事件
    // ----------------------------------------
    
    /** Schema 已部署 - Schema 文件已部署到工作区 */
    SchemaDeployed: 'schema.deployed',
    
    /** Schema 文件已变更 - 工作区 Schema 文件发生变更 */
    SchemaFileChanged: 'schema.file.changed',
    
    /** Schema 文件已创建 - 工作区新增 Schema 文件 */
    SchemaFileCreated: 'schema.file.created',
    
    /** Schema 文件已删除 - 工作区 Schema 文件被删除 */
    SchemaFileDeleted: 'schema.file.deleted',
    
    /** Schema 热重载 - Schema 已从工作区重新加载 */
    SchemaHotReloaded: 'schema.hot.reloaded',
    
    /** Schema 版本不匹配 - 工作区 Schema 版本与扩展版本不一致 */
    SchemaVersionMismatch: 'schema.version.mismatch',

    // ----------------------------------------
    // 模板缓存事件
    // ----------------------------------------

    /** 模板缓存已重建 - 模板缓存完成重建 */
    TemplateCacheRebuilt: 'template.cache.rebuilt',

    // ----------------------------------------
    // 物品事件
    // ----------------------------------------

    /** 物品已创建 - 新物品 ID 添加到系统中 */
    ItemCreated: 'item.created',

    /** 物品已删除 - 物品 ID 从系统中移除 */
    ItemDeleted: 'item.deleted',

    /** 物品已清空 - 所有物品 ID 被清除 */
    ItemCleared: 'item.cleared',

    // ----------------------------------------
    // 分类事件
    // ----------------------------------------

    /** 分类已创建 - 新分类添加到系统中 */
    CategoryCreated: 'category.created',

    /** 分类已删除 - 分类从系统中移除 */
    CategoryDeleted: 'category.deleted',

    /** 分类已清空 - 所有分类被清除 */
    CategoryCleared: 'category.cleared',

    // ----------------------------------------
    // 翻译事件
    // ----------------------------------------

    /** 翻译已创建 - 新翻译键添加到系统中 */
    TranslationCreated: 'translation.created',

    /** 翻译已删除 - 翻译键从系统中移除 */
    TranslationDeleted: 'translation.deleted',

    /** 翻译已清空 - 所有翻译键被清除 */
    TranslationCleared: 'translation.cleared',

    // ----------------------------------------
    // 数据状态事件
    // ----------------------------------------

    /** 数据状态变更 - 数据加载状态发生变化 */
    DataStatusChanged: 'data.status.changed',
} as const;
