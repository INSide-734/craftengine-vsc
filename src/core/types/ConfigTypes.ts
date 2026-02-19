/**
 * 配置数据类型定义模块
 *
 * 包含所有从 JSON 配置文件加载的数据结构类型定义，
 * 涵盖网络数据源、补全优先级、性能配置、Minecraft 版本、
 * 模型属性、版本条件、时间配置、API 端点、MiniMessage 常量、
 * 资源类型预设和参数类型等配置接口。
 */

import {
    IExtendedParameterTypeDefinition,
    IExtendedPropertyDefinition
} from '../interfaces/IExtendedParameterType';

/**
 * 网络数据源配置
 */
export interface IDataSourceConfig {
    /** 数据源描述 */
    description: string;
    /** 主站 URL */
    primary: string;
    /** 镜像站 URL 列表 */
    mirrors: string[];
    /** 端点路径模板 */
    endpoints: Record<string, string>;
}

/**
 * 网络配置
 */
export interface INetworkConfig {
    /** 请求超时时间（毫秒） */
    requestTimeout: number;
    /** 重试次数 */
    retryAttempts: number;
    /** 重试延迟（毫秒） */
    retryDelayMs: number;
}

/**
 * 数据源配置文件结构
 */
export interface IDataSourcesConfig {
    version: string;
    lastUpdated: string;
    description: string;
    network: INetworkConfig;
    sources: Record<string, IDataSourceConfig>;
    builtinSource: {
        identifier: string;
        description: string;
    };
}

/**
 * 补全策略配置
 */
export interface ICompletionStrategyConfig {
    name: string;
    priority: number;
    description: string;
    provider?: string;
}

/**
 * 优先级计算配置
 */
export interface IPriorityCalculationConfig {
    baseValue: number;
    adjustments: Record<string, number>;
}

/**
 * 补全优先级配置文件结构
 */
export interface ICompletionPrioritiesConfig {
    version: string;
    lastUpdated: string;
    description: string;
    strategies: {
        main: Record<string, ICompletionStrategyConfig>;
        delegates: Record<string, ICompletionStrategyConfig>;
    };
    priorityCalculation: IPriorityCalculationConfig;
    sortOrder: Record<string, number>;
}

/**
 * 性能配置文件结构
 */
export interface IPerformanceConfig {
    version: string;
    lastUpdated: string;
    description: string;
    logging: {
        maxFileSize: number;
        maxFileSizeDescription: string;
        rotationStrategy: string;
        appendMode: boolean;
    };
    network: INetworkConfig & {
        maxRedirects?: number;
        maxResponseSize?: number;
    };
    completion: {
        debounceMs: number;
        maxResultsPerStrategy: number;
        cacheHitRateTarget: number;
    };
    performance: {
        activationTimeoutMs: number;
        completionResponseTimeMs: number;
        hoverResponseTimeMs: number;
        diagnosticUpdateMs: number;
    };
    batch: {
        tagLoadBatchSize: number;
        maxConcurrentRequests: number;
    };
    /** 性能阈值（操作名 -> 毫秒） */
    thresholds?: Record<string, number>;
    /** 缓存容量配置 */
    caches?: {
        diagnosticCache?: { capacity: number; ttl: number };
        documentParseCache?: { capacity: number };
        yamlPathParser?: { astCacheSize: number; pathCacheSize: number };
        namespaceDiscovery?: { ttl: number; maxSize: number };
        filePathDiagnostic?: { capacity: number; ttl: number; fileExistsCacheTTL: number };
        schemaDiagnostic?: { capacity: number; ttl: number };
        templateDiagnostic?: { capacity: number; ttl: number };
        modelCache?: { maxSize: number };
        resolvedModelCache?: { size: number };
        textureCache?: { imageCacheSize: number; textureCacheSize: number };
    };
    /** Worker 线程池配置 */
    workerPool?: {
        taskTimeout: number;
        workerTerminateTimeout: number;
    };
    /** 文件系统配置 */
    filesystem?: {
        skipDirectories: string[];
        resourcePackCacheTTL: number;
        concurrencyLimit: number;
        defaultMaxFileSize: number;
        yamlScannerBatchSize: number;
    };
}

