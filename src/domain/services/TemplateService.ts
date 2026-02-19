import { EditorTextDocument, EditorUri } from '../../core/types/EditorTypes';
import {
    ITemplateService,
    ITemplateParseResult,
    ITemplateMatch,
    ITemplateSearchOptions,
    ITemplateUsageContext
} from '../../core/interfaces/ITemplateService';
import { ITemplateValidationResult, TemplateParameterRecord } from '../../core/interfaces/ITemplate';
import { IDataStoreService } from '../../core/interfaces/IDataStoreService';
import { ILogger } from '../../core/interfaces/ILogger';
import { IConfiguration } from '../../core/interfaces/IConfiguration';
import {
    TemplateParserService,
    TemplateSearchService,
    TemplateValidationService,
    TemplateSuggestionService,
    TemplateUsageService
} from './template';

/**
 * 模板服务实现
 * 
 * 作为领域层的核心服务门面，封装模板相关的所有业务逻辑。
 * 使用组合模式委托给专门的子服务。
 * 
 * @remarks
 * **业务职责**：
 * 
 * 1. **模板解析** - 委托给 TemplateParserService
 *    - 从 YAML 文档中提取模板定义
 *    - 解析模板参数和元数据
 *    - 验证模板结构的正确性
 * 
 * 2. **模板搜索** - 委托给 TemplateSearchService
 *    - 基于名称前缀的精确搜索
 *    - 模糊匹配支持（容错搜索）
 *    - 按相关性、名称或使用频率排序
 * 
 * 3. **智能推荐** - 委托给 TemplateSuggestionService
 *    - 根据上下文推荐合适的模板
 *    - 考虑缩进级别、文档结构等因素
 *    - 基于使用历史的个性化推荐
 * 
 * 4. **模板验证** - 委托给 TemplateValidationService
 *    - 验证模板使用的参数完整性
 *    - 检查必需参数是否提供
 * 
 * 5. **使用统计** - 委托给 TemplateUsageService
 *    - 记录模板使用次数
 *    - 跟踪最后使用时间
 * 
 * **设计原则**：
 * - 门面模式：统一对外接口
 * - 组合模式：功能委托给子服务
 * - 依赖倒置：依赖接口而非具体实现
 */
export class TemplateService implements ITemplateService {
    private readonly logger: ILogger;
    private readonly parserService: TemplateParserService;
    private readonly searchService: TemplateSearchService;
    private readonly validationService: TemplateValidationService;
    private readonly suggestionService: TemplateSuggestionService;
    private readonly usageService: TemplateUsageService;
    
    constructor(
        dataStoreService: IDataStoreService,
        logger: ILogger,
        configuration?: IConfiguration,
        parserService?: TemplateParserService,
        searchService?: TemplateSearchService,
        validationService?: TemplateValidationService,
        suggestionService?: TemplateSuggestionService,
        usageService?: TemplateUsageService
    ) {
        this.logger = logger.createChild('TemplateService');

        // 使用注入的子服务或创建默认实例
        this.parserService = parserService ?? new TemplateParserService(logger, configuration);
        this.searchService = searchService ?? new TemplateSearchService(dataStoreService, logger);
        this.validationService = validationService ?? new TemplateValidationService(dataStoreService, logger);
        this.suggestionService = suggestionService ?? new TemplateSuggestionService(dataStoreService, logger);
        this.usageService = usageService ?? new TemplateUsageService(dataStoreService, logger);
    }
    
    // ========================================
    // 解析功能（委托给 TemplateParserService）
    // ========================================
    
    async parseDocument(document: EditorTextDocument): Promise<ITemplateParseResult> {
        this.logger.debug('Parsing document for templates', {
            fileName: document.fileName,
            languageId: document.languageId
        });
        
        return this.parseText(document.getText(), document.uri);
    }
    
    async parseText(text: string, sourceFile: EditorUri): Promise<ITemplateParseResult> {
        try {
            const result = this.parserService.parseTemplatesWithErrors(text, sourceFile);
            
            // 记录详细的解析统计
            const totalAttempts = result.templates.length + result.errors.length;
            const successRate = totalAttempts > 0 ? (result.templates.length / totalAttempts) * 100 : 0;
            
            if (result.errors.length > 0) {
                this.logger.warn('Template parsing completed with errors', {
                    fileName: sourceFile.fsPath,
                    successfulTemplates: result.templates.length,
                    failedTemplates: result.errors.length,
                    successRate: `${successRate.toFixed(1)}%`,
                    failedTemplatesList: result.errors.map(e => e.message).slice(0, 5)
                });
            } else {
                this.logger.info('Template parsing completed successfully', {
                    fileName: sourceFile.fsPath,
                    templateCount: result.templates.length
                });
            }
            
            return result;
            
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error('Failed to parse document', error as Error, {
                fileName: sourceFile.fsPath
            });
            
            return {
                templates: [],
                errors: [{
                    message: `Parse error: ${message}`,
                    severity: 'error'
                }]
            };
        }
    }
    
    // ========================================
    // 搜索功能（委托给 TemplateSearchService）
    // ========================================
    
    async searchTemplates(options: ITemplateSearchOptions): Promise<ITemplateMatch[]> {
        return this.searchService.searchTemplates(options);
    }
    
    // ========================================
    // 验证功能（委托给 TemplateValidationService）
    // ========================================
    
    async validateTemplateUsage(
        templateName: string,
        parameters: TemplateParameterRecord
    ): Promise<ITemplateValidationResult> {
        return this.validationService.validateTemplateUsage(templateName, parameters);
    }
    
    async isTemplateAvailableAt(
        templateName: string,
        _context: ITemplateUsageContext
    ): Promise<boolean> {
        return this.validationService.isTemplateAvailable(templateName);
    }
    
    // ========================================
    // 建议功能（委托给 TemplateSuggestionService）
    // ========================================
    
    async getTemplateSuggestions(context: ITemplateUsageContext): Promise<ITemplateMatch[]> {
        return this.suggestionService.getTemplateSuggestions(context);
    }
    
    async getParameterSuggestions(
        templateName: string,
        existingParameters: string[]
    ): Promise<string[]> {
        return this.suggestionService.getParameterSuggestions(templateName, existingParameters);
    }
    
    // ========================================
    // 使用统计（委托给 TemplateUsageService）
    // ========================================
    
    async recordTemplateUsage(templateName: string): Promise<boolean> {
        return this.usageService.recordTemplateUsage(templateName);
    }
    
    // ========================================
    // 访问子服务（用于扩展功能）
    // ========================================
    
    /**
     * 获取解析服务
     */
    getParserService(): TemplateParserService {
        return this.parserService;
    }
    
    /**
     * 获取搜索服务
     */
    getSearchService(): TemplateSearchService {
        return this.searchService;
    }
    
    /**
     * 获取验证服务
     */
    getValidationService(): TemplateValidationService {
        return this.validationService;
    }
    
    /**
     * 获取建议服务
     */
    getSuggestionService(): TemplateSuggestionService {
        return this.suggestionService;
    }
    
    /**
     * 获取使用统计服务
     */
    getUsageService(): TemplateUsageService {
        return this.usageService;
    }
}
