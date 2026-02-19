import {
    ITemplateMatch,
    ITemplateSearchOptions,
    ITemplateUsageContext
} from '../../../core/interfaces/ITemplateService';
import { ITemplate } from '../../../core/interfaces/ITemplate';
import { IDataStoreService } from '../../../core/interfaces/IDataStoreService';
import { ILogger } from '../../../core/interfaces/ILogger';
import { TemplateSearchService } from './TemplateSearchService';

/**
 * 上下文分析结果
 */
interface IContextAnalysis {
    inputPrefix: string;
    indentLevel: number;
    lineText: string;
}

/**
 * 模板建议服务
 * 
 * 负责根据上下文智能推荐合适的模板。
 * 考虑缩进级别、文档结构、使用历史等因素。
 */
export class TemplateSuggestionService {
    private readonly logger: ILogger;
    private readonly searchService: TemplateSearchService;

    constructor(
        private readonly repository: IDataStoreService,
        logger: ILogger,
        searchService?: TemplateSearchService
    ) {
        this.logger = logger.createChild('TemplateSuggestionService');
        this.searchService = searchService ?? new TemplateSearchService(repository, logger);
    }
    
    // ========================================
    // 建议 API
    // ========================================
    
    /**
     * 获取模板建议
     */
    async getTemplateSuggestions(context: ITemplateUsageContext): Promise<ITemplateMatch[]> {
        this.logger.debug('Getting template suggestions', {
            fileName: context.document?.fileName,
            line: context.position.line,
            character: context.position.character
        });
        
        // 分析上下文
        const contextAnalysis = this.analyzeContext(context);
        
        // 搜索相关模板
        const searchOptions: ITemplateSearchOptions = {
            prefix: contextAnalysis.inputPrefix,
            limit: 20,
            fuzzy: true,
            sortBy: 'relevance'
        };
        
        const matches = await this.searchService.searchTemplates(searchOptions);
        
        // 根据上下文过滤和调整分数
        return matches
            .filter(match => this.isTemplateRelevant(match.template, contextAnalysis))
            .map(match => ({
                ...match,
                score: match.score * this.getContextRelevanceMultiplier(match.template, contextAnalysis)
            }))
            .sort((a, b) => b.score - a.score);
    }
    
    /**
     * 获取参数建议
     */
    async getParameterSuggestions(
        templateName: string,
        existingParameters: string[]
    ): Promise<string[]> {
        this.logger.debug('Getting parameter suggestions', {
            templateName,
            existingParameterCount: existingParameters.length
        });
        
        const template = await this.repository.getTemplateByName(templateName);
        
        if (!template) {
            return [];
        }
        
        // 返回还未使用的参数
        const allParameters = template.parameters.map((p: { name: string }) => p.name);
        const suggestions = allParameters.filter((param: string) => !existingParameters.includes(param));
        
        // 优先返回必需参数
        const requiredParameters = template.getRequiredParameters().map((p: { name: string }) => p.name);
        const optionalParameters = template.getOptionalParameters().map((p: { name: string }) => p.name);
        
        const requiredSuggestions = suggestions.filter((param: string) => requiredParameters.includes(param));
        const optionalSuggestions = suggestions.filter((param: string) => optionalParameters.includes(param));
        
        return [...requiredSuggestions, ...optionalSuggestions];
    }
    
    // ========================================
    // 上下文分析
    // ========================================
    
    /**
     * 分析使用上下文
     */
    private analyzeContext(context: ITemplateUsageContext): IContextAnalysis {
        const lineText = context.lineText;
        const position = context.position.character;
        
        // 提取输入前缀
        let inputPrefix = '';
        for (let i = position - 1; i >= 0; i--) {
            const char = lineText[i];
            if (/[a-zA-Z0-9_:/-]/.test(char)) {
                inputPrefix = char + inputPrefix;
            } else {
                break;
            }
        }
        
        // 如果没有输入前缀，尝试从 lineText 中提取 "template:" 后面的内容
        if (!inputPrefix && lineText.includes('template:')) {
            const afterTemplate = lineText.split('template:')[1];
            if (afterTemplate) {
                inputPrefix = afterTemplate.trim();
            }
        }
        
        return {
            inputPrefix,
            indentLevel: context.indentLevel,
            lineText: context.lineText
        };
    }
    
    // ========================================
    // 相关性计算
    // ========================================
    
    /**
     * 检查模板是否与上下文相关
     */
    private isTemplateRelevant(template: ITemplate, contextAnalysis: IContextAnalysis): boolean {
        const prefix = contextAnalysis.inputPrefix?.trim();
        
        if (prefix && prefix.length > 0) {
            const prefixLower = prefix.toLowerCase();
            const templateName = template.name.toLowerCase();
            
            // 模板名称必须包含输入前缀
            return templateName.includes(prefixLower);
        }
        
        // 没有输入前缀时，所有模板都相关
        return true;
    }
    
    /**
     * 获取上下文相关性乘数
     */
    private getContextRelevanceMultiplier(
        _template: ITemplate,
        contextAnalysis: IContextAnalysis
    ): number {
        let multiplier = 1.0;
        
        // 如果输入前缀更长，给予更高的分数
        if (contextAnalysis.inputPrefix && contextAnalysis.inputPrefix.length > 2) {
            multiplier += 0.2;
        }
        
        return multiplier;
    }
}


