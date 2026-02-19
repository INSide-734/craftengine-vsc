/**
 * 诊断消息模板
 *
 * 提供统一的、用户友好的诊断消息格式
 *
 * 规则:
 * - 使用自然语言
 * - 避免技术术语
 * - 提供上下文信息
 * - 消息简洁明了
 */

// ============================================================================
// 类型格式化
// ============================================================================

/** 默认类型名称映射 */
const DEFAULT_TYPE_DISPLAY_NAMES: Record<string, string> = {
    'string': 'text',
    'number': 'number',
    'integer': 'integer',
    'boolean': 'true/false',
    'object': 'object',
    'array': 'list',
    'null': 'null'
};

/** 类型名称映射（可从配置初始化） */
let TYPE_DISPLAY_NAMES: Record<string, string> = { ...DEFAULT_TYPE_DISPLAY_NAMES };

/**
 * 从配置初始化类型显示名称
 *
 * @param config 类型显示名称映射
 */
export function initializeTypeDisplayNames(config: Record<string, string>): void {
    TYPE_DISPLAY_NAMES = { ...config };
}

/**
 * 格式化类型名称
 *
 * @param type 类型名称或类型数组
 * @returns 用户友好的类型描述
 */
export function formatTypeName(type: string | string[]): string {
    if (Array.isArray(type)) {
        return type.map(t => TYPE_DISPLAY_NAMES[t] || t).join(' or ');
    }
    return TYPE_DISPLAY_NAMES[type] || type;
}

// ============================================================================
// YAML 语法错误消息
// ============================================================================

export const YAML_MESSAGES = {
    /**
     * 通用语法错误
     */
    syntaxError: (detail?: string): string =>
        detail ? `YAML syntax error: ${detail}` : 'YAML syntax error',

    /**
     * 重复键错误
     */
    duplicateKey: (key: string): string =>
        `Duplicate key "${key}"`,

    /**
     * 缩进错误
     */
    invalidIndentation: (): string =>
        'Invalid indentation',

    /**
     * 隐式键错误
     */
    implicitKeyError: (): string =>
        'Implicit keys need to be on a single line'
};

// ============================================================================
// Schema 验证错误消息
// ============================================================================

export const SCHEMA_MESSAGES = {
    /**
     * 缺少必需字段
     */
    required: (field: string): string =>
        `Missing required field "${field}"`,

    /**
     * 类型不匹配
     */
    type: (expected: string | string[], actual?: string): string => {
        const expectedStr = formatTypeName(expected);
        if (actual) {
            return `Expected ${expectedStr}, got ${actual}`;
        }
        return `Expected ${expectedStr}`;
    },

    /**
     * 枚举值无效
     */
    enum: (allowedValues: unknown[]): string => {
        if (allowedValues.length <= 3) {
            const formatted = allowedValues.map(v => `"${v}"`).join(', ');
            return `Invalid value. Allowed: ${formatted}`;
        }
        return `Invalid value. Must be one of ${allowedValues.length} allowed values`;
    },

    /**
     * 模式不匹配
     */
    pattern: (hint?: string): string =>
        hint ? `Invalid format: ${hint}` : 'Invalid format',

    /**
     * 格式无效
     */
    format: (formatName: string): string =>
        `Invalid ${formatName} format`,

    /**
     * 字符串太短
     */
    minLength: (limit: number, current?: number): string => {
        if (current !== undefined) {
            const needed = limit - current;
            return `Too short: need ${needed} more character${needed > 1 ? 's' : ''} (minimum ${limit})`;
        }
        return `Too short: minimum ${limit} character${limit > 1 ? 's' : ''} required`;
    },

    /**
     * 字符串太长
     */
    maxLength: (limit: number, current?: number): string => {
        if (current !== undefined) {
            const excess = current - limit;
            return `Too long: remove ${excess} character${excess > 1 ? 's' : ''} (maximum ${limit})`;
        }
        return `Too long: maximum ${limit} character${limit > 1 ? 's' : ''} allowed`;
    },

    /**
     * 值太小
     */
    minimum: (limit: number): string =>
        `Value too small: minimum is ${limit}`,

    /**
     * 值太大
     */
    maximum: (limit: number): string =>
        `Value too large: maximum is ${limit}`,

    /**
     * 未知属性
     */
    additionalProperties: (property: string): string =>
        `Unknown property "${property}"`,

    /**
     * oneOf 不匹配
     */
    oneOf: (): string =>
        'Value does not match any allowed schema'
};

// ============================================================================
// 引用错误消息
// ============================================================================

