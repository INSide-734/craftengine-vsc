import { CompletionItem, CompletionItemKind, MarkdownString, SnippetString } from 'vscode';
import { ServiceContainer } from '../../../infrastructure/ServiceContainer';
import {
    type IMinecraftVersionService,
    type IMinecraftVersion,
} from '../../../core/interfaces/IMinecraftVersionService';
import { type ILogger } from '../../../core/interfaces/ILogger';
import {
    type IDataConfigLoader,
    type IVersionConditionConfig,
    type IVersionConditionOperator,
} from '../../../core/interfaces/IDataConfigLoader';
import { SERVICE_TOKENS } from '../../../core/constants/ServiceTokens';

/**
 * 版本条件补全选项
 */
export interface VersionConditionCompletionOptions {
    /** 是否为键名位置（键名需要添加冒号和换行） */
    isKeyPosition: boolean;
    /** 是否包含 default 键补全项 */
    includeDefault?: boolean;
    /** 是否支持标识符后缀（如 $$>=1.21.4#section_id:） */
    includeIdentifierSuffix?: boolean;
    /** 最多显示的版本数量 */
    maxVersions?: number;
    /** 用户已输入的行前缀，用于判断是否需要包含 $$ 前缀 */
    linePrefix?: string;
}

/**
 * 版本条件补全辅助类
 *
 * 提供版本条件补全项的生成逻辑，
 * 被 SchemaKeyCompletionStrategy 和 VersionConditionCompletionStrategy 共同使用
 *
 * 从 JSON 配置文件加载操作符和默认值
 */
export class VersionConditionHelper {
    private readonly versionService: IMinecraftVersionService;
    private readonly configLoader: IDataConfigLoader;
    private readonly logger: ILogger;

    // 配置缓存
    private configCache: IVersionConditionConfig | null = null;
    private configLoaded = false;
    private configLoadPromise: Promise<void> | null = null;

    constructor() {
        this.versionService = ServiceContainer.getService<IMinecraftVersionService>(
            SERVICE_TOKENS.MinecraftVersionService,
        );
        this.configLoader = ServiceContainer.getService<IDataConfigLoader>(SERVICE_TOKENS.DataConfigLoader);
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild('VersionConditionHelper');
    }

    /**
     * 确保配置已加载
     */
    private async ensureConfigLoaded(): Promise<void> {
        if (this.configLoaded) {
            return;
        }

        if (this.configLoadPromise) {
            return this.configLoadPromise;
        }

        this.configLoadPromise = this.loadConfig();
        await this.configLoadPromise;
    }

    /**
     * 加载配置文件
     */
    private async loadConfig(): Promise<void> {
        this.configCache = await this.configLoader.loadVersionConditionConfig();
        this.configLoaded = true;
        this.logger.debug('Version condition config loaded from JSON');
    }

    /**
     * 获取操作符列表
     */
    private getOperators(): IVersionConditionOperator[] {
        if (!this.configCache) {
            throw new Error('VersionConditionHelper not initialized. Call ensureConfigLoaded() first.');
        }
        return this.configCache.operators;
    }

    /**
     * 获取默认配置
     */
    private getDefaults(): { maxVersionsToShow: number; fallbackVersion: string } {
        if (!this.configCache) {
            throw new Error('VersionConditionHelper not initialized. Call ensureConfigLoaded() first.');
        }
        return this.configCache.defaults;
    }

