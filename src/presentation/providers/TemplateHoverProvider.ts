import {
    type HoverProvider,
    type TextDocument,
    type Position,
    Hover,
    MarkdownString,
    Range,
    type CancellationToken,
} from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { type ITemplateService } from '../../core/interfaces/ITemplateService';
import { type ILogger } from '../../core/interfaces/ILogger';
import { type IConfiguration } from '../../core/interfaces/IConfiguration';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import {
    type IExtendedParameterTypeDefinition,
    type IExtendedTypeService,
} from '../../core/interfaces/IExtendedParameterType';
import { type IPerformanceMonitor } from '../../core/interfaces/IPerformanceMonitor';
import { YamlHelper } from '../../infrastructure/yaml/YamlHelper';
import { buildTemplateMarkdown } from './helpers/TemplateDocumentationBuilder';

/**
 * 模板悬停提示提供者
 *
 * 在鼠标悬停时显示模板的详细信息和文档
 * 支持扩展参数类型的悬停提示
 */
export class TemplateHoverProvider implements HoverProvider {
    private readonly templateService: ITemplateService;
    private readonly logger: ILogger;
    private readonly configuration: IConfiguration;
    private readonly performanceMonitor: IPerformanceMonitor;
    private readonly extendedTypeService: IExtendedTypeService;

    constructor() {
        this.templateService = ServiceContainer.getService<ITemplateService>(SERVICE_TOKENS.TemplateService);
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild('HoverProvider');
        this.configuration = ServiceContainer.getService<IConfiguration>(SERVICE_TOKENS.Configuration);
        this.performanceMonitor = ServiceContainer.getService<IPerformanceMonitor>(SERVICE_TOKENS.PerformanceMonitor);
        this.extendedTypeService = ServiceContainer.getService<IExtendedTypeService>(
            SERVICE_TOKENS.ExtendedTypeService,
        );
    }

    async provideHover(
        document: TextDocument,
        position: Position,
        token?: CancellationToken,
    ): Promise<Hover | undefined> {
        const timer = this.performanceMonitor.startTimer('hover.provide');

        try {
            if (!this.configuration.get('hover.enabled', true) || token?.isCancellationRequested) {
                return undefined;
            }

            // 首先检查是否在扩展参数类型上
            const extendedTypeHover = this.getExtendedTypeHover(document, position);
            if (extendedTypeHover) {
                return extendedTypeHover;
            }

            const templateInfo = this.getTemplateNameAtPosition(document, position);
            if (!templateInfo) {
                return undefined;
            }

            const searchResults = await this.templateService.searchTemplates({
                prefix: templateInfo.name,
                limit: 1,
                fuzzy: false,
            });

            if (searchResults.length === 0) {
                return undefined;
            }

            const template = searchResults[0].template;
            const isAvailable = await this.templateService.isTemplateAvailableAt(template.name, {
                document,
                position,
                lineText: document.lineAt(position).text,
                indentLevel: this.getIndentLevel(document.lineAt(position).text),
            });

            if (!isAvailable) {
                return undefined;
            }

            return new Hover(buildTemplateMarkdown(template), templateInfo.range);
        } catch (error) {
            this.logger.error('Error providing hover information', error as Error);
            return undefined;
        } finally {
            timer.stop({ document: document.fileName });
        }
    }

    /**
     * 获取扩展参数类型的悬停提示
     */
    private getExtendedTypeHover(document: TextDocument, position: Position): Hover | undefined {
        const lineText = document.lineAt(position).text;

        // 检查是否在 type: xxx 行上
        const typeMatch = lineText.match(/^\s*type:\s*([a-z_]+)\s*$/);
        if (!typeMatch) {
            return undefined;
        }

        const typeName = typeMatch[1];

        // 使用服务检查是否是有效的扩展类型
        if (!this.extendedTypeService.isValidType(typeName)) {
            return undefined;
        }

        const typeInfo = this.extendedTypeService.getTypeDefinition(typeName);
        if (!typeInfo) {
            return undefined;
        }

        // 检查光标是否在类型值上
        const typeValueStart = lineText.indexOf(typeName);
        const typeValueEnd = typeValueStart + typeName.length;

        if (position.character < typeValueStart || position.character > typeValueEnd) {
            return undefined;
        }

        const md = this.createExtendedTypeHoverMarkdown(typeInfo);
        const range = new Range(position.line, typeValueStart, position.line, typeValueEnd);

        return new Hover(md, range);
    }