export const REFERENCE_MESSAGES = {
    /**
     * 模板未找到
     */
    templateNotFound: (templateName: string): string =>
        `Template "${templateName}" not found`,

    /**
     * 缺少模板参数
     */
    templateParameterMissing: (paramName: string, templateName?: string): string =>
        templateName
            ? `Missing required parameter "${paramName}" for template "${templateName}"`
            : `Missing required parameter "${paramName}"`,

    /**
     * 模板参数无效
     */
    templateParameterInvalid: (paramName: string, reason?: string): string =>
        reason
            ? `Invalid parameter "${paramName}": ${reason}`
            : `Invalid parameter "${paramName}"`,

    /**
     * 翻译键未找到
     */
    translationNotFound: (key: string): string =>
        `Translation key "${key}" not found`,

    /**
     * 翻译值为空
     */
    translationEmptyValue: (key: string, languages: string[]): string =>
        `Translation key "${key}" has empty values in: ${languages.join(', ')}`,

    /**
     * 重复翻译键
     */
    translationDuplicateKey: (key: string, language: string): string =>
        `Duplicate translation key "${key}" in language "${language}"`,

    /**
     * 缺失语言翻译
     */
    translationMissingLanguage: (key: string, languages: string[]): string =>
        `Missing translation for key "${key}" in common languages: ${languages.join(', ')}`,

    /**
     * 分类未找到
     */
    categoryNotFound: (category: string): string =>
        `Category "${category}" not found`,

    /**
     * 循环引用
     */
    circularReference: (path?: string): string =>
        path
            ? `Circular reference detected: ${path}`
            : 'Circular reference detected'
};

// ============================================================================
// 类型验证错误消息
// ============================================================================

export const TYPE_VALIDATION_MESSAGES = {
    /**
     * 文件未找到
     */
    fileNotFound: (filePath: string): string =>
        `File not found: "${filePath}"`,

    /**
     * 物品 ID 未找到
     */
    itemNotFound: (itemId: string): string =>
        `Item "${itemId}" not found`,

    /**
     * 文件路径格式无效
     */
    invalidFilePath: (filePath: string): string =>
        `Invalid file path: "${filePath}"`,

    /**
     * 物品 ID 格式无效
     */
    invalidItemId: (itemId: string): string =>
        `Invalid item ID: "${itemId}"`,

    /**
     * 版本条件无效
     */
    invalidVersionCondition: (condition: string, reason?: string): string =>
        reason
            ? `Invalid version condition "${condition}": ${reason}`
            : `Invalid version condition: "${condition}"`,

    /**
     * 版本过低
     */
    versionTooOld: (version: string, minVersion: string): string =>
        `Version "${version}" is below the minimum supported version (${minVersion})`,

    /**
     * 未知版本
     */
    versionNotFound: (version: string): string =>
        `Unknown Minecraft version: "${version}"`,

    /**
     * 版本范围无效
     */
    invalidVersionRange: (startVersion: string, endVersion: string): string =>
        `Invalid version range: start version "${startVersion}" must be less than end version "${endVersion}"`,

    /**
     * 命名空间无效
     */
    invalidNamespace: (namespace: string): string =>
        `Invalid namespace: "${namespace}". Namespaces can only contain lowercase letters, numbers, underscores, hyphens, and dots.`,

    /**
     * 路径无效
     */
    invalidPath: (path: string): string =>
        `Invalid path: "${path}". Paths can only contain lowercase letters, numbers, underscores, hyphens, dots, and forward slashes.`
};

// ============================================================================
// 警告和建议消息
// ============================================================================

export const SUGGESTION_MESSAGES = {
    /**
     * 已弃用
     */
    deprecated: (replacement?: string): string =>
        replacement
            ? `Deprecated. Use "${replacement}" instead`
            : 'Deprecated',

    /**
     * 未使用的参数
     */
    unusedParameter: (paramName: string): string =>
        `Parameter "${paramName}" is defined but never used`,

    /**
     * 命名规范违反
     */
    namingConvention: (suggestion: string): string =>
        `Naming convention: ${suggestion}`,

    /**
     * MiniMessage 语法问题
     */
    miniMessageSyntax: (detail: string): string =>
        `MiniMessage: ${detail}`,

    /**
     * 性能提示
     */
    performanceHint: (hint: string): string =>
        `Performance: ${hint}`
};

// ============================================================================
// MiniMessage 消息
// ============================================================================

