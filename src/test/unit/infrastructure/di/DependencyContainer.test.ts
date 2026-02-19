/**
 * DependencyContainer 单元测试
 * 
 * 测试依赖注入容器的所有功能，包括：
 * - 服务注册（类、实例、工厂）
 * - 服务解析
 * - 生命周期管理（单例、瞬态）
 * - 循环依赖检测
 * - 子容器
 * - 资源清理
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DependencyContainer } from '../../../../infrastructure/di/DependencyContainer';
import { ServiceLifetime } from '../../../../core/interfaces/IDependencyContainer';
import { 
    ServiceNotRegisteredError, 
    CircularDependencyError 
} from '../../../../core/errors/ExtensionErrors';

describe('DependencyContainer', () => {
    let container: DependencyContainer;

    beforeEach(() => {
        container = new DependencyContainer();
    });

    describe('registerInstance', () => {
        it('should register and resolve instance', () => {
            const instance = { value: 42 };
            const token = Symbol('TestService');

            container.registerInstance(token, instance);
            const resolved = container.resolve<typeof instance>(token);

            expect(resolved).toBe(instance);
        });

        it('should always return the same instance', () => {
            const instance = { value: 42 };
            const token = Symbol('TestService');

            container.registerInstance(token, instance);
            const resolved1 = container.resolve(token);
            const resolved2 = container.resolve(token);

            expect(resolved1).toBe(resolved2);
            expect(resolved1).toBe(instance);
        });

        it('should support string tokens', () => {
            const instance = { name: 'test' };
            container.registerInstance('stringToken', instance);

            expect(container.resolve('stringToken')).toBe(instance);
        });

        it('should support symbol tokens', () => {
            const instance = { name: 'test' };
            const token = Symbol('symbolToken');
            container.registerInstance(token, instance);

            expect(container.resolve(token)).toBe(instance);
        });
    });

    describe('registerFactory', () => {
        it('should resolve using factory function', () => {
            const token = Symbol('FactoryService');
            const factory = vi.fn(() => ({ created: true }));

            container.registerFactory(token, factory);
            const resolved = container.resolve(token);

            expect(resolved).toEqual({ created: true });
            expect(factory).toHaveBeenCalledWith(container);
        });

        it('should call factory each time for transient lifetime', () => {
            const token = Symbol('TransientService');
            let callCount = 0;
            const factory = () => ({ id: ++callCount });

            container.registerFactory(token, factory, ServiceLifetime.Transient);

            const resolved1 = container.resolve<{ id: number }>(token);
            const resolved2 = container.resolve<{ id: number }>(token);

            expect(resolved1.id).toBe(1);
            expect(resolved2.id).toBe(2);
            expect(resolved1).not.toBe(resolved2);
        });

        it('should cache factory result for singleton lifetime', () => {
            const token = Symbol('SingletonService');
            let callCount = 0;
            const factory = () => ({ id: ++callCount });

            container.registerFactory(token, factory, ServiceLifetime.Singleton);

            const resolved1 = container.resolve<{ id: number }>(token);
            const resolved2 = container.resolve<{ id: number }>(token);

            expect(resolved1.id).toBe(1);
            expect(resolved2.id).toBe(1);
            expect(resolved1).toBe(resolved2);
        });

        it('should pass container to factory for dependency resolution', () => {
            const depToken = Symbol('Dependency');
            const serviceToken = Symbol('Service');

            container.registerInstance(depToken, { depValue: 'dependency' });
            container.registerFactory(serviceToken, (c) => ({
                dependency: c.resolve(depToken),
            }));

            const resolved = container.resolve<{ dependency: { depValue: string } }>(serviceToken);

            expect(resolved.dependency).toEqual({ depValue: 'dependency' });
        });
    });

    describe('register', () => {
        it('should register class and create instance on resolve', () => {
            class TestClass {
                value = 'test';
            }
            const token = Symbol('TestClass');

            container.register(token, TestClass);
            const resolved = container.resolve<TestClass>(token);

            expect(resolved).toBeInstanceOf(TestClass);
            expect(resolved.value).toBe('test');
        });

        it('should create new instance each time for transient lifetime', () => {
            class TestClass {
                id = Math.random();
            }
            const token = Symbol('TransientClass');

            container.register(token, TestClass, ServiceLifetime.Transient);

            const resolved1 = container.resolve<TestClass>(token);
            const resolved2 = container.resolve<TestClass>(token);

            expect(resolved1).not.toBe(resolved2);
            expect(resolved1.id).not.toBe(resolved2.id);
        });

        it('should reuse instance for singleton lifetime', () => {
            class TestClass {
                id = Math.random();
            }
            const token = Symbol('SingletonClass');

            container.register(token, TestClass, ServiceLifetime.Singleton);

            const resolved1 = container.resolve<TestClass>(token);
            const resolved2 = container.resolve<TestClass>(token);

            expect(resolved1).toBe(resolved2);
        });

        it('should use transient as default lifetime', () => {
            class TestClass {
                id = Math.random();
            }
            const token = Symbol('DefaultClass');

            container.register(token, TestClass);

            const resolved1 = container.resolve<TestClass>(token);
            const resolved2 = container.resolve<TestClass>(token);

            expect(resolved1).not.toBe(resolved2);
        });
    });

    describe('resolve', () => {
        it('should throw ServiceNotRegisteredError for unregistered service', () => {
            const token = Symbol('UnregisteredService');

            expect(() => container.resolve(token)).toThrow(ServiceNotRegisteredError);
        });

        it('should include service name in error message', () => {
            const token = Symbol('MyService');

            try {
                container.resolve(token);
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(ServiceNotRegisteredError);
                expect((error as Error).message).toContain('MyService');
            }
        });
    });

    describe('tryResolve', () => {
        it('should return undefined for unregistered service', () => {
            const token = Symbol('UnregisteredService');

            const resolved = container.tryResolve(token);

            expect(resolved).toBeUndefined();
        });

        it('should return service for registered service', () => {
            const token = Symbol('RegisteredService');
            container.registerInstance(token, { value: 42 });

            const resolved = container.tryResolve(token);

            expect(resolved).toEqual({ value: 42 });
        });

        it('should not throw for unregistered service', () => {
            const token = Symbol('UnregisteredService');

            expect(() => container.tryResolve(token)).not.toThrow();
        });
    });

    describe('isRegistered', () => {
        it('should return true for registered service', () => {
            const token = Symbol('RegisteredService');
            container.registerInstance(token, {});

            expect(container.isRegistered(token)).toBe(true);
        });

        it('should return false for unregistered service', () => {
            const token = Symbol('UnregisteredService');

            expect(container.isRegistered(token)).toBe(false);
        });
    });

    describe('circular dependency detection', () => {
        it('should detect direct circular dependency', () => {
            const tokenA = Symbol('ServiceA');
            const tokenB = Symbol('ServiceB');

            // A 依赖 B，B 依赖 A
            container.registerFactory(tokenA, (c) => ({
                b: c.resolve(tokenB),
            }));
            container.registerFactory(tokenB, (c) => ({
                a: c.resolve(tokenA),
            }));

            expect(() => container.resolve(tokenA)).toThrow(CircularDependencyError);
        });

        it('should detect indirect circular dependency', () => {
            const tokenA = Symbol('ServiceA');
            const tokenB = Symbol('ServiceB');
            const tokenC = Symbol('ServiceC');

            // A -> B -> C -> A
            container.registerFactory(tokenA, (c) => ({ b: c.resolve(tokenB) }));
            container.registerFactory(tokenB, (c) => ({ c: c.resolve(tokenC) }));
            container.registerFactory(tokenC, (c) => ({ a: c.resolve(tokenA) }));

            expect(() => container.resolve(tokenA)).toThrow(CircularDependencyError);
        });

        it('should include dependency chain in error', () => {
            const tokenA = Symbol('ServiceA');
            const tokenB = Symbol('ServiceB');

            container.registerFactory(tokenA, (c) => ({ b: c.resolve(tokenB) }));
            container.registerFactory(tokenB, (c) => ({ a: c.resolve(tokenA) }));

            try {
                container.resolve(tokenA);
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(CircularDependencyError);
                const message = (error as Error).message;
                expect(message).toContain('ServiceA');
                expect(message).toContain('ServiceB');
            }
        });
    });

    describe('createChild', () => {
        it('should create child container with parent registrations', () => {
            const token = Symbol('ParentService');
            container.registerInstance(token, { source: 'parent' });

            const child = container.createChild();

            expect(child.resolve(token)).toEqual({ source: 'parent' });
        });

        it('should allow child to override parent registration', () => {
            const token = Symbol('SharedService');
            container.registerInstance(token, { source: 'parent' });

            const child = container.createChild();
            // Mock console.warn 以抑制预期的 override 警告
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            child.registerInstance(token, { source: 'child' });
            warnSpy.mockRestore();

            expect(container.resolve(token)).toEqual({ source: 'parent' });
            expect(child.resolve(token)).toEqual({ source: 'child' });
        });

        it('should share singleton instances from parent', () => {
            const token = Symbol('SingletonService');
            container.registerFactory(token, () => ({ id: Math.random() }), ServiceLifetime.Singleton);

            // 首先在父容器中解析
            const parentInstance = container.resolve(token);

            const child = container.createChild();
            const childInstance = child.resolve(token);

            expect(childInstance).toBe(parentInstance);
        });

        it('should not affect parent when child is disposed', () => {
            const token = Symbol('Service');
            container.registerInstance(token, { value: 42 });

            const child = container.createChild();
            child.dispose();

            expect(container.resolve(token)).toEqual({ value: 42 });
        });

        it('should isolate dependencies array between parent and child', () => {
            const token = Symbol('Service');
            const depToken = Symbol('Dep');

            // 注册一个带依赖的服务
            container.registerFactory(token, () => ({ value: 'test' }));

            const child = container.createChild();

            // 在子容器中注册新的依赖不应影响父容器的描述符
            child.registerInstance(depToken, { dep: true });

            // 父容器应该不受影响
            expect(container.isRegistered(depToken)).toBe(false);
        });
    });

    describe('dispose', () => {
        it('should dispose all registered instances with dispose method', () => {
            const token = Symbol('DisposableService');
            const disposeFn = vi.fn();
            const instance = { dispose: disposeFn };

            container.registerInstance(token, instance);
            container.dispose();

            expect(disposeFn).toHaveBeenCalled();
        });

        it('should clear all registrations', () => {
            const token = Symbol('Service');
            container.registerInstance(token, {});

            container.dispose();

            expect(() => container.resolve(token)).toThrow();
        });

        it('should handle dispose errors gracefully', () => {
            const token = Symbol('FailingService');
            const instance = {
                dispose: () => {
                    throw new Error('Dispose failed');
                },
            };

            container.registerInstance(token, instance);

            // Mock console.warn 以抑制预期的错误日志
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            // 应该不抛出异常
            expect(() => container.dispose()).not.toThrow();

            // 验证 warn 被调用
            expect(warnSpy).toHaveBeenCalledWith('Error disposing service instance:', expect.any(Error));

            warnSpy.mockRestore();
        });

        it('should be idempotent', async () => {
            const token = Symbol('Service');
            const disposeFn = vi.fn();
            container.registerInstance(token, { dispose: disposeFn });

            await container.dispose();
            await container.dispose();

            expect(disposeFn).toHaveBeenCalledTimes(1);
        });

        it('should throw on operations after dispose', () => {
            container.dispose();

            expect(() => container.registerInstance(Symbol('test'), {})).toThrow();
            expect(() => container.resolve(Symbol('test'))).toThrow();
        });
    });

    describe('service override', () => {
        it('should allow overriding existing registration', () => {
            const token = Symbol('Service');
            // Mock console.warn 以抑制预期的 override 警告
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            container.registerInstance(token, { version: 1 });
            container.registerInstance(token, { version: 2 });

            expect(container.resolve(token)).toEqual({ version: 2 });
            warnSpy.mockRestore();
        });

        it('should allow replacing instance with factory', () => {
            const token = Symbol('Service');
            // Mock console.warn 以抑制预期的 override 警告
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            container.registerInstance(token, { type: 'instance' });
            container.registerFactory(token, () => ({ type: 'factory' }));

            expect(container.resolve(token)).toEqual({ type: 'factory' });
            warnSpy.mockRestore();
        });

        it('should warn when overriding existing registration via registerInstance', () => {
            const token = Symbol('Service');
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            container.registerInstance(token, { version: 1 });
            container.registerInstance(token, { version: 2 });

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Service override detected')
            );
            warnSpy.mockRestore();
        });

        it('should warn when overriding existing registration via register', () => {
            class TestClass { value = 'test'; }
            const token = Symbol('Service');
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            container.register(token, TestClass);
            container.register(token, TestClass);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Service override detected')
            );
            warnSpy.mockRestore();
        });

        it('should warn when overriding existing registration via registerFactory', () => {
            const token = Symbol('Service');
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            container.registerFactory(token, () => ({ v: 1 }));
            container.registerFactory(token, () => ({ v: 2 }));

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Service override detected')
            );
            warnSpy.mockRestore();
        });
    });

    describe('complex scenarios', () => {
        it('should support deep dependency chains', () => {
            const tokenA = Symbol('A');
            const tokenB = Symbol('B');
            const tokenC = Symbol('C');
            const tokenD = Symbol('D');

            container.registerInstance(tokenD, { value: 'd' });
            container.registerFactory(tokenC, (c) => ({
                d: c.resolve(tokenD),
                value: 'c',
            }));
            container.registerFactory(tokenB, (c) => ({
                c: c.resolve(tokenC),
                value: 'b',
            }));
            container.registerFactory(tokenA, (c) => ({
                b: c.resolve(tokenB),
                value: 'a',
            }));

            const resolved = container.resolve(tokenA) as any;

            expect(resolved.value).toBe('a');
            expect(resolved.b.value).toBe('b');
            expect(resolved.b.c.value).toBe('c');
            expect(resolved.b.c.d.value).toBe('d');
        });

        it('should support multiple dependencies', () => {
            const token1 = Symbol('Dep1');
            const token2 = Symbol('Dep2');
            const token3 = Symbol('Dep3');
            const serviceToken = Symbol('Service');

            container.registerInstance(token1, { name: 'dep1' });
            container.registerInstance(token2, { name: 'dep2' });
            container.registerInstance(token3, { name: 'dep3' });
            container.registerFactory(serviceToken, (c) => ({
                dep1: c.resolve(token1),
                dep2: c.resolve(token2),
                dep3: c.resolve(token3),
            }));

            const resolved = container.resolve(serviceToken) as any;

            expect(resolved.dep1.name).toBe('dep1');
            expect(resolved.dep2.name).toBe('dep2');
            expect(resolved.dep3.name).toBe('dep3');
        });

        it('should resolve shared singleton correctly in diamond dependency', () => {
            const sharedToken = Symbol('Shared');
            const leftToken = Symbol('Left');
            const rightToken = Symbol('Right');
            const topToken = Symbol('Top');

            let sharedCreateCount = 0;
            container.registerFactory(sharedToken, () => ({
                id: ++sharedCreateCount,
            }), ServiceLifetime.Singleton);

            container.registerFactory(leftToken, (c) => ({
                shared: c.resolve(sharedToken),
            }));
            container.registerFactory(rightToken, (c) => ({
                shared: c.resolve(sharedToken),
            }));
            container.registerFactory(topToken, (c) => ({
                left: c.resolve(leftToken),
                right: c.resolve(rightToken),
            }));

            const resolved = container.resolve(topToken) as any;

            // 共享的单例应该只创建一次
            expect(sharedCreateCount).toBe(1);
            expect(resolved.left.shared).toBe(resolved.right.shared);
        });
    });
});

