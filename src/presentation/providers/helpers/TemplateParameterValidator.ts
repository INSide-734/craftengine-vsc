/**
 * 模板参数验证器
 *
 * 负责验证模板使用的正确性，包括模板存在性检查和参数验证
 */

import { type TextDocument, Diagnostic, DiagnosticSeverity, DiagnosticRelatedInformation, Location } from 'vscode';
import { type ILogger } from '../../../core/interfaces/ILogger';
import { type ITemplateService } from '../../../core/interfaces/ITemplateService';
import {
    type ITemplate,
    type ITemplateParameter,
    type TemplateParameterRecord,
} from '../../../core/interfaces/ITemplate';
import { type TemplateReferenceFinder } from './TemplateReferenceFinder';

/**
 * 模板参数验证器
 *
 * 提供模板使用验证和参数检查功能
 */
export class TemplateParameterValidator {
    private readonly logger: ILogger;
    private readonly templateService: ITemplateService;
    private readonly referenceFinder: TemplateReferenceFinder;

    /** 诊断源标识 */
    private static readonly DIAGNOSTIC_SOURCE = 'CraftEngine Template';

    constructor(logger: ILogger, templateService: ITemplateService, referenceFinder: TemplateReferenceFinder) {
        this.logger = logger;
        this.templateService = templateService;
        this.referenceFinder = referenceFinder;
    }

    /**
     * 验证模板使用
     */
    async validateITemplateUsage(usage: ITemplateUsage, document: TextDocument): Promise<Diagnostic[]> {
        const diagnostics: Diagnostic[] = [];

        try {
            // 如果模板名称包含变量，则无法静态验证，跳过
            if (usage.templateName.includes('${')) {
                this.logger.debug('Skipping validation for dynamic template name', {
                    templateName: usage.templateName,
                    line: usage.line,
                });
                return diagnostics;
            }

            this.logger.debug('Validating template usage', {
                templateName: usage.templateName,
                parameters: usage.parameters,
                line: usage.line,
            });

            // 先尝试搜索模板，使用与悬浮提示相同的方法
            const searchResults = await this.templateService.searchTemplates({
                prefix: usage.templateName,
                limit: 1,
                fuzzy: false, // 精确匹配
            });

            this.logger.debug('Template search result', {
                templateName: usage.templateName,
                found: searchResults.length > 0,
                exactMatch: searchResults.length > 0 && searchResults[0].template.name === usage.templateName,
            });

            // 如果找不到精确匹配的模板
            if (searchResults.length === 0 || searchResults[0].template.name !== usage.templateName) {
                this.logger.warn('Template not found', {
                    templateName: usage.templateName,
                    searchResultCount: searchResults.length,
                    firstResult: searchResults.length > 0 ? searchResults[0].template.name : 'none',
                });

                const diagnostic = new Diagnostic(
                    usage.range,
                    `Template '${usage.templateName}' not found`,
                    DiagnosticSeverity.Error,
                );
                diagnostic.source = TemplateParameterValidator.DIAGNOSTIC_SOURCE;
                diagnostic.code = 'unknown_template';

                // 添加可能的建议
                diagnostic.relatedInformation = await this.referenceFinder.findSimilarTemplatesSuggestions(
                    usage.templateName,
                    document,
                    usage.range,
                );

                diagnostics.push(diagnostic);
                return diagnostics;
            }

            // 找到模板 - 进行参数验证
            const template = searchResults[0].template;
            this.logger.debug('Template found, validating parameters', {
                templateName: usage.templateName,
                templateId: template.id,
                providedParams: Object.keys(usage.parameters),
                requiredParams: template.getRequiredParameters().map((p) => p.name),
            });

            // 验证模板参数
            const parameterValidationResult = await this.validateTemplateParameters(
                template,
                usage.parameters,
                usage,
                document,
            );
            diagnostics.push(...parameterValidationResult);
        } catch (error) {
            // 只有在真正发生异常时才记录
            this.logger.error('Exception during template validation', error as Error, {
                templateName: usage.templateName,
            });

            // 模板不存在或其他错误
            const diagnostic = new Diagnostic(
                usage.range,
                `Unknown template: ${usage.templateName}\n Hint: Check template name or press Ctrl+Space to view available templates`,
                DiagnosticSeverity.Error,
            );
            diagnostic.source = TemplateParameterValidator.DIAGNOSTIC_SOURCE;
            diagnostic.code = 'unknown_template';

            // 添加可能的建议
            diagnostic.relatedInformation = await this.referenceFinder.findSimilarTemplatesSuggestions(
                usage.templateName,
                document,
                usage.range,
            );

            diagnostics.push(diagnostic);
        }

        return diagnostics;
    }

