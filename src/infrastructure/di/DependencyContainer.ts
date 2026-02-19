import { 
    IDependencyContainer, 
    ServiceLifetime, 
    ServiceFactory 
} from '../../core/interfaces/IDependencyContainer';
import { 
    DependencyInjectionError, 
    ServiceNotRegisteredError, 
    CircularDependencyError 
} from '../../core/errors/ExtensionErrors';

/**
 * 服务描述符
 */
interface ServiceDescriptor {
    token: string | symbol;
    implementation?: new (...args: unknown[]) => unknown;
    instance?: unknown;
    factory?: ServiceFactory;
    lifetime: ServiceLifetime;
    dependencies: (string | symbol)[];
}

/**
 * 依赖注入容器实现
 */
export class DependencyContainer implements IDependencyContainer {
    private readonly services = new Map<string | symbol, ServiceDescriptor>();
    private readonly instances = new Map<string | symbol, unknown>();
    private readonly resolutionStack: (string | symbol)[] = [];
    private readonly registrationOrder: (string | symbol)[] = [];
    private disposed = false;

    /**
     * 注册服务
     */
    register<T>(
        token: string | symbol,
        implementation: new (...args: unknown[]) => T,
        lifetime: ServiceLifetime = ServiceLifetime.Transient
    ): void {
        this.ensureNotDisposed();

        // 检测服务覆盖
        if (this.services.has(token)) {
            console.warn(`[DependencyContainer] Service override detected: ${this.getTokenName(token)}`);
        }

        this.services.set(token, {
            token,
            implementation,
            lifetime,
            dependencies: []
        });
        this.registrationOrder.push(token);
    }

    /**
     * 注册服务实例
     */
    registerInstance<T>(token: string | symbol, instance: T): void {
        this.ensureNotDisposed();

        // 检测服务覆盖
        if (this.services.has(token)) {
            console.warn(`[DependencyContainer] Service override detected: ${this.getTokenName(token)}`);
        }

        this.services.set(token, {
            token,
            instance,
            lifetime: ServiceLifetime.Singleton,
            dependencies: []
        });

        this.instances.set(token, instance);
        this.registrationOrder.push(token);
    }

    /**
     * 注册服务工厂
     */
    registerFactory<T>(
        token: string | symbol,
        factory: ServiceFactory<T>,
        lifetime: ServiceLifetime = ServiceLifetime.Transient
    ): void {
        this.ensureNotDisposed();

        // 检测服务覆盖
        if (this.services.has(token)) {
            console.warn(`[DependencyContainer] Service override detected: ${this.getTokenName(token)}`);
        }

        this.services.set(token, {
            token,
            factory,
            lifetime,
            dependencies: []
        });
        this.registrationOrder.push(token);
    }

    /**
     * 解析服务
     */
    resolve<T>(token: string | symbol): T {
        this.ensureNotDisposed();
        
        const service = this.tryResolve<T>(token);
        if (service === undefined) {
            throw new ServiceNotRegisteredError(
                this.getTokenName(token),
                { token: token.toString() }
            );
        }
        
        return service;
    }

    /**
     * 尝试解析服务
     */
    tryResolve<T>(token: string | symbol): T | undefined {
        this.ensureNotDisposed();
        
        if (!this.isRegistered(token)) {
            return undefined;
        }

        // 检查循环依赖
        if (this.resolutionStack.includes(token)) {
            const cycle = [...this.resolutionStack, token].map(t => this.getTokenName(t));
            throw new CircularDependencyError(cycle);
        }

        const descriptor = this.services.get(token)!;
        
        // 单例模式检查
        if (descriptor.lifetime === ServiceLifetime.Singleton && this.instances.has(token)) {
            return this.instances.get(token) as T | undefined;
        }

        this.resolutionStack.push(token);

        try {
            let instance: T;

            if (descriptor.instance) {
                instance = descriptor.instance as T;
            } else if (descriptor.factory) {
                instance = descriptor.factory(this) as T;
            } else if (descriptor.implementation) {
                // 解析依赖项
                const dependencies = descriptor.dependencies.map(dep => this.resolve(dep));
                instance = new descriptor.implementation(...dependencies) as T;
            } else {
                throw new DependencyInjectionError(
                    `No implementation found for service: ${this.getTokenName(token)}`
                );
            }

            // 缓存单例实例
            if (descriptor.lifetime === ServiceLifetime.Singleton) {
                this.instances.set(token, instance);
            }

            return instance;
        } finally {
            this.resolutionStack.pop();
        }
    }

    /**
     * 检查服务是否已注册
     */
    isRegistered(token: string | symbol): boolean {
        return this.services.has(token);
    }

    /**
     * 创建子容器
     */
    createChild(): IDependencyContainer {
        const child = new DependencyContainer();
        
        // 复制父容器的服务注册（深拷贝 dependencies 数组，避免子容器修改影响父容器）
        for (const [token, descriptor] of this.services) {
            child.services.set(token, { ...descriptor, dependencies: [...descriptor.dependencies] });
        }
        
        // 复制父容器的单例实例
        for (const [token, instance] of this.instances) {
            child.instances.set(token, instance);
        }
        
        return child;
    }

    /**
     * 清理资源
     */
    async dispose(): Promise<void> {
        if (this.disposed) {
            return;
        }

        // 按注册的反向顺序清理，确保基础服务（Logger、EventBus）最后销毁
        for (let i = this.registrationOrder.length - 1; i >= 0; i--) {
            const token = this.registrationOrder[i];
            const instance = this.instances.get(token);
            if (instance && typeof (instance as Record<string, unknown>).dispose === 'function') {
                try {
                    await (instance as { dispose(): Promise<void> | void }).dispose();
                } catch (error) {
                    // dispose 阶段 Logger 可能已销毁，使用 console
                    console.warn('Error disposing service instance:', error);
                }
            }
        }

        this.services.clear();
        this.instances.clear();
        this.registrationOrder.length = 0;
        this.resolutionStack.length = 0;
        this.disposed = true;
    }

    /**
     * 获取令牌名称
     */
    private getTokenName(token: string | symbol): string {
        return typeof token === 'symbol' ? token.description || token.toString() : token;
    }

    /**
     * 确保容器未被释放
     */
    private ensureNotDisposed(): void {
        if (this.disposed) {
            throw new DependencyInjectionError('Container has been disposed');
        }
    }
}
