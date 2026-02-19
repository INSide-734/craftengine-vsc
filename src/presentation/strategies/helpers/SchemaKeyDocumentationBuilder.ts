import { MarkdownString, SnippetString } from 'vscode';
import { IConfiguration } from '../../../core/interfaces/IConfiguration';
import { IJsonSchema } from '../../../core/interfaces/ISchemaService';

/**
 * 正则模式分析结果
 *
 * 用于分析 Schema 中 patternProperties 的正则表达式，
 * 提取其特征以生成合适的补全提示和代码片段
 */
export interface PatternAnalysis {
    /** 具体字段名，如 ^items(#.*)?$ 中的 "items" */
    concreteFieldName?: string;
    /** 是否为命名空间模式，如 namespace:name */
    isNamespace: boolean;
    /** 是否为简单标识符模式，如 [a-z][a-z0-9_-]* */
    isSimpleIdentifier: boolean;
    /** 是否为版本条件模式，如 $$>=1.21.4 */
    isVersionCondition: boolean;
    /** 委托补全键，来自 x-completion-key 属性 */
    completionKey?: string;
}

/**
 * Schema 键补全文档生成器
 *
 * 负责 Schema 键补全中的文档生成、模式分析和代码片段创建。
 * 从 SchemaKeyCompletionStrategy 中提取，专注于展示层逻辑。
 */
export class SchemaKeyDocumentationBuilder {
    constructor(private readonly config: IConfiguration) {}

    /**
     * 分析正则模式，提取其特征
     */
    analyzePattern(pattern: string, schema?: IJsonSchema): PatternAnalysis {
        const isVersionCondition = pattern.includes('\\$\\$') || pattern.startsWith('^\\$\\$');
        const completionKey = schema?.['x-completion-key'] as string | undefined;

        const fieldMatch = pattern.match(/^\^([a-z][a-z0-9_-]*)/i);
        const concreteFieldName = fieldMatch && !pattern.substring(fieldMatch[0].length).includes('[')
            ? fieldMatch[1]
            : undefined;

        const isNamespace = !isVersionCondition && !pattern.includes(':-') && !pattern.includes('\\:') && (
            pattern.includes('namespace') || this.hasNamespaceStructure(pattern)
        );

        const isSimpleIdentifier = !isVersionCondition && !isNamespace &&
            !(pattern.includes(':') && !pattern.includes(':-') && !pattern.includes('\\:')) &&
            /\[[^\]]*\]/.test(pattern);

