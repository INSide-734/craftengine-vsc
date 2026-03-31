import { CompletionItem, CompletionItemKind, MarkdownString, type CancellationToken } from 'vscode';
import { ServiceContainer } from '../../../infrastructure/ServiceContainer';
import {
    type ICompletionStrategy,
    type ICompletionContextInfo,
    type ICompletionResult,
} from '../../../core/interfaces/ICompletionStrategy';
import {
    type IMinecraftVersionService,
    type IMinecraftVersion,
} from '../../../core/interfaces/IMinecraftVersionService';
import { type ILogger } from '../../../core/interfaces/ILogger';
import { type IDataConfigLoader } from '../../../core/interfaces/IDataConfigLoader';
import { SERVICE_TOKENS } from '../../../core/constants/ServiceTokens';
import { type ICompletionItemWithStrategy } from '../../types/CompletionTypes';

/**
 * 补全阶段类型
 */
type CompletionStageType = 'operator' | 'version' | 'range-end' | 'complete' | 'none';

/**
 * 补全阶段信息
 */
interface ICompletionStage {
    /** 阶段类型 */
    type: CompletionStageType;
    /** 操作符（>=, <, <=, =, 或空表示范围模式） */
    operator?: string;
    /** 部分输入的版本号 */
    partialVersion?: string;
    /** 范围模式的起始版本 */
    startVersion?: string;
}

/**
 * 版本条件操作符定义
 */
interface IVersionOperator {
    /** 操作符符号 */
    symbol: string;
    /** 显示标签 */
    label: string;
    /** 描述 */
    description: string;
    /** 是否为常用操作符 */
    common?: boolean;
    /** 示例 */
    example: string;
}

/**
 * 版本条件操作符列表
 */
const VERSION_OPERATORS: IVersionOperator[] = [
    { symbol: '>=', label: '$$>=', description: 'Greater than or equal', common: true, example: '$$>=1.21.4' },
    { symbol: '<', label: '$$<', description: 'Less than', common: true, example: '$$<1.21.2' },
    { symbol: '<=', label: '$$<=', description: 'Less than or equal', example: '$$<=1.20.4' },
    { symbol: '=', label: '$$=', description: 'Equal to (exact version)', example: '$$=1.21.0' },
    { symbol: '', label: '$$[ver]~[ver]', description: 'Version range (inclusive)', example: '$$1.20.1~1.21.3' },
];

/**
 * 版本条件补全策略
 *
 * 提供 CraftEngine 版本条件格式的智能补全，支持：
 * - 操作符补全：>=, <, <=, =, ~ (范围)
 * - 版本号补全：动态从 Mojang API 获取，静态数据作为 fallback
 * - 范围结束版本补全：智能过滤大于起始版本的版本
 *
 * ## 版本条件格式
 *
 * | 格式 | 示例 | 说明 |
 * |------|------|------|
 * | 大于等于 | `$$>=1.21.4` | 适用于指定版本及以上 |
 * | 小于 | `$$<1.21.2` | 适用于指定版本之前 |
 * | 小于等于 | `$$<=1.20.4` | 适用于指定版本及以下 |
 * | 等于 | `$$=1.21.0` | 仅适用于指定版本 |
 * | 版本范围 | `$$1.20.1~1.21.3` | 从版本 A 到版本 B（包含两端） |
 *
 * @example
 * ```yaml
 * items:
 *   $$>=1.21.4:
 *     # 仅在 1.21.4 及以上版本生效的配置
 *   $$1.20.1~1.21.3:
 *     # 在 1.20.1 到 1.21.3 版本范围内生效的配置
 * ```
 */
export class VersionConditionCompletionStrategy implements ICompletionStrategy {
    readonly name = 'version-condition-delegate';
    readonly priority: number;
    readonly triggerCharacters: string[] = ['$', '>', '<', '=', '~', '.'];

    private readonly logger: ILogger;
    private readonly versionService: IMinecraftVersionService;

    constructor() {
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild(
            'VersionConditionCompletionStrategy',
        );
        this.versionService = ServiceContainer.getService<IMinecraftVersionService>(
            SERVICE_TOKENS.MinecraftVersionService,
        );

        // 从配置文件加载优先级
        const configLoader = ServiceContainer.getService<IDataConfigLoader>(SERVICE_TOKENS.DataConfigLoader);
        this.priority = configLoader.getCompletionPrioritySync('versionCondition', true);
    }

    /**
     * 委托策略不直接激活
     */
    shouldActivate(_context: ICompletionContextInfo): boolean {
        return false;
    }

