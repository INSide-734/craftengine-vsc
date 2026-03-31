import type { ExtensionContext } from 'vscode';
import { type IDependencyContainer } from '../core/interfaces/IDependencyContainer';
import { type ILogger } from '../core/interfaces/ILogger';
import { SERVICE_TOKENS } from '../core/constants/ServiceTokens';
import { ServiceNotInitializedError } from '../core/errors/ExtensionErrors';
import { DependencyContainer } from './index';
import {
    registerLoggingServices,
    registerConfigurationServices,
    registerEventServices,
    registerPerformanceServices,
    registerInfrastructureServices,
    registerDataServices,
    registerDomainServices,
    registerCompletionServices,
    registerApplicationServices,
    initializeServices,
} from './di/registrars';

// ============================================
// 服务容器管理器
// ============================================

/**
 * 服务容器管理器
 *
 * 作为应用程序的依赖注入容器管理器，负责初始化、注册和管理所有服务实例。
 * 使用单例模式确保全局只有一个容器实例。
 *
 * ## 核心职责
 *
 * - **生命周期管理**：管理服务的单例、瞬态、作用域生命周期
 * - **依赖解析**：自动解析和注入依赖关系
 * - **延迟加载**：支持服务的延迟初始化
 * - **统一访问**：提供统一的服务访问接口
 *
 * ## 服务注册顺序
 *
 * 服务按依赖关系分层注册，确保依赖项在使用前已注册：
 *
 * ```
 * 1. 日志服务      ─────────────────────────────────┐
 * 2. 配置服务      ← 依赖日志                        │
 * 3. 事件总线      ← 依赖日志                        │ 基础设施层
 * 4. 性能监控      ← 依赖日志、事件总线               │
 * 5. 基础设施服务  ← 依赖日志                        ┘
 * 6. 领域服务      ← 依赖基础设施服务                 ─ 领域层
 * 7. 补全服务      ← 依赖日志                        ─ 表现层
 * 8. 应用服务      ← 依赖领域服务、基础设施服务        ─ 应用层
 * ```
 *
 * @example
 * ```typescript
 * // 初始化容器（在扩展激活时）
 * const container = await ServiceContainer.initialize(context);
 *
 * // 获取服务实例
 * const logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger);
 * logger.info('Application started');
 *
 * // 清理容器（在扩展停用时）
 * await ServiceContainer.dispose();
 * ```
 */
export class ServiceContainer {
    /** 单例容器实例 */
    private static instance: IDependencyContainer | null = null;

    /** VSCode 扩展上下文 */
    private static context: ExtensionContext | null = null;

    // ========================================
    // 公共 API
    // ========================================

    /**
     * 初始化服务容器
     *
     * 创建容器实例并注册所有服务。此方法应在扩展激活时调用一次。
     *
     * @param context - VSCode 扩展上下文
     * @returns 初始化完成的依赖注入容器实例
     * @throws {Error} 如果服务注册或初始化失败
     */
    public static async initialize(context: ExtensionContext): Promise<IDependencyContainer> {
        if (ServiceContainer.instance) {
            return ServiceContainer.instance;
        }

        ServiceContainer.context = context;
        ServiceContainer.instance = new DependencyContainer();

        try {
            await ServiceContainer.registerAllServices();
            await initializeServices(ServiceContainer.instance);

            const logger = ServiceContainer.instance.resolve<ILogger>(SERVICE_TOKENS.Logger);
            logger.info('Service container initialized successfully');
            return ServiceContainer.instance;
        } catch (error) {
            // Logger 可能尚未注册，使用 console
            // eslint-disable-next-line no-console
            console.error('Failed to initialize service container:', error);
            throw error;
        }
    }

    /**
     * 获取当前容器实例
     *
     * @returns 依赖注入容器实例
     * @throws {ServiceNotInitializedError} 如果容器未初始化
     */
    public static getInstance(): IDependencyContainer {
        if (!ServiceContainer.instance) {
            throw new ServiceNotInitializedError('ServiceContainer');
        }
        return ServiceContainer.instance;
    }

    /**
     * 清理服务容器
     *
     * 释放所有服务资源并重置容器状态。此方法应在扩展停用时调用。
     */
    public static async dispose(): Promise<void> {
        if (ServiceContainer.instance) {
            await ServiceContainer.instance.dispose();
            ServiceContainer.instance = null;
            ServiceContainer.context = null;
        }
    }

    /**
     * 获取服务实例
     *
     * @template T - 服务类型
     * @param token - 服务令牌
     * @returns 服务实例
     * @throws {Error} 如果服务未注册或容器未初始化
     */
    public static getService<T>(token: string | symbol): T {
        return ServiceContainer.getInstance().resolve<T>(token);
    }

    /**
     * 尝试获取服务实例（不抛出异常）
     *
     * @template T - 服务类型
     * @param token - 服务令牌
     * @returns 服务实例，如果获取失败则返回 undefined
     */
    public static tryGetService<T>(token: string | symbol): T | undefined {
        try {
            return ServiceContainer.getInstance().tryResolve<T>(token);
        } catch {
            return undefined;
        }
    }

    /**
     * 检查服务是否已注册
     *
     * @param token - 服务令牌
     * @returns 如果服务已注册则返回 true
     */
    public static hasService(token: string | symbol): boolean {
        try {
            return ServiceContainer.getInstance().isRegistered(token);
        } catch {
            return false;
        }
    }

    // ========================================
    // 服务注册编排
    // ========================================

    /**
     * 注册所有服务
     *
     * 按照依赖关系的顺序注册所有服务模块。
     * 注册顺序至关重要，必须确保依赖项在使用前已注册。
     */
    private static async registerAllServices(): Promise<void> {
        if (!ServiceContainer.instance) {
            throw new Error('ServiceContainer instance not initialized');
        }
        const container = ServiceContainer.instance;

        // 第一阶段：核心基础设施（无依赖或仅依赖外部资源）
        registerLoggingServices(container, ServiceContainer.context);
        registerConfigurationServices(container);
        registerEventServices(container);
        registerPerformanceServices(container);

        // 第二阶段：基础设施服务（依赖核心服务）
        registerInfrastructureServices(container);

        // 第二阶段b：数据服务（依赖日志服务）
        registerDataServices(container);

        // 第三阶段：领域服务（依赖基础设施服务）
        registerDomainServices(container);

        // 第四阶段：补全系统（依赖日志服务）
        registerCompletionServices(container);

        // 第五阶段：应用服务（依赖领域和基础设施服务）
        registerApplicationServices(container);
    }
}
