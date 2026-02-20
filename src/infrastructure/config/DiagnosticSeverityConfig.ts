/**
 * 诊断严重程度配置服务
 *
 * 管理用户自定义的诊断严重程度配置
 */

import { DiagnosticSeverity } from 'vscode';
import { type IConfiguration } from '../../core/interfaces/IConfiguration';
import { ServiceContainer } from '../ServiceContainer';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import {
    type SeverityLevel,
    type ValidationMode,
    SEVERITY_RULES,
    getConfigurableCodes,
    getDefaultSeverity,
} from '../../core/constants/DiagnosticSeverityRules';
import { getDiagnosticCodeInfo } from '../../core/constants/DiagnosticCodes';

/**
 * 将严重程度级别转换为 VS Code DiagnosticSeverity
 *
 * @param level 严重程度级别
 * @returns VS Code DiagnosticSeverity，如果是 'ignore' 则返回 null
 */
export function toVSCodeSeverity(level: SeverityLevel): DiagnosticSeverity | null {
    switch (level) {
        case 'error':
            return DiagnosticSeverity.Error;
        case 'warning':
            return DiagnosticSeverity.Warning;
        case 'information':
            return DiagnosticSeverity.Information;
        case 'hint':
            return DiagnosticSeverity.Hint;
        case 'ignore':
            return null;
    }
}

/**
 * 将 VS Code DiagnosticSeverity 转换为严重程度级别
 *
 * @param severity VS Code DiagnosticSeverity
 * @returns 严重程度级别
 */
export function fromVSCodeSeverity(severity: DiagnosticSeverity): SeverityLevel {
    switch (severity) {
        case DiagnosticSeverity.Error:
            return 'error';
        case DiagnosticSeverity.Warning:
            return 'warning';
        case DiagnosticSeverity.Information:
            return 'information';
        case DiagnosticSeverity.Hint:
            return 'hint';
    }
}

/**
 * 获取错误代码的严重程度
 *
 * @param diagnosticCode 诊断代码 (CE1001, CE2001, etc.)
 * @param mode 验证模式
 * @param customSeverity 用户自定义严重程度
 * @returns VS Code DiagnosticSeverity，如果应该忽略则返回 null
 */
export function getSeverity(
    diagnosticCode: string,
    mode: ValidationMode = 'default',
    customSeverity?: Record<string, SeverityLevel>,
): DiagnosticSeverity | null {
    const rule = SEVERITY_RULES[diagnosticCode];

    if (!rule) {
        return DiagnosticSeverity.Warning;
    }

    if (customSeverity && rule.configurable && diagnosticCode in customSeverity) {
        return toVSCodeSeverity(customSeverity[diagnosticCode]);
    }

    let level: SeverityLevel;
    switch (mode) {
        case 'strict':
            level = rule.strict ?? rule.default;
            break;
        case 'loose':
            level = rule.loose ?? rule.default;
            break;
        default:
            level = rule.default;
    }

    return toVSCodeSeverity(level);
}

/**
 * 从内部错误代码获取严重程度
 *
 * @param internalCode 内部错误代码
 * @param mode 验证模式
 * @param customSeverity 用户自定义严重程度
 * @returns VS Code DiagnosticSeverity，如果应该忽略则返回 null
 */
export function getSeverityFromInternalCode(
    internalCode: string,
    mode: ValidationMode = 'default',
    customSeverity?: Record<string, SeverityLevel>,
): DiagnosticSeverity | null {
    const diagnosticCode = getDiagnosticCodeInfo(internalCode)?.code;

    if (!diagnosticCode) {
        return DiagnosticSeverity.Warning;
    }

    return getSeverity(diagnosticCode, mode, customSeverity);
}

/**
 * 诊断严重程度配置
 */
export interface IDiagnosticSeveritySettings {
    /** 验证模式 */
    mode: ValidationMode;
    /** 自定义严重程度 */
    customSeverity: Record<string, SeverityLevel>;
}

/**
 * 诊断严重程度配置服务
 *
 * 功能：
 * - 读取用户配置的严重程度
 * - 提供严重程度查询接口
 * - 支持验证模式切换
 */
export class DiagnosticSeverityConfig {
    private readonly configuration: IConfiguration;

    /** 配置键 */
    private static readonly CONFIG_KEY_MODE = 'craftengine.validation.level';
    private static readonly CONFIG_KEY_SEVERITY = 'craftengine.diagnostics.severity';

    constructor() {
        this.configuration = ServiceContainer.getService<IConfiguration>(SERVICE_TOKENS.Configuration);
    }

    /**
     * 获取错误代码的严重程度
     *
     * @param diagnosticCode 诊断代码 (CE1001, CE2001, etc.)
     * @returns VS Code DiagnosticSeverity，如果应该忽略则返回 null
     */
    getSeverity(diagnosticCode: string): DiagnosticSeverity | null {
        const mode = this.getValidationMode();
        const customSeverity = this.getCustomSeverity();

        return getSeverity(diagnosticCode, mode, customSeverity);
    }

    /**
     * 获取验证模式
     */
    getValidationMode(): ValidationMode {
        const mode = this.configuration.get<string>(DiagnosticSeverityConfig.CONFIG_KEY_MODE, 'loose');

        switch (mode.toLowerCase()) {
            case 'strict':
                return 'strict';
            case 'loose':
                return 'loose';
            default:
                return 'default';
        }
    }

    /**
     * 获取用户自定义严重程度
     */
    getCustomSeverity(): Record<string, SeverityLevel> {
        return this.configuration.get<Record<string, SeverityLevel>>(DiagnosticSeverityConfig.CONFIG_KEY_SEVERITY, {});
    }

    /**
     * 获取完整的严重程度设置
     */
    getSettings(): IDiagnosticSeveritySettings {
        return {
            mode: this.getValidationMode(),
            customSeverity: this.getCustomSeverity(),
        };
    }

    /**
     * 检查错误代码是否应该被忽略
     *
     * @param diagnosticCode 诊断代码
     * @returns 是否应该忽略
     */
    shouldIgnore(diagnosticCode: string): boolean {
        return this.getSeverity(diagnosticCode) === null;
    }

    /**
     * 获取所有可配置的错误代码
     */
    getConfigurableCodes(): string[] {
        return getConfigurableCodes();
    }

    /**
     * 获取错误代码的默认严重程度
     *
     * @param diagnosticCode 诊断代码
     * @returns 默认严重程度级别
     */
    getDefaultSeverity(diagnosticCode: string): SeverityLevel {
        return getDefaultSeverity(diagnosticCode);
    }

    /**
     * 将严重程度级别转换为 VS Code DiagnosticSeverity
     *
     * @param level 严重程度级别
     * @returns VS Code DiagnosticSeverity
     */
    toVSCodeSeverity(level: SeverityLevel): DiagnosticSeverity | null {
        return toVSCodeSeverity(level);
    }

    /**
     * 获取配置摘要（用于日志）
     */
    getConfigSummary(): Record<string, unknown> {
        const customSeverity = this.getCustomSeverity();
        const customCount = Object.keys(customSeverity).length;

        return {
            mode: this.getValidationMode(),
            customSeverityCount: customCount,
            customSeverity: customCount > 0 ? customSeverity : undefined,
        };
    }
}