    /**
     * 创建版本条件补全项
     *
     * @param options 补全选项
     * @returns 补全项数组
     */
    async createCompletionItems(options: VersionConditionCompletionOptions): Promise<CompletionItem[]> {
        // 确保配置已加载
        await this.ensureConfigLoaded();

        const defaults = this.getDefaults();
        const {
            isKeyPosition,
            includeDefault = true,
            includeIdentifierSuffix = false,
            maxVersions = defaults.maxVersionsToShow,
            linePrefix = '',
        } = options;
        const items: CompletionItem[] = [];

        // 检测用户是否已输入 $$ 前缀
        const hasDoubleDoller = linePrefix.trimStart().includes('$$');

        try {
            const versions = await this.versionService.getVersions();
            const latestVersion =
                versions.find((v) => v.isLatest)?.version || versions[0]?.version || defaults.fallbackVersion;

            // 标识符后缀片段：仅在需要时添加
            const idSuffix = includeIdentifierSuffix ? '#\${99:section_id}' : '';
            const idSuffixDisplay = includeIdentifierSuffix ? '#...' : '';

            // 后缀：键名位置需要冒号和换行
            const suffix = isKeyPosition ? `${idSuffix}:\n  $0` : idSuffix;
            const suffixDisplay = isKeyPosition ? `${idSuffixDisplay}:` : idSuffixDisplay;

            // default 键补全项（放在最前面）
            if (includeDefault) {
                items.push(this.createDefaultItem(isKeyPosition));
            }

            // 操作符补全项
            items.push(
                ...this.createOperatorItems(
                    latestVersion,
                    suffix,
                    suffixDisplay,
                    includeIdentifierSuffix,
                    hasDoubleDoller,
                ),
            );

            // 范围模式补全项
            items.push(
                this.createRangeItem(latestVersion, suffix, suffixDisplay, includeIdentifierSuffix, hasDoubleDoller),
            );

            // 具体版本补全项
            const topVersions = versions.slice(0, maxVersions);
            items.push(...this.createVersionItems(topVersions, suffix, suffixDisplay, hasDoubleDoller));
        } catch (error) {
            this.logger.error('Failed to create version condition completion items', error as Error);

            // 返回基本的版本条件模板
            if (includeDefault) {
                items.push(this.createDefaultItem(isKeyPosition));
            }
            items.push(this.createFallbackTemplateItem(isKeyPosition, includeIdentifierSuffix, hasDoubleDoller));
        }

        return items;
    }

    /**
     * 创建操作符补全项
     */
    private createOperatorItems(
        latestVersion: string,
        suffix: string,
        suffixDisplay: string,
        includeIdentifierSuffix: boolean,
        hasDoubleDoller: boolean,
    ): CompletionItem[] {
        const operators = this.getOperators();

        return operators.map(({ operator: op, description: desc, icon }) => {
            // 如果用户已输入 $$，则不在 insertText 中包含 $$
            const prefix = hasDoubleDoller ? '' : '\\$\\$';
            const displayPrefix = hasDoubleDoller ? '' : '$$';

            const item = new CompletionItem(
                `${icon} ${displayPrefix}${op}...${suffixDisplay}`,
                CompletionItemKind.Snippet,
            );
            item.insertText = new SnippetString(`${prefix}${op}\${1:${latestVersion}}${suffix}`);
            item.detail = includeIdentifierSuffix
                ? `Version section: ${desc} (with section ID)`
                : `Version condition: ${desc}`;
            item.documentation = this.createOperatorDoc(op, desc, latestVersion, includeIdentifierSuffix);
            item.sortText = `000-${op}`;
            item.filterText = `$$${op} version condition`;
            return item;
        });
    }

    /**
     * 创建范围模式补全项
     */
    private createRangeItem(
        latestVersion: string,
        suffix: string,
        suffixDisplay: string,
        includeIdentifierSuffix: boolean,
        hasDoubleDoller: boolean,
    ): CompletionItem {
        // 如果用户已输入 $$，则不在 insertText 中包含 $$
        const prefix = hasDoubleDoller ? '' : '\\$\\$';
        const displayPrefix = hasDoubleDoller ? '' : '$$';

        const item = new CompletionItem(`↔ ${displayPrefix}...~...${suffixDisplay}`, CompletionItemKind.Snippet);
        item.insertText = new SnippetString(`${prefix}\${1:1.20.1}~\${2:${latestVersion}}${suffix}`);
        item.detail = includeIdentifierSuffix
            ? 'Version range section (from~to, with section ID)'
            : 'Version range (from~to)';
        item.documentation = this.createRangeDoc(includeIdentifierSuffix);
        item.sortText = '000-range';
        item.filterText = '$$ version range';
        return item;
    }

    /**
     * 创建具体版本补全项
     */
    private createVersionItems(
        versions: IMinecraftVersion[],
        suffix: string,
        suffixDisplay: string,
        hasDoubleDoller: boolean,
    ): CompletionItem[] {
        return versions.map((ver, index) => {
            // 如果用户已输入 $$，则不在 insertText 中包含 $$
            const prefix = hasDoubleDoller ? '' : '\\$\\$';
            const displayPrefix = hasDoubleDoller ? '' : '$$';

            const condition = `${displayPrefix}>=${ver.version}${suffixDisplay}`;
            const item = new CompletionItem(condition, CompletionItemKind.Value);
            item.insertText = new SnippetString(`${prefix}>=\${1|${ver.version}|}${suffix}`);
            item.detail = ver.isLatest
                ? `📅 ${this.formatDate(ver.releaseTime)} ⭐ Latest`
                : `📅 ${this.formatDate(ver.releaseTime)}`;
            item.documentation = new MarkdownString(`Version condition for **${ver.version}** and above`);
            item.sortText = `100-${index.toString().padStart(3, '0')}`;
            item.filterText = `$$ ${ver.version}`;
            return item;
        });
    }

