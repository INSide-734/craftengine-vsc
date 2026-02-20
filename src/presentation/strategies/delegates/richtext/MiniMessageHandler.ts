import { CompletionItem, CompletionItemKind, MarkdownString, SnippetString } from 'vscode';
import {
    type MiniMessageDataLoader,
    type MiniMessageTagDefinition,
    type MiniMessageTagArgument,
} from '../../../../infrastructure/schema/data-loaders';
import { type CompletionItemWithStrategy } from '../../../types/CompletionTypes';
import { PATTERNS } from './types';
import { type IMiniMessageCategoryConfig } from '../../../../core/types/ConfigTypes';
import { type IDataConfigLoader } from '../../../../core/interfaces/IDataConfigLoader';

/**
 * MiniMessage 标签补全处理器
 *
 * 负责处理 MiniMessage 格式相关的所有补全：
 * - 标签名称补全
 * - 关闭标签补全
 * - 十六进制颜色补全
 * - 标签参数补全
 */
export class MiniMessageHandler {
    /** 分类配置缓存 */
    private categoryConfig: Record<string, IMiniMessageCategoryConfig> | null = null;
    /** 可否定装饰列表缓存 */
    private negatableDecorations: string[] | null = null;

    constructor(
        private readonly dataLoader: MiniMessageDataLoader,
        private readonly strategyName: string,
        configLoader?: IDataConfigLoader,
    ) {
        // 尝试从配置加载分类配置和否定装饰列表
        if (configLoader) {
            const miniMessageConfig = configLoader.getMiniMessageConstantsConfigSync();
            if (miniMessageConfig) {
                this.categoryConfig = miniMessageConfig.categoryConfig;
                this.negatableDecorations = miniMessageConfig.negatableDecorations;
            }
        }
    }

    // ==================== 标签名称补全 ====================

    /**
     * 提供标签名称补全
     */
    provideTagCompletions(linePrefix: string): CompletionItem[] {
        const match = linePrefix.match(PATTERNS.TAG_START);
        const prefix = match ? match[1].toLowerCase() : '';

        const items: CompletionItem[] = [];
        const allTags = this.dataLoader.getAllTags();

        // 遍历所有标签，匹配名称或别名
        for (const tag of allTags) {
            const names = [tag.name, ...(tag.aliases || [])];
            for (const name of names) {
                if (name.toLowerCase().startsWith(prefix)) {
                    items.push(this.createTagCompletionItem(tag, name));
                }
            }
        }

        // 添加特殊提示
        if ('#'.startsWith(prefix) || prefix === '') {
            items.push(this.createHexColorHintItem());
        }
        if ('!'.startsWith(prefix) || prefix === '') {
            items.push(this.createNegationHintItem());
        }

        return items;
    }

    /**
     * 创建标签补全项
     */
    private createTagCompletionItem(tag: MiniMessageTagDefinition, displayName: string): CompletionItem {
        const item = new CompletionItem(displayName, this.getCompletionItemKind(tag.category));

        // 设置插入文本
        if (tag.insertSnippet) {
            item.insertText = new SnippetString(tag.insertSnippet);
        } else if (tag.selfClosing) {
            item.insertText = `<${displayName}>`;
        } else {
            item.insertText = new SnippetString(`<${displayName}>\${1:}</${displayName}>`);
        }

        item.detail = `MiniMessage ${tag.category} tag`;
        item.documentation = this.buildTagDocumentation(tag);
        item.sortText = this.getCategorySortPrefix(tag.category) + displayName;
        item.filterText = displayName;
        (item as CompletionItemWithStrategy)._strategy = this.strategyName;

        return item;
    }

    /**
     * 构建标签的 Markdown 文档
     */
    private buildTagDocumentation(tag: MiniMessageTagDefinition): MarkdownString {
        const doc = new MarkdownString();
        doc.isTrusted = true;

        doc.appendMarkdown(`## \`${tag.syntax}\`\n\n`);
        doc.appendMarkdown(`${tag.description}\n\n`);

        if (tag.arguments && tag.arguments.length > 0) {
            doc.appendMarkdown('### Arguments\n\n');
            for (const arg of tag.arguments) {
                const required = arg.required ? '**required**' : 'optional';
                doc.appendMarkdown(`- \`${arg.name}\` (${arg.type}, ${required}): ${arg.description}\n`);
                if (arg.enumValues) {
                    doc.appendMarkdown(`  - Values: \`${arg.enumValues.join('`, `')}\`\n`);
                }
            }
            doc.appendMarkdown('\n');
        }

        doc.appendMarkdown('### Example\n\n');
        doc.appendCodeblock(tag.example, 'yaml');

        if (tag.aliases && tag.aliases.length > 0) {
            doc.appendMarkdown(`\n**Aliases:** \`${tag.aliases.join('`, `')}\``);
        }

        return doc;
    }

