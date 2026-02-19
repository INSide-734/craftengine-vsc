import { CompletionItem, CancellationToken } from 'vscode';
import { ServiceContainer } from '../../../infrastructure/ServiceContainer';
import { ICompletionStrategy, ICompletionContextInfo, ICompletionResult } from '../../../core/interfaces/ICompletionStrategy';
import { ILogger } from '../../../core/interfaces/ILogger';
import { IDataStoreService } from '../../../core/interfaces/IDataStoreService';
import { IDataConfigLoader } from '../../../core/interfaces/IDataConfigLoader';
import { SERVICE_TOKENS } from '../../../core/constants/ServiceTokens';
import { MiniMessageDataLoader } from '../../../infrastructure/schema/data-loaders';
import { CompletionItemWithStrategy } from '../../types/CompletionTypes';
import {
    RichTextCompletionType,
    TranslationMode,
    PATTERNS
} from './richtext/types';
import { MiniMessageHandler } from './richtext/MiniMessageHandler';
import { TranslationHandler } from './richtext/TranslationHandler';

/**
 * 富文本补全策略（统一策略）
 *
 * 合并 MiniMessage 格式和翻译键补全功能，提供完整的富文本编辑支持。
 *
 * ## 功能概述
 *
 * ### MiniMessage 格式支持
 * - **标签补全**：在 `<` 后提供所有可用标签的补全
 * - **关闭标签补全**：在 `</` 后智能匹配需要关闭的标签
 * - **十六进制颜色补全**：在 `<#` 后提供常用颜色快速选择
 * - **参数补全**：在 `<tag:` 后提供标签参数的补全
 *
 * ### 翻译键支持
 * - **i18n 标签参数**：在 `<i18n:` 后提供翻译键补全（服务器端翻译）
 * - **l10n 标签参数**：在 `<l10n:` 后提供翻译键补全（客户端翻译）
 * - **纯翻译键**：支持非 MiniMessage 上下文的翻译键补全
 *
 * ## Schema 配置
 *
 * ```json
 * {
 *   "item-name": {
 *     "type": "string",
 *     "x-completion-provider": "craftengine.richText"
 *   }
 * }
 * ```
 *
 * @remarks
 * 此策略由 `SchemaAwareCompletionStrategy` 根据 `x-completion-provider` 委托调用。
 * 支持的提供者 ID：`craftengine.richText`、`craftengine.miniMessage`、`craftengine.translationKey`
 *
 * @see {@link ICompletionStrategy} 补全策略接口
 */
export class RichTextCompletionStrategy implements ICompletionStrategy {
    readonly name = 'rich-text-delegate';
    readonly priority: number;
    readonly triggerCharacters: string[] = ['<', ':', '!', '/'];

    private readonly logger: ILogger;
    private readonly dataLoader: MiniMessageDataLoader;
    private readonly miniMessageHandler: MiniMessageHandler;
    private readonly translationHandler: TranslationHandler;

    constructor() {
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger)
            .createChild('RichTextCompletionStrategy');
        this.dataLoader = MiniMessageDataLoader.getInstance();

        const dataStoreService = ServiceContainer.getService<IDataStoreService>(
            SERVICE_TOKENS.DataStoreService
        );

        // 从配置文件加载优先级
        const configLoader = ServiceContainer.getService<IDataConfigLoader>(SERVICE_TOKENS.DataConfigLoader);
        this.priority = configLoader.getCompletionPrioritySync('richText', true);

