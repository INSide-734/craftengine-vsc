/**
 * 诊断错误代码定义
 *
 * 数据来源：data/constants/diagnostic-codes.json
 * 此模块从 JSON 配置文件加载诊断代码定义。
 * 必须在使用前调用 initializeDiagnosticCodes() 初始化。
 *
 * 格式: CE<类别><编号>
 * - CE1xxx: YAML 语法错误
 * - CE2xxx: Schema 验证错误
 * - CE3xxx: 引用错误
 * - CE4xxx: 类型验证错误
 * - CE5xxx: 警告和建议
 */

import { type IDiagnosticCodesConfig } from '../types/ConfigTypes';

/**
 * 诊断代码信息
 */
export interface IDiagnosticCodeInfo {
    /** 错误代码 */
    code: string;
    /** 简短描述 */
    description: string;
}

// ============================================================================
// JSON 配置驱动的诊断代码注册表
// ============================================================================

/** 代码信息注册表（code -> info） */
let codeInfoRegistry: Record<string, IDiagnosticCodeInfo> | null = null;

/** 内部代码映射（internalCode -> info） */
let internalCodeMapping: Record<string, IDiagnosticCodeInfo> | null = null;

/** AJV 关键字映射（keyword -> info） */
let ajvKeywordMapping: Record<string, IDiagnosticCodeInfo> | null = null;

/** 代码别名映射（aliasName -> info） */
let codeAliasMapping: Record<string, IDiagnosticCodeInfo> | null = null;

/**
 * 从代码和描述构建 IDiagnosticCodeInfo
 */
function buildCodeInfo(code: string, description: string): IDiagnosticCodeInfo {
    return { code, description };
}

/**
 * 确保已初始化
 */
function ensureInitialized(): void {
    if (!codeInfoRegistry) {
        throw new Error('DiagnosticCodes not initialized. Call initializeDiagnosticCodes() first.');
    }
}

/**
 * 初始化诊断代码（从 JSON 配置加载）
 *
 * 必须在使用任何诊断代码之前调用。
 *
 * @param config 诊断代码配置
 */
export function initializeDiagnosticCodes(config: IDiagnosticCodesConfig): void {
    // 构建代码信息注册表
    const registry: Record<string, IDiagnosticCodeInfo> = {};
    for (const [code, def] of Object.entries(config.codes)) {
        registry[code] = buildCodeInfo(code, def.description);
    }
    codeInfoRegistry = registry;

    // 构建代码别名映射
    const aliases: Record<string, IDiagnosticCodeInfo> = {};
    for (const [alias, code] of Object.entries(config.codeAliases)) {
        const info = registry[code];
        if (info) {
            aliases[alias] = info;
        }
    }
    codeAliasMapping = aliases;

    // 构建内部代码映射
    const internalMapping: Record<string, IDiagnosticCodeInfo> = {};
    for (const [internalCode, diagnosticCode] of Object.entries(config.internalCodeMapping)) {
        const info = registry[diagnosticCode];
        if (info) {
            internalMapping[internalCode] = info;
        }
    }
    internalCodeMapping = internalMapping;

    // 构建 AJV 关键字映射
    const ajvMapping: Record<string, IDiagnosticCodeInfo> = {};
    for (const [keyword, diagnosticCode] of Object.entries(config.ajvKeywordMapping)) {
        const info = registry[diagnosticCode];
        if (info) {
            ajvMapping[keyword] = info;
        }
    }
    ajvKeywordMapping = ajvMapping;
}

// ============================================================================
// 按别名访问的诊断代码常量
// ============================================================================

/**
 * 通过别名获取诊断代码信息
 */
function getByAlias(alias: string): IDiagnosticCodeInfo {
    ensureInitialized();
    const info = codeAliasMapping![alias];
    if (!info) {
        throw new Error(`Unknown diagnostic code alias: ${alias}`);
    }
    return info;
}

// YAML 语法错误 (CE1xxx)
export const YAML_SYNTAX_ERROR: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('YAML_SYNTAX_ERROR')[prop as keyof IDiagnosticCodeInfo],
});
export const YAML_DUPLICATE_KEY: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('YAML_DUPLICATE_KEY')[prop as keyof IDiagnosticCodeInfo],
});
export const YAML_INVALID_INDENTATION: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('YAML_INVALID_INDENTATION')[prop as keyof IDiagnosticCodeInfo],
});
export const YAML_IMPLICIT_KEY_ERROR: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('YAML_IMPLICIT_KEY_ERROR')[prop as keyof IDiagnosticCodeInfo],
});

