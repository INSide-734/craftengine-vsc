import { type IDataStoreService } from '../../../core/interfaces/IDataStoreService';
import { type ILogger } from '../../../core/interfaces/ILogger';
import { type ITemplate } from '../../../core/interfaces/ITemplate';

/**
 * 模板使用统计服务
 *
 * 负责记录和管理模板的使用统计信息。
 * 跟踪使用次数、最后使用时间等。
 */
export class TemplateUsageService {
    private readonly logger: ILogger;

    constructor(
        private readonly repository: IDataStoreService,
        logger: ILogger,
    ) {
        this.logger = logger.createChild('TemplateUsageService');
    }

    // ========================================
    // 使用统计 API
    // ========================================

    /**
     * 记录模板使用
     */
    async recordTemplateUsage(templateName: string): Promise<boolean> {
        this.logger.debug('Recording template usage', { templateName });

        try {
            const template = await this.repository.getTemplateByName(templateName);

            if (!template) {
                this.logger.warn('Template not found for usage recording', { templateName });
                return false;
            }

            // 使用 recordUsage 方法创建新的模板实例
            const updatedTemplate = template.recordUsage();

            // 更新仓储中的模板
            await this.repository.updateTemplate(updatedTemplate);

            this.logger.info('Template usage recorded', {
                templateName,
                usageCount: updatedTemplate.usageCount,
                lastUsedAt: updatedTemplate.lastUsedAt,
            });

            return true;
        } catch (error) {
            this.logger.error('Failed to record template usage', error as Error, {
                templateName,
            });
            return false;
        }
    }

    /**
     * 获取模板使用统计
     */
    async getUsageStatistics(templateName: string): Promise<
        | {
              usageCount: number;
              lastUsedAt?: Date;
          }
        | undefined
    > {
        const template = await this.repository.getTemplateByName(templateName);

        if (!template) {
            return undefined;
        }

        return {
            usageCount: template.usageCount,
            lastUsedAt: template.lastUsedAt,
        };
    }

    /**
     * 获取最常使用的模板
     */
    async getMostUsedTemplates(limit: number = 10): Promise<
        Array<{
            templateName: string;
            usageCount: number;
            lastUsedAt?: Date;
        }>
    > {
        // 查询所有模板以确保高使用量模板不会被遗漏
        const result = await this.repository.queryTemplates({});

        return result.items
            .filter((t: ITemplate) => t.usageCount > 0)
            .sort((a: ITemplate, b: ITemplate) => b.usageCount - a.usageCount)
            .slice(0, limit)
            .map((t: ITemplate) => ({
                templateName: t.name,
                usageCount: t.usageCount,
                lastUsedAt: t.lastUsedAt,
            }));
    }

    /**
     * 获取最近使用的模板
     */
    async getRecentlyUsedTemplates(limit: number = 10): Promise<
        Array<{
            templateName: string;
            usageCount: number;
            lastUsedAt: Date;
        }>
    > {
        // 查询所有模板以确保最近使用的模板不会被遗漏
        const result = await this.repository.queryTemplates({});

        return result.items
            .filter((t: ITemplate) => t.lastUsedAt !== undefined)
            .sort((a: ITemplate, b: ITemplate) => {
                if (!a.lastUsedAt || !b.lastUsedAt) {
                    return 0;
                }
                return b.lastUsedAt.getTime() - a.lastUsedAt.getTime();
            })
            .slice(0, limit)
            .map((t: ITemplate) => ({
                templateName: t.name,
                usageCount: t.usageCount,
                lastUsedAt: t.lastUsedAt ?? new Date(),
            }));
    }
}
