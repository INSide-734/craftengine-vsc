import { type ErrorObject } from 'ajv';
import { type ILogger } from '../../../core/interfaces/ILogger';
import { ValidationLevel, type IValidationError } from '../SchemaValidator';

/**
 * 验证错误格式化器
 *
 * 负责将 Ajv 验证错误转换为用户友好的错误消息，
 * 包括错误去重、消息格式化和修复建议生成。
 */
export class ValidationErrorFormatter {
    constructor(private readonly logger: ILogger) {}

    /**
     * 处理验证错误
     *
     * 对错误进行去重，避免 allOf 中多个子 schema 声明相同约束时产生重复错误
     */
    processErrors(errors: ErrorObject[], level: ValidationLevel): IValidationError[] {
        const processedErrors: IValidationError[] = [];
        const seenErrors = new Set<string>();

        // 首先过滤掉版本条件 oneOf 引入的误导性错误
        const filteredErrors = this.filterVersionConditionErrors(errors);

        for (const error of filteredErrors) {
            const path = error.instancePath || '/';
            const message = this.formatErrorMessage(error);
            const severity = this.getErrorSeverity(error, level);
            const suggestion = this.getSuggestion(error);

            // 生成去重键：路径 + 错误类型 + 核心参数
            const dedupeKey = this.generateDedupeKey(error);

            if (seenErrors.has(dedupeKey)) {
                this.logger.debug('Skipping duplicate validation error', {
                    path,
                    keyword: error.keyword,
                    dedupeKey,
                });
                continue;
            }

            seenErrors.add(dedupeKey);

            processedErrors.push({
                path,
                message,
                code: error.keyword,
                severity,
                suggestion,
            });
        }

        return processedErrors;
    }