/**
 * 扩展类型配置文件结构
 */
export interface IExtendedTypesConfig {
    version: string;
    lastUpdated: string;
    description: string;
    types: Record<string, IExtendedParameterTypeDefinition>;
    propertyDefinitions: Record<string, IExtendedPropertyDefinition[]>;
    snippets: Record<string, string>;
}

// ============================================
// Minecraft 数据配置接口
// ============================================

/**
 * Minecraft 版本配置
 */
export interface IMinecraftVersionsConfig {
    version: string;
    lastUpdated: string;
    description: string;
    /** 默认版本 */
    defaultVersion: string;
    /** 版本到资源包格式的映射 */
    packFormats: Record<string, number>;
    /** 支持的版本列表 */
    supportedVersions: string[];
    /** 版本别名映射 */
    versionAliases: Record<string, string>;
}

/**
 * 模型属性定义
 */
export interface IModelPropertyDefinition {
    /** 属性键 (如 "minecraft:broken") */
    key: string;
    /** 属性名称 (如 "BROKEN") */
    name: string;
    /** 属性描述 */
    description: string;
}

/**
 * Minecraft 模型属性配置
 */
export interface IModelPropertiesConfig {
    version: string;
    lastUpdated: string;
    description: string;
    /** 模型类型映射 */
    modelTypes: Record<string, string>;
    /** 条件属性列表 */
    conditionProperties: IModelPropertyDefinition[];
    /** 选择属性列表 */
    selectProperties: IModelPropertyDefinition[];
    /** 范围分发属性列表 */
    rangeDispatchProperties: IModelPropertyDefinition[];
    /** 特殊模型类型列表 */
    specialModelTypes: IModelPropertyDefinition[];
    /** 已知键列表 */
    knownKeys: Record<string, string[]>;
    /** Tint 类型配置 */
    tintTypes: {
        /** 有专用工厂类的 tint 类型 */
        specialFactories: string[];
        /** 使用 SimpleDefaultTint 的类型 */
        simpleDefaultTypes: string[];
    };
}

/**
 * 版本条件操作符定义
 */
export interface IVersionConditionOperator {
    /** 操作符 (如 ">=") */
    operator: string;
    /** 描述 */
    description: string;
    /** 图标 */
    icon: string;
}

/**
 * 版本条件配置
 */
export interface IVersionConditionConfig {
    version: string;
    lastUpdated: string;
    description: string;
    /** 操作符列表 */
    operators: IVersionConditionOperator[];
    /** 语法定义 */
    syntax: {
        prefix: string;
        rangeSeparator: string;
        sectionIdPrefix: string;
    };
    /** 正则表达式模式 */
    patterns: Record<string, string>;
    /** 默认值 */
    defaults: {
        maxVersionsToShow: number;
        fallbackVersion: string;
    };
    /** 文档链接 */
    documentation: {
        baseUrl: string;
    };
}

// ============================================
// 时间和性能配置接口
// ============================================

/**
 * 时间配置
 */
