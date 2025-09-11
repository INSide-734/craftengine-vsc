// src/features/CompletionProvider.ts
import { CompletionItemProvider, TextDocument, Position, CompletionItem, CompletionItemKind, CompletionList, MarkdownString, CompletionContext, CancellationToken } from 'vscode';
import { templateCache } from '../core/TemplateCache';
import { Template } from '../types';
import { StringUtils, TemplateUtils } from '../utils';

// 调试日志控制
const DEBUG_ENABLED = process.env.NODE_ENV !== 'test' && process.env.DEBUG === 'true';

/**
 * 模板补全提供者类
 * 
 * 实现 VS Code 的 CompletionItemProvider 接口，为 CraftEngine 模板提供智能补全功能。
 * 支持多种触发场景，包括直接模板引用、数组模板和嵌套模板。
 * 
 * @implements {CompletionItemProvider}
 */
export class TemplateCompletionProvider implements CompletionItemProvider {
    /**
     * 提供补全建议项
     * 
     * 当用户在文档中触发补全时调用此方法。该方法会检查当前光标位置的上下文，
     * 支持多种触发场景并提供智能的模板补全建议。
     * 
     * @param {TextDocument} document - 当前活动的文本文档
     * @param {Position} position - 触发补全的光标位置
     * @param {CancellationToken} token - 取消标记
     * @param {CompletionContext} context - 补全上下文信息
     * @returns {CompletionList | undefined} 补全建议列表，如果不需要补全则返回 undefined
     * 
     * @example
     * // 支持多种触发场景：
     * // 1. template: 
     * // 2. template:
     * //      - 
     * // 3. template: [部分输入]
     */
    provideCompletionItems(
        document: TextDocument, 
        position: Position, 
        token?: CancellationToken, 
        _context?: CompletionContext
    ) {
        // 检查取消标记
        if (token?.isCancellationRequested) {
            return undefined;
        }

        const completionContext = this.analyzeCompletionContext(document, position);
        if (!completionContext.shouldTrigger) {
            return undefined;
        }

        if (DEBUG_ENABLED) {
            console.log('Completion triggered:', completionContext.triggerType, 'input prefix:', JSON.stringify(completionContext.inputPrefix));
        }

        // 获取所有模板
        const allTemplates = templateCache.getAll();
        
        if (DEBUG_ENABLED) {
            console.log('All templates in cache:', allTemplates.map(t => ({
                name: t.name,
                parameters: t.parameters,
                required: t.requiredParameters,
                optional: t.optionalParameters
            })));
        }
        
        if (allTemplates.length === 0) {
            if (DEBUG_ENABLED) {
                console.log('No templates found in cache');
            }
            return new CompletionList([], false);
        }

        // 根据输入前缀过滤和排序模板
        const filteredTemplates = TemplateUtils.filterAndSortTemplates(allTemplates, completionContext.inputPrefix);
        
        if (DEBUG_ENABLED) {
            console.log(`Found ${filteredTemplates.length}/${allTemplates.length} matching templates`);
        }
        
        const items = filteredTemplates.map(template => 
            this.createCompletionItem(template, completionContext)
        );

        return new CompletionList(items, false);
    }

    /**
     * 解析补全项，当用户悬停在补全项上时调用
     * 
     * 这个方法会在用户将鼠标悬停在补全列表中的某个项目上时被调用，
     * 用于动态加载和显示模板信息。
     * 
     * @param {CompletionItem} item - 需要解析的补全项
     * @param {CancellationToken} token - 取消标记
     * @returns {CompletionItem | undefined} 解析后的补全项，如果解析失败则返回 undefined
     */
    resolveCompletionItem(item: CompletionItem, token?: CancellationToken): CompletionItem | undefined {
        // 检查取消标记
        if (token?.isCancellationRequested) {
            return undefined;
        }

        // 从缓存中获取模板信息
        const template = templateCache.get(item.label as string);
        if (!template) {
            return undefined;
        }

        // 使用原有的文档创建方法
        item.documentation = this.createTemplateDocumentation(template);
        
        // 更新详细信息
        const paramCount = template.parameters.length;
        const requiredCount = template.requiredParameters.length;
        const optionalCount = template.optionalParameters.length;
        
        item.detail = `🚀 CraftEngine Template`;
        if (paramCount > 0) {
            item.detail += ` (${requiredCount} required, ${optionalCount} optional)`;
        } else {
            item.detail += ` (no parameters)`;
        }

        return item;
    }

    /**
     * 分析补全上下文，确定是否应该触发补全以及触发类型
     */
    private analyzeCompletionContext(document: TextDocument, position: Position) {
        const currentLine = document.lineAt(position);
        const linePrefix = currentLine.text.substring(0, position.character);
        const trimmedPrefix = linePrefix.trim();
        
        // 检查多种触发场景
        const contexts = [
            this.checkDirectTemplateContext(linePrefix, trimmedPrefix),
            this.checkArrayTemplateContext(document, position, linePrefix)
        ];
        
        // 返回第一个匹配的上下文
        for (const context of contexts) {
            if (context.shouldTrigger) {
                return context;
            }
        }
        
        return { shouldTrigger: false, triggerType: 'none', inputPrefix: '' };
    }