    /**
     * 过滤掉版本条件 oneOf 引入的误导性错误
     */
    private filterVersionConditionErrors(errors: ErrorObject[]): ErrorObject[] {
        const oneOfFailurePaths = new Set<string>();

        for (const error of errors) {
            if (error.keyword === 'oneOf') {
                oneOfFailurePaths.add(error.instancePath);
            }
        }

        return errors.filter((error) => {
            // 过滤掉版本条件对象 schema 的类型错误
            if (error.keyword === 'type' && error.schemaPath && /\/oneOf\/1\/type$/.test(error.schemaPath)) {
                return false;
            }

            // 对于 oneOf 失败，如果同一路径有其他更具体的错误，则过滤掉 oneOf 错误
            if (error.keyword === 'oneOf') {
                const hasSpecificError = errors.some(
                    (e) =>
                        e.instancePath === error.instancePath &&
                        e.keyword !== 'oneOf' &&
                        e.keyword !== 'type' &&
                        !/\/oneOf\/1\//.test(e.schemaPath || ''),
                );
                if (hasSpecificError) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * 生成错误去重键
     */
    private generateDedupeKey(error: ErrorObject): string {
        const path = error.instancePath || '/';
        const keyword = error.keyword;

        switch (keyword) {
            case 'type':
                return `${path}:type:${error.params.type}`;
            case 'required':
                return `${path}:required:${error.params.missingProperty}`;
            case 'enum':
                return `${path}:enum:${JSON.stringify(error.params.allowedValues)}`;
            case 'additionalProperties':
                return `${path}:additionalProperties:${error.params.additionalProperty}`;
            case 'pattern':
                return `${path}:pattern:${error.params.pattern}`;
            default:
                return `${path}:${keyword}:${JSON.stringify(error.params)}`;
        }
    }

    /**
     * 格式化错误消息
     */
    private formatErrorMessage(error: ErrorObject): string {
        switch (error.keyword) {
            case 'required':
                return `❌ Missing required field "${error.params.missingProperty}"`;

            case 'type':
                return `⚠️ Type mismatch: expected ${this.formatType(error.params.type)}`;

            case 'enum':
                const values = error.params.allowedValues || [];
                if (values.length <= 3) {
                    return `❌ Invalid value. Allowed: ${values.map((v: unknown) => `"${v}"`).join(' | ')}`;
                } else {
                    return `❌ Invalid value. Must be one of ${values.length} allowed values`;
                }

            case 'pattern':
                return `⚠️ Format error: ${this.simplifyPatternMessage(error.message || 'invalid format')}`;

            case 'additionalProperties':
                return `💡 Unknown property "${error.params.additionalProperty}"`;

            case 'minLength':
                return `⚠️ Too short: minimum ${error.params.limit} characters required`;

            case 'maxLength':
                return `⚠️ Too long: maximum ${error.params.limit} characters allowed`;

            case 'minimum':
                return `⚠️ Value too small: minimum is ${error.params.limit}`;

            case 'maximum':
                return `⚠️ Value too large: maximum is ${error.params.limit}`;

            case 'format':
                return `⚠️ Invalid ${error.params.format} format`;

            default:
                return error.message ? `⚠️ ${this.capitalizeFirst(error.message)}` : '⚠️ Validation error';
        }
    }

    /**
     * 格式化类型名称
     */
    private formatType(type: string | string[]): string {
        if (Array.isArray(type)) {
            return type.map((t) => this.formatSingleType(t)).join(' or ');
        }
        return this.formatSingleType(type);
    }

    /**
     * 格式化单个类型名称
     */
    private formatSingleType(type: string): string {
        const typeMap: Record<string, string> = {
            string: '📝 text',
            number: '🔢 number',
            integer: '🔢 integer',
            boolean: '✓ true/false',
            object: '📦 object',
            array: '📋 list',
            null: '∅ null',
        };
        return typeMap[type] || type;
    }

    /**
     * 简化正则表达式错误消息
     */
    private simplifyPatternMessage(message: string): string {
        return message
            .replace(/must match pattern ".*?"/, 'invalid format')
            .replace(/should match pattern ".*?"/, 'invalid format');
    }

    /**
     * 首字母大写
     */
    private capitalizeFirst(str: string): string {
        if (!str) {
            return str;
        }
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * 获取错误严重程度
     */
    private getErrorSeverity(error: ErrorObject, level: ValidationLevel): 'error' | 'warning' | 'info' {
        if (level === ValidationLevel.Loose && error.keyword === 'additionalProperties') {
            return 'warning';
        }

        if (['required', 'type'].includes(error.keyword)) {
            return 'error';
        }

        if (level === ValidationLevel.Loose) {
            return 'warning';
        }

        return 'error';
    }

    /**
     * 获取修复建议
     */
    private getSuggestion(error: ErrorObject): string | undefined {
        switch (error.keyword) {
            case 'required':
                return `➕ Add missing field:\n    ${error.params.missingProperty}: <value>`;

            case 'type':
                const expectedType = Array.isArray(error.params.type)
                    ? error.params.type.join(' | ')
                    : error.params.type;
                return this.getTypeExample(expectedType);

            case 'enum':
                const values = error.params.allowedValues;
                if (values && values.length > 0) {
                    if (values.length <= 5) {
                        return `✓ Choose one:\n    ${values.map((v: string) => `• ${v}`).join('\n    ')}`;
                    } else {
                        return `✓ Choose one of ${values.length} options:\n    ${values
                            .slice(0, 3)
                            .map((v: string) => `• ${v}`)
                            .join('\n    ')}\n    ... and ${values.length - 3} more`;
                    }
                }
                break;

            case 'additionalProperties':
                return `🗑️ Remove unknown property or check spelling:\n    "${error.params.additionalProperty}"`;

            case 'pattern':
                return `📝 Check the format and fix any syntax errors`;

            case 'minLength': {
                const currentLength = typeof error.data === 'string' ? error.data.length : 0;
                const needed = error.params.limit - currentLength;
                return needed > 0 ? `📏 Add at least ${needed} more characters` : '📏 Too short';
            }

            case 'maxLength': {
                const currentLength = typeof error.data === 'string' ? error.data.length : 0;
                const excess = currentLength - error.params.limit;
                return excess > 0 ? `✂️ Remove ${excess} characters` : '✂️ Too long';
            }

            case 'minimum':
                return `⬆️ Increase value to at least ${error.params.limit}`;

            case 'maximum':
                return `⬇️ Decrease value to at most ${error.params.limit}`;
        }

        return undefined;
    }

    /**
     * 获取类型示例
     */
    private getTypeExample(type: string): string {
        const examples: Record<string, string> = {
            string: '📝 Example:\n    field: "text value"',
            number: '🔢 Example:\n    field: 42',
            integer: '🔢 Example:\n    field: 10',
            boolean: '✓ Example:\n    field: true',
            object: '📦 Example:\n    field:\n      property: value',
            array: '📋 Example:\n    field:\n      - item1\n      - item2',
        };

        return examples[type] || `Change to ${type} type`;
    }
}
