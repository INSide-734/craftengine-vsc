/**
 * 扩展常量定义
 *
 * 集中管理所有硬编码的字符串常量，包括：
 * - 诊断源标识符
 * - 补全提供者标识符
 * - 命令 ID
 * - 配置键名
 * - 上下文键
 *
 * @remarks
 * 所有常量都应该从这个文件导入，避免在代码中硬编码字符串。
 * 这样可以：
 * 1. 避免拼写错误
 * 2. 方便重构和重命名
 * 3. 提供类型安全
 * 4. 集中管理，易于维护
 */

// ============================================
// 扩展基本信息
// ============================================

/**
 * 扩展名称和标识
 */
export const EXTENSION = {
    /** 扩展显示名称 */
    NAME: 'CraftEngine',
    /** 扩展 ID 前缀 */
    PREFIX: 'craftengine',
    /** 输出通道名称 */
    OUTPUT_CHANNEL: 'CraftEngine',
} as const;

// ============================================
// 诊断源标识符
// ============================================

/**
 * 诊断源标识符
 *
 * 用于 diagnostic.source 属性，标识诊断信息的来源
 */
export const DIAGNOSTIC_SOURCES = {
    /** 模板诊断 */
    TEMPLATE: 'CraftEngine Template',
    /** 模板参数验证 */
    PARAMETER_VALIDATOR: 'CraftEngine Parameter Validator',
    /** 模板参数建议 */
    PARAMETER_SUGGESTION: 'CraftEngine Parameter Suggestion',
    /** 解析器 */
    PARSER: 'CraftEngine Parser',
    /** 扩展参数类型 */
    EXTENDED_TYPE: 'CraftEngine Extended Type',
    /** 翻译键 */
    TRANSLATION: 'CraftEngine Translation',
    /** 物品 ID */
    ITEM_ID: 'CraftEngine ItemId',
    /** 分类引用 */
    CATEGORY: 'CraftEngine Category',
    /** 文件路径 */
    FILE_PATH: 'CraftEngine File Path',
    /** Schema 验证器 */
    SCHEMA_VALIDATOR: 'CraftEngine Schema Validator',
    /** Schema 解析器 */
    SCHEMA_PARSER: 'CraftEngine Schema Parser',
    /** YAML 解析器 */
    YAML_PARSER: 'CraftEngine YAML Parser',
    /** 版本条件 */
    VERSION_CONDITION: 'CraftEngine VersionCondition',
    /** MiniMessage */
    MINI_MESSAGE: 'CraftEngine MiniMessage',
} as const;

// ============================================
// 补全提供者标识符
// ============================================

/**
 * 补全提供者标识符
 *
 * 用于 Schema 的 x-completion-provider 属性
 */
export const COMPLETION_PROVIDERS = {
    /** 模板名称补全 */
    TEMPLATE_NAME: 'craftengine.templateName',
    /** 模板参数补全 */
    TEMPLATE_PARAMETERS: 'craftengine.templateParameters',
    /** 文件路径补全 */
    FILE_PATH: 'craftengine.filePath',
    /** 物品 ID 补全 */
    ITEM_ID: 'craftengine.itemId',
    /** 版本条件补全 */
    VERSION_CONDITION: 'craftengine.versionCondition',
    /** 分类引用补全 */
    CATEGORY_REFERENCE: 'craftengine.categoryReference',
    /** 富文本补全 */
    RICH_TEXT: 'craftengine.richText',
    /** MiniMessage 补全 */
    MINI_MESSAGE: 'craftengine.miniMessage',
    /** 翻译键补全 */
    TRANSLATION_KEY: 'craftengine.translationKey',
} as const;

// ============================================
// 命令 ID
// ============================================

/**
 * VSCode 命令 ID
 */
