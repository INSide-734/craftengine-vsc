/**
 * 诊断严重程度规则
 *
 * 数据来源：data/constants/diagnostic-severity-rules.json
 * 必须在使用前调用 initializeDiagnosticSeverityRules() 初始化。
 */

import { IDiagnosticSeverityRulesConfig } from '../types/ConfigTypes';

/**
 * 严重程度级别
 */
export type SeverityLevel = 'error' | 'warning' | 'information' | 'hint' | 'ignore';

/**
 * 严重程度规则配置
 */
export interface ISeverityRule {
    /** 默认严重程度 */
    default: SeverityLevel;
    /** 宽松模式下的严重程度 */
    loose?: SeverityLevel;
    /** 严格模式下的严重程度 */
    strict?: SeverityLevel;
    /** 是否可由用户配置 */
    configurable: boolean;
}

/**
 * 验证模式
 */
export type ValidationMode = 'strict' | 'loose' | 'default';

// ============================================================================
// JSON 配置驱动的严重程度规则
// ============================================================================

/** 已加载的规则 */
let loadedRules: Record<string, ISeverityRule> | null = null;

/**
 * 确保已初始化
 */
function ensureInitialized(): Record<string, ISeverityRule> {
    if (!loadedRules) {
        throw new Error('DiagnosticSeverityRules not initialized. Call initializeDiagnosticSeverityRules() first.');
    }
    return loadedRules;
}

/**
 * 初始化诊断严重程度规则（从 JSON 配置加载）
 *
 * 必须在使用任何严重程度规则之前调用。
 *
 * @param config 诊断严重程度规则配置
 */
export function initializeDiagnosticSeverityRules(config: IDiagnosticSeverityRulesConfig): void {
    const rules: Record<string, ISeverityRule> = {};
    for (const [code, def] of Object.entries(config.rules)) {
        rules[code] = {
            default: def.default as SeverityLevel,
            loose: def.loose as SeverityLevel | undefined,
            strict: def.strict as SeverityLevel | undefined,
            configurable: def.configurable
        };
    }
    loadedRules = rules;
}

// ============================================================================
// 导出
// ============================================================================

/**
 * 诊断严重程度规则定义
 */
export const SEVERITY_RULES: Record<string, ISeverityRule> = new Proxy(
    {} as Record<string, ISeverityRule>,
    { get: (_, prop: string) => ensureInitialized()[prop] }
);

/**
 * 检查错误代码是否可由用户配置
 *
 * @param diagnosticCode 诊断代码
 * @returns 是否可配置
 */
export function isConfigurable(diagnosticCode: string): boolean {
    const rules = ensureInitialized();
    const rule = rules[diagnosticCode];
    return rule?.configurable ?? false;
}

/**
 * 获取所有可配置的错误代码
 *
 * @returns 可配置的错误代码列表
 */
export function getConfigurableCodes(): string[] {
    const rules = ensureInitialized();
    return Object.entries(rules)
        .filter(([, rule]) => rule.configurable)
        .map(([code]) => code);
}

/**
 * 获取错误代码的默认严重程度
 *
 * @param diagnosticCode 诊断代码
 * @returns 默认严重程度级别
 */
export function getDefaultSeverity(diagnosticCode: string): SeverityLevel {
    const rules = ensureInitialized();
    const rule = rules[diagnosticCode];
    return rule?.default ?? 'warning';
}