export interface ITimingConfig {
    version: string;
    lastUpdated: string;
    description: string;
    /** 防抖配置 */
    debounce: {
        documentDiagnostics: number;
        schemaFileWatcher: number;
        completionProvider: number;
    };
    /** 延迟配置 */
    delays: {
        initialDiagnostics: number;
        activationTimeout: number;
    };
    /** 限制配置 */
    limits: {
        templateNestingDepth: number;
        maxFileSize: number;
        yamlScannerBatchSize: number;
        minecraftDataBatchSize: number;
        maxConcurrentRequests: number;
        maxResultsPerStrategy: number;
        searchRange: number;
    };
    /** 缓存配置 */
    cache: {
        versionCacheTTL: number;
        minecraftDataCacheTTL: number;
        schemaCacheTTL: number;
        namespaceDiscoveryCacheTTL: number;
        templateCacheTTL: number;
        filePathCacheTTL: number;
        fileExistsCacheTTL: number;
    };
    /** 网络配置 */
    network: {
        requestTimeout: number;
        retryAttempts: number;
        retryDelayMs: number;
    };
    /** 日志配置 */
    logging: {
        maxFileSize: number;
        appendMode: boolean;
        rotationStrategy: string;
    };
    /** 性能目标 */
    performance: {
        completionResponseTimeMs: number;
        hoverResponseTimeMs: number;
        diagnosticUpdateMs: number;
        cacheHitRateTarget: number;
    };
    /** 诊断处理器时序配置 */
    diagnosticHandler?: {
        initialDelay: number;
        highPriorityDelay: number;
        lowPriorityDelay: number;
        incrementalThreshold: number;
        fullAnalysisLineThreshold: number;
        fullAnalysisCharThreshold: number;
        eventThrottleDelay: number;
    };
    /** 诊断组配置 */
    diagnosticGroups?: Array<{
        name: string;
        providers: string[];
        priority: number;
    }>;
    /** 补全管理器超时配置 */
    completionManager?: {
        activationTimeoutMs: number;
        totalActivationTimeoutMs: number;
    };
    /** 文件索引编排器配置 */
    fileIndexing?: {
        maxRetries: number;
        retryBaseDelayMs: number;
        batchSize: number;
        lockCleanupIntervalMs: number;
        lockExpiryMs: number;
    };
}

// ============================================
// 版本要求配置接口
// ============================================

/**
 * 版本要求配置
 */
export interface IVersionRequirementsConfig {
    version: string;
    lastUpdated: string;
    description: string;
    /** Minecraft 版本要求 */
    minecraft: {
        minSupported: string;
        minSupportedStrict: string;
        maxSupported: string;
        recommended: string;
    };
    /** 资源包格式要求 */
    packFormat: {
        minSupported: number;
        maxSupported: number;
    };
    /** 兼容性信息 */
    compatibility: {
        deprecatedVersions: string[];
        experimentalVersions: string[];
    };
}

// ============================================
// API 端点配置接口
// ============================================

/**
 * API 端点定义
 */
export interface IApiEndpoint {
    description: string;
    primary: string;
    fallback?: string;
    mirrors?: string[];
}

/**
 * API 数据源定义
 */
export interface IApiDataSource {
    description: string;
    baseUrl: string;
    endpoints: Record<string, string>;
}

/**
 * API 端点配置
 */
export interface IApiEndpointsConfig {
    version: string;
    lastUpdated: string;
    description: string;
    /** Minecraft 官方 API */
    minecraft: {
        versionManifest: IApiEndpoint;
    };
    /** PrismarineJS 数据源 */
    prismarineData: IApiDataSource;
    /** Minecraft Assets 数据源 */
    minecraftAssets: IApiDataSource;
}

// ============================================
// MiniMessage 常量配置接口
// ============================================

/**
 * MiniMessage 点击动作定义
 */
export interface IMiniMessageClickAction {
    name: string;
    description: string;
}

/**
 * MiniMessage 悬停动作定义
 */
export interface IMiniMessageHoverAction {
    name: string;
    description: string;
}

/**
 * MiniMessage 按键绑定定义
 */
export interface IMiniMessageKeybind {
    key: string;
    description: string;
}

/**
 * MiniMessage NBT 源类型定义
 */
export interface IMiniMessageNbtSourceType {
    name: string;
    description: string;
}

/**
 * MiniMessage 十六进制颜色定义
 */
export interface IMiniMessageHexColor {
    hex: string;
    name: string;
    description: string;
}

/**
 * MiniMessage 简单标签定义（用于分类索引）
 */
export interface IMiniMessageTag {
    name: string;
    aliases: string[];
    description: string;
    selfClosing?: boolean;
    hasArgument?: boolean;
}

/**
 * MiniMessage 标签参数定义
 */