        // 初始化处理器
        this.miniMessageHandler = new MiniMessageHandler(this.dataLoader, this.name, configLoader);
        this.translationHandler = new TranslationHandler(dataStoreService, this.logger, this.name);
    }
    
    /**
     * 作为委托策略，始终返回 false
     */
    shouldActivate(_context: ICompletionContextInfo): boolean {
        return false;
    }
    
    /**
     * 提供补全项
     */
    async provideCompletionItems(
        context: ICompletionContextInfo,
        token?: CancellationToken
    ): Promise<ICompletionResult | undefined> {
        try {
            await this.dataLoader.ensureLoaded();
            
            if (token?.isCancellationRequested) {
                return undefined;
            }
            
            const linePrefix = context.linePrefix;
            const completionMode = this.getCompletionMode(context);
            
            this.logger.debug('Providing rich text completions', {
                position: `${context.position.line}:${context.position.character}`,
                linePrefix,
                completionMode
            });
            
            const items = await this.getCompletionItems(linePrefix, completionMode, context);
            
            if (items.length === 0) {
                return undefined;
            }
            
            this.logger.debug('Rich text completions provided', { itemCount: items.length });
            
            return {
                items,
                isIncomplete: false,
                completionType: 'rich-text',
                priority: this.priority
            };
            
        } catch (error) {
            this.logger.error('Failed to provide rich text completions', error as Error);
            return undefined;
        }
    }
    
    /**
     * 解析补全项
     */
    async resolveCompletionItem(
        item: CompletionItem,
        token?: CancellationToken
    ): Promise<CompletionItem | undefined> {
        try {
            if (token?.isCancellationRequested) {
                return item;
            }
            
            const translationKey = (item as CompletionItemWithStrategy)._translationKey;
            if (translationKey) {
                return this.translationHandler.resolveTranslationKeyItem(item, translationKey, token);
            }
            
            return item;
            
        } catch (error) {
            this.logger.error('Failed to resolve completion item', error as Error);
            return item;
        }
    }
    
    // ==================== 私有方法 ====================
    
    /**
     * 从 Schema 获取补全模式
     */
    private getCompletionMode(context: ICompletionContextInfo): 'rich-text' | 'translation-only' {
        if (!context.schema) {
            return 'rich-text';
        }
        
        const mode = context.schema['x-completion-mode'];
        if (mode === 'translation-only' || mode === 'key') {
            return 'translation-only';
        }
        
        return 'rich-text';
    }
    
    /**
     * 检测补全类型
     */
    private detectCompletionType(linePrefix: string, mode: 'rich-text' | 'translation-only'): RichTextCompletionType {
        if (mode === 'translation-only') {
            return 'pure-translation';
        }
        
        // 按优先级检测
        if (PATTERNS.TRANSLATION_TAG.test(linePrefix)) {
            return 'translation-key';
        }
        if (PATTERNS.CLOSING_TAG.test(linePrefix)) {
            return 'closing-tag';
        }
        if (PATTERNS.HEX_COLOR.test(linePrefix)) {
            return 'hex-color';
        }
        if (PATTERNS.TAG_ARGUMENT.test(linePrefix)) {
            return 'tag-argument';
        }
        if (PATTERNS.TAG_START.test(linePrefix)) {
            return 'tag';
        }
        
        return 'none';
    }
    
    /**
     * 根据类型获取补全项
     */
    private async getCompletionItems(
        linePrefix: string, 
        mode: 'rich-text' | 'translation-only',
        context: ICompletionContextInfo
    ): Promise<CompletionItem[]> {
        const completionType = this.detectCompletionType(linePrefix, mode);
        
        this.logger.debug('Detected completion type', { completionType, mode });
        
        switch (completionType) {
            case 'translation-key':
                return this.translationHandler.provideTranslationKeyCompletions(linePrefix);
            
            case 'pure-translation':
                return this.translationHandler.providePureTranslationKeyCompletions(
                    linePrefix,
                    this.getTranslationModeFromSchema(context)
                );
            
            case 'closing-tag':
                return this.miniMessageHandler.provideClosingTagCompletions(linePrefix);
            
            case 'hex-color':
                return this.miniMessageHandler.provideHexColorCompletions();
            
            case 'tag-argument':
                return this.miniMessageHandler.provideArgumentCompletions(linePrefix);
            
            case 'tag':
                return this.miniMessageHandler.provideTagCompletions(linePrefix);
            
            default:
                return [];
        }
    }
    
    /**
     * 从 Schema 获取翻译模式
     */
    private getTranslationModeFromSchema(context: ICompletionContextInfo): TranslationMode {
        if (context.schema) {
            const mode = context.schema['x-completion-mode'];
            if (mode === 'i18n' || mode === 'l10n') {
                return mode;
            }
        }
        return 'key';
    }
}