export const MINIMESSAGE_MESSAGES = {
    /**
     * 未闭合标签
     */
    unclosedTag: (tagName: string, closingTag: string, selfClosingTag: string): string =>
        `Tag "${tagName}" is not closed. Add "${closingTag}" or use self-closing syntax "${selfClosingTag}"`,

    /**
     * 无效标签
     */
    invalidTag: (tagName: string, suggestions?: string[]): string => {
        let message = `Unknown MiniMessage tag: "${tagName}"`;
        if (suggestions && suggestions.length > 0) {
            message += `. Did you mean: ${suggestions.join(', ')}?`;
        }
        return message;
    },

    /**
     * 无效颜色
     */
    invalidColor: (color: string): string =>
        `Invalid color: "${color}". Use a named color or hex code (#RRGGBB)`,

    /**
     * 无效十六进制颜色
     */
    invalidHexColor: (color: string): string =>
        `Invalid hex color format: "${color}". Expected #RRGGBB or #RRGGBBAA`,

    /**
     * 缺少参数
     */
    missingArgument: (tagName: string, usage: string): string =>
        `Tag "${tagName}" requires arguments: ${usage}`,

    /**
     * 无效参数
     */
    invalidArgument: (argName: string, validValues: string[]): string =>
        `Invalid ${argName}. Valid values: ${validValues.join(', ')}`,

    /**
     * 不匹配的关闭标签
     */
    unmatchedClosing: (closingTag: string): string =>
        `Closing tag "${closingTag}" has no matching opening tag`,

    /**
     * 关闭顺序错误
     */
    wrongClosingOrder: (expected: string, actual: string): string =>
        `Wrong closing order: expected "${expected}" before "${actual}"`,

    /**
     * 无效点击动作
     */
    invalidClickAction: (action: string, validActions: string[]): string =>
        `Invalid click action: "${action}". Valid actions: ${validActions.join(', ')}`,

    /**
     * 无效悬停动作
     */
    invalidHoverAction: (action: string, validActions: string[]): string =>
        `Invalid hover action: "${action}". Valid actions: ${validActions.join(', ')}`
};

// ============================================================================
// 快速修复建议消息
// ============================================================================

export const QUICK_FIX_MESSAGES = {
    /**
     * 添加缺失字段
     */
    addMissingField: (field: string): string =>
        `Add missing field "${field}"`,

    /**
     * 删除未知属性
     */
    removeUnknownProperty: (property: string): string =>
        `Remove unknown property "${property}"`,

    /**
     * 修复类型
     */
    fixType: (expectedType: string): string =>
        `Convert to ${formatTypeName(expectedType)}`,

    /**
     * 使用建议值
     */
    useSuggestedValue: (value: string): string =>
        `Use "${value}"`,

    /**
     * 使用允许的值
     */
    useAllowedValue: (value: string): string =>
        `Use allowed value "${value}"`,

    /**
     * 修复格式
     */
    fixPattern: (): string =>
        'Check the format and fix any syntax errors',

    /**
     * 创建模板
     */
    createTemplate: (templateName: string): string =>
        `Create template "${templateName}"`,

    /**
     * 创建翻译键
     */
    createTranslationKey: (key: string): string =>
        `Create translation key "${key}"`,

    /**
     * 创建文件
     */
    createFile: (filePath: string): string =>
        `Create file "${filePath}"`,

    /**
     * 重命名为
     */
    renameTo: (newName: string): string =>
        `Rename to "${newName}"`,

    /**
     * 使用替代方案
     */
    useReplacement: (replacement: string): string =>
        `Use "${replacement}" instead`
};

// ============================================================================
// 关联信息消息
// ============================================================================

export const RELATED_INFO_MESSAGES = {
    /**
     * 定义位置
     */
    definedAt: (name: string): string =>
        `"${name}" is defined here`,

    /**
     * 相似建议
     */
    didYouMean: (suggestion: string): string =>
        `Did you mean "${suggestion}"?`,

    /**
     * 来自模板
     */
    fromTemplate: (templateName: string): string =>
        `From template "${templateName}"`,

    /**
     * 引用位置
     */
    referencedAt: (location: string): string =>
        `Referenced at ${location}`,

    /**
     * 允许的值
     */
    allowedValues: (values: string[]): string =>
        `Allowed values: ${values.join(', ')}`
};

// ============================================================================
// 消息构建器
// ============================================================================

/**
 * 诊断消息构建器
 *
 * 提供链式 API 构建复杂的诊断消息
 */
export class DiagnosticMessageBuilder {
    private parts: string[] = [];

    /**
     * 添加主消息
     */
    message(msg: string): this {
        this.parts.push(msg);
        return this;
    }

    /**
     * 添加上下文信息
     */
    context(ctx: string): this {
        this.parts.push(`(${ctx})`);
        return this;
    }

    /**
     * 添加建议
     */
    suggestion(sug: string): this {
        this.parts.push(`Suggestion: ${sug}`);
        return this;
    }

    /**
     * 构建最终消息
     */
    build(): string {
        return this.parts.join(' ');
    }
}

/**
 * 创建消息构建器
 */
export function messageBuilder(): DiagnosticMessageBuilder {
    return new DiagnosticMessageBuilder();
}