export interface IMiniMessageTagArgument {
    /** 参数名称 */
    name: string;
    /** 参数类型（string, number, boolean, enum, color） */
    type: string;
    /** 是否为必填参数 */
    required: boolean;
    /** 参数描述 */
    description: string;
    /** 枚举类型的可选值列表 */
    enumValues?: string[];
}

/**
 * MiniMessage 完整标签定义（用于补全和验证）
 */
export interface IMiniMessageFullTagDefinition {
    /** 标签名称（主名称） */
    name: string;
    /** 别名列表（可选） */
    aliases?: string[];
    /** 标签语法示例 */
    syntax: string;
    /** 标签功能描述 */
    description: string;
    /** 参数定义列表 */
    arguments?: IMiniMessageTagArgument[];
    /** 是否为自闭合标签（如 <reset>, <newline>） */
    selfClosing?: boolean;
    /** 使用示例 */
    example: string;
    /** 标签分类（color, decoration, event, format, special, craftengine） */
    category: string;
    /** VSCode 代码片段格式的插入文本 */
    insertSnippet?: string;
}

/**
 * MiniMessage 分类配置
 */
export interface IMiniMessageCategoryConfig {
    /** VS Code CompletionItemKind 枚举值 */
    completionKind: number;
    /** 排序前缀 */
    sortPrefix: string;
}

/**
 * MiniMessage 常量配置
 */
export interface IMiniMessageConstantsConfig {
    version: string;
    lastUpdated: string;
    description: string;
    /** 颜色名称列表 */
    colors: string[];
    /** 点击动作列表 */
    clickActions: IMiniMessageClickAction[];
    /** 悬停动作列表 */
    hoverActions: IMiniMessageHoverAction[];
    /** Pride 旗帜列表 */
    prideFlags: string[];
    /** 按键绑定列表 */
    keybinds: IMiniMessageKeybind[];
    /** NBT 源类型列表 */
    nbtSourceTypes: IMiniMessageNbtSourceType[];
    /** 常用十六进制颜色 */
    commonHexColors: IMiniMessageHexColor[];
    /** 格式化标签 */
    formattingTags: IMiniMessageTag[];
    /** 颜色标签 */
    colorTags: IMiniMessageTag[];
    /** 交互标签 */
    interactionTags: IMiniMessageTag[];
    /** 内容标签 */
    contentTags: IMiniMessageTag[];
    /** 特殊标签 */
    specialTags: IMiniMessageTag[];
    /** CraftEngine 自定义标签 */
    craftEngineTags: IMiniMessageTag[];
    /** 完整标签定义列表（用于补全和验证） */
    tags: IMiniMessageFullTagDefinition[];
    /** 正则表达式模式 */
    patterns: Record<string, string>;
    /** 分类显示配置 */
    categoryConfig: Record<string, IMiniMessageCategoryConfig>;
    /** 可否定的装饰列表 */
    negatableDecorations: string[];
    /** 常用语言代码 */
    commonLanguages: string[];
}

// ============================================
// 资源类型预设配置接口
// ============================================

/**
 * 资源类型预设定义
 */
export interface IResourceTypePreset {
    description: string;
    basePath: string;
    fileExtensions: string[];
    includeNamespace: boolean;
    stripExtension: boolean;
    searchDepth: number;
    pathSeparator: string;
    includeSubdirectories: boolean;
}

/**
 * 资源类型预设配置
 */
export interface IResourceTypePresetsConfig {
    version: string;
    lastUpdated: string;
    description: string;
    /** 资源类型列表 */
    resourceTypes: string[];
    /** 预设配置 */
    presets: Record<string, IResourceTypePreset>;
    /** 默认值 */
    defaults: {
        defaultNamespace: string;
        searchDepth: number;
        pathSeparator: string;
        includeNamespace: boolean;
        stripExtension: boolean;
        includeSubdirectories: boolean;
        autoDetectWorkspace: boolean;
    };
    /** 文件扩展名分组 */
    fileExtensionGroups: Record<string, string[]>;
    /** 路径模板 */
    pathTemplates: Record<string, string>;
    /** 排除模式 */
    excludePatterns: Record<string, string[]>;
}