    /**
     * 创建 default 键补全项
     */
    private createDefaultItem(isKeyPosition: boolean): CompletionItem {
        const item = new CompletionItem('⚙ default', CompletionItemKind.Keyword);
        item.insertText = new SnippetString(isKeyPosition ? 'default:\n  $0' : 'default');
        item.detail = 'Default configuration (base)';
        item.documentation = new MarkdownString(
            '**Default Configuration**\n\n' +
                'The base configuration that applies to all versions.\n\n' +
                'Version-conditional configurations (`$$>=1.21.4:`, etc.) will ' +
                '**override or merge** into this default configuration when the ' +
                'runtime Minecraft version matches.\n\n' +
                '**Example:**\n' +
                '```yaml\n' +
                'model:\n' +
                '  default:\n' +
                '    type: minecraft:model\n' +
                '    model: my_item\n' +
                '  $$>=1.21.4:\n' +
                '    model: my_item_new\n' +
                '```',
        );
        item.sortText = '000-default';
        item.filterText = 'default base';
        return item;
    }

    /**
     * 创建降级模板补全项
     */
    private createFallbackTemplateItem(
        isKeyPosition: boolean,
        includeIdentifierSuffix: boolean = false,
        hasDoubleDoller: boolean = false,
    ): CompletionItem {
        const idSuffix = includeIdentifierSuffix ? '#\${2:section_id}' : '';

        // 如果用户已输入 $$，则不在 insertText 中包含 $$
        const prefix = hasDoubleDoller ? '' : '\\$\\$';
        const displayPrefix = hasDoubleDoller ? '' : '$$';

        const item = new CompletionItem(`${displayPrefix}>=...`, CompletionItemKind.Snippet);
        item.insertText = new SnippetString(
            isKeyPosition ? `${prefix}>=\${1:1.21.4}${idSuffix}:\n  $0` : `${prefix}>=\${1:1.21.4}${idSuffix}`,
        );
        item.detail = includeIdentifierSuffix ? 'Version section' : 'Version condition';
        return item;
    }

    /**
     * 创建操作符文档
     */
    private createOperatorDoc(
        op: string,
        desc: string,
        example: string,
        includeIdentifierSuffix: boolean = false,
    ): MarkdownString {
        const md = new MarkdownString();
        md.isTrusted = true;
        md.appendMarkdown(`**${desc}**\n\n`);
        md.appendMarkdown(`Applies when Minecraft version is ${desc.toLowerCase()} the specified version.\n\n`);

        if (includeIdentifierSuffix) {
            md.appendMarkdown('**Format:** `$$<op><version>#<section_id>:`\n\n');
            md.appendMarkdown('The `#section_id` suffix is used to group version-conditional sections.\n\n');
            md.appendMarkdown('**Example:**\n');
            md.appendCodeblock(
                `$$${op}${example}#my_section:\n  namespace:item_id:\n    material: diamond\n    data:\n      item-name: My Item`,
                'yaml',
            );
        } else {
            md.appendMarkdown('**Example:**\n');
            md.appendCodeblock(
                `$$${op}${example}:\n  client-bound-data:\n    components:\n      minecraft:item_model: my_item`,
                'yaml',
            );
        }
        return md;
    }

    /**
     * 创建范围文档
     */
    private createRangeDoc(includeIdentifierSuffix: boolean = false): MarkdownString {
        const md = new MarkdownString();
        md.isTrusted = true;
        md.appendMarkdown('**Version Range**\n\n');
        md.appendMarkdown('Applies when Minecraft version is within the specified range (inclusive).\n\n');

        if (includeIdentifierSuffix) {
            md.appendMarkdown('**Format:** `$$<from>~<to>#<section_id>:`\n\n');
            md.appendMarkdown('The `#section_id` suffix is used to group version-conditional sections.\n\n');
            md.appendMarkdown('**Example:**\n');
            md.appendCodeblock(
                '$$1.20.1~1.21.3#old_items:\n  namespace:item_id:\n    material: bow\n    client-bound-material: honey_bottle',
                'yaml',
            );
        } else {
            md.appendMarkdown('**Example:**\n');
            md.appendCodeblock('$$1.20.1~1.21.3:\n  client-bound-material: bow', 'yaml');
        }
        return md;
    }

    /**
     * 格式化日期
     */
    private formatDate(date: Date): string {
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    }
}