    /**
     * 提供版本条件补全项
     */
    async provideCompletionItems(
        context: ICompletionContextInfo,
        token?: CancellationToken,
    ): Promise<ICompletionResult | undefined> {
        try {
            if (token?.isCancellationRequested) {
                return undefined;
            }

            // 检测当前补全阶段
            const stage = this.detectCompletionStage(context.linePrefix);

            this.logger.debug('Version condition completion stage', {
                stage: stage.type,
                operator: stage.operator,
                partialVersion: stage.partialVersion,
                startVersion: stage.startVersion,
                linePrefix: context.linePrefix,
            });

            switch (stage.type) {
                case 'operator':
                    return this.provideOperatorCompletions();

                case 'version':
                    return await this.provideVersionCompletions(stage.operator || '', stage.partialVersion);

                case 'range-end':
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    return await this.provideRangeEndCompletions(stage.startVersion!);

                case 'complete':
                case 'none':
                default:
                    return undefined;
            }
        } catch (error) {
            this.logger.error('Failed to provide version condition completions', error as Error);
            return undefined;
        }
    }

    /**
     * 检测当前补全阶段
     *
     * 根据光标前的文本判断用户处于哪个输入阶段：
     * - operator: 刚输入 $$ 或正在输入操作符
     * - version: 已选择操作符，正在输入版本号
     * - range-end: 范围模式，正在输入结束版本
     * - complete: 版本条件已完成
     * - none: 不在版本条件上下文中
     */
    private detectCompletionStage(linePrefix: string): ICompletionStage {
        // 完整版本条件（已完成）
        // 匹配: "$$>=1.21.4" 或 "$$1.20.1~1.21.3" (后面没有更多输入)
        if (
            /\$\$(>=|<=|<|=)\d+\.\d+\.\d+\s*$/.test(linePrefix) ||
            /\$\$\d+\.\d+\.\d+~\d+\.\d+\.\d+\s*$/.test(linePrefix)
        ) {
            return { type: 'complete' };
        }

        // 阶段3: 范围模式，已输入起始版本和 ~
        // 匹配: "$$1.20.1~" 或 "$$1.21~" 或 "$$1.20.1~1.21" 或 "$$1.20.1~1"
        const rangeEndMatch = linePrefix.match(/\$\$(\d+\.\d+(?:\.\d+)?)~(\d*\.?\d*\.?\d*)$/);
        if (rangeEndMatch) {
            return {
                type: 'range-end',
                startVersion: rangeEndMatch[1],
                partialVersion: rangeEndMatch[2] || '',
            };
        }

        // 阶段2: 已选择操作符，准备输入版本号
        // 匹配: "$$>=" 或 "$$>=1" 或 "$$>=1.21" 或 "$$>=1.21."
        const operatorVersionMatch = linePrefix.match(/\$\$(>=|<=|<|=)(\d*\.?\d*\.?\d*)$/);
        if (operatorVersionMatch) {
            return {
                type: 'version',
                operator: operatorVersionMatch[1],
                partialVersion: operatorVersionMatch[2] || '',
            };
        }

        // 阶段2b: 范围模式起始版本（无操作符）
        // 匹配: "$$1" 或 "$$1.21" 或 "$$1.21.4" (无 ~ 符号)
        const rangeStartMatch = linePrefix.match(/\$\$(\d+\.?\d*\.?\d*)$/);
        if (rangeStartMatch) {
            return {
                type: 'version',
                operator: '',
                partialVersion: rangeStartMatch[1] || '',
            };
        }

        // 阶段1: 刚输入 $$ 或正在输入操作符
        // 匹配: "$$" 或 "$$>" 或 "$$<" 等（但不是完整操作符）
        if (/\$\$[><=]?$/.test(linePrefix)) {
            return { type: 'operator' };
        }

        return { type: 'none' };
    }

    /**
     * 提供操作符补全
     */
    private provideOperatorCompletions(): ICompletionResult {
        const items = VERSION_OPERATORS.map((op, index) => {
            const item = new CompletionItem(op.label, CompletionItemKind.Operator) as ICompletionItemWithStrategy;

            item.detail = op.description;

            const md = new MarkdownString();
            md.appendMarkdown(`## ${op.description}\n\n`);
            md.appendMarkdown(`**Example:** \`${op.example}\`\n\n`);
            if (op.symbol === '') {
                md.appendMarkdown('> Use this format to specify a version range (both endpoints included)\n');
            }
            item.documentation = md;

            // 常用操作符排在前面
            item.sortText = op.common ? `0${index}` : `1${index}`;

            // 插入文本
            if (op.symbol) {
                item.insertText = `$$${op.symbol}`;
            } else {
                item.insertText = '$$';
            }

            // 替换已输入的 $$
            item.filterText = `$$${op.symbol}`;

            item._strategy = this.name;

            return item;
        });

        return {
            items,
            isIncomplete: false,
            completionType: 'version-condition-operator',
            priority: this.priority,
        };
    }

