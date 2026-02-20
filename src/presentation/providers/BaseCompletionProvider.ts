import {
    type CompletionItemProvider,
    type TextDocument,
    type Position,
    type CompletionItem,
    CompletionList,
    type CompletionContext,
    type CancellationToken,
} from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { type ILogger } from '../../core/interfaces/ILogger';
import { type IConfiguration } from '../../core/interfaces/IConfiguration';
import { type IEventBus } from '../../core/interfaces/IEventBus';
import { type ICompletionContextInfo } from '../../core/interfaces/ICompletionStrategy';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { type PerformanceMonitor } from '../../infrastructure/performance/PerformanceMonitor';
import { type CompletionManager } from '../../infrastructure/completion/CompletionManager';
import { YamlHelper } from '../../infrastructure/yaml/YamlHelper';
import { type CompletionItemWithStrategy } from '../types/CompletionTypes';
import { generateEventId } from '../../infrastructure/utils/IdGenerator';

/**
 * 抽象补全提供者基类
 *
 * 使用策略模式，通过补全管理器协调多种补全策略
 */
export class BaseCompletionProvider implements CompletionItemProvider {
    protected readonly logger: ILogger;
    protected readonly configuration: IConfiguration;
    protected readonly performanceMonitor: PerformanceMonitor;
    protected readonly completionManager: CompletionManager;
    protected readonly eventBus: IEventBus;

    constructor() {
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild('BaseCompletionProvider');
        this.configuration = ServiceContainer.getService<IConfiguration>(SERVICE_TOKENS.Configuration);
        this.performanceMonitor = ServiceContainer.getService<PerformanceMonitor>(SERVICE_TOKENS.PerformanceMonitor);
        this.completionManager = ServiceContainer.getService<CompletionManager>(SERVICE_TOKENS.CompletionManager);
        this.eventBus = ServiceContainer.getService<IEventBus>(SERVICE_TOKENS.EventBus);
    }

    /**
     * 提供补全项
     */
    async provideCompletionItems(
        document: TextDocument,
        position: Position,
        token?: CancellationToken,
        context?: CompletionContext,
    ): Promise<CompletionList | CompletionItem[] | undefined> {
        const timer = this.performanceMonitor.startTimer('completion.provide');

        try {
            // 检查功能是否启用
            if (!this.configuration.get('completion.enabled', true)) {
                return undefined;
            }

            // 检查取消请求
            if (token?.isCancellationRequested) {
                return undefined;
            }

            this.logger.debug('Providing completion items', {
                file: document.fileName,
                position: `${position.line}:${position.character}`,
                language: document.languageId,
            });

            // 检查是否在注释中（统一处理，避免所有策略都需要检查）
            const currentLine = document.lineAt(position.line).text;
            if (YamlHelper.isInComment(currentLine, position.character)) {
                this.logger.debug('Position is in comment, skipping completion');
                return undefined;
            }

            // 构建补全上下文
            const completionContext = this.buildCompletionContext(document, position, context);

            // 获取激活的策略
            const activeStrategies = await this.completionManager.getActiveStrategies(completionContext);

            if (activeStrategies.length === 0) {
                this.logger.debug('No active completion strategies');
                return undefined;
            }

            // 并行执行所有策略收集补全项
            const allCompletionItems: CompletionItem[] = [];

            // 使用 Promise.allSettled 并行执行，确保单个策略失败不影响其他策略
            const results = await Promise.allSettled(
                activeStrategies.map((strategy) => strategy.provideCompletionItems(completionContext, token)),
            );

            // 收集成功的结果
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                const strategy = activeStrategies[i];

                if (result.status === 'fulfilled' && result.value?.items.length) {
                    this.logger.debug('Strategy provided completions', {
                        strategy: strategy.name,
                        count: result.value.items.length,
                    });
                    allCompletionItems.push(...result.value.items);
                } else if (result.status === 'rejected') {
                    this.logger.error('Strategy failed to provide completions', result.reason as Error, {
                        strategy: strategy.name,
                    });
                }
            }

            if (allCompletionItems.length === 0) {
                this.logger.debug('No completion items generated');
                return new CompletionList([], false);
            }

            this.logger.debug('Completion items created', {
                totalCount: allCompletionItems.length,
                strategiesUsed: activeStrategies.map((s) => s.name),
            });

            // 发布补全提供事件
            await this.eventBus.publish('completion.provided', {
                id: generateEventId('completion'),
                type: 'completion.provided',
                timestamp: new Date(),
                source: 'BaseCompletionProvider',
                itemCount: allCompletionItems.length,
                strategiesUsed: activeStrategies.map((s) => s.name),
                document: document.uri.toString(),
            });

            timer.stop({
                itemsCount: allCompletionItems.length.toString(),
                strategiesCount: activeStrategies.length.toString(),
            });

            return new CompletionList(allCompletionItems, false);
        } catch (error) {
            this.logger.error('Error providing completion items', error as Error, {
                file: document.fileName,
                position: `${position.line}:${position.character}`,
            });
            timer.stop({ error: (error as Error).message });
            return undefined;
        }
    }

    /**
     * 解析补全项
     */
    async resolveCompletionItem(item: CompletionItem, token?: CancellationToken): Promise<CompletionItem | undefined> {
        const timer = this.performanceMonitor.startTimer('completion.resolve');

        try {
            if (token?.isCancellationRequested) {
                return undefined;
            }

            // 检查补全项是否包含策略信息
            const strategyName = (item as CompletionItemWithStrategy)._strategy;

            if (!strategyName) {
                return item;
            }

            // 查找对应的策略
            const strategy = this.completionManager.getStrategies().find((s) => s.name === strategyName);

            if (!strategy || !strategy.resolveCompletionItem) {
                return item;
            }

            // 使用策略解析补全项
            const resolvedItem = await strategy.resolveCompletionItem(item, token);

            timer.stop({ strategy: strategyName });

            return resolvedItem || item;
        } catch (error) {
            this.logger.error('Error resolving completion item', error as Error, {
                label: typeof item.label === 'string' ? item.label : item.label.label,
            });
            timer.stop({ error: (error as Error).message });
            return item;
        }
    }

    /**
     * 构建补全上下文信息
     */
    protected buildCompletionContext(
        document: TextDocument,
        position: Position,
        context?: CompletionContext,
    ): ICompletionContextInfo {
        const currentLine = document.lineAt(position);
        const lineText = currentLine.text;
        const linePrefix = lineText.substring(0, position.character);
        const lineSuffix = lineText.substring(position.character);

        // 计算缩进级别
        const indentLevel = this.getIndentLevel(lineText);

        return {
            document,
            position,
            lineText,
            linePrefix,
            lineSuffix,
            indentLevel,
            triggerCharacter: context?.triggerCharacter,
            vscodeContext: context,
        };
    }

    /**
     * 获取缩进级别
     */
    protected getIndentLevel(text: string): number {
        const match = text.match(/^(\s*)/);
        return match ? match[1].length : 0;
    }
}
