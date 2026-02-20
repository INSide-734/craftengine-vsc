import { CompletionItem, CompletionItemKind, MarkdownString, SnippetString, type CancellationToken } from 'vscode';
import { ServiceContainer } from '../../../infrastructure/ServiceContainer';
import {
    type ICompletionStrategy,
    type ICompletionContextInfo,
    type ICompletionResult,
} from '../../../core/interfaces/ICompletionStrategy';
import { type IDataStoreService } from '../../../core/interfaces/IDataStoreService';
import { type ILogger } from '../../../core/interfaces/ILogger';
import { type IDataConfigLoader } from '../../../core/interfaces/IDataConfigLoader';
import { type ITemplateParameter } from '../../../core/interfaces/ITemplate';
import { type IExtendedTypeService } from '../../../core/interfaces/IExtendedParameterType';
import { SERVICE_TOKENS } from '../../../core/constants/ServiceTokens';

/**
 * 模板参数补全策略
 *
 * 根据当前选择的模板提供参数补全，用于 arguments 字段
 * 此策略由 SchemaAwareCompletionStrategy 委托调用
 *
 * 支持的扩展参数类型：
 * - condition: 条件选择
 * - when: 多分支匹配
 * - to_upper_case: 大写转换
 * - to_lower_case: 小写转换
 * - self_increase_int: 自增整数
 * - expression: 表达式计算
 */
export class TemplateParameterCompletionStrategy implements ICompletionStrategy {
    readonly name = 'template-parameter-delegate';
    readonly priority: number;
    readonly triggerCharacters: string[] = [];

    private readonly dataStoreService: IDataStoreService;
    private readonly logger: ILogger;
    private readonly extendedTypeService: IExtendedTypeService;

    constructor() {
        this.dataStoreService = ServiceContainer.getService<IDataStoreService>(SERVICE_TOKENS.DataStoreService);
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild(
            'TemplateParameterCompletionStrategy',
        );
        this.extendedTypeService = ServiceContainer.getService<IExtendedTypeService>(
            SERVICE_TOKENS.ExtendedTypeService,
        );

        // 从配置文件加载优先级
        const configLoader = ServiceContainer.getService<IDataConfigLoader>(SERVICE_TOKENS.DataConfigLoader);
        this.priority = configLoader.getCompletionPrioritySync('templateParameters', true);
    }

    /**
     * 此策略不直接激活，由 SchemaAwareCompletionStrategy 委托调用
     */
    shouldActivate(_context: ICompletionContextInfo): boolean {
        return false;
    }

