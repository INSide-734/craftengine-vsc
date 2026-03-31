import { type ITemplateValidationResult, type TemplateParameterRecord } from '../../../core/interfaces/ITemplate';
import { type IDataStoreService } from '../../../core/interfaces/IDataStoreService';
import { type ILogger } from '../../../core/interfaces/ILogger';

/**
 * 模板验证服务
 *
 * 负责模板使用的验证功能。
 * 检查必需参数是否提供、参数类型是否正确等。
 */
export class TemplateValidationService {
    private readonly logger: ILogger;

    constructor(
        private readonly repository: IDataStoreService,
        logger: ILogger,
    ) {
        this.logger = logger.createChild('TemplateValidationService');
    }

    // ========================================
    // 验证 API
    // ========================================

    /**
     * 验证模板使用
     */
    async validateTemplateUsage(
        templateName: string,
        parameters: TemplateParameterRecord,
    ): Promise<ITemplateValidationResult> {
        this.logger.debug('Validating template usage', {
            templateName,
            parameterCount: Object.keys(parameters).length,
        });

        const template = await this.repository.getTemplateByName(templateName);

        if (!template) {
            return {
                isValid: false,
                errors: [
                    {
                        parameter: '',
                        message: `Template '${templateName}' not found`,
                        type: 'missing',
                    },
                ],
                warnings: [],
            };
        }

        return template.validateParameters(parameters);
    }

    /**
     * 检查模板是否在当前上下文中可用
     */
    async isTemplateAvailable(templateName: string): Promise<boolean> {
        const template = await this.repository.getTemplateByName(templateName);
        return template !== undefined;
    }

    /**
     * 批量验证模板使用
     */
    async validateMultipleTemplateUsages(
        usages: Array<{ templateName: string; parameters: TemplateParameterRecord }>,
    ): Promise<Map<string, ITemplateValidationResult>> {
        const entries = await Promise.all(
            usages.map(
                async (usage) =>
                    [
                        usage.templateName,
                        await this.validateTemplateUsage(usage.templateName, usage.parameters),
                    ] as const,
            ),
        );

        return new Map(entries);
    }
}
