import {
    ICompletionManager,
    ICompletionStrategy,
    ICompletionContextInfo
} from '../../core/interfaces/ICompletionStrategy';
import { ILogger } from '../../core/interfaces/ILogger';
import { IDataConfigLoader, ICompletionPrioritiesConfig } from '../../core/interfaces/IDataConfigLoader';
import { ServiceContainer } from '../ServiceContainer';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { ServiceNotInitializedError } from '../../core/errors/ExtensionErrors';
import { withTimeout } from '../utils/AsyncUtils';

/**
 * 补全管理器实现
 *
 * 作为补全系统的核心管理器，负责补全策略的注册、管理和协调。
 * 实现策略模式，支持动态注册和卸载补全策略。
 *
 * 支持从 JSON 配置文件动态加载优先级配置
 *
 * @remarks
 * **核心功能**：
 *
 * 1. **策略注册管理**
 *    - 注册新的补全策略
 *    - 卸载不需要的策略
 *    - 防止重复注册
 *    - 记录策略信息
 *
 * 2. **策略激活协调**
 *    - 根据上下文判断哪些策略应该激活
 *    - 按优先级排序激活的策略
 *    - 支持多策略同时激活
 *    - 合并不同策略的补全结果
 *
 * 3. **优先级管理**
 *    - 高优先级策略先执行
 *    - 优先级范围：0-100
 *    - 内置策略优先级规划：
 *      - 90+: Schema 驱动的补全
 *      - 80-89: 模板和变量补全
 *      - 70-79: 路径和文件补全
 *      - 60-69: YAML 键补全
 *      - 0-59: 其他辅助补全
 *
 * 4. **日志记录**
 *    - 记录策略注册/卸载
 *    - 记录策略激活情况
 *    - 记录性能统计
 *
 * **使用场景**：
 * - UnifiedCompletionProvider 使用它管理所有策略
 * - 扩展激活时注册内置策略
 * - 插件系统可动态添加新策略
 *
 * **设计模式**：
 * - 策略模式：动态选择补全算法
 * - 注册表模式：集中管理策略实例
 * - 责任链模式：按优先级依次尝试策略
 *
 * @example
 * ```typescript
 * // 创建管理器
 * const manager = new CompletionManager(logger);
 *
 * // 注册策略
 * manager.registerStrategy(new TemplateCompletionStrategy());
 * manager.registerStrategy(new VariableCompletionStrategy());
 * manager.registerStrategy(new PathCompletionStrategy());
 *
 * // 获取激活的策略
 * const context: ICompletionContextInfo = {
 *     document,
 *     position,
 *     linePrefix: 'template: ',
 *     // ...
 * };
 *
 * const activeStrategies = await manager.getActiveStrategies(context);
 * console.log(`${activeStrategies.length} strategies activated`);
 *
 * // 策略按优先级排序，可以依次调用
 * for (const strategy of activeStrategies) {
 *     const result = await strategy.provideCompletionItems(context);
 *     if (result) {
 *         // 处理补全结果
 *     }
 * }
 *
 * // 卸载策略
 * manager.unregisterStrategy('template');
 * ```
 */
export class CompletionManager implements ICompletionManager {
    /** 策略注册表：策略名 -> 策略实例 */
    private readonly strategies = new Map<string, ICompletionStrategy>();

    /** 配置加载器 */
    private configLoader: IDataConfigLoader | null = null;

    /** 配置缓存 */
    private prioritiesConfig: ICompletionPrioritiesConfig | null = null;
    private configLoaded = false;
    private configLoadPromise: Promise<void> | null = null;

    /** 单个策略激活检查超时（毫秒） */
    private readonly activationTimeoutMs: number;
    /** 所有策略激活检查总超时（毫秒） */
    private readonly totalActivationTimeoutMs: number;

    /**
     * 构造补全管理器实例
     *
     * @param logger - 日志记录器（可选），用于记录管理操作
     */
    constructor(
        private readonly logger?: ILogger,
        config?: { activationTimeoutMs?: number; totalActivationTimeoutMs?: number }
    ) {
        this.activationTimeoutMs = config?.activationTimeoutMs ?? 50;
        this.totalActivationTimeoutMs = config?.totalActivationTimeoutMs ?? 100;
    }

    /**
     * 获取配置加载器（延迟初始化）
     */
    private getConfigLoader(): IDataConfigLoader {
        if (!this.configLoader) {
            this.configLoader = ServiceContainer.getService<IDataConfigLoader>(
                SERVICE_TOKENS.DataConfigLoader
            );
        }
        return this.configLoader;
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
        this.prioritiesConfig = await this.getConfigLoader().loadCompletionPrioritiesConfig();
        this.configLoaded = true;
        this.logger?.debug('Completion priorities config loaded from JSON');
    }

