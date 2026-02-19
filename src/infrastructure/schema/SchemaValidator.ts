import Ajv, { ValidateFunction } from 'ajv';
import { JSONSchema7 } from 'json-schema';
import { ILogger } from '../../core/interfaces/ILogger';
import { ISchemaParser } from '../../core/interfaces/ISchemaParser';
import { IConfiguration } from '../../core/interfaces/IConfiguration';
import {
    ITemplateExpander,
    ITemplateExpansionResult,
    IPositionMapping
} from '../../core/interfaces/ITemplateExpander';
import { SchemaTransformer } from './helpers/SchemaTransformer';
import { ValidationErrorFormatter } from './helpers/ValidationErrorFormatter';
import { SCHEMA_CACHE } from '../../core/constants/SchemaConstants';

/**
 * 验证级别
 */
export enum ValidationLevel {
    /** 严格：不允许额外属性，强制类型检查 */
    Strict = 'strict',
    /** 宽松：允许额外属性，只验证已知字段 */
    Loose = 'loose',
    /** 关闭：不进行验证 */
    Off = 'off'
}

/**
 * 验证错误
 */
export interface IValidationError {
    /** 错误路径 */
    path: string;
    /** 错误消息 */
    message: string;
    /** 错误代码 */
    code: string;
    /** 严重程度 */
    severity: 'error' | 'warning' | 'info';
    /** 建议修复 */
    suggestion?: string;
}

/**
 * 验证结果
 */
export interface IValidationResult {
    /** 是否有效 */
    valid: boolean;
    /** 错误列表 */
    errors: IValidationError[];
    /** 警告列表 */
    warnings: IValidationError[];
}

/**
 * Schema 验证器
 *
 * 使用 Ajv 进行 JSON Schema 验证，支持可配置的验证级别。
 * Schema 变换逻辑委托给 SchemaTransformer，错误处理委托给 ValidationErrorFormatter。
 */
export class SchemaValidator {
    private readonly ajv: Ajv;
    private readonly schemaParser: ISchemaParser;
    private readonly config: IConfiguration;
    private readonly logger: ILogger;
    private readonly validateCache = new Map<string, ValidateFunction>();
    private readonly schemaTransformer = new SchemaTransformer();
    private readonly errorFormatter: ValidationErrorFormatter;
    private templateExpander?: ITemplateExpander;

    constructor(
        schemaParser: ISchemaParser,
        config: IConfiguration,
        logger: ILogger,
        templateExpander?: ITemplateExpander
    ) {
        this.ajv = new Ajv({
            allErrors: true,
            verbose: true,
            strict: false,
            validateFormats: false
        });

        this.schemaParser = schemaParser;
        this.config = config;
        this.logger = logger.createChild('SchemaValidator');
        this.errorFormatter = new ValidationErrorFormatter(this.logger);

        if (templateExpander) {
            this.templateExpander = templateExpander;
        } else {
            this.logger.debug('TemplateExpander not provided - will be unavailable');
        }
    }

    /**
     * 验证数据
     */
    async validate(data: unknown, schemaId: string): Promise<IValidationResult> {
        try {
            const level = this.getValidationLevel();
            if (level === ValidationLevel.Off) {
                return { valid: true, errors: [], warnings: [] };
            }

            if (schemaId.includes('template') || schemaId.includes('parameter')) {
                return { valid: true, errors: [], warnings: [] };
            }

            const schemaResult = await this.schemaParser.loadSchema(schemaId);
            const schema = this.schemaTransformer.prepareSchema(
                schemaResult.resolved || schemaResult.schema,
                level
            );

            const validate = this.getValidateFunction(schemaId, schema);
            const valid = validate(data);

            if (valid) {
                return { valid: true, errors: [], warnings: [] };
            }

            const errors = this.errorFormatter.processErrors(validate.errors || [], level);

            return {
                valid: false,
                errors: errors.filter(e => e.severity === 'error'),
                warnings: []
            };
        } catch (error) {
            this.logger.error('Validation failed', error as Error, { schemaId });
            return {
                valid: false,
                errors: [{
                    path: '',
                    message: `Validation error: ${(error as Error).message}`,
                    code: 'validation_error',
                    severity: 'error'
                }],
                warnings: []
            };
        }
    }

