import { CompletionItem, CompletionItemKind, MarkdownString, CancellationToken } from 'vscode';
import { ServiceContainer } from '../../../infrastructure/ServiceContainer';
import { ICompletionStrategy, ICompletionContextInfo, ICompletionResult } from '../../../core/interfaces/ICompletionStrategy';
import { IDataStoreService } from '../../../core/interfaces/IDataStoreService';
import { ICategory } from '../../../core/interfaces/ICategory';
import { ILogger } from '../../../core/interfaces/ILogger';
import { IDataConfigLoader } from '../../../core/interfaces/IDataConfigLoader';
import { SERVICE_TOKENS } from '../../../core/constants/ServiceTokens';
import { getRelativePath, extractCompletionPrefix } from '../../../infrastructure/utils/StringUtils';

/**
 * 分类引用补全策略
 *
 * 提供用户在 categories: section 中定义的分类 ID 补全
 * 分类引用格式为 #namespace:category_name
 * 此策略由 SchemaAwareCompletionStrategy 委托调用
 */
export class CategoryReferenceCompletionStrategy implements ICompletionStrategy {
    readonly name = 'category-reference-delegate';
    readonly priority: number;
    readonly triggerCharacters: string[] = ['#'];

    private readonly dataStoreService: IDataStoreService;
    private readonly logger: ILogger;

    constructor() {
        this.dataStoreService = ServiceContainer.getService<IDataStoreService>(SERVICE_TOKENS.DataStoreService);
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger)
            .createChild('CategoryReferenceCompletionStrategy');

