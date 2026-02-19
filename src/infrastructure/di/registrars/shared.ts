import {
    IDependencyContainer,
    ServiceLifetime
} from '../../../core/interfaces/IDependencyContainer';

/**
 * 服务工厂函数类型
 */
export type ServiceFactory<T> = (container: IDependencyContainer) => T;

/**
 * 服务注册配置
 */
export interface ServiceRegistration<T = unknown> {
    /** 服务令牌 */
    token: symbol;
    /** 工厂函数 */
    factory: ServiceFactory<T>;
    /** 服务生命周期（默认 Singleton） */
    lifetime?: ServiceLifetime;
}

/**
 * 动态导入模块，封装 require 调用以避免循环依赖
 */
export function dynamicImport<T>(modulePath: string): T {
    return require(modulePath) as T;
}

/**
 * 批量注册服务到容器
 */
export function registerServices(
    container: IDependencyContainer,
    registrations: ServiceRegistration[]
): void {
    for (const { token, factory, lifetime = ServiceLifetime.Singleton } of registrations) {
        container.registerFactory(token, factory, lifetime);
    }
}