    /**
     * 提供模板参数补全项
     */
    async provideCompletionItems(
        context: ICompletionContextInfo,
        token?: CancellationToken,
    ): Promise<ICompletionResult | undefined> {
        try {
            if (token?.isCancellationRequested) {
                return undefined;
            }

            this.logger.debug('Providing template parameter completions', {
                position: `${context.position.line}:${context.position.character}`,
                linePrefix: context.linePrefix,
            });

            // 检查是否在扩展参数类型内部，提供属性补全
            const extendedTypeContext = this.detectExtendedTypeContext(context);
            if (extendedTypeContext) {
                this.logger.debug('Detected extended type context', { type: extendedTypeContext.type });
                return this.provideExtendedTypePropertyCompletions(context, extendedTypeContext);
            }

            // 检查是否在 type: 值位置，提供扩展类型补全
            if (this.isTypeValuePosition(context)) {
                this.logger.debug('Detected type value position');
                return this.provideExtendedTypeCompletions();
            }

            // 向上查找 template 字段的值
            const templateName = await this.findTemplateNameInContext(context);

            if (!templateName) {
                this.logger.debug('No template name found in context');
                // 即使没有模板，也提供扩展类型的补全建议
                return this.provideExtendedTypeSnippetCompletions();
            }

            // 获取模板定义
            const template = await this.dataStoreService.getTemplateByName(templateName);

            if (!template) {
                this.logger.debug('Template not found', { templateName });
                return this.provideExtendedTypeSnippetCompletions();
            }

            // 获取已定义的参数
            const existingParams = await this.getExistingParameters(context);

            // 过滤出未定义的参数
            const availableParams = template.parameters.filter(
                (param: ITemplateParameter) => !existingParams.has(param.name),
            );

            // 创建补全项，必需参数优先
            const requiredItems = availableParams
                .filter((p: ITemplateParameter) => p.required)
                .map((p: ITemplateParameter) => this.createParameterCompletionItem(p, true));

            const optionalItems = availableParams
                .filter((p: ITemplateParameter) => !p.required)
                .map((p: ITemplateParameter) => this.createParameterCompletionItem(p, false));

            // 添加扩展类型的代码片段补全
            const extendedTypeItems = this.createExtendedTypeSnippetItems();

            const completionItems = [...requiredItems, ...optionalItems, ...extendedTypeItems];

            this.logger.debug('Template parameter completions provided', {
                templateName,
                totalParams: template.parameters.length,
                available: completionItems.length,
                required: requiredItems.length,
                optional: optionalItems.length,
                extendedTypes: extendedTypeItems.length,
            });

            return {
                items: completionItems,
                isIncomplete: false,
                completionType: 'template-parameter',
                priority: this.priority,
            };
        } catch (error) {
            this.logger.error('Failed to provide template parameter completions', error as Error);
            return {
                items: [],
                isIncomplete: false,
                completionType: 'template-parameter',
                priority: this.priority,
            };
        }
    }

    /**
     * 解析补全项，提供更详细的信息
     * 参数补全通常不需要延迟解析，因为信息已经在创建时提供
     */
    async resolveCompletionItem(item: CompletionItem, token?: CancellationToken): Promise<CompletionItem | undefined> {
        try {
            if (token?.isCancellationRequested) {
                return item;
            }

            // 参数补全项已经在创建时包含了所有必要信息
            // 这里主要是为了一致性和未来的扩展
            this.logger.debug('Resolving template parameter completion item', {
                parameterName: typeof item.label === 'string' ? item.label : item.label.label,
                hasDocumentation: !!item.documentation,
                hasDetail: !!item.detail,
            });

            return item;
        } catch (error) {
            this.logger.error('Failed to resolve template parameter completion item', error as Error);
            return item;
        }
    }

    /**
     * 创建参数补全项
     */
    private createParameterCompletionItem(param: ITemplateParameter, isRequired: boolean): CompletionItem {
        const item = new CompletionItem(param.name, CompletionItemKind.Property);

        // 设置排序（必需参数优先）
        item.sortText = isRequired ? `0_${param.name}` : `1_${param.name}`;

        // 设置过滤文本
        item.filterText = param.name;

        // 创建插入文本（使用占位符格式）
        const defaultValue = `{${param.name}}`;

        item.insertText = new SnippetString(`${param.name}: ${defaultValue}`);

        // 设置详细信息
        const requiredLabel = isRequired ? '🔴 Required' : '🟡 Optional';
        const typeLabel = param.type ? ` (${param.type})` : '';
        item.detail = `${requiredLabel}${typeLabel}`;

        // 设置文档
        const md = new MarkdownString();
        md.isTrusted = true;

        if (isRequired) {
            md.appendMarkdown('🔴 **Required Parameter**\n\n');
        } else {
            md.appendMarkdown('🟡 **Optional Parameter**\n\n');
        }

        if (param.description) {
            md.appendMarkdown(`${param.description}\n\n`);
        }

        if (param.type) {
            md.appendMarkdown(`**Type**: \`${param.type}\`\n\n`);
        }

        if (param.defaultValue !== undefined) {
            md.appendMarkdown(`**Default**: \`${JSON.stringify(param.defaultValue)}\`\n\n`);
        }

        item.documentation = md;

        return item;
    }