    /**
     * 获取策略优先级
     *
     * @param strategyKey 策略键名
     * @param isDelegate 是否是委托策略
     * @returns 优先级数值
     */
    getStrategyPriority(strategyKey: string, isDelegate = false): number {
        if (!this.prioritiesConfig) {
            throw new ServiceNotInitializedError('CompletionManager');
        }
        const strategies = isDelegate
            ? this.prioritiesConfig.strategies.delegates
            : this.prioritiesConfig.strategies.main;
        const strategy = strategies[strategyKey];
        if (strategy) {
            return strategy.priority;
        }
        // 返回默认优先级
        return isDelegate ? 75 : 85;
    }

    /**
     * 获取优先级计算配置
     */
    getPriorityCalculation(): { baseValue: number; adjustments: Record<string, number> } {
        if (!this.prioritiesConfig) {
            throw new ServiceNotInitializedError('CompletionManager');
        }
        return this.prioritiesConfig.priorityCalculation;
    }

    /**
     * 获取排序顺序配置
     */
    getSortOrder(): Record<string, number> {
        if (!this.prioritiesConfig) {
            throw new ServiceNotInitializedError('CompletionManager');
        }
        return this.prioritiesConfig.sortOrder;
    }

    /**
     * 初始化管理器（预加载配置）
     */
    async initialize(): Promise<void> {
        await this.ensureConfigLoaded();
    }

    /**
     * 注册补全策略
     *
     * 将新的补全策略添加到管理器中，使其可以被激活和使用。
     *
     * @param strategy - 要注册的补全策略实例
     *
     * @remarks
     * - 如果策略名称已存在，会记录警告但不替换
     * - 策略注册后立即可用
     * - 建议在扩展激活时注册所有策略
     *
     * @example
     * ```typescript
     * const strategy = new TemplateCompletionStrategy();
     * manager.registerStrategy(strategy);
     * ```
     */
    registerStrategy(strategy: ICompletionStrategy): void {
        if (this.strategies.has(strategy.name)) {
            this.logger?.warn('Completion strategy already registered', {
                strategyName: strategy.name
            });
            return;
        }

        this.strategies.set(strategy.name, strategy);

        this.logger?.debug('Completion strategy registered', {
            strategyName: strategy.name,
            priority: strategy.priority,
            triggerCharacters: strategy.triggerCharacters
        });
    }
    
    /**
     * 取消注册补全策略
     */
    unregisterStrategy(strategyName: string): void {
        if (!this.strategies.has(strategyName)) {
            this.logger?.warn('Completion strategy not found for unregistration', {
                strategyName
            });
            return;
        }
        
        this.strategies.delete(strategyName);
        
        this.logger?.debug('Completion strategy unregistered', {
            strategyName
        });
    }
    
    /**
     * 获取所有注册的策略
     */
    getStrategies(): ICompletionStrategy[] {
        return Array.from(this.strategies.values());
    }
    
    /**
     * 根据上下文获取激活的策略
     *
     * 并行检查所有策略的 shouldActivate() 方法，带超时保护以提高性能和稳定性
     *
     * @param context 补全上下文
     * @returns 激活的策略列表（按优先级从高到低排序）
     */
    async getActiveStrategies(context: ICompletionContextInfo): Promise<ICompletionStrategy[]> {
        const strategies = Array.from(this.strategies.values());

        // 并行检查所有策略是否应该激活，带超时保护
        const activationResults = await withTimeout(
            Promise.all(
                strategies.map(async (strategy) => {
                    try {
                        // 单个策略激活检查带超时
                        const shouldActivate = await withTimeout(
                            Promise.resolve(strategy.shouldActivate(context)),
                            this.activationTimeoutMs,
                            `Strategy ${strategy.name} activation timeout`
                        );
                        return { strategy, shouldActivate };
                    } catch (error) {
                        // 超时或其他错误，记录并跳过该策略
                        this.logger?.warn('Strategy activation check failed', {
                            strategyName: strategy.name,
                            error: error instanceof Error ? error.message : String(error)
                        });
                        return { strategy, shouldActivate: false };
                    }
                })
            ),
            this.totalActivationTimeoutMs,
            'Total completion activation timeout'
        ).catch((error) => {
            // 总超时，返回空数组
            this.logger?.warn('Completion activation timed out', {
                error: error instanceof Error ? error.message : String(error)
            });
            return strategies.map(strategy => ({ strategy, shouldActivate: false }));
        });

        // 过滤出激活的策略
        const activeStrategies = activationResults
            .filter(result => result.shouldActivate)
            .map(result => {
                this.logger?.debug('Completion strategy activated', {
                    strategyName: result.strategy.name,
                    position: `${context.position.line}:${context.position.character}`
                });
                return result.strategy;
            });

        // 按优先级排序（从高到低）
        activeStrategies.sort((a, b) => b.priority - a.priority);

        this.logger?.debug('Active completion strategies determined', {
            count: activeStrategies.length,
            strategies: activeStrategies.map(s => s.name)
        });

        return activeStrategies;
    }
    
    /**
     * 获取所有触发字符
     */
    getAllTriggerCharacters(): string[] {
        const triggerChars = new Set<string>();
        
        for (const strategy of this.strategies.values()) {
            for (const char of strategy.triggerCharacters) {
                triggerChars.add(char);
            }
        }
        
        return Array.from(triggerChars);
    }
}