// Schema 验证错误 (CE2xxx)
export const SCHEMA_REQUIRED: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('SCHEMA_REQUIRED')[prop as keyof IDiagnosticCodeInfo],
});
export const SCHEMA_TYPE: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('SCHEMA_TYPE')[prop as keyof IDiagnosticCodeInfo],
});
export const SCHEMA_ENUM: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('SCHEMA_ENUM')[prop as keyof IDiagnosticCodeInfo],
});
export const SCHEMA_PATTERN: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('SCHEMA_PATTERN')[prop as keyof IDiagnosticCodeInfo],
});
export const SCHEMA_FORMAT: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('SCHEMA_FORMAT')[prop as keyof IDiagnosticCodeInfo],
});
export const SCHEMA_MIN_LENGTH: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('SCHEMA_MIN_LENGTH')[prop as keyof IDiagnosticCodeInfo],
});
export const SCHEMA_MAX_LENGTH: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('SCHEMA_MAX_LENGTH')[prop as keyof IDiagnosticCodeInfo],
});
export const SCHEMA_MINIMUM: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('SCHEMA_MINIMUM')[prop as keyof IDiagnosticCodeInfo],
});
export const SCHEMA_MAXIMUM: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('SCHEMA_MAXIMUM')[prop as keyof IDiagnosticCodeInfo],
});
export const SCHEMA_ADDITIONAL_PROPERTIES: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('SCHEMA_ADDITIONAL_PROPERTIES')[prop as keyof IDiagnosticCodeInfo],
});
export const SCHEMA_ONE_OF: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('SCHEMA_ONE_OF')[prop as keyof IDiagnosticCodeInfo],
});

// PLACEHOLDER_MORE_ALIASES

// 引用错误 (CE3xxx)
export const TEMPLATE_NOT_FOUND: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('TEMPLATE_NOT_FOUND')[prop as keyof IDiagnosticCodeInfo],
});
export const TEMPLATE_PARAMETER_MISSING: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('TEMPLATE_PARAMETER_MISSING')[prop as keyof IDiagnosticCodeInfo],
});
export const TEMPLATE_PARAMETER_INVALID: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('TEMPLATE_PARAMETER_INVALID')[prop as keyof IDiagnosticCodeInfo],
});
export const TRANSLATION_NOT_FOUND: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('TRANSLATION_NOT_FOUND')[prop as keyof IDiagnosticCodeInfo],
});
export const CATEGORY_NOT_FOUND: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('CATEGORY_NOT_FOUND')[prop as keyof IDiagnosticCodeInfo],
});
export const CIRCULAR_REFERENCE: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('CIRCULAR_REFERENCE')[prop as keyof IDiagnosticCodeInfo],
});
export const TRANSLATION_EMPTY_VALUE: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('TRANSLATION_EMPTY_VALUE')[prop as keyof IDiagnosticCodeInfo],
});
export const TRANSLATION_DUPLICATE_KEY: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('TRANSLATION_DUPLICATE_KEY')[prop as keyof IDiagnosticCodeInfo],
});
export const TRANSLATION_MISSING_LANGUAGE: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('TRANSLATION_MISSING_LANGUAGE')[prop as keyof IDiagnosticCodeInfo],
});

// 类型验证错误 (CE4xxx)
export const FILE_NOT_FOUND: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('FILE_NOT_FOUND')[prop as keyof IDiagnosticCodeInfo],
});
export const ITEM_NOT_FOUND: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('ITEM_NOT_FOUND')[prop as keyof IDiagnosticCodeInfo],
});
export const INVALID_FILE_PATH: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('INVALID_FILE_PATH')[prop as keyof IDiagnosticCodeInfo],
});
export const INVALID_ITEM_ID: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('INVALID_ITEM_ID')[prop as keyof IDiagnosticCodeInfo],
});
export const INVALID_VERSION_CONDITION: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('INVALID_VERSION_CONDITION')[prop as keyof IDiagnosticCodeInfo],
});
export const VERSION_TOO_OLD: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('VERSION_TOO_OLD')[prop as keyof IDiagnosticCodeInfo],
});
export const VERSION_NOT_FOUND: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('VERSION_NOT_FOUND')[prop as keyof IDiagnosticCodeInfo],
});
export const INVALID_VERSION_RANGE: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('INVALID_VERSION_RANGE')[prop as keyof IDiagnosticCodeInfo],
});
export const INVALID_NAMESPACE: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('INVALID_NAMESPACE')[prop as keyof IDiagnosticCodeInfo],
});
export const INVALID_PATH: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('INVALID_PATH')[prop as keyof IDiagnosticCodeInfo],
});