    /**
     * 在上下文中查找 template 字段的值
     */
    private async findTemplateNameInContext(context: ICompletionContextInfo): Promise<string | undefined> {
        const { document, position } = context;

        // 当前所在的缩进级别
        const currentLine = document.lineAt(position.line);
        const currentIndent = this.getIndentLevel(currentLine.text);

        // 向上查找 template 字段
        for (let lineNum = position.line - 1; lineNum >= 0; lineNum--) {
            const line = document.lineAt(lineNum);
            const lineText = line.text;
            const trimmed = lineText.trim();

            // 跳过空行和注释
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            const lineIndent = this.getIndentLevel(lineText);

            // 如果缩进小于等于当前级别，检查是否是 template 字段
            if (lineIndent <= currentIndent) {
                const templateMatch = trimmed.match(/^template:\s*(.+)$/);
                if (templateMatch) {
                    const templateName = templateMatch[1].trim();
                    // 移除引号（如果有）
                    return templateName.replace(/^["']|["']$/g, '');
                }

                // 如果遇到同级或更高级的其他字段，停止搜索
                if (lineIndent < currentIndent && trimmed.match(/^[a-zA-Z_-]+:/)) {
                    break;
                }
            }
        }

        return undefined;
    }

    /**
     * 获取已定义的参数
     */
    private async getExistingParameters(context: ICompletionContextInfo): Promise<Set<string>> {
        const { document, position } = context;
        const existingParams = new Set<string>();

        // 当前所在的 arguments 块的缩进级别
        const currentLine = document.lineAt(position.line);
        const argsIndent = this.getIndentLevel(currentLine.text);

        // 向下扫描同一个 arguments 块内的参数
        for (let lineNum = position.line; lineNum < document.lineCount; lineNum++) {
            const line = document.lineAt(lineNum);
            const lineText = line.text;
            const trimmed = lineText.trim();

            // 跳过空行和注释
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            const lineIndent = this.getIndentLevel(lineText);

            // 如果缩进小于等于 arguments 的缩进，说明退出了 arguments 块
            if (lineIndent <= argsIndent && lineNum !== position.line) {
                break;
            }

            // 如果是子级参数（比 arguments 多一级缩进）
            if (lineIndent > argsIndent) {
                const paramMatch = trimmed.match(/^([a-zA-Z_-]+):/);
                if (paramMatch) {
                    existingParams.add(paramMatch[1]);
                }
            }
        }

        // 也向上扫描（以防光标不在末尾）
        for (let lineNum = position.line - 1; lineNum >= 0; lineNum--) {
            const line = document.lineAt(lineNum);
            const lineText = line.text;
            const trimmed = lineText.trim();

            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            const lineIndent = this.getIndentLevel(lineText);

            // 如果缩进小于等于 arguments 的缩进，说明退出了 arguments 块
            if (lineIndent <= argsIndent) {
                // 检查是否是 arguments 字段本身
                if (trimmed.startsWith('arguments:')) {
                    break;
                } else {
                    break;
                }
            }

            // 如果是子级参数
            if (lineIndent > argsIndent) {
                const paramMatch = trimmed.match(/^([a-zA-Z_-]+):/);
                if (paramMatch) {
                    existingParams.add(paramMatch[1]);
                }
            }
        }

        return existingParams;
    }

    /**
     * 获取缩进级别
     */
    private getIndentLevel(line: string): number {
        const match = line.match(/^(\s*)/);
        return match ? match[1].length : 0;
    }

    // ==================== 扩展参数类型相关方法 ====================

    /**
     * 检测当前是否在扩展参数类型内部
     * 返回类型名称和已存在的属性
     */
    private detectExtendedTypeContext(
        context: ICompletionContextInfo,
    ): { type: string; existingProps: Set<string> } | null {
        const { document, position } = context;
        const currentIndent = this.getIndentLevel(document.lineAt(position.line).text);

        let typeValue: string | null = null;
        const existingProps = new Set<string>();

        // 向上扫描查找 type: 字段
        for (let lineNum = position.line; lineNum >= 0; lineNum--) {
            const lineText = document.lineAt(lineNum).text;
            const trimmed = lineText.trim();
            const lineIndent = this.getIndentLevel(lineText);

            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            // 如果缩进比当前位置小，说明退出了当前块
            if (lineIndent < currentIndent && lineNum !== position.line) {
                break;
            }

            // 检查是否是 type: 字段
            const typeMatch = trimmed.match(/^type:\s*(.+)$/);
            if (typeMatch && lineIndent === currentIndent) {
                typeValue = typeMatch[1].trim().replace(/^["']|["']$/g, '');
                break;
            }

            // 收集同级的已存在属性
            if (lineIndent === currentIndent) {
                const propMatch = trimmed.match(/^([a-zA-Z_-]+):/);
                if (propMatch) {
                    existingProps.add(propMatch[1]);
                }
            }
        }

        // 也向下扫描收集已存在的属性
        for (let lineNum = position.line + 1; lineNum < document.lineCount; lineNum++) {
            const lineText = document.lineAt(lineNum).text;
            const trimmed = lineText.trim();
            const lineIndent = this.getIndentLevel(lineText);

            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            if (lineIndent < currentIndent) {
                break;
            }

            if (lineIndent === currentIndent) {
                const propMatch = trimmed.match(/^([a-zA-Z_-]+):/);
                if (propMatch) {
                    existingProps.add(propMatch[1]);
                }

                // 检查 type 字段
                const typeMatch = trimmed.match(/^type:\s*(.+)$/);
                if (typeMatch && !typeValue) {
                    typeValue = typeMatch[1].trim().replace(/^["']|["']$/g, '');
                }
            }
        }

        // 检查是否是有效的扩展类型
        if (typeValue && this.extendedTypeService.getTypeProperties(typeValue).length > 0) {
            return { type: typeValue, existingProps };
        }

        return null;
    }

    /**
     * 检查是否在 type: 值位置
     */
    private isTypeValuePosition(context: ICompletionContextInfo): boolean {
        const { linePrefix } = context;
        return /^\s*type:\s*$/.test(linePrefix) || /^\s*type:\s+\S*$/.test(linePrefix);
    }

    /**
     * 提供扩展类型名称补全
     */
    private provideExtendedTypeCompletions(): ICompletionResult {
        const typeNames = this.extendedTypeService.getTypeNames();
        const items: CompletionItem[] = typeNames.map((typeName, index) => {
            const extType = this.extendedTypeService.getTypeDefinition(typeName)!;
            const item = new CompletionItem(extType.name, CompletionItemKind.EnumMember);
            item.sortText = `0_${index.toString().padStart(2, '0')}_${extType.name}`;
            item.detail = `Extended Parameter Type`;
            item.insertText = extType.name;

            const md = new MarkdownString();
            md.isTrusted = true;
            md.appendMarkdown(`**${extType.name}**\n\n`);
            md.appendMarkdown(`${extType.description}\n\n`);
            md.appendMarkdown(`**Required**: \`${extType.requiredProperties.join('`, `')}\`\n\n`);
            if (extType.optionalProperties.length > 0) {
                md.appendMarkdown(`**Optional**: \`${extType.optionalProperties.join('`, `')}\`\n\n`);
            }
            md.appendMarkdown(`**Example**:\n\`\`\`yaml\n${extType.example}\n\`\`\``);
            item.documentation = md;

            return item;
        });

        return {
            items,
            isIncomplete: false,
            completionType: 'template-parameter-type',
            priority: this.priority,
        };
    }

    /**
     * 提供扩展类型属性补全
     */
    private provideExtendedTypePropertyCompletions(
        _context: ICompletionContextInfo,
        typeContext: { type: string; existingProps: Set<string> },
    ): ICompletionResult {
        const properties = this.extendedTypeService.getTypeProperties(typeContext.type);
        const extType = this.extendedTypeService.getTypeDefinition(typeContext.type);

        const items: CompletionItem[] = properties
            .filter((prop) => !typeContext.existingProps.has(prop.name))
            .map((prop, index) => {
                const isRequired = extType?.requiredProperties.includes(prop.name) ?? false;
                const item = new CompletionItem(prop.name, CompletionItemKind.Property);

                item.sortText = isRequired ? `0_${index}_${prop.name}` : `1_${index}_${prop.name}`;
                item.detail = isRequired ? '🔴 Required' : '🟡 Optional';

                // 根据属性类型创建插入文本
                if (prop.enumValues && prop.enumValues.length > 0) {
                    item.insertText = new SnippetString(`${prop.name}: \${1|${prop.enumValues.join(',')}|}`);
                } else if (prop.type === 'object') {
                    item.insertText = new SnippetString(`${prop.name}:\n  \${1:key}: \${2:value}`);
                } else if (prop.type === 'integer') {
                    item.insertText = new SnippetString(`${prop.name}: \${1:0}`);
                } else {
                    const defaultValue = prop.examples?.[0] || '';
                    item.insertText = new SnippetString(`${prop.name}: \${1:${defaultValue}}`);
                }

                const md = new MarkdownString();
                md.isTrusted = true;
                md.appendMarkdown(`**${prop.name}** (${prop.type})\n\n`);
                md.appendMarkdown(`${prop.description}\n\n`);
                if (prop.enumValues) {
                    md.appendMarkdown(`**Values**: \`${prop.enumValues.join('`, `')}\`\n\n`);
                }
                if (prop.examples && prop.examples.length > 0) {
                    md.appendMarkdown(`**Examples**: \`${prop.examples.join('`, `')}\`\n\n`);
                }
                item.documentation = md;

                return item;
            });

        return {
            items,
            isIncomplete: false,
            completionType: 'template-parameter-property',
            priority: this.priority,
        };
    }

    /**
     * 提供扩展类型代码片段补全（用于参数值位置）
     */
    private provideExtendedTypeSnippetCompletions(): ICompletionResult {
        const items = this.createExtendedTypeSnippetItems();
        return {
            items,
            isIncomplete: false,
            completionType: 'template-parameter',
            priority: this.priority,
        };
    }

    /**
     * 创建扩展类型代码片段补全项
     */
    private createExtendedTypeSnippetItems(): CompletionItem[] {
        const typeNames = this.extendedTypeService.getTypeNames();
        return typeNames.map((typeName, index) => {
            const extType = this.extendedTypeService.getTypeDefinition(typeName)!;
            const item = new CompletionItem(
                { label: `(${extType.name})`, description: extType.description },
                CompletionItemKind.Snippet,
            );

            item.sortText = `2_${index.toString().padStart(2, '0')}_${extType.name}`;
            item.filterText = extType.name;
            item.detail = `Extended Type: ${extType.name}`;
            // 使用服务获取代码片段
            const snippet = this.extendedTypeService.getTypeSnippet(extType.name) || '';
            item.insertText = new SnippetString(snippet);

            const md = new MarkdownString();
            md.isTrusted = true;
            md.appendMarkdown(`**${extType.name}** - ${extType.description}\n\n`);
            md.appendMarkdown(`**Required**: \`${extType.requiredProperties.join('`, `')}\`\n\n`);
            if (extType.optionalProperties.length > 0) {
                md.appendMarkdown(`**Optional**: \`${extType.optionalProperties.join('`, `')}\`\n\n`);
            }
            md.appendMarkdown(`**Example**:\n\`\`\`yaml\n${extType.example}\n\`\`\``);
            item.documentation = md;

            return item;
        });
    }
}