    private getCompletionItemKind(category: string): CompletionItemKind {
        if (this.categoryConfig?.[category]) {
            return this.categoryConfig[category].completionKind as CompletionItemKind;
        }
        const kindMap: Record<string, CompletionItemKind> = {
            color: CompletionItemKind.Color,
            decoration: CompletionItemKind.Keyword,
            event: CompletionItemKind.Event,
            format: CompletionItemKind.Function,
            special: CompletionItemKind.Snippet,
            craftengine: CompletionItemKind.Reference,
        };
        return kindMap[category] || CompletionItemKind.Text;
    }

    private getCategorySortPrefix(category: string): string {
        if (this.categoryConfig?.[category]) {
            return this.categoryConfig[category].sortPrefix;
        }
        const sortMap: Record<string, string> = {
            color: '1_',
            decoration: '2_',
            format: '3_',
            event: '4_',
            craftengine: '5_',
            special: '6_',
        };
        return sortMap[category] || '9_';
    }

    // ==================== 特殊补全提示 ====================

    /**
     * 创建十六进制颜色提示项
     */
    createHexColorHintItem(): CompletionItem {
        const item = new CompletionItem('#RRGGBB', CompletionItemKind.Color);
        item.insertText = new SnippetString('<#${1:FF5555}>${2:text}</#${1:FF5555}>');
        item.detail = 'Hex color code';
        item.documentation = new MarkdownString()
            .appendMarkdown('## Hex Color\n\n')
            .appendMarkdown('Use hex color codes for precise color control.\n\n')
            .appendMarkdown('### Format\n\n')
            .appendMarkdown('- `<#RRGGBB>` - RGB color\n')
            .appendMarkdown('- `<#RRGGBBAA>` - RGBA color with alpha\n\n')
            .appendMarkdown('### Example\n\n')
            .appendCodeblock('<#FF5555>Red text</#FF5555>', 'yaml');
        item.sortText = '0_hex';
        return item;
    }

    /**
     * 创建否定装饰提示项
     */
    private createNegationHintItem(): CompletionItem {
        const decorations = this.negatableDecorations || [
            'bold',
            'italic',
            'underlined',
            'strikethrough',
            'obfuscated',
            'shadow',
        ];
        const item = new CompletionItem('!decoration', CompletionItemKind.Keyword);
        item.insertText = new SnippetString(`<!$\{1|${decorations.join(',')}|}>`);
        item.detail = 'Negate a decoration';
        item.documentation = new MarkdownString()
            .appendMarkdown('## Negation\n\n')
            .appendMarkdown('Use `!` prefix to disable a decoration.\n\n')
            .appendMarkdown('### Example\n\n')
            .appendCodeblock('<bold>Bold text <!bold>not bold</bold>', 'yaml');
        item.sortText = '0_negation';
        return item;
    }

    // ==================== 关闭标签补全 ====================

    /**
     * 提供关闭标签补全
     */
    provideClosingTagCompletions(linePrefix: string): CompletionItem[] {
        const match = linePrefix.match(PATTERNS.CLOSING_TAG);
        const prefix = match ? match[1].toLowerCase() : '';

        const openTags = this.findOpenTags(linePrefix);
        const items: CompletionItem[] = [];

        // 优先提供已打开的标签
        for (const tagName of openTags) {
            if (tagName.toLowerCase().startsWith(prefix)) {
                const item = new CompletionItem(tagName, CompletionItemKind.Keyword);
                item.insertText = `</${tagName}>`;
                item.detail = 'Close opened tag';
                item.sortText = '0_' + tagName;
                items.push(item);
            }
        }

        // 如果没有找到打开的标签，提供所有非自闭合标签
        if (items.length === 0) {
            const allTags = this.dataLoader.getAllTags();
            for (const tag of allTags) {
                if (!tag.selfClosing && tag.name.toLowerCase().startsWith(prefix)) {
                    const item = new CompletionItem(tag.name, CompletionItemKind.Keyword);
                    item.insertText = `</${tag.name}>`;
                    item.detail = 'Close tag';
                    items.push(item);
                }
            }
        }

        return items;
    }

