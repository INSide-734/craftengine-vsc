import { CompletionItem, CompletionItemKind, type CancellationToken, SnippetString } from 'vscode';
import { ServiceContainer } from '../../../infrastructure/ServiceContainer';
import {
    type ICompletionStrategy,
    type ICompletionContextInfo,
    type ICompletionResult,
} from '../../../core/interfaces/ICompletionStrategy';
import { type IDataStoreService } from '../../../core/interfaces/IDataStoreService';
import { type ILogger } from '../../../core/interfaces/ILogger';
import { type IDataConfigLoader } from '../../../core/interfaces/IDataConfigLoader';
import { type ITemplate, type ITemplateParameter } from '../../../core/interfaces/ITemplate';
import { SERVICE_TOKENS } from '../../../core/constants/ServiceTokens';
import { type ICompletionItemWithStrategy } from '../../types/CompletionTypes';
import { extractCompletionPrefix } from '../../../infrastructure/utils/StringUtils';
import { buildTemplateMarkdown } from '../../providers/helpers/TemplateDocumentationBuilder';

/**
 * 模板名称补全策略
 *
 * 提供所有可用模板名称的补全，用于 template 字段
 * 此策略由 SchemaAwareCompletionStrategy 委托调用
 */
export class TemplateNameCompletionStrategy implements ICompletionStrategy {
    readonly name = 'template-name-delegate';
    readonly priority: number;
    readonly triggerCharacters: string[] = [];

    private readonly dataStoreService: IDataStoreService;
    private readonly logger: ILogger;

    constructor() {
        this.dataStoreService = ServiceContainer.getService<IDataStoreService>(SERVICE_TOKENS.DataStoreService);
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild(
            'TemplateNameCompletionStrategy',
        );

        // 从配置文件加载优先级
        const configLoader = ServiceContainer.getService<IDataConfigLoader>(SERVICE_TOKENS.DataConfigLoader);
        this.priority = configLoader.getCompletionPrioritySync('templateName', true);
    }

    /**
     * 此策略不直接激活，由 SchemaAwareCompletionStrategy 委托调用
     */
    shouldActivate(_context: ICompletionContextInfo): boolean {
        return false;
    }

    /**
     * 提供模板名称补全项
     */
    async provideCompletionItems(
        context: ICompletionContextInfo,
        token?: CancellationToken,
    ): Promise<ICompletionResult | undefined> {
        try {
            if (token?.isCancellationRequested) {
                return undefined;
            }

            this.logger.debug('Providing template name completions', {
                position: `${context.position.line}:${context.position.character}`,
                linePrefix: context.linePrefix,
                hasSchema: !!context.schema,
                completionMode: this.getCompletionMode(context),
            });

            // 获取所有模板
            const templates = await this.dataStoreService.getAllTemplates();

            if (templates.length === 0) {
                this.logger.debug('No templates found');
                return {
                    items: [],
                    isIncomplete: false,
                    completionType: 'template-name',
                    priority: this.priority,
                };
            }

            // 提取当前已输入的前缀
            const prefix = extractCompletionPrefix(context.linePrefix);

            // 过滤和排序模板
            let filteredTemplates = templates;
            if (prefix) {
                filteredTemplates = templates.filter((t: ITemplate) =>
                    t.name.toLowerCase().includes(prefix.toLowerCase()),
                );
            }

            // 按名称排序
            filteredTemplates.sort((a: ITemplate, b: ITemplate) => a.name.localeCompare(b.name));

            // 创建补全项，传递 context 以便根据 schema 决定补全行为
            const completionItems = filteredTemplates.map((template: ITemplate) =>
                this.createCompletionItem(template, context),
            );

            this.logger.debug('Template name completions provided', {
                total: templates.length,
                filtered: completionItems.length,
                prefix,
            });

            return {
                items: completionItems,
                isIncomplete: false,
                completionType: 'template-name',
                priority: this.priority,
            };
        } catch (error) {
            this.logger.error('Failed to provide template name completions', error as Error);
            return {
                items: [],
                isIncomplete: false,
                completionType: 'template-name',
                priority: this.priority,
            };
        }
    }

