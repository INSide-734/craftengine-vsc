// ============================================================================
// 核心基础设施接口
// ============================================================================

/** 日志系统 */
export * from './ILogger';

/** 配置管理 */
export * from './IConfiguration';

/** 事件总线 */
export * from './IEventBus';

/** 依赖注入 */
export * from './IDependencyContainer';

/** 文件监控 */
export * from './IFileWatcher';

/** 命名空间发现服务 */
export * from './INamespaceDiscoveryService';

/** 性能监控 */
export * from './IPerformanceMonitor';

/** 缓存系统 */
export * from './ICache';

// ============================================================================
// 模板领域接口
// ============================================================================

/** 模板实体 */
export * from './ITemplate';

/** 扩展参数类型 */
export * from './IExtendedParameterType';

/** 模板服务 */
export * from './ITemplateService';

/** 模板仓储 */
export * from './ITemplateRepository';

/** 统一数据存储服务 */
export * from './IDataStoreService';

/** 数据存储生命周期 */
export * from './IDataStoreLifecycle';

/** 数据配置加载器 */
export * from './IDataConfigLoader';

/** 模板展开器 */
export * from './ITemplateExpander';

/** 模板搜索和建议 */
export {
    ITemplateSearchResult,
    IAdvancedTemplateSearchOptions,
    ITemplateSuggestionContext,
    ITemplateSuggestion,
} from './ITemplateSearchResult';

/** 文档解析 */
export * from './IDocumentParser';

/** 已解析文档和解析缓存 */
export * from './IParsedDocument';

// ============================================================================
// 补全系统接口
// ============================================================================

/** 补全策略 */
export * from './ICompletionStrategy';

/** 补全委托注册 */
export * from './IDelegateStrategyRegistry';

/** 提供者接口 */
export * from './IProviders';

// ============================================================================
// Schema 系统接口
// ============================================================================

/** Schema 解析器 */
export * from './ISchemaParser';

/** Schema 文件加载器 */
export * from './ISchemaFileLoader';

/** Schema 服务 */
export * from './ISchemaService';

/** Schema 部署服务 */
export * from './ISchemaDeploymentService';

// ============================================================================
// YAML 处理接口
// ============================================================================

/** YAML 路径解析 */
export * from './IYamlPathParser';

/** YAML 文档 */
export * from './IYamlDocument';

/** YAML 解析器 */
export * from './IYamlParser';

/** YAML 扫描器 */
export * from './IYamlScanner';

// ============================================================================
// 扩展服务接口
// ============================================================================

/** 扩展服务 */
export * from './IExtensionService';

/** 诊断提供者 */
export * from './IDiagnosticProvider';

// ============================================================================
// 翻译系统接口
// ============================================================================

/** 翻译键、i18n 引用、l10n 引用 */
export * from './ITranslation';

/** 物品 ID */
export * from './IItemId';

/** 分类 */
export * from './ICategory';

/** 文件读取器 */
export * from './IFileReader';

/** 工作区服务 */
export * from './IWorkspaceService';

/** Minecraft 版本服务 */
export * from './IMinecraftVersionService';

/** Minecraft 数据服务 */
export * from './IMinecraftDataService';

/** Minecraft 数据加载器 */
export * from './IMinecraftDataLoader';

/** Minecraft 数据查询 */
export * from './IMinecraftDataQuery';

/** Minecraft 数据验证器 */
export * from './IMinecraftDataValidator';

// ============================================================================
// 模型预览接口
// ============================================================================

/** 模型生成器 */
export * from './IModelGenerator';

/** 模型预览服务 */
export * from './IModelPreviewService';

/** 渲染器适配器 */
export * from './IRendererAdapter';

/** 资源包发现 */
export * from './IResourcePackDiscovery';