    /**
     * 验证模板参数
     */
    async validateTemplateParameters(
        template: ITemplate,
        providedParameters: TemplateParameterRecord,
        usage: ITemplateUsage,
        document: TextDocument,
    ): Promise<Diagnostic[]> {
        const diagnostics: Diagnostic[] = [];

        try {
            // 使用模板内置的验证方法
            const validationResult = template.validateParameters(providedParameters);

            this.logger.debug('Parameter validation result', {
                templateName: template.name,
                isValid: validationResult.isValid,
                errorCount: validationResult.errors.length,
                warningCount: validationResult.warnings.length,
            });

            // 处理验证错误
            for (const error of validationResult.errors) {
                const diagnostic = new Diagnostic(usage.range, error.message, DiagnosticSeverity.Error);
                diagnostic.source = TemplateParameterValidator.DIAGNOSTIC_SOURCE;
                diagnostic.code = `parameter_${error.type}`;

                // 添加参数相关信息
                if (error.parameter) {
                    const paramInfo = template.getParameter(error.parameter);
                    if (paramInfo) {
                        diagnostic.relatedInformation = [
                            new DiagnosticRelatedInformation(
                                new Location(document.uri, usage.range),
                                `Parameter '${error.parameter}' is ${paramInfo.required ? 'required' : 'optional'}`,
                            ),
                        ];
                    }
                }

                diagnostics.push(diagnostic);
            }

            // 处理验证警告
            for (const warning of validationResult.warnings) {
                const diagnostic = new Diagnostic(usage.range, warning.message, DiagnosticSeverity.Warning);
                diagnostic.source = TemplateParameterValidator.DIAGNOSTIC_SOURCE;
                diagnostic.code = `parameter_${warning.type}`;

                // 添加建议信息
                if (warning.suggestion) {
                    diagnostic.relatedInformation = [
                        new DiagnosticRelatedInformation(
                            new Location(document.uri, usage.range),
                            ` Suggestion: ${warning.suggestion}`,
                        ),
                    ];
                }

                diagnostics.push(diagnostic);
            }

            // 额外检查：提供未使用的可选参数建议
            if (validationResult.isValid && validationResult.warnings.length === 0) {
                const optionalParams = template.getOptionalParameters();
                const providedParamNames = new Set(Object.keys(providedParameters));
                const unusedOptionalParams = optionalParams.filter(
                    (p: ITemplateParameter) => !providedParamNames.has(p.name),
                );

                if (unusedOptionalParams.length > 0 && unusedOptionalParams.length <= 3) {
                    const diagnostic = new Diagnostic(
                        usage.range,
                        `Available optional parameters: ${unusedOptionalParams.map((p: ITemplateParameter) => p.name).join(', ')}`,
                        DiagnosticSeverity.Information,
                    );
                    diagnostic.source = TemplateParameterValidator.DIAGNOSTIC_SOURCE;
                    diagnostic.code = 'optional_parameters_available';

                    // 添加每个参数的详细信息
                    diagnostic.relatedInformation = unusedOptionalParams.map(
                        (param: ITemplateParameter) =>
                            new DiagnosticRelatedInformation(
                                new Location(document.uri, usage.range),
                                `${param.name}${param.description ? `: ${param.description}` : ''}${param.defaultValue !== undefined ? ` [default: ${param.defaultValue}]` : ''}`,
                            ),
                    );

                    diagnostics.push(diagnostic);
                }
            }
        } catch (error) {
            this.logger.error('Error validating template parameters', error as Error, {
                templateName: template.name,
                providedParameters: Object.keys(providedParameters),
            });

            // 添加通用验证错误
            const diagnostic = new Diagnostic(
                usage.range,
                `Failed to validate parameters for template '${template.name}': ${(error as Error).message}`,
                DiagnosticSeverity.Error,
            );
            diagnostic.source = 'CraftEngine Parameter Validator';
            diagnostic.code = 'validation_error';

            diagnostics.push(diagnostic);
        }

        return diagnostics;
    }
}
