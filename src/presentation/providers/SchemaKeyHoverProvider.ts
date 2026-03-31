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
import { type ISchemaService } from '../../core/interfaces/ISchemaService';
import { type IYamlPathParser } from '../../core/interfaces/IYamlPathParser';
import { type ILogger } from '../../core/interfaces/ILogger';
import { type IConfiguration } from '../../core/interfaces/IConfiguration';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { type IPerformanceMonitor } from '../../core/interfaces/IPerformanceMonitor';

/**
 * Schema 键悬浮提示提供者
 *
 * 在鼠标悬停在 YAML 键上时，显示来自 JSON Schema 的详细信息
 */
export class SchemaKeyHoverProvider implements HoverProvider {
    private readonly schemaService: ISchemaService;
    private readonly pathParser: IYamlPathParser;
    private readonly logger: ILogger;
    private readonly configuration: IConfiguration;
    private readonly performanceMonitor: IPerformanceMonitor;

    constructor() {
        this.schemaService = ServiceContainer.getService<ISchemaService>(SERVICE_TOKENS.SchemaService);
        this.pathParser = ServiceContainer.getService<IYamlPathParser>(SERVICE_TOKENS.YamlPathParser);
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild('SchemaKeyHover');
        this.configuration = ServiceContainer.getService<IConfiguration>(SERVICE_TOKENS.Configuration);
        this.performanceMonitor = ServiceContainer.getService<IPerformanceMonitor>(SERVICE_TOKENS.PerformanceMonitor);
    }

    async provideHover(
        document: TextDocument,
        position: Position,
        token?: CancellationToken,
    ): Promise<Hover | undefined> {
        const timer = this.performanceMonitor.startTimer('hover.schemaKey');

        try {
            // 检查功能是否启用
            if (!this.configuration.get('hover.schemaKeys.enabled', true)) {
                return undefined;
            }

            // 只在 YAML 文件中工作
            if (document.languageId !== 'yaml') {
                return undefined;
            }

            if (token?.isCancellationRequested) {
                return undefined;
            }

            this.logger.debug('Providing schema key hover', {
                file: document.fileName,
                line: position.line,
                character: position.character,
            });

            // 获取光标位置的键信息
            const keyInfo = this.getKeyAtPosition(document, position);
            if (!keyInfo) {
                return undefined;
            }

            this.logger.debug('Key detected at position', {
                key: keyInfo.key,
                range: keyInfo.range,
            });

            // 解析路径
            const path = this.pathParser.parsePath(document, position);

            // 确保路径最后一个元素是当前键
            if (path.length === 0 || path[path.length - 1] !== keyInfo.key) {
                path.push(keyInfo.key);
            }

            // 获取属性详细信息
            const details = await this.schemaService.getPropertyDetails(path);

            if (!details || Object.keys(details).length === 0) {
                this.logger.debug('No schema details found for key', {
                    key: keyInfo.key,
                    path: path.join('.'),
                });
                return undefined;
            }

            // 创建悬停内容
            const markdown = this.createHoverMarkdown(keyInfo.key, details);

            this.logger.debug('Schema key hover content created', {
                key: keyInfo.key,
                hasDescription: !!details.description,
            });

            return new Hover(markdown, keyInfo.range);
        } catch (error) {
            this.logger.error('Error providing schema key hover', error as Error, {
                file: document.fileName,
                position: { line: position.line, character: position.character },
            });
            return undefined;
        } finally {
            timer.stop({ document: document.fileName });
        }
    }