    /**
     * 查找文本中已打开但未关闭的标签
     */
    private findOpenTags(text: string): string[] {
        const openTags: string[] = [];
        const allTags = this.dataLoader.getAllTags();
        const tagPattern = /<\/?([a-z_]+)/gi;
        let match: RegExpExecArray | null;

        while ((match = tagPattern.exec(text)) !== null) {
            const tagName = match[1].toLowerCase();
            const isClosing = match[0].startsWith('</');

            if (isClosing) {
                const index = openTags.lastIndexOf(tagName);
                if (index !== -1) {
                    openTags.splice(index, 1);
                }
            } else {
                const tag = allTags.find((t) => t.name === tagName || (t.aliases && t.aliases.includes(tagName)));
                if (!tag?.selfClosing) {
                    openTags.push(tagName);
                }
            }
        }

        return openTags.reverse();
    }

    // ==================== 十六进制颜色补全 ====================

    /**
     * 提供十六进制颜色补全
     */
    provideHexColorCompletions(): CompletionItem[] {
        const commonColors = this.dataLoader.getCommonHexColors();

        return commonColors.map((color) => {
            const item = new CompletionItem(`#${color.hex}`, CompletionItemKind.Color);
            item.insertText = color.hex;
            item.detail = color.name;
            item.documentation = new MarkdownString(
                `**${color.name}** (#${color.hex})${color.description ? `\n\n${color.description}` : ''}`,
            );
            return item;
        });
    }

    // ==================== 标签参数补全 ====================

    /**
     * 提供标签参数补全
     */
    provideArgumentCompletions(linePrefix: string): CompletionItem[] {
        const match = linePrefix.match(PATTERNS.TAG_ARGUMENT);
        if (!match) {
            return [];
        }

        const tagName = match[1].toLowerCase();
        const currentArgs = match[2];

        const allTags = this.dataLoader.getAllTags();
        const tag = allTags.find((t) => t.name === tagName || (t.aliases && t.aliases.includes(tagName)));

        const argParts = currentArgs.split(':');
        const currentArgIndex = argParts.length - 1;

        // 优先处理特定标签的参数
        const specialItems = this.getSpecialTagArgumentCompletions(tagName, currentArgIndex);
        if (specialItems.length > 0) {
            return specialItems;
        }

        // 根据标签参数定义提供补全
        if (tag?.arguments && currentArgIndex < tag.arguments.length) {
            return this.getArgumentCompletionsFromDefinition(tag.arguments[currentArgIndex]);
        }

        return [];
    }

    /**
     * 获取特定标签的参数补全
     */
    private getSpecialTagArgumentCompletions(tagName: string, argIndex: number): CompletionItem[] {
        const specialCompletions: Record<string, () => CompletionItem[]> = {
            click: () =>
                argIndex === 0 ? this.createEnumCompletions(this.dataLoader.getClickActions(), 'Click action') : [],
            hover: () =>
                argIndex === 0 ? this.createEnumCompletions(this.dataLoader.getHoverActions(), 'Hover action') : [],
            key: () => this.createEnumCompletions(this.dataLoader.getKeybinds(), 'Keybind'),
            keybind: () => this.createEnumCompletions(this.dataLoader.getKeybinds(), 'Keybind'),
            pride: () =>
                argIndex === 0 ? this.createEnumCompletions(this.dataLoader.getPrideFlags(), 'Pride flag') : [],
            nbt: () =>
                argIndex === 0
                    ? this.createEnumCompletions(this.dataLoader.getNbtSourceTypes(), 'NBT source type')
                    : [],
            data: () =>
                argIndex === 0
                    ? this.createEnumCompletions(this.dataLoader.getNbtSourceTypes(), 'NBT source type')
                    : [],
            // i18n/l10n 由翻译处理器处理
            i18n: () => [],
            l10n: () => [],
        };

        const handler = specialCompletions[tagName];
        return handler ? handler() : [];
    }

    /**
     * 根据参数定义生成补全项
     */
    private getArgumentCompletionsFromDefinition(argDef: MiniMessageTagArgument): CompletionItem[] {
        if (argDef.type === 'enum' && argDef.enumValues) {
            return this.createEnumCompletions(argDef.enumValues, argDef.description);
        }

        if (argDef.type === 'color') {
            const items = this.createEnumCompletions(this.dataLoader.getColors(), 'Named color');
            items.push(this.createHexColorHintItem());
            return items;
        }

        return [];
    }

    /**
     * 创建枚举类型的补全项列表
     */
    private createEnumCompletions(values: string[], detail: string): CompletionItem[] {
        return values.map((value) => {
            const item = new CompletionItem(value, CompletionItemKind.EnumMember);
            item.detail = detail;
            return item;
        });
    }
}