    /**
     * 提供版本号补全
     */
    private async provideVersionCompletions(operator: string, partialVersion?: string): Promise<ICompletionResult> {
        // 动态获取版本列表
        const versions = await this.versionService.getVersions();

        // 根据部分输入过滤
        let filteredVersions = versions;
        if (partialVersion) {
            filteredVersions = versions.filter((v) => v.version.startsWith(partialVersion));
        }

        const items = filteredVersions.map((ver, index) => {
            const item = new CompletionItem(ver.version, CompletionItemKind.Constant) as ICompletionItemWithStrategy;

            // 设置详情
            let detail = ` ${this.formatDate(ver.releaseTime)}`;
            if (ver.isLatest) {
                detail += '  Latest';
            }
            item.detail = detail;

            // 创建文档
            item.documentation = this.createVersionDocumentation(ver, operator);

            // 最新版本排在前面
            item.sortText = String(index).padStart(3, '0');

            // 插入完整的版本条件
            if (operator) {
                item.insertText = `$$${operator}${ver.version}`;
            } else {
                // 范围模式，只插入版本号，等待用户输入 ~
                item.insertText = `$$${ver.version}`;
            }

            // 过滤文本
            item.filterText = ver.version;

            item._strategy = this.name;

            return item;
        });

        return {
            items,
            isIncomplete: false,
            completionType: 'version-condition-version',
            priority: this.priority,
        };
    }

    /**
     * 提供范围结束版本补全
     */
    private async provideRangeEndCompletions(startVersion: string): Promise<ICompletionResult> {
        const versions = await this.versionService.getVersions();

        // 只显示大于起始版本的版本
        const filteredVersions = versions.filter(
            (v) => this.versionService.compareVersions(v.version, startVersion) > 0,
        );

        const items = filteredVersions.map((ver, index) => {
            const item = new CompletionItem(ver.version, CompletionItemKind.Constant) as ICompletionItemWithStrategy;

            let detail = ` ${this.formatDate(ver.releaseTime)}`;
            if (ver.isLatest) {
                detail += '  Latest';
            }
            item.detail = detail;

            // 创建文档
            const md = new MarkdownString();
            md.appendMarkdown(`## Version Range End\n\n`);
            md.appendMarkdown(`|  Property |  Value |\n`);
            md.appendMarkdown(`|:------------|:---------|\n`);
            md.appendMarkdown(`| **Start** | \`${startVersion}\` |\n`);
            md.appendMarkdown(`| **End** | \`${ver.version}\` |\n`);
            md.appendMarkdown(`\n---\n\n`);
            md.appendMarkdown(`**Result:** \`$$${startVersion}~${ver.version}\`\n\n`);
            md.appendMarkdown(`> Applies to versions from **${startVersion}** to **${ver.version}** (inclusive)\n`);
            item.documentation = md;

            item.sortText = String(index).padStart(3, '0');

            // 只插入结束版本
            item.insertText = ver.version;
            item.filterText = ver.version;

            item._strategy = this.name;

            return item;
        });

        return {
            items,
            isIncomplete: false,
            completionType: 'version-condition-range-end',
            priority: this.priority,
        };
    }

    /**
     * 创建版本文档
     */
    private createVersionDocumentation(ver: IMinecraftVersion, operator: string): MarkdownString {
        const md = new MarkdownString();
        md.isTrusted = true;

        md.appendMarkdown(`## Minecraft ${ver.version}\n\n`);

        md.appendMarkdown(`|  Property |  Value |\n`);
        md.appendMarkdown(`|:------------|:---------|\n`);
        md.appendMarkdown(`| **Release Date** | ${this.formatDate(ver.releaseTime)} |\n`);

        md.appendMarkdown(`\n---\n\n`);

        if (operator) {
            md.appendMarkdown(`**Result:** \`$$${operator}${ver.version}\`\n`);
        } else {
            md.appendMarkdown(`**Result:** \`$$${ver.version}~[end_version]\`\n`);
            md.appendMarkdown(`\n>  Type \`~\` after this version to specify the range end\n`);
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