    /**
     * 解析补全项，提供详细信息
     */
    async resolveCompletionItem(item: CompletionItem, token?: CancellationToken): Promise<CompletionItem | undefined> {
        try {
            if (token?.isCancellationRequested) {
                return item;
            }

            const templateName = typeof item.label === 'string' ? item.label : item.label.label;
            const template = await this.dataStoreService.getTemplateByName(templateName);

            if (!template) {
                return item;
            }

            // 返回新对象，不修改原 item
            const paramCount = template.parameters.length;
            const requiredCount = template.getRequiredParameters().length;
            const detail =
                paramCount > 0
                    ? ` Template (${requiredCount} required, ${paramCount - requiredCount} optional)`
                    : ` Template (no parameters)`;

            return {
                ...item,
                documentation: buildTemplateMarkdown(template),
                detail,
            };
        } catch (error) {
            this.logger.error('Failed to resolve template name completion item', error as Error);
            return item;
        }
    }

    /**
     * 创建补全项
     */
    private createCompletionItem(template: ITemplate, context?: ICompletionContextInfo): CompletionItem {
        // 设置排序文本（按字母顺序）
        const sortText = template.name;

        // 根据 schema 的 x-completion-mode 决定插入行为
        const completionMode = this.getCompletionMode(context);

        let item: CompletionItem;

        if (completionMode === 'full' && template.parameters.length > 0) {
            // 完整插入模式：模板名 + arguments 结构
            item = new CompletionItem(template.name, CompletionItemKind.Snippet);

            const snippet = new SnippetString(template.name);
            snippet.appendText('\n');
            snippet.appendText('arguments:\n');

            let tabIndex = 1;

            // 首先添加必需参数
            const requiredParams = template.getRequiredParameters();
            requiredParams.forEach((param) => {
                snippet.appendText('  ');
                snippet.appendText(param.name);
                snippet.appendText(': ');
                snippet.appendPlaceholder(this.getDefaultPlaceholder(param), tabIndex++);
                snippet.appendText('\n');
            });

            // 如果有可选参数，添加注释提示
            const optionalParams = template.getOptionalParameters();
            if (optionalParams.length > 0) {
                snippet.appendText('  # Optional parameters:\n');
                optionalParams.forEach((param) => {
                    snippet.appendText('  # ');
                    snippet.appendText(param.name);
                    snippet.appendText(': ');
                    snippet.appendText(this.getDefaultPlaceholder(param));
                    snippet.appendText('\n');
                });
            }

            item.insertText = snippet;
            item.detail = ` ${template.parameters.length} param${template.parameters.length !== 1 ? 's' : ''} (with arguments)`;
        } else {
            // 仅模板名模式
            item = new CompletionItem(template.name, CompletionItemKind.Snippet);
            item.insertText = template.name;
            item.detail = ` ${template.parameters.length} param${template.parameters.length !== 1 ? 's' : ''}`;
        }

        // 设置通用属性
        item.sortText = sortText;
        item.filterText = template.name;

        // 设置策略标识，让 BaseCompletionProvider 知道使用哪个策略来解析
        (item as ICompletionItemWithStrategy)._strategy = this.name;

        // 不设置 documentation，让 resolveCompletionItem 延迟加载详细文档
        // 这样 VSCode 会调用 resolveCompletionItem 来获取详细的模板文档

        return item;
    }

    /**
     * 获取补全模式
     */
    private getCompletionMode(context?: ICompletionContextInfo): 'full' | 'template-only' | 'arguments-only' {
        if (!context?.schema) {
            return 'template-only'; // 默认只插入模板名
        }

        // 从 schema 中读取 x-completion-mode
        const mode = context.schema['x-completion-mode'];

        if (mode === 'full') {
            return 'full';
        } else if (mode === 'arguments-only') {
            return 'arguments-only';
        } else {
            return 'template-only';
        }
    }

    /**
     * 获取参数的默认占位符
     */
    private getDefaultPlaceholder(param: ITemplateParameter): string {
        if (param.defaultValue !== undefined) {
            return JSON.stringify(param.defaultValue);
        }

        switch (param.type) {
            case 'string':
                return '""';
            case 'number':
                return '0';
            case 'boolean':
                return 'false';
            case 'array':
                return '[]';
            case 'object':
                return '{}';
            default:
                return 'value';
        }
    }
}
