import { EditorUri } from '../../../core/types/EditorTypes';
import { ITemplate } from '../../../core/interfaces/ITemplate';
import { ITemplateQuery, ITemplateQueryResult, ITemplateStatistics, ITemplateRepository } from '../../../core/interfaces/ITemplateRepository';
import { IQueryResult } from '../../../core/interfaces/IDataStoreService';
import { ILogger } from '../../../core/interfaces/ILogger';
import { IEventBus } from '../../../core/interfaces/IEventBus';
import { EVENT_TYPES } from '../../../core/constants/ServiceTokens';
import { TemplateValidationError, TemplateNotFoundError } from '../../../core/errors/ExtensionErrors';
import { generateEventId, safeRegExp } from '../../../core/utils';

/**
 * 模板存储管理
 * 
 * 负责模板的存储、索引和查询操作。
 * 使用内存索引提供高性能的数据访问。
 */
export class TemplateStore implements ITemplateRepository {
    /** 模板主存储：ID -> 模板对象 */
    private readonly templates = new Map<string, ITemplate>();
    /** 模板名称索引：名称 -> 模板对象 */
    private readonly nameIndex = new Map<string, ITemplate>();
    /** 模板文件索引：文件路径 -> 模板 ID 集合 */
    private readonly fileIndex = new Map<string, Set<string>>();
    /** 模板参数索引：参数名 -> 模板 ID 集合 */
    private readonly parameterIndex = new Map<string, Set<string>>();
    
    private lastUpdated = new Date();
    
    constructor(
        private readonly logger: ILogger,
        private readonly eventBus?: IEventBus
    ) {}
    
    // ========================================
    // 查询操作
    // ========================================
    
    async getById(id: string): Promise<ITemplate | undefined> {
        return this.templates.get(id);
    }
    
    async getByName(name: string): Promise<ITemplate | undefined> {
        return this.nameIndex.get(name);
    }
    
    async query(query: ITemplateQuery): Promise<ITemplateQueryResult> {
        let results = Array.from(this.templates.values());
        
        // 应用过滤器
        if (query.namePattern) {
            const pattern = safeRegExp(query.namePattern, 'i');
            results = results.filter(t => pattern.test(t.name));
        }
        
        if (query.hasParameter) {
            const templateIds = this.parameterIndex.get(query.hasParameter) || new Set();
            results = results.filter(t => templateIds.has(t.id));
        }
        
        if (query.sourceFile) {
            const filePath = query.sourceFile.fsPath;
            const templateIds = this.fileIndex.get(filePath) || new Set();
            results = results.filter(t => templateIds.has(t.id));
        }
        
        // 排序
        results.sort((a, b) => a.name.localeCompare(b.name));
        
        const total = results.length;
        
        // 分页
        if (query.skip) {
            results = results.slice(query.skip);
        }
        if (query.limit) {
            results = results.slice(0, query.limit);
        }
        
        return {
            templates: results,
            total,
            hasMore: query.limit ? (query.skip || 0) + results.length < total : false
        };
    }
    
    /**
     * 查询模板（返回 IQueryResult 格式）
     */
    async queryTemplates(query: ITemplateQuery): Promise<IQueryResult<ITemplate>> {
        const result = await this.query(query);
        return {
            items: result.templates,
            total: result.total,
            hasMore: result.hasMore
        };
    }
    
    async getAll(): Promise<ITemplate[]> {
        return Array.from(this.templates.values());
    }
    
    async count(): Promise<number> {
        return this.templates.size;
    }
    
    async exists(id: string): Promise<boolean> {
        return this.templates.has(id);
    }
    
    // ========================================
    // 写入操作
    // ========================================
    
    async add(template: ITemplate): Promise<void> {
        await this.addInternal(template, true);
    }
    
    async addMany(templates: ITemplate[]): Promise<void> {
        for (const template of templates) {
            await this.addInternal(template, false);
        }
        
        this.logger.info('Templates added', { count: templates.length });
        
        // 批量发布事件
        for (const template of templates) {
            await this.publishEvent(EVENT_TYPES.TemplateCreated, template);
        }
    }
    
    /**
     * 内部添加模板（不发布事件）
     */
    async addWithoutEvent(template: ITemplate): Promise<void> {
        await this.addInternal(template, false);
    }
    
    private async addInternal(template: ITemplate, publishEvent: boolean): Promise<void> {
        // 检查名称冲突
        if (this.nameIndex.has(template.name)) {
            const existing = this.nameIndex.get(template.name)!;
            if (existing.id !== template.id) {
                throw new TemplateValidationError(`Template with name '${template.name}' already exists`);
            }
        }
        
        // 添加到主存储
        this.templates.set(template.id, template);
        
        // 更新索引
        this.updateIndexes(template);
        
        this.lastUpdated = new Date();
        
        if (publishEvent) {
            this.logger.debug('Template added', {
                id: template.id,
                name: template.name
            });
            
            await this.publishEvent(EVENT_TYPES.TemplateCreated, template);
        }
    }
    