// 警告和建议 (CE5xxx)
export const DEPRECATED: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('DEPRECATED')[prop as keyof IDiagnosticCodeInfo],
});
export const UNUSED_PARAMETER: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('UNUSED_PARAMETER')[prop as keyof IDiagnosticCodeInfo],
});
export const NAMING_CONVENTION: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('NAMING_CONVENTION')[prop as keyof IDiagnosticCodeInfo],
});
export const MINIMESSAGE_SYNTAX: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('MINIMESSAGE_SYNTAX')[prop as keyof IDiagnosticCodeInfo],
});
export const PERFORMANCE_HINT: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('PERFORMANCE_HINT')[prop as keyof IDiagnosticCodeInfo],
});
export const MINIMESSAGE_UNCLOSED_TAG: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('MINIMESSAGE_UNCLOSED_TAG')[prop as keyof IDiagnosticCodeInfo],
});
export const MINIMESSAGE_INVALID_TAG: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('MINIMESSAGE_INVALID_TAG')[prop as keyof IDiagnosticCodeInfo],
});
export const MINIMESSAGE_INVALID_COLOR: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('MINIMESSAGE_INVALID_COLOR')[prop as keyof IDiagnosticCodeInfo],
});
export const MINIMESSAGE_INVALID_HEX_COLOR: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('MINIMESSAGE_INVALID_HEX_COLOR')[prop as keyof IDiagnosticCodeInfo],
});
export const MINIMESSAGE_MISSING_ARGUMENT: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('MINIMESSAGE_MISSING_ARGUMENT')[prop as keyof IDiagnosticCodeInfo],
});
export const MINIMESSAGE_INVALID_ARGUMENT: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('MINIMESSAGE_INVALID_ARGUMENT')[prop as keyof IDiagnosticCodeInfo],
});
export const MINIMESSAGE_UNMATCHED_CLOSING: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('MINIMESSAGE_UNMATCHED_CLOSING')[prop as keyof IDiagnosticCodeInfo],
});
export const MINIMESSAGE_WRONG_CLOSING_ORDER: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('MINIMESSAGE_WRONG_CLOSING_ORDER')[prop as keyof IDiagnosticCodeInfo],
});
export const MINIMESSAGE_INVALID_CLICK_ACTION: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('MINIMESSAGE_INVALID_CLICK_ACTION')[prop as keyof IDiagnosticCodeInfo],
});
export const MINIMESSAGE_INVALID_HOVER_ACTION: IDiagnosticCodeInfo = new Proxy({} as IDiagnosticCodeInfo, {
    get: (_, prop) => getByAlias('MINIMESSAGE_INVALID_HOVER_ACTION')[prop as keyof IDiagnosticCodeInfo],
});

// ============================================================================
// 映射表导出
// ============================================================================

/**
 * 从 Ajv 关键字到诊断代码的映射
 */
export const AJV_KEYWORD_TO_CODE: Record<string, IDiagnosticCodeInfo> = new Proxy(
    {} as Record<string, IDiagnosticCodeInfo>,
    {
        get: (_, prop: string) => {
            ensureInitialized();
            return ajvKeywordMapping![prop];
        },
    },
);

/**
 * 从内部错误代码到诊断代码的映射
 */
export const INTERNAL_CODE_TO_DIAGNOSTIC: Record<string, IDiagnosticCodeInfo> = new Proxy(
    {} as Record<string, IDiagnosticCodeInfo>,
    {
        get: (_, prop: string) => {
            ensureInitialized();
            return internalCodeMapping![prop];
        },
    },
);

// ============================================================================
// 公共函数
// ============================================================================

/**
 * 获取诊断代码信息
 *
 * @param internalCode 内部错误代码
 * @returns 诊断代码信息，如果未找到则返回 undefined
 */
export function getDiagnosticCodeInfo(internalCode: string): IDiagnosticCodeInfo | undefined {
    ensureInitialized();
    return internalCodeMapping![internalCode];
}

/**
 * 将 Ajv 关键字映射到诊断代码
 *
 * @param keyword Ajv 验证关键字
 * @returns 诊断代码字符串
 */
export function mapAjvKeywordToCode(keyword: string): string {
    ensureInitialized();
    const codeInfo = ajvKeywordMapping![keyword];
    return codeInfo?.code || keyword;
}

/**
 * 根据诊断代码字符串获取代码信息
 *
 * @param code 诊断代码（如 'CE1001'）
 * @returns 诊断代码信息，如果未找到则返回 undefined
 */
export function getCodeInfoByCode(code: string): IDiagnosticCodeInfo | undefined {
    ensureInitialized();
    return codeInfoRegistry![code];
}