        // 从配置文件加载优先级
        const configLoader = ServiceContainer.getService<IDataConfigLoader>(SERVICE_TOKENS.DataConfigLoader);
        this.priority = configLoader.getCompletionPrioritySync('categoryReference', true);
    }
    
    /**
     * 此策略不直接激活，由 SchemaAwareCompletionStrategy 委托调用
     */
    shouldActivate(_context: ICompletionContextInfo): boolean {
        return false;
    }
    
    /**
     * 提供分类引用补全项
     */
    async provideCompletionItems(
        context: ICompletionContextInfo,
        token?: CancellationToken
    ): Promise<ICompletionResult | undefined> {
        try {
            if (token?.isCancellationRequested) {
                return undefined;
            }
            
            this.logger.debug('Providing category reference completions', {
                position: `${context.position.line}:${context.position.character}`,
                linePrefix: context.linePrefix,
                hasSchema: !!context.schema
            });
            
            // 获取所有分类
            const categories = await this.dataStoreService.getAllCategories();
            
            if (categories.length === 0) {
                this.logger.debug('No categories found');
                return {
                    items: [],
                    isIncomplete: false,
                    completionType: 'category-reference',
                    priority: this.priority
                };
            }
            
            // 提取当前已输入的前缀
            const prefix = extractCompletionPrefix(context.linePrefix, /#?[a-zA-Z0-9_:/-]*$/);
            
            // 过滤和排序分类
            let filteredCategories = categories;
            if (prefix) {
                const lowerPrefix = prefix.toLowerCase();
                filteredCategories = categories.filter((category: ICategory) => 
                    category.id.toLowerCase().includes(lowerPrefix) ||
                    category.name.toLowerCase().includes(lowerPrefix) ||
                    category.namespace.toLowerCase().includes(lowerPrefix) ||
                    (category.displayName && category.displayName.toLowerCase().includes(lowerPrefix))
                );
            }
            
            // 按 ID 排序
            filteredCategories.sort((a: ICategory, b: ICategory) => a.id.localeCompare(b.id));
            
            // 创建补全项
            const completionItems = filteredCategories.map((category: ICategory) => 
                this.createCompletionItem(category)
            );
            
            this.logger.debug('Category reference completions provided', {
                total: categories.length,
                filtered: completionItems.length,
                prefix
            });
            
            return {
                items: completionItems,
                isIncomplete: false,
                completionType: 'category-reference',
                priority: this.priority
            };
            
        } catch (error) {
            this.logger.error('Failed to provide category reference completions', error as Error);
            return {
                items: [],
                isIncomplete: false,
                completionType: 'category-reference',
                priority: this.priority
            };
        }
    }
    
    /**
     * 解析补全项，提供详细信息
     */
    async resolveCompletionItem(
        item: CompletionItem,
        token?: CancellationToken
    ): Promise<CompletionItem | undefined> {
        try {
            if (token?.isCancellationRequested) {
                return item;
            }
            
            const categoryId = typeof item.label === 'string' ? item.label : item.label.label;
            const category = await this.dataStoreService.getCategoryById(categoryId);
            
            if (!category) {
                return item;
            }
            
            // 增强文档信息
            item.documentation = this.createCategoryDocumentation(category);
            
            return item;
            
        } catch (error) {
            this.logger.error('Failed to resolve category reference completion item', error as Error);
            return item;
        }
    }
    
    /**
     * 创建补全项
     */
    private createCompletionItem(category: ICategory): CompletionItem {
        const completionItem = new CompletionItem(category.id, CompletionItemKind.Folder);
        
        // 设置排序文本（按命名空间分组，然后按名称排序）
        completionItem.sortText = `${category.namespace}_${category.name}`;
        
        // 设置过滤文本（支持按 ID、名称或命名空间过滤）
        completionItem.filterText = `${category.id} ${category.name} ${category.namespace} ${category.displayName || ''}`;
        
        // 设置简短描述
        if (category.displayName) {
            completionItem.detail = `📁 ${category.displayName}`;
        } else {
            completionItem.detail = `📁 Category`;
        }
        
        // 设置插入文本
        completionItem.insertText = category.id;
        
        // 设置策略标识，让 BaseCompletionProvider 知道使用哪个策略来解析
        (completionItem as unknown as Record<string, unknown>)._strategy = this.name;
        
        return completionItem;
    }
    
    /**
     * 创建分类文档
     */
    private createCategoryDocumentation(category: ICategory): MarkdownString {
        const md = new MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;
        
        // 标题
        md.appendMarkdown(`## 📁 ${category.id}\n\n`);
        
        // 基本信息表格
        md.appendMarkdown('| 🏷️ Property | 📄 Value |\n');
        md.appendMarkdown('|:------------|:---------|');
        md.appendMarkdown(`\n| **Namespace** | \`${category.namespace}\` |`);
        md.appendMarkdown(`\n| **Name** | \`${category.name}\` |`);
        
        if (category.displayName) {
            md.appendMarkdown(`\n| **Display Name** | ${category.displayName} |`);
        }
        
        if (category.icon) {
            md.appendMarkdown(`\n| **Icon** | \`${category.icon}\` |`);
        }
        
        if (category.priority !== undefined) {
            md.appendMarkdown(`\n| **Priority** | \`${category.priority}\` |`);
        }
        
        if (category.hidden !== undefined) {
            md.appendMarkdown(`\n| **Hidden** | \`${category.hidden}\` |`);
        }
        
        md.appendMarkdown('\n\n');
        
        // 描述/lore
        if (category.description && category.description.length > 0) {
            md.appendMarkdown('### 📝 Description\n\n');
            for (const line of category.description) {
                md.appendMarkdown(`- ${line}\n`);
            }
            md.appendMarkdown('\n');
        }
        
        // 源文件信息
        md.appendMarkdown('---\n\n');
        md.appendMarkdown('### 📋 Source Information\n\n');
        
        const relativePath = getRelativePath(category.sourceFile);
        md.appendMarkdown(`| 📁 Source File | \`${relativePath}\` |\n`);
        md.appendMarkdown('|:--------------|:---------|\n');
        
        if (category.lineNumber !== undefined) {
            md.appendMarkdown(`| 📍 Line Number | \`${category.lineNumber + 1}\` |\n`);
        }
        
        md.appendMarkdown('\n');
        
        // 使用提示
        md.appendMarkdown('> **💡 Tip:** Use this category reference in item configurations.\n');
        
        return md;
    }
    
}


