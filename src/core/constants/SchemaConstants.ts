/**
 * Schema 元数据属性名常量和配置
 *
 * SCHEMA_METADATA: 内部属性名标识符（保留在代码中）
 * SCHEMA_RESOLUTION, SCHEMA_CACHE, VERSION_CONDITION: 数据来源 data/constants/schema-config.json
 * 必须在使用前调用 initializeSchemaConfig() 初始化。
 */

import { type ISchemaConfig } from '../types/ConfigTypes';

/**
 * Schema 元数据属性名常量
 *
 * 用于标记 Schema 对象的上下文信息，避免魔法字符串分散在代码中。
 */
export const SCHEMA_METADATA = {
    /** Schema 文件路径 */
    SCHEMA_FILE: '__schemaFile__',
    /** Schema 文件所在目录 */
    SCHEMA_DIR: '__schemaDir__',
    /** 上下文 Schema */
    CONTEXT_SCHEMA: '__contextSchema__',
    /** 循环引用标记 */
    CIRCULAR_REF: '__circularRef__',
    /** 加载时间戳 */
    LOADED_AT: '__loadedAt__',
    /** Schema 来源 */
    SCHEMA_SOURCE: '__schemaSource__',
} as const;

// ============================================================================
// JSON 配置驱动的 Schema 配置
// ============================================================================

/** 已加载的配置 */
let loadedConfig: ISchemaConfig | null = null;

/**
 * 确保已初始化
 */
function ensureInitialized(): ISchemaConfig {
    if (!loadedConfig) {
        throw new Error('SchemaConfig not initialized. Call initializeSchemaConfig() first.');
    }
    return loadedConfig;
}

/**
 * 初始化 Schema 配置（从 JSON 配置加载）
 *
 * 必须在使用任何 Schema 配置之前调用。
 *
 * @param config Schema 配置
 */
export function initializeSchemaConfig(config: ISchemaConfig): void {
    loadedConfig = config;
    // 重置缓存的正则，下次访问时重新编译
    cachedVersionPattern = null;
}

// ============================================================================
// 导出（从 JSON 配置读取）
// ============================================================================

/**
 * Schema 引用解析配置
 */
export const SCHEMA_RESOLUTION = {
    get DEFAULT_MAX_DEPTH(): number {
        return ensureInitialized().resolution.defaultMaxDepth;
    },
    get DEPTH_WARNING_THRESHOLD(): number {
        return ensureInitialized().resolution.depthWarningThreshold;
    },
} as const;

/**
 * Schema 缓存配置
 */
export const SCHEMA_CACHE = {
    get PROPERTIES_CACHE_SIZE(): number {
        return ensureInitialized().cache.propertiesCacheSize;
    },
    get PATH_CACHE_SIZE(): number {
        return ensureInitialized().cache.pathCacheSize;
    },
    get AVAILABILITY_CACHE_SIZE(): number {
        return ensureInitialized().cache.availabilityCacheSize;
    },
    get FILE_CACHE_SIZE(): number {
        return ensureInitialized().cache.fileCacheSize;
    },
    get VALIDATE_CACHE_SIZE(): number {
        return ensureInitialized().cache.validateCacheSize;
    },
} as const;

/** 缓存的版本条件正则 */
let cachedVersionPattern: RegExp | null = null;

/**
 * 版本条件相关常量
 */
export const VERSION_CONDITION = {
    get PREFIX(): string {
        return ensureInitialized().versionCondition.prefix;
    },
    get PATTERN(): RegExp {
        if (!cachedVersionPattern) {
            cachedVersionPattern = new RegExp(ensureInitialized().versionCondition.pattern);
        }
        return cachedVersionPattern;
    },
} as const;
