import { type ITemplateMatch, type ITemplateSearchOptions } from '../../../core/interfaces/ITemplateService';
import { type ITemplate } from '../../../core/interfaces/ITemplate';
import { type IDataStoreService } from '../../../core/interfaces/IDataStoreService';
import { type ILogger } from '../../../core/interfaces/ILogger';

/**
 * 模板搜索服务
 *
 * 负责模板的搜索、匹配和排序功能。
 * 支持精确匹配、前缀匹配和模糊匹配。
 */
export class TemplateSearchService {
    private readonly logger: ILogger;

    constructor(
        private readonly repository: IDataStoreService,
        logger: ILogger,
    ) {
        this.logger = logger.createChild('TemplateSearchService');
    }

    // ========================================
    // 搜索 API
    // ========================================

    /**
     * 搜索模板
     */
    async searchTemplates(options: ITemplateSearchOptions): Promise<ITemplateMatch[]> {
        this.logger.debug('Searching templates', { options });

        // 构建查询
        const query = this.buildQuery(options);

        // 执行查询
        const result = await this.repository.queryTemplates(query);

        // 计算匹配分数并排序
        const matches = result.items.map((template: ITemplate) => ({
            template,
            score: this.calculateMatchScore(template, options),
            reason: this.getMatchReason(template, options),
        }));

        // 过滤 score 为 0 的匹配
        const filteredMatches = matches.filter((m: ITemplateMatch) => m.score > 0);

        // 排序
        this.sortMatches(filteredMatches, options);

        // 应用 limit
        const limitedMatches = options.limit ? filteredMatches.slice(0, options.limit) : filteredMatches;

        this.logger.debug('Template search completed', {
            matchCount: limitedMatches.length,
            totalTemplates: result.total,
        });

        return limitedMatches;
    }

    // ========================================
    // 查询构建
    // ========================================

    /**
     * 构建查询参数
     */
    private buildQuery(options: ITemplateSearchOptions): Record<string, unknown> {
        const query: Record<string, unknown> = {};

        // 如果启用 fuzzy 搜索，查询所有模板然后通过评分筛选
        // 否则使用前缀匹配优化查询
        if (options.prefix && !options.fuzzy) {
            query.namePattern = `^${this.escapeRegExp(options.prefix)}`;
        }

        // 如果是 fuzzy 搜索，先查询更多数据
        if (options.fuzzy && options.limit) {
            query.limit = options.limit * 5; // 获取更多候选项
        } else if (options.limit) {
            query.limit = options.limit;
        }

        return query;
    }

    // ========================================
    // 分数计算
    // ========================================

    /**
     * 计算匹配分数
     */
    calculateMatchScore(template: ITemplate, options: ITemplateSearchOptions): number {
        let score = 0;

        if (options.prefix) {
            const prefix = options.prefix.toLowerCase();
            const name = template.name.toLowerCase();

            if (name.startsWith(prefix)) {
                score += 100; // 精确前缀匹配

                // 完全匹配得分更高
                if (name === prefix) {
                    score += 50;
                }
            } else if (options.fuzzy && name.includes(prefix)) {
                score += 50; // 模糊匹配
            }
        }

        // 参数数量影响分数（参数较少的模板更容易使用）
        score += Math.max(0, 20 - template.parameters.length);

        return score;
    }

    /**
     * 获取匹配原因
     */
    getMatchReason(template: ITemplate, options: ITemplateSearchOptions): string {
        if (options.prefix) {
            const prefix = options.prefix.toLowerCase();
            const name = template.name.toLowerCase();

            if (name === prefix) {
                return 'Exact match';
            } else if (name.startsWith(prefix)) {
                return 'Prefix match';
            } else if (name.includes(prefix)) {
                return 'Contains text';
            }
        }

        return 'General match';
    }

    // ========================================
    // 排序
    // ========================================

    /**
     * 对匹配结果排序
     */
    private sortMatches(matches: ITemplateMatch[], options: ITemplateSearchOptions): void {
        matches.sort((a, b) => {
            switch (options.sortBy) {
                case 'name':
                    return a.template.name.localeCompare(b.template.name);

                case 'usage':
                    return this.compareByUsage(a, b);

                default:
                    // 默认按相关性排序
                    return b.score - a.score;
            }
        });
    }

    /**
     * 按使用频率比较
     */
    private compareByUsage(a: ITemplateMatch, b: ITemplateMatch): number {
        const usageDiff = b.template.usageCount - a.template.usageCount;

        if (usageDiff !== 0) {
            return usageDiff;
        }

        // 如果使用次数相同，按最后使用时间排序
        if (a.template.lastUsedAt && b.template.lastUsedAt) {
            return b.template.lastUsedAt.getTime() - a.template.lastUsedAt.getTime();
        } else if (b.template.lastUsedAt) {
            return 1; // b 有使用记录，优先显示
        } else if (a.template.lastUsedAt) {
            return -1; // a 有使用记录，优先显示
        }

        // 如果都没有使用记录，按相关性分数排序
        return b.score - a.score;
    }

    // ========================================
    // 工具方法
    // ========================================

    /**
     * 转义正则表达式特殊字符
     */
    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