    /**
     * 验证 YAML 文档
     *
     * 支持模板展开：在验证前将模板引用展开为完整配置
     */
    async validateDocument(content: string): Promise<IValidationResult> {
        try {
            const yaml = await import('yaml');
            let data = yaml.parse(content);
            let expansionResult: ITemplateExpansionResult | undefined;

            const expander = this.templateExpander;
            if (this.shouldExpandTemplates() && expander) {
                try {
                    expansionResult = await expander.expandDocument(content);
                    if (expansionResult.success) {
                        data = expansionResult.expanded;
                        this.logger.debug('Template expansion completed', {
                            usedTemplates: expansionResult.usedTemplates.length,
                            expansionErrors: expansionResult.errors.length
                        });
                    } else {
                        this.logger.warn('Template expansion failed, validating original data', {
                            errors: expansionResult.errors.map(e => e.message)
                        });
                    }
                } catch (expandError) {
                    this.logger.warn('Template expansion error, validating original data', {
                        error: (expandError as Error).message
                    });
                }
            }

            const result = await this.validate(data, 'index.schema.json');

            if (expansionResult?.positionMap && !result.valid) {
                result.errors = this.mapErrorPositions(result.errors, expansionResult.positionMap);
            }
            if (expansionResult?.errors.length) {
                this.addExpansionErrors(result, expansionResult.errors);
            }

            return result;
        } catch (error) {
            this.logger.error('Failed to validate document', error as Error);
            return {
                valid: false,
                errors: [{ path: '', message: `Parse error: ${(error as Error).message}`, code: 'parse_error', severity: 'error' }],
                warnings: []
            };
        }
    }

    /** 清除缓存 */
    clearCache(): void {
        this.validateCache.clear();
        this.logger.debug('Validation cache cleared');
    }

    // ========================================
    // 私有方法
    // ========================================

    private shouldExpandTemplates(): boolean {
        return this.config.get<boolean>('craftengine.validation.templateExpansion', true);
    }

    private mapErrorPositions(
        errors: IValidationError[],
        positionMap: Map<string, IPositionMapping>
    ): IValidationError[] {
        return errors.map(error => {
            const mapping = positionMap.get(error.path);
            if (mapping?.source === 'template') {
                return {
                    ...error,
                    message: `${error.message} (from template: ${mapping.templateName})`,
                    suggestion: error.suggestion
                        ? `${error.suggestion} (check template: ${mapping.templateName})`
                        : `Check template: ${mapping.templateName}`
                };
            }
            return error;
        });
    }

    private addExpansionErrors(
        result: IValidationResult,
        expansionErrors: { path: string; message: string; type: string; templateName?: string }[]
    ): void {
        for (const error of expansionErrors) {
            if (error.type === 'template_not_found') {
                result.warnings.push({
                    path: error.path, message: error.message, code: 'template_not_found', severity: 'warning',
                    suggestion: error.templateName ? `Define template "${error.templateName}" or check the template name` : undefined
                });
            } else {
                result.errors.push({ path: error.path, message: error.message, code: error.type, severity: 'error' });
                result.valid = false;
            }
        }
    }

    private getValidationLevel(): ValidationLevel {
        const level = this.config.get<string>('craftengine.validation.level', 'loose');
        return ValidationLevel[level as keyof typeof ValidationLevel] || ValidationLevel.Loose;
    }

    private getValidateFunction(schemaId: string, schema: JSONSchema7): ValidateFunction {
        const schemaHash = this.computeSchemaHash(schema);
        const cacheKey = `${schemaId}_${this.getValidationLevel()}_${schemaHash}`;

        if (this.validateCache.has(cacheKey)) {
            return this.validateCache.get(cacheKey)!;
        }

        this.cleanupOldCacheEntries(schemaId);

        // 全局容量限制：超出时淘汰最早的条目
        if (this.validateCache.size >= SCHEMA_CACHE.VALIDATE_CACHE_SIZE) {
            const firstKey = this.validateCache.keys().next().value;
            if (firstKey !== undefined) {
                this.validateCache.delete(firstKey);
            }
        }

        const validate = this.ajv.compile(schema);
        this.validateCache.set(cacheKey, validate);
        return validate;
    }

    private computeSchemaHash(schema: JSONSchema7): string {
        const str = JSON.stringify(schema);
        // 使用 djb2 哈希算法，遍历全部字符避免碰撞
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
        }
        return hash.toString(36);
    }

    private cleanupOldCacheEntries(schemaId: string): void {
        const prefix = `${schemaId}_`;
        const keysToDelete: string[] = [];
        for (const key of this.validateCache.keys()) {
            if (key.startsWith(prefix)) {
                keysToDelete.push(key);
            }
        }
        for (const key of keysToDelete) {
            this.validateCache.delete(key);
        }
    }
}