    /**
     * 检查直接模板上下文: "template: [input]"
     */
    private checkDirectTemplateContext(linePrefix: string, _trimmedPrefix: string) {
        // 匹配 "template:" 后面的内容
        const templateMatch = linePrefix.match(/\btemplate:\s*(.*)$/);
        if (templateMatch) {
            const inputAfterTemplate = templateMatch[1];
            return {
                shouldTrigger: true,
                triggerType: 'direct',
                inputPrefix: inputAfterTemplate.trim()
            };
        }
        
        return { shouldTrigger: false, triggerType: 'none', inputPrefix: '' };
    }

    /**
     * 检查数组模板上下文: "template:\n  - [input]"
     */
    private checkArrayTemplateContext(document: TextDocument, position: Position, linePrefix: string) {
        // 检查当前行是否是数组项
        const arrayItemMatch = linePrefix.match(/^(\s*)-\s*(.*)$/);
        if (!arrayItemMatch) {
            return { shouldTrigger: false, triggerType: 'none', inputPrefix: '' };
        }
        
        const indent = arrayItemMatch[1];
        const inputAfterDash = arrayItemMatch[2];
        
        // 向上查找 "template:" 键
        for (let lineNum = position.line - 1; lineNum >= 0; lineNum--) {
            const line = document.lineAt(lineNum);
            const lineText = line.text;
            
            // 如果遇到相同或更少缩进的非空行，停止搜索
            if (lineText.trim() && StringUtils.getIndentLevel(lineText) <= StringUtils.getIndentLevel(indent)) {
                if (lineText.trim().startsWith('template:')) {
                    return {
                        shouldTrigger: true,
                        triggerType: 'array',
                        inputPrefix: inputAfterDash.trim()
                    };
                }
                break;
            }
        }
        
        return { shouldTrigger: false, triggerType: 'none', inputPrefix: '' };
    }





    /**
     * 创建补全项
     */
    private createCompletionItem(template: Template, completionContext: any): CompletionItem {
        const item = new CompletionItem(template.name, CompletionItemKind.Snippet);
        
        // 设置详细信息
        const paramCount = template.parameters.length;
        const requiredCount = template.requiredParameters.length;
        const optionalCount = template.optionalParameters.length;
        
        item.detail = `🚀 CraftEngine Template`;
        if (paramCount > 0) {
            item.detail += ` (${requiredCount} required, ${optionalCount} optional)`;
        } else {
            item.detail += ` (no parameters)`;
        }
        
        // 创建丰富的文档
        item.documentation = this.createTemplateDocumentation(template);
        
        // 设置插入文本和排序
        item.insertText = template.name;
        item.sortText = this.getSortText(template, completionContext.inputPrefix);
        
        // 设置过滤文本
        item.filterText = template.name;
        
        // 添加命令
        item.command = {
            command: 'craftengine.insertTemplateSnippet',
            title: 'Insert Template Snippet',
            arguments: [template],
        };
        
        return item;
    }

    /**
     * 创建模板文档
     */
    private createTemplateDocumentation(template: Template): MarkdownString {
        const md = new MarkdownString();
        
        md.appendMarkdown(`### 📋 Template: \`${template.name}\`\n\n`);
        
        if (template.parameters.length > 0) {
            if (template.requiredParameters.length > 0) {
                md.appendMarkdown('#### 🔴 Required Parameters\n\n');
                template.requiredParameters.forEach((param, index) => {
                    md.appendMarkdown(`${index + 1}. **\`${param}\`**\n`);
                });
                md.appendMarkdown('\n');
            }
            
            if (template.optionalParameters.length > 0) {
                md.appendMarkdown('#### 🟡 Optional Parameters\n\n');
                template.optionalParameters.forEach((param, index) => {
                    md.appendMarkdown(`${index + 1}. **\`${param}\`** *(has default value)*\n`);
                });
                md.appendMarkdown('\n');
            }
        } else {
            md.appendMarkdown('> ✨ This template requires no parameters and can be used directly\n\n');
        }
        
        md.appendMarkdown('---\n');
        md.appendMarkdown('💡 **Tip**: Selecting this item will automatically insert the template and its parameter placeholders');
        
        return md;
    }


    /**
     * 获取排序文本
     */
    private getSortText(template: Template, inputPrefix: string): string {
        const score = TemplateUtils.calculateMatchScore(template, inputPrefix);
        // 使用4位数字确保正确排序，分数高的排在前面
        return (9999 - score).toString().padStart(4, '0') + template.name;
    }
}