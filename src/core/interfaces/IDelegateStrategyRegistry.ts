import { type ICompletionStrategy } from './ICompletionStrategy';

/**
 * 委托策略注册表接口
 *
 * 管理所有可委托的补全策略，提供注册和查询功能
 */
export interface IDelegateStrategyRegistry {
    /**
     * 注册委托策略
     *
     * @param providerId 提供者标识符，例如 "craftengine.templateName"
     * @param strategy 补全策略实例或工厂函数
     */
    registerStrategy(providerId: string, strategy: ICompletionStrategy | (() => ICompletionStrategy)): void;

    /**
     * 根据提供者标识符获取策略
     *
     * @param providerId 提供者标识符
     * @returns 策略实例，如果未找到则返回 undefined
     */
    getStrategy(providerId: string): ICompletionStrategy | undefined;

    /**
     * 列出所有已注册的提供者标识符
     *
     * @returns 提供者标识符数组
     */
    listProviders(): string[];

    /**
     * 检查提供者是否已注册
     *
     * @param providerId 提供者标识符
     * @returns 如果已注册返回 true
     */
    hasProvider(providerId: string): boolean;
}