// ============================================
// 参数类型配置接口
// ============================================

/**
 * 参数类型区域设置
 */
export interface IParameterTypeLocale {
    code: string;
    name: string;
    description: string;
}

/**
 * 参数类型配置
 */
export interface IParameterTypesConfig {
    version: string;
    lastUpdated: string;
    description: string;
    /** 类型定义 */
    types: Record<string, IExtendedParameterTypeDefinition>;
    /** 属性定义 */
    propertyDefinitions: Record<string, IExtendedPropertyDefinition[]>;
    /** 代码片段 */
    snippets: Record<string, string>;
    /** 值类型分组 */
    valueTypes: Record<string, string[]>;
    /** 区域设置列表 */
    locales: IParameterTypeLocale[];
    /** 正则表达式模式 */
    patterns: Record<string, string>;
}

// ============================================
// 诊断代码配置接口
// ============================================

/**
 * 诊断代码定义
 */
export interface IDiagnosticCodeDefinition {
    /** 简短描述 */
    description: string;
}

/**
 * 诊断代码配置
 */
export interface IDiagnosticCodesConfig {
    version: string;
    lastUpdated: string;
    description: string;
    /** 诊断代码定义 */
    codes: Record<string, IDiagnosticCodeDefinition>;
    /** 代码别名映射（常量名 -> 代码） */
    codeAliases: Record<string, string>;
    /** AJV 关键字到诊断代码的映射 */
    ajvKeywordMapping: Record<string, string>;
    /** 内部错误代码到诊断代码的映射 */
    internalCodeMapping: Record<string, string>;
    /** 类型显示名称映射 */
    typeDisplayNames?: Record<string, string>;
}

// ============================================
// 诊断严重程度规则配置接口
// ============================================

/**
 * 严重程度规则定义
 */
export interface ISeverityRuleDefinition {
    /** 默认严重程度 */
    default: string;
    /** 宽松模式下的严重程度 */
    loose?: string;
    /** 严格模式下的严重程度 */
    strict?: string;
    /** 是否可由用户配置 */
    configurable: boolean;
}

/**
 * 诊断严重程度规则配置
 */
export interface IDiagnosticSeverityRulesConfig {
    version: string;
    lastUpdated: string;
    description: string;
    /** 严重程度规则 */
    rules: Record<string, ISeverityRuleDefinition>;
}

// ============================================
// Schema 配置接口
// ============================================

/**
 * Schema 配置
 */
export interface ISchemaConfig {
    version: string;
    lastUpdated: string;
    description: string;
    /** Schema 引用解析配置 */
    resolution: {
        defaultMaxDepth: number;
        depthWarningThreshold: number;
    };
    /** Schema 缓存配置 */
    cache: {
        propertiesCacheSize: number;
        pathCacheSize: number;
        availabilityCacheSize: number;
        fileCacheSize: number;
        validateCacheSize: number;
    };
    /** 版本条件配置 */
    versionCondition: {
        prefix: string;
        pattern: string;
    };
    /** 默认顶级字段列表 */
    defaultTopLevelFields: string[];
    /** 文档 section 键名 */
    documentSections: {
        templateKey: string;
        itemsKey: string;
        blocksKey: string;
        furnitureKey: string;
        categoriesKey: string;
    };
    /** 文档正则模式 */
    documentPatterns: {
        namespacedId: string;
        i18nReference: string;
        l10nReference: string;
    };
    /** 模板解析器配置 */
    templateParser?: {
        specialParams: string[];
        excludeKeys: string[];
        defaultTemplateKey: string;
    };
}

// ============================================
// 物品类型配置接口
// ============================================

/**
 * 物品类型显示配置
 */
export interface IItemTypeDisplayConfig {
    /** 显示图标 */
    icon: string;
    /** 显示标签 */
    label: string;
}

/**
 * 物品类型配置
 */
export interface IItemTypeConfig {
    version: string;
    lastUpdated: string;
    description: string;
    /** 物品类型显示配置 */
    types: Record<string, IItemTypeDisplayConfig>;
}