    async update(template: ITemplate): Promise<void> {
        const existing = this.templates.get(template.id);
        if (!existing) {
            throw new TemplateNotFoundError(template.id);
        }
        
        // 检查名称冲突
        if (template.name !== existing.name && this.nameIndex.has(template.name)) {
            throw new Error(`Template with name '${template.name}' already exists`);
        }
        
        // 移除旧索引
        this.removeFromIndexes(existing);
        
        // 更新存储
        this.templates.set(template.id, template);
        
        // 更新索引
        this.updateIndexes(template);
        
        this.lastUpdated = new Date();
        
        this.logger.debug('Template updated', {
            id: template.id,
            name: template.name
        });
        
        await this.publishEvent(EVENT_TYPES.TemplateUpdated, template);
    }
    
    async remove(id: string): Promise<void> {
        const template = this.templates.get(id);
        if (!template) {
            return;
        }
        
        this.removeFromIndexes(template);
        this.templates.delete(id);
        
        this.lastUpdated = new Date();
        
        this.logger.debug('Template removed', {
            id,
            name: template.name
        });
        
        await this.eventBus?.publish(EVENT_TYPES.TemplateDeleted, {
            id: generateEventId(),
            type: EVENT_TYPES.TemplateDeleted,
            timestamp: new Date(),
            source: 'TemplateStore',
            templateId: id,
            templateName: template.name
        });
    }

    async removeByFile(sourceFile: EditorUri): Promise<void> {
        const filePath = sourceFile.fsPath;
        const templateIds = this.fileIndex.get(filePath);

        if (!templateIds || templateIds.size === 0) {
            return;
        }

        const removedTemplates: ITemplate[] = [];

        for (const id of templateIds) {
            const template = this.templates.get(id);
            if (template) {
                removedTemplates.push(template);
                this.removeFromIndexes(template);
                this.templates.delete(id);
            }
        }

        this.lastUpdated = new Date();

        this.logger.debug('Templates removed by file', {
            filePath,
            count: removedTemplates.length
        });

        // 发布事件
        for (const template of removedTemplates) {
            await this.eventBus?.publish(EVENT_TYPES.TemplateDeleted, {
                id: generateEventId(),
                type: EVENT_TYPES.TemplateDeleted,
                timestamp: new Date(),
                source: 'TemplateStore',
                templateId: template.id,
                templateName: template.name
            });
        }
    }
    
    async clearTemplates(): Promise<void> {
        const count = this.templates.size;
        this.templates.clear();
        this.nameIndex.clear();
        this.fileIndex.clear();
        this.parameterIndex.clear();
        this.lastUpdated = new Date();

        // 发布单个批量清除事件，替代逐条 TemplateDeleted
        if (count > 0) {
            await this.eventBus?.publish(EVENT_TYPES.TemplateCacheRebuilt, {
                id: `template-clear-${Date.now()}`,
                type: EVENT_TYPES.TemplateCacheRebuilt,
                timestamp: new Date(),
                source: 'TemplateStore',
                templateCount: 0,
                duration: 0
            });
        }
    }
    
    /**
     * 清空所有数据（不发布事件）
     */
    clear(): void {
        this.templates.clear();
        this.nameIndex.clear();
        this.fileIndex.clear();
        this.parameterIndex.clear();
        this.lastUpdated = new Date();
    }
    
    // ========================================
    // 统计
    // ========================================
    
    async getTemplateStatistics(): Promise<ITemplateStatistics> {
        return {
            totalTemplates: this.templates.size,
            totalFiles: this.fileIndex.size,
            lastUpdated: this.lastUpdated
        };
    }
    
    getLastUpdated(): Date {
        return this.lastUpdated;
    }
    
    getFileCount(): number {
        return this.fileIndex.size;
    }
    
    // ========================================
    // 索引管理
    // ========================================
    
    private updateIndexes(template: ITemplate): void {
        // 名称索引
        this.nameIndex.set(template.name, template);
        
        // 文件索引
        const filePath = template.sourceFile.fsPath;
        if (!this.fileIndex.has(filePath)) {
            this.fileIndex.set(filePath, new Set());
        }
        this.fileIndex.get(filePath)!.add(template.id);
        
        // 参数索引
        for (const param of template.parameters) {
            if (!this.parameterIndex.has(param.name)) {
                this.parameterIndex.set(param.name, new Set());
            }
            this.parameterIndex.get(param.name)!.add(template.id);
        }
    }
    
    private removeFromIndexes(template: ITemplate): void {
        // 名称索引
        if (this.nameIndex.get(template.name)?.id === template.id) {
            this.nameIndex.delete(template.name);
        }
        
        // 文件索引
        const filePath = template.sourceFile.fsPath;
        const fileTemplates = this.fileIndex.get(filePath);
        if (fileTemplates) {
            fileTemplates.delete(template.id);
            if (fileTemplates.size === 0) {
                this.fileIndex.delete(filePath);
            }
        }
        
        // 参数索引
        for (const param of template.parameters) {
            const paramTemplates = this.parameterIndex.get(param.name);
            if (paramTemplates) {
                paramTemplates.delete(template.id);
                if (paramTemplates.size === 0) {
                    this.parameterIndex.delete(param.name);
                }
            }
        }
    }
    
    // ========================================
    // 事件发布
    // ========================================
    
    private async publishEvent(eventType: string, template: ITemplate): Promise<void> {
        try {
            await this.eventBus?.publish(eventType, {
                id: generateEventId(),
                type: eventType,
                timestamp: new Date(),
                source: 'TemplateStore',
                template
            });
        } catch (error) {
            this.logger.warn('Failed to publish template event', {
                eventType,
                templateId: template.id,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
}
