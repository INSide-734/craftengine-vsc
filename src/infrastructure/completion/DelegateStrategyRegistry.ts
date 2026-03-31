import { type IDelegateStrategyRegistry } from '../../core/interfaces/IDelegateStrategyRegistry';
import { type ICompletionStrategy } from '../../core/interfaces/ICompletionStrategy';
import { type ILogger } from '../../core/interfaces/ILogger';

/**
 * 委托策略注册表实现
 *
 * 管理所有可委托的补全策略，提供注册、查询和延迟加载功能
 */
export class DelegateStrategyRegistry implements IDelegateStrategyRegistry {
    private readonly strategies = new Map<string, ICompletionStrategy>();
    private readonly strategyFactories = new Map<string, () => ICompletionStrategy>();

    constructor(private readonly logger?: ILogger) {}

    /**
     * 注册委托策略
     *
     * @param providerId 提供者标识符，例如 "craftengine.templateName"
     * @param strategy 补全策略实例或工厂函数
     */
    registerStrategy(providerId: string, strategy: ICompletionStrategy | (() => ICompletionStrategy)): void {
        if (typeof strategy === 'function') {
            // 注册工厂函数，支持延迟加载
            this.strategyFactories.set(providerId, strategy);
            this.logger?.debug('Delegate strategy factory registered', {
                providerId,
            });
        } else {
            // 直接注册策略实例
            this.strategies.set(providerId, strategy);
            this.logger?.debug('Delegate strategy registered', {
                providerId,
                strategyName: strategy.name,
                priority: strategy.priority,
            });
        }
    }

    /**
     * 根据提供者标识符获取策略
     *
     * @param providerId 提供者标识符
     * @returns 策略实例，如果未找到则返回 undefined
     */
    getStrategy(providerId: string): ICompletionStrategy | undefined {
        // 先检查已实例化的策略
        if (this.strategies.has(providerId)) {
            return this.strategies.get(providerId);
        }

        // 检查工厂函数
        if (this.strategyFactories.has(providerId)) {
            try {
                const factory = this.strategyFactories.get(providerId);
                if (!factory) {
                    return undefined;
                }
                const strategy = factory();

                // 缓存实例
                this.strategies.set(providerId, strategy);

                // 移除工厂函数（可选，取决于是否允许重新创建）
                // this.strategyFactories.delete(providerId);

                this.logger?.debug('Delegate strategy instantiated from factory', {
                    providerId,
                    strategyName: strategy.name,
                });

                return strategy;
            } catch (error) {
                this.logger?.error('Failed to instantiate delegate strategy', error as Error, {
                    providerId,
                });
                return undefined;
            }
        }

        this.logger?.warn('Delegate strategy not found', {
            providerId,
            registeredProviders: this.listProviders(),
        });

        return undefined;
    }

    /**
     * 列出所有已注册的提供者标识符
     *
     * @returns 提供者标识符数组
     */
    listProviders(): string[] {
        const providers = new Set<string>();

        // 添加已实例化的策略
        this.strategies.forEach((_, providerId) => providers.add(providerId));

        // 添加工厂函数
        this.strategyFactories.forEach((_, providerId) => providers.add(providerId));

        return Array.from(providers).sort();
    }

    /**
     * 检查提供者是否已注册
     *
     * @param providerId 提供者标识符
     * @returns 如果已注册返回 true
     */
    hasProvider(providerId: string): boolean {
        return this.strategies.has(providerId) || this.strategyFactories.has(providerId);
    }

    /**
     * 取消注册提供者
     *
     * @param providerId 提供者标识符
     */
    unregisterStrategy(providerId: string): void {
        const removed = this.strategies.delete(providerId) || this.strategyFactories.delete(providerId);

        if (removed) {
            this.logger?.debug('Delegate strategy unregistered', { providerId });
        } else {
            this.logger?.warn('Attempt to unregister non-existent provider', { providerId });
        }
    }

    /**
     * 清空所有注册的策略
     */
    clear(): void {
        const count = this.strategies.size + this.strategyFactories.size;
        this.strategies.clear();
        this.strategyFactories.clear();

        this.logger?.debug('Delegate strategy registry cleared', { count });
    }
}