        return { concreteFieldName, isNamespace, isSimpleIdentifier, isVersionCondition, completionKey };
    }

    /**
     * 检查模式是否具有命名空间结构 (identifier:identifier)
     */
    private hasNamespaceStructure(pattern: string): boolean {
        const colonIndex = pattern.indexOf(':');
        if (colonIndex === -1) {
            return false;
        }
        const beforeColon = pattern.substring(0, colonIndex);
        const afterColon = pattern.substring(colonIndex + 1);
        return /\[[^\]]*\]/.test(beforeColon) && /\[[^\]]*\]/.test(afterColon);
    }

    /**
     * 根据模式分析结果获取显示标签
     */
    getPatternLabel(analysis: PatternAnalysis): string {
        if (analysis.concreteFieldName) {
            return analysis.concreteFieldName;
        }
        if (analysis.isNamespace) {
            return 'namespace:name';
        }
        if (analysis.isSimpleIdentifier) {
            return 'identifier';
        }
        return 'property-name';
    }

    /**
     * 根据模式分析结果生成代码片段
     */
    generatePatternSnippet(analysis: PatternAnalysis): SnippetString {
        if (analysis.concreteFieldName) {
            return new SnippetString(`${analysis.concreteFieldName}:\n  $0`);
        }
        if (analysis.isNamespace) {
            return new SnippetString('${1:namespace}:${2:name}:\n  $0');
        }
        return new SnippetString('${1:name}:\n  $0');
    }

    /**
     * 获取类型描述文本
     */
    getTypeDescription(schema: IJsonSchema): string {
        const parts: string[] = [];
        if (schema.type) {
            parts.push(Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type);
        }
        if (schema.enum) {
            parts.push(`(enum: ${schema.enum.length} values)`);
        }
        if (schema.pattern) {
            parts.push('(pattern)');
        }
        if (schema.required || schema['x-isRequired']) {
            parts.push('*required*');
        }
        return parts.join(' ');
    }

    /**
     * 创建文档字符串
     */
    createDocumentation(schema: IJsonSchema, isPattern: boolean): MarkdownString | undefined {
        const md = new MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;

        let hasContent = false;
        const append = (content: string) => { md.appendMarkdown(content); hasContent = true; };

        if (schema.description) {
            append(`${schema.description}\n\n`);
        }
        if (schema.type) {
            const typeStr = Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type;
            append(`**Type:** \`${typeStr}\`\n\n`);
        }
        if (schema.enum?.length) {
            this.appendEnumDocs(md, schema.enum);
            hasContent = true;
        }
        if (schema.default !== undefined) {
            append(`**Default:** \`${JSON.stringify(schema.default)}\`\n\n`);
        }
        if (schema.pattern) {
            append(`**Pattern:** \`${schema.pattern}\`\n\n`);
        }
        if (schema.examples?.length) {
            append('**Examples:**\n');
            for (const ex of schema.examples) {
                const lang = typeof ex === 'string' ? 'yaml' : 'json';
                const content = typeof ex === 'string' ? ex : JSON.stringify(ex, null, 2);
                md.appendCodeblock(content, lang);
            }
        }
        if (isPattern && schema['x-pattern']) {
            append(`**Pattern matching:** \`${schema['x-pattern']}\`\n\n`);
        }

        return hasContent ? md : undefined;
    }

    /**
     * 添加枚举值文档
     */
    appendEnumDocs(md: MarkdownString, enumValues: unknown[]): void {
        const maxDisplay = this.config.get<number>('completion.schemaKeys.maxEnumDisplay', 20);
        const toDisplay = enumValues.slice(0, maxDisplay);

        md.appendMarkdown('**Allowed values:**\n');
        if (enumValues.length <= 10) {
            for (const v of toDisplay) {
                md.appendMarkdown(`- \`${JSON.stringify(v)}\`\n`);
            }
        } else {
            md.appendCodeblock(toDisplay.map(v => JSON.stringify(v)).join(', '), 'text');
        }

        if (enumValues.length > maxDisplay) {
            md.appendMarkdown(`\n*... and ${enumValues.length - maxDisplay} more values*\n`);
        }
        md.appendMarkdown('\n');
    }

    /**
     * 创建枚举值选择代码片段
     */
    createEnumSnippet(keyName: string, enumValues: unknown[]): SnippetString {
        if (enumValues.length === 0) {
            return new SnippetString(`${keyName}: $0`);
        }

        const maxEnums = this.config.get<number>('completion.schemaKeys.maxEnumInSnippet', 10);
        const escapedValues = enumValues.slice(0, maxEnums).map(value => {
            const strValue = typeof value === 'string' ? value : String(value);
            return strValue.replace(/[|,\\$}]/g, '\\$&');
        });

        if (escapedValues.length === 1) {
            return new SnippetString(`${keyName}: ${escapedValues[0]}`);
        }
        return new SnippetString(`${keyName}: \${1|${escapedValues.join(',')}|}`);
    }

    /**
     * 计算补全项优先级
     */
    calculatePriority(schema: IJsonSchema): number {
        let priority = 100;
        if (schema.required || schema['x-isRequired']) {
            priority -= 50;
        }
        if (schema.description) {
            priority -= 10;
        }
        if (schema.default !== undefined) {
            priority -= 5;
        }
        return priority;
    }
}
