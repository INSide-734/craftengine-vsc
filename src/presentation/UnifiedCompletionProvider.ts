import { BaseCompletionProvider } from './providers/BaseCompletionProvider';
import { type ILogger } from '../core/interfaces/ILogger';
import { type IDelegateStrategyRegistry } from '../core/interfaces/IDelegateStrategyRegistry';
import { type ICompletionStrategy } from '../core/interfaces/ICompletionStrategy';
import { SERVICE_TOKENS } from '../core/constants/ServiceTokens';
import { ServiceContainer } from '../infrastructure/ServiceContainer';
import { type CompletionManager } from '../infrastructure/completion/CompletionManager';
import { ServiceNotInitializedError } from '../core/errors/ExtensionErrors';
import { SchemaAwareCompletionStrategy } from './strategies/SchemaAwareCompletionStrategy';
import { SchemaKeyCompletionStrategy } from './strategies/SchemaKeyCompletionStrategy';
import { TemplateNameCompletionStrategy } from './strategies/delegates/TemplateNameCompletionStrategy';
import { TemplateParameterCompletionStrategy } from './strategies/delegates/TemplateParameterCompletionStrategy';
import { FilePathCompletionStrategy } from './strategies/delegates/FilePathCompletionStrategy';
import { RichTextCompletionStrategy } from './strategies/delegates/RichTextCompletionStrategy';
import { ItemIdCompletionStrategy } from './strategies/delegates/ItemIdCompletionStrategy';
import { VersionConditionCompletionStrategy } from './strategies/delegates/VersionConditionCompletionStrategy';
import { CategoryReferenceCompletionStrategy } from './strategies/delegates/CategoryReferenceCompletionStrategy';

// 委托策略配置：provider ID -> 策略工厂函数
const DELEGATE_STRATEGIES: Record<string, () => ICompletionStrategy> = {
    'craftengine.templateName': () => new TemplateNameCompletionStrategy(),
    'craftengine.templateParameters': () => new TemplateParameterCompletionStrategy(),
    'craftengine.filePath': () => new FilePathCompletionStrategy(),
    'craftengine.itemId': () => new ItemIdCompletionStrategy(),
    'craftengine.versionCondition': () => new VersionConditionCompletionStrategy(),
    'craftengine.categoryReference': () => new CategoryReferenceCompletionStrategy(),
    // 富文本补全策略（统一 MiniMessage 和翻译键补全）
    'craftengine.richText': () => new RichTextCompletionStrategy(),
    // 向后兼容的别名
    'craftengine.miniMessage': () => new RichTextCompletionStrategy(),
    'craftengine.translationKey': () => new RichTextCompletionStrategy(),
};

/**
 * 统一补全提供者
 *
 * 管理和协调所有补全策略的注册和使用
 */
export class UnifiedCompletionProvider {
    private readonly completionManager: CompletionManager;
    private readonly delegateRegistry: IDelegateStrategyRegistry;
    private readonly logger: ILogger;
    private completionProvider?: BaseCompletionProvider;

    constructor() {
        this.completionManager = ServiceContainer.getService<CompletionManager>(SERVICE_TOKENS.CompletionManager);
        this.delegateRegistry = ServiceContainer.getService<IDelegateStrategyRegistry>(
            SERVICE_TOKENS.DelegateStrategyRegistry,
        );
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild(
            'UnifiedCompletionProvider',
        );
    }

    /**
     * 初始化补全系统
     */
    async initialize(): Promise<void> {
        this.logger.info('Initializing unified completion system');

        this.registerDelegateStrategies();
        this.registerMainStrategies();
        this.completionProvider = new BaseCompletionProvider();

        this.logger.info('Unified completion system initialized', {
            strategies: this.completionManager.getStrategies().map((s) => ({
                name: s.name,
                priority: s.priority,
                triggers: s.triggerCharacters,
            })),
            delegateProviders: this.delegateRegistry.listProviders(),
        });
    }

    /**
     * 注册所有委托策略
     */
    private registerDelegateStrategies(): void {
        for (const [providerId, factory] of Object.entries(DELEGATE_STRATEGIES)) {
            try {
                this.delegateRegistry.registerStrategy(providerId, factory);
                this.logger.debug('Delegate strategy registered', { providerId });
            } catch (error) {
                this.logger.error('Failed to register delegate strategy', error as Error, { providerId });
            }
        }
    }

    /**
     * 注册主补全策略
     */
    private registerMainStrategies(): void {
        const strategies: ICompletionStrategy[] = [
            new SchemaAwareCompletionStrategy(), // 优先级 90
            new SchemaKeyCompletionStrategy(), // 优先级 85
        ];

        for (const strategy of strategies) {
            this.completionManager.registerStrategy(strategy);
            this.logger.info('Main completion strategy registered', {
                name: strategy.name,
                priority: strategy.priority,
                triggerCharacters: strategy.triggerCharacters,
            });
        }
    }

    /**
     * 获取补全提供者
     *
     * @throws Error 如果提供者未初始化
     */
    getProvider(): BaseCompletionProvider {
        if (!this.completionProvider) {
            throw new ServiceNotInitializedError('UnifiedCompletionProvider');
        }
        return this.completionProvider;
    }

    /**
     * 获取所有触发字符
     */
    getTriggerCharacters(): string[] {
        return this.completionManager.getAllTriggerCharacters();
    }

    /**
     * 添加自定义策略
     *
     * @param strategy 自定义补全策略
     */
    addCustomStrategy(strategy: ICompletionStrategy): void {
        this.completionManager.registerStrategy(strategy);
        this.logger.info('Custom strategy added', { name: strategy.name, priority: strategy.priority });
    }

    /**
     * 移除策略
     *
     * @param strategyName 策略名称
     */
    removeStrategy(strategyName: string): void {
        this.completionManager.unregisterStrategy(strategyName);
        this.logger.info('Strategy removed', { name: strategyName });
    }
}