export const COMMANDS = {
    // Schema 相关命令
    /** 部署 Schema */
    SCHEMA_DEPLOY: 'craftengine.schema.deploy',
    /** 重置 Schema */
    SCHEMA_RESET: 'craftengine.schema.reset',
    /** 重新加载 Schema */
    SCHEMA_RELOAD: 'craftengine.schema.reload',
    /** Schema 热重载 */
    SCHEMA_HOT_RELOAD: 'craftengine.schema.hotReload',
    /** 部署 Schema 到工作区 */
    SCHEMA_DEPLOY_TO_WORKSPACE: 'craftengine.schema.deployToWorkspace',
    /** 版本变更时自动更新 */
    SCHEMA_AUTO_UPDATE: 'craftengine.schema.autoUpdateOnVersionChange',

    // 模板相关命令
    /** 从使用创建模板 */
    CREATE_TEMPLATE_FROM_USAGE: 'craftengine.createTemplateFromUsage',
    /** 忽略模板警告 */
    IGNORE_TEMPLATE_WARNING: 'craftengine.ignoreTemplateWarning',
    // 缓存相关命令
    /** 重建缓存 */
    REBUILD_CACHE: 'craftengine.rebuildCache',
    /** 重新加载 Minecraft 物品 */
    RELOAD_MINECRAFT_ITEMS: 'craftengine.reloadMinecraftItems',

    // 诊断相关命令
    /** 忽略警告 */
    IGNORE_WARNING: 'craftengine.ignoreWarning',

    // 物品相关命令
    /** 忽略物品警告 */
    IGNORE_ITEM_WARNING: 'craftengine.ignoreItemWarning',
    /** 预览物品模型 */
    PREVIEW_ITEM_MODEL: 'craftengine.previewItemModel',

    // 文件相关命令
    /** 创建资源文件 */
    CREATE_RESOURCE_FILE: 'craftengine.createResourceFile',

    // 扩展生命周期命令
    /** 重启扩展 */
    RESTART: 'craftengine.restart',
    /** 检查健康状态 */
    CHECK_HEALTH: 'craftengine.checkHealth',
} as const;

// ============================================
// 配置键
// ============================================

/**
 * 配置键名
 *
 * 用于 workspace.getConfiguration() 获取配置
 */
export const CONFIG_KEYS = {
    // 日志配置
    /** 日志配置前缀 */
    LOGGING: 'craftengine.logging',
    /** 调试模式 */
    LOGGING_DEBUG_MODE: 'craftengine.logging.debugMode',

    // 诊断配置
    /** 诊断配置前缀 */
    DIAGNOSTICS: 'craftengine.diagnostics',
    /** 文件路径验证 */
    DIAGNOSTICS_FILE_PATH_VALIDATION: 'craftengine.diagnostics.filePathValidation',
    /** Schema 验证 */
    DIAGNOSTICS_SCHEMA_VALIDATION: 'craftengine.diagnostics.schemaValidation',

    // 验证配置
    /** 验证配置前缀 */
    VALIDATION: 'craftengine.validation',
    /** 验证级别 */
    VALIDATION_LEVEL: 'craftengine.validation.level',
    /** 模板展开 */
    VALIDATION_TEMPLATE_EXPANSION: 'craftengine.validation.templateExpansion',

    // 预览配置
    /** 资源包路径 */
    PREVIEW_RESOURCE_PACKS: 'craftengine.preview.resourcePacks',
    /** 使用内部资源 */
    PREVIEW_USE_INTERNAL_RESOURCES: 'craftengine.preview.useInternalResources',
    /** 渲染尺寸 */
    PREVIEW_RENDER_SIZE: 'craftengine.preview.renderSize',
} as const;

// ============================================
// 上下文键
// ============================================

/**
 * VSCode 上下文键
 *
 * 用于 setContext 命令设置上下文
 */
export const CONTEXT_KEYS = {
    /** 光标处是否有物品 ID */
    IS_ITEM_ID_AT_CURSOR: 'craftengine.isItemIdAtCursor',
} as const;

// ============================================
// 领域常量
// ============================================

/**
 * 物品配置节点键名
 *
 * YAML 文件中用于定义物品的顶级节点名称
 */
export const ITEM_SECTION_KEYS = ['items', 'blocks', 'furniture'] as const;

// ============================================
// UI 文本
// ============================================

/**
 * 状态栏和 UI 显示文本
 */
export const UI_TEXT = {
    /** 诊断状态栏名称 */
    DIAGNOSTICS_STATUS_BAR: 'CraftEngine Diagnostics',
    /** 模板诊断标题 */
    TEMPLATE_DIAGNOSTICS_TITLE: 'CraftEngine Template Diagnostics',
    /** Schema 标题 */
    SCHEMA_TITLE: 'CraftEngine Template Schema',
    /** Schema 回退标题 */
    SCHEMA_FALLBACK_TITLE: 'CraftEngine Template Schema (Fallback)',
} as const;

// ============================================
// 类型导出
// ============================================

/** 诊断源类型 */
export type DiagnosticSource = (typeof DIAGNOSTIC_SOURCES)[keyof typeof DIAGNOSTIC_SOURCES];

/** 补全提供者类型 */
export type CompletionProvider = (typeof COMPLETION_PROVIDERS)[keyof typeof COMPLETION_PROVIDERS];

/** 命令类型 */
export type Command = (typeof COMMANDS)[keyof typeof COMMANDS];

/** 配置键类型 */
export type ConfigKey = (typeof CONFIG_KEYS)[keyof typeof CONFIG_KEYS];

/** 上下文键类型 */
export type ContextKey = (typeof CONTEXT_KEYS)[keyof typeof CONTEXT_KEYS];