    /**
     * 创建扩展参数类型的悬停文档
     */
    private createExtendedTypeHoverMarkdown(typeInfo: IExtendedParameterTypeDefinition): MarkdownString {
        const md = new MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;

        // 标题
        md.appendMarkdown(`##  Extended Parameter Type: \`${typeInfo.name}\`\n\n`);

        // 描述
        md.appendMarkdown(`${typeInfo.description}\n\n`);

        // 属性表格
        md.appendMarkdown('###  Properties\n\n');
        md.appendMarkdown('| Property | Status |\n|:---------|:------:|\n');

        typeInfo.requiredProperties.forEach((prop) => {
            md.appendMarkdown(`| \`${prop}\` |  Required |\n`);
        });

        typeInfo.optionalProperties.forEach((prop) => {
            md.appendMarkdown(`| \`${prop}\` |  Optional |\n`);
        });

        md.appendMarkdown('\n');

        // 示例
        md.appendMarkdown('###  Example\n\n');
        md.appendMarkdown('```yaml\n');
        md.appendMarkdown(typeInfo.example);
        md.appendMarkdown('\n```\n\n');

        // 提示
        md.appendMarkdown('---\n\n');
        md.appendMarkdown('> ** Tip:** Use code completion to quickly insert extended parameter types.\n');

        return md;
    }

    private getTemplateNameAtPosition(
        document: TextDocument,
        position: Position,
    ): { name: string; range: Range } | undefined {
        const lineText = document.lineAt(position).text;

        if (YamlHelper.isInComment(lineText, position.character)) {
            return undefined;
        }

        // 检查 template: xxx 格式
        const templatePattern = /\btemplate:\s*([a-zA-Z][a-zA-Z0-9_:/-]*)/g;
        let match;

        while ((match = templatePattern.exec(lineText)) !== null) {
            if (YamlHelper.isMatchInComment(lineText, match, 1)) {
                continue;
            }

            const templateName = match[1];
            const startPos = match.index + match[0].indexOf(templateName);
            const endPos = startPos + templateName.length;

            if (position.character >= startPos && position.character <= endPos) {
                return {
                    name: templateName,
                    range: new Range(position.line, startPos, position.line, endPos),
                };
            }
        }

        // 检查数组模板格式
        const arrayPattern = /^\s*-\s*([a-zA-Z][a-zA-Z0-9_:/-]*)/;
        const arrayMatch = lineText.match(arrayPattern);

        if (arrayMatch && !YamlHelper.isMatchInComment(lineText, arrayMatch, 1)) {
            const templateName = arrayMatch[1];
            const startPos = lineText.indexOf(templateName);
            const endPos = startPos + templateName.length;

            if (position.character >= startPos && position.character <= endPos) {
                if (this.isInTemplateArray(document, position.line)) {
                    return {
                        name: templateName,
                        range: new Range(position.line, startPos, position.line, endPos),
                    };
                }
            }
        }

        return undefined;
    }

    private isInTemplateArray(document: TextDocument, lineNumber: number): boolean {
        const currentIndent = this.getIndentLevel(document.lineAt(lineNumber).text);

        for (let i = lineNumber - 1; i >= 0; i--) {
            const line = document.lineAt(i);
            const lineText = line.text.trim();

            if (!lineText) {
                continue;
            }

            if (this.getIndentLevel(line.text) <= currentIndent) {
                return lineText.startsWith('template:');
            }
        }

        return false;
    }

    private getIndentLevel(text: string): number {
        const match = text.match(/^(\s*)/);
        return match ? match[1].length : 0;
    }
}
