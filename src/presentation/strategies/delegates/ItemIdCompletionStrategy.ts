import { CompletionItem, CompletionItemKind, MarkdownString, CancellationToken } from 'vscode';
import { ServiceContainer } from '../../../infrastructure/ServiceContainer';
import { ICompletionStrategy, ICompletionContextInfo, ICompletionResult } from '../../../core/interfaces/ICompletionStrategy';
import { IDataStoreService } from '../../../core/interfaces/IDataStoreService';
import { IItemId } from '../../../core/interfaces/IItemId';
import { ILogger } from '../../../core/interfaces/ILogger';
import { IDataConfigLoader } from '../../../core/interfaces/IDataConfigLoader';
import { IItemTypeDisplayConfig } from '../../../core/types/ConfigTypes';
import { SERVICE_TOKENS } from '../../../core/constants/ServiceTokens';
import { CompletionItemWithStrategy } from '../../types/CompletionTypes';
import { getRelativePath, extractCompletionPrefix } from '../../../infrastructure/utils/StringUtils';

/** 默认物品类型配置（回退值） */
const DEFAULT_ITEM_TYPE_CONFIG: Record<string, IItemTypeDisplayConfig> = {
    block: { icon: '🧱', label: 'Block' },
    furniture: { icon: '🪑', label: 'Furniture' },
    item: { icon: '📦', label: 'Item' },
};

/**
 * 物品 ID 补全策略
 *
 * 提供用户在 items/blocks/furniture section 中定义的物品 ID 补全
 */
export class ItemIdCompletionStrategy implements ICompletionStrategy {
    readonly name = 'item-id-delegate';
    readonly priority: number;
    readonly triggerCharacters: string[] = [];

    private readonly dataStoreService: IDataStoreService;
    private readonly logger: ILogger;
    private readonly itemTypeConfig: Record<string, IItemTypeDisplayConfig>;

    constructor() {
        this.dataStoreService = ServiceContainer.getService<IDataStoreService>(SERVICE_TOKENS.DataStoreService);
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild('ItemIdCompletionStrategy');

        // 从配置文件加载优先级和物品类型配置
        const configLoader = ServiceContainer.getService<IDataConfigLoader>(SERVICE_TOKENS.DataConfigLoader);
        this.priority = configLoader.getCompletionPrioritySync('itemId', true);

        const itemTypeConfig = configLoader.getItemTypeConfigSync();
        this.itemTypeConfig = itemTypeConfig?.types ?? DEFAULT_ITEM_TYPE_CONFIG;
    }

    shouldActivate(_context: ICompletionContextInfo): boolean {
        return false;
    }

    async provideCompletionItems(
        context: ICompletionContextInfo,
        token?: CancellationToken
    ): Promise<ICompletionResult | undefined> {
        if (token?.isCancellationRequested) {
            return undefined;
        }

        this.logger.debug('Providing item ID completions', {
            position: `${context.position.line}:${context.position.character}`,
            linePrefix: context.linePrefix
        });

        const items = await this.dataStoreService.getAllItems();
        if (items.length === 0) {
            return this.createEmptyResult();
        }

        const prefix = extractCompletionPrefix(context.linePrefix, /[a-zA-Z0-9_:/-]+$/);
        const filteredItems = this.filterItems(items, prefix);
        const completionItems = filteredItems.map(item => this.createCompletionItem(item));

        this.logger.debug('Item ID completions provided', {
            total: items.length,
            filtered: completionItems.length,
            prefix
        });

        return { items: completionItems, isIncomplete: false, completionType: 'item-id', priority: this.priority };
    }

    async resolveCompletionItem(
        item: CompletionItem,
        token?: CancellationToken
    ): Promise<CompletionItem | undefined> {
        if (token?.isCancellationRequested) {
            return item;
        }

        const itemId = typeof item.label === 'string' ? item.label : item.label.label;
        const itemData = await this.dataStoreService.getItemById(itemId);

        if (itemData) {
            return { ...item, documentation: this.createItemDocumentation(itemData) };
        }

        return item;
    }

    private createEmptyResult(): ICompletionResult {
        return { items: [], isIncomplete: false, completionType: 'item-id', priority: this.priority };
    }

    private filterItems(items: IItemId[], prefix: string): IItemId[] {
        if (!prefix) {
            return items.sort((a, b) => a.id.localeCompare(b.id));
        }

        const lowerPrefix = prefix.toLowerCase();
        return items
            .filter(item =>
                item.id.toLowerCase().includes(lowerPrefix) ||
                item.name.toLowerCase().includes(lowerPrefix) ||
                item.namespace.toLowerCase().includes(lowerPrefix)
            )
            .sort((a, b) => a.id.localeCompare(b.id));
    }

    private createCompletionItem(item: IItemId): CompletionItem {
        const completionItem = new CompletionItem(item.id, CompletionItemKind.Value);
        const config = this.itemTypeConfig[item.type || 'item'] || this.itemTypeConfig['item'] || DEFAULT_ITEM_TYPE_CONFIG['item'];

        completionItem.sortText = `${item.namespace}_${item.name}`;
        completionItem.filterText = `${item.id} ${item.name} ${item.namespace}`;
        completionItem.detail = item.material
            ? `${config.icon} ${item.material}`
            : `${config.icon} Custom ${config.label}`;
        completionItem.insertText = item.id;
        (completionItem as CompletionItemWithStrategy)._strategy = this.name;

        return completionItem;
    }

    private createItemDocumentation(item: IItemId): MarkdownString {
        const config = this.itemTypeConfig[item.type || 'item'] || this.itemTypeConfig['item'] || DEFAULT_ITEM_TYPE_CONFIG['item'];
        const md = new MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;

        md.appendMarkdown(`## ${config.icon} ${item.id}\n\n`);
        md.appendMarkdown('| 🏷️ Property | 📄 Value |\n');
        md.appendMarkdown('|:------------|:---------|\n');
        md.appendMarkdown(`| **Type** | \`${config.label}\` |\n`);
        md.appendMarkdown(`| **Namespace** | \`${item.namespace}\` |\n`);
        md.appendMarkdown(`| **Name** | \`${item.name}\` |\n`);

        if (item.material) {
            md.appendMarkdown(`| **Material** | \`${item.material}\` |\n`);
        }

        md.appendMarkdown('\n---\n\n### 📋 Source Information\n\n');
        md.appendMarkdown(`| 📁 Source File | \`${getRelativePath(item.sourceFile)}\` |\n`);
        md.appendMarkdown('|:--------------|:---------|\n');

        if (item.lineNumber !== undefined) {
            md.appendMarkdown(`| 📍 Line Number | \`${item.lineNumber + 1}\` |\n`);
        }

        md.appendMarkdown(`\n> **💡 Tip:** This is a custom ${config.label.toLowerCase()} defined in your configuration.\n`);

        return md;
    }

}



