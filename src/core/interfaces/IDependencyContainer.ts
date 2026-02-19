/**
 * 服务生命周期类型
 */
export enum ServiceLifetime {
    /** 每次获取都创建新实例 */
    Transient = 'transient',
    /** 在同一作用域内共享实例 */
    Scoped = 'scoped',
    /** 全局单例（推荐） */
    Singleton = 'singleton'
}

/**
 * 服务注册描述符
 * @typeParam T - 服务的类型
 */
export interface IServiceDescriptor<T = unknown> {
    /** 服务标识符 */
    token: string | symbol;
    /** 服务实现类或实例 */
    implementation: (new (...args: unknown[]) => T) | T;
    /** 生命周期 */
    lifetime: ServiceLifetime;
    /** 依赖项标识符列表 */
    dependencies?: (string | symbol)[];
}

/**
 * 服务工厂函数类型
 *
 * @typeParam T - 服务的类型
 * @param container - 依赖注入容器，用于解析依赖
 * @returns 服务实例
 */
export type ServiceFactory<T = unknown> = (container: IDependencyContainer) => T;

/**
 * 依赖注入容器接口
 *
 * 提供服务注册、解析和生命周期管理功能。
 */
export interface IDependencyContainer {
    /**
     * 注册服务类
     * @param token - 服务标识符
     * @param implementation - 服务实现类
     * @param lifetime - 服务生命周期，默认 Singleton
     */
    register<T>(
        token: string | symbol,
        implementation: new (...args: unknown[]) => T,
        lifetime?: ServiceLifetime
    ): void;

    /**
     * 注册已创建的服务实例（始终作为 Singleton）
     * @param token - 服务标识符
     * @param instance - 服务实例
     */
    registerInstance<T>(token: string | symbol, instance: T): void;

    /**
     * 使用工厂函数注册服务
     * @param token - 服务标识符
     * @param factory - 工厂函数
     * @param lifetime - 服务生命周期，默认 Singleton
     */
    registerFactory<T>(
        token: string | symbol,
        factory: ServiceFactory<T>,
        lifetime?: ServiceLifetime
    ): void;

    /**
     * 解析服务实例
     * @param token - 服务标识符
     * @returns 服务实例
     * @throws {ServiceNotRegisteredError} 服务未注册时
     * @throws {CircularDependencyError} 检测到循环依赖时
     */
    resolve<T>(token: string | symbol): T;

    /**
     * 尝试解析服务，未注册时返回 undefined（不抛异常）
     * @param token - 服务标识符
     */
    tryResolve<T>(token: string | symbol): T | undefined;

    /**
     * 检查服务是否已注册
     * @param token - 服务标识符
     */
    isRegistered(token: string | symbol): boolean;

    /**
     * 创建子容器，继承父容器的所有注册
     * @returns 新的子容器实例
     */
    createChild(): IDependencyContainer;

    /**
     * 释放容器管理的所有资源
     */
    dispose(): void | Promise<void>;
}