    /**
     * 获取光标位置的键名和范围
     */
    private getKeyAtPosition(document: TextDocument, position: Position): { key: string; range: Range } | undefined {
        const line = document.lineAt(position);
        const lineText = line.text;

        // 检查是否在注释中
        const hashIndex = lineText.indexOf('#');
        if (hashIndex >= 0 && position.character >= hashIndex) {
            return undefined;
        }

        // 提取键名（冒号之前的部分）
        const colonIndex = lineText.indexOf(':');
        if (colonIndex < 0) {
            return undefined;
        }

        // 获取冒号之前的文本
        const beforeColon = lineText.substring(0, colonIndex);

        // 跳过数组标记
        const keyText = beforeColon.replace(/^\s*-\s*/, '').trim();

        if (!keyText) {
            return undefined;
        }

        // 提取键名（可能包含命名空间、点号分隔的翻译键、版本条件等）
        // 支持版本条件格式如 $$>=1.21.4, $$1.20.1~1.21.3#section
        const keyMatch = keyText.match(/([a-zA-Z0-9_$:#\/\-\.>=<~]+)$/);
        if (!keyMatch) {
            return undefined;
        }

        const key = keyMatch[1];
        const keyStartIndex = lineText.lastIndexOf(key, colonIndex);

        // 检查光标是否在键名范围内
        if (position.character < keyStartIndex || position.character > keyStartIndex + key.length) {
            return undefined;
        }

        const range = new Range(position.line, keyStartIndex, position.line, keyStartIndex + key.length);

        return { key, range };
    }

    /**
     * 创建悬停提示的 Markdown 内容
     */
    private createHoverMarkdown(
        key: string,
        details: {
            description?: string;
            type?: string | string[];
            examples?: unknown[];
            enum?: unknown[];
            default?: unknown;
            required?: boolean;
            deprecated?: boolean;
            pattern?: string;
        },
    ): MarkdownString {
        const md = new MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;

        // 标题
        md.appendMarkdown(`### \`${key}\`\n\n`);

        this.appendBadges(md, details);
        if (details.description) {
            md.appendMarkdown(`${details.description}\n\n`);
        }
        this.appendTypeInfo(md, details);
        this.appendEnumValues(md, details);
        this.appendDefaultValue(md, details);
        this.appendPattern(md, details);
        this.appendExamples(md, key, details);
        this.appendDeprecationWarning(md, details);

        return md;
    }

    /** 追加状态标签 */
    private appendBadges(md: MarkdownString, details: { required?: boolean; deprecated?: boolean }): void {
        const badges: string[] = [];
        if (details.required) {
            badges.push('`required`');
        }
        if (details.deprecated) {
            badges.push('~~`deprecated`~~');
        }
        if (badges.length > 0) {
            md.appendMarkdown(`${badges.join(' ')} \n\n`);
        }
    }

    /** 追加类型信息 */
    private appendTypeInfo(md: MarkdownString, details: { type?: string | string[] }): void {
        if (!details.type) {
            return;
        }
        md.appendMarkdown(`---\n\n`);
        md.appendMarkdown(`** Type:** `);
        if (Array.isArray(details.type)) {
            md.appendMarkdown(`\`${details.type.join(' | ')}\`\n\n`);
        } else {
            md.appendMarkdown(`\`${details.type}\`\n\n`);
        }
    }

    /** 追加枚举值 */
    private appendEnumValues(md: MarkdownString, details: { enum?: unknown[] }): void {
        if (!details.enum || details.enum.length === 0) {
            return;
        }
        md.appendMarkdown(`** Allowed Values:**\n\n`);
        if (details.enum.length <= 10) {
            details.enum.forEach((value) => {
                md.appendMarkdown(`- \`${JSON.stringify(value)}\`\n`);
            });
        } else {
            md.appendCodeblock(details.enum.map((v) => JSON.stringify(v)).join(', '), 'text');
        }
        md.appendMarkdown('\n');
    }

    /** 追加默认值 */
    private appendDefaultValue(md: MarkdownString, details: { default?: unknown }): void {
        if (details.default === undefined) {
            return;
        }
        md.appendMarkdown(`** Default Value:**\n\n`);
        if (typeof details.default === 'string') {
            md.appendCodeblock(details.default, 'text');
        } else {
            md.appendCodeblock(JSON.stringify(details.default, null, 2), 'json');
        }
        md.appendMarkdown('\n');
    }

    /** 追加模式 */
    private appendPattern(md: MarkdownString, details: { pattern?: string }): void {
        if (!details.pattern) {
            return;
        }
        md.appendMarkdown(`** Pattern:**\n\n`);
        md.appendCodeblock(details.pattern, 'regex');
        md.appendMarkdown('\n');
    }

    /** 追加示例 */
    private appendExamples(
        md: MarkdownString,
        key: string,
        details: { examples?: unknown[]; type?: string | string[]; enum?: unknown[]; default?: unknown },
    ): void {
        if (details.examples && details.examples.length > 0) {
            md.appendMarkdown(`** Examples:**\n\n`);
            details.examples.forEach((example, index) => {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                if (details.examples!.length > 1) {
                    md.appendMarkdown(`*Example ${index + 1}:*\n\n`);
                }
                if (typeof example === 'string') {
                    md.appendCodeblock(example, 'yaml');
                } else if (typeof example === 'object') {
                    md.appendCodeblock(JSON.stringify(example, null, 2), 'json');
                } else {
                    md.appendCodeblock(String(example), 'text');
                }
                md.appendMarkdown('\n');
            });
        } else {
            md.appendMarkdown(`** Usage:**\n\n`);
            md.appendCodeblock(this.generateUsageExample(key, details), 'yaml');
            md.appendMarkdown('\n');
        }
    }

    /** 追加废弃警告 */
    private appendDeprecationWarning(md: MarkdownString, details: { deprecated?: boolean }): void {
        if (!details.deprecated) {
            return;
        }
        md.appendMarkdown(`---\n\n`);
        md.appendMarkdown(` **Warning:** This property is deprecated and may be removed in future versions.\n\n`);
    }

    /**
     * 生成使用示例
     */
    private generateUsageExample(
        key: string,
        details: {
            type?: string | string[];
            enum?: unknown[];
            default?: unknown;
        },
    ): string {
        // 优先使用枚举值或默认值；不再根据类型生成示例值
        if (details.enum && details.enum.length > 0) {
            return `${key}: ${JSON.stringify(details.enum[0])}`;
        }
        if (details.default !== undefined) {
            return `${key}: ${JSON.stringify(details.default)}`;
        }
        // 无可用示例时，返回占位形式，避免类型推断生成
        return `${key}: `;
    }
}
