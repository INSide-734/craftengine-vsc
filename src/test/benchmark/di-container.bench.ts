/**
 * 依赖注入容器性能测试
 * 
 * 测试 DependencyContainer 在不同场景下的性能表现
 */
import { describe, bench } from 'vitest';
import { DependencyContainer } from '../../infrastructure/di/DependencyContainer';
import { ServiceLifetime } from '../../core/interfaces/IDependencyContainer';
import { defaultBenchOptions, fastBenchOptions } from './bench-options';

// ========================================
// 测试服务类
// ========================================

class SimpleService {
    readonly id = Math.random();
}

// 生成唯一的 Symbol
let tokenCounter = 0;
function createToken(name: string): symbol {
    return Symbol.for(`benchmark.${name}.${++tokenCounter}`);
}

describe('DependencyContainer Performance', () => {
    // ========================================
    // 服务注册测试
    // ========================================

    describe('Service Registration', () => {
        bench('register single instance', () => {
            const container = new DependencyContainer();
            const token = createToken('simple');
            container.registerInstance(token, new SimpleService());
            container.dispose();
        }, defaultBenchOptions);

        bench('register 10 instances', () => {
            const container = new DependencyContainer();
            for (let i = 0; i < 10; i++) {
                const token = createToken(`service${i}`);
                container.registerInstance(token, new SimpleService());
            }
            container.dispose();
        }, defaultBenchOptions);

        bench('register 100 instances', () => {
            const container = new DependencyContainer();
            for (let i = 0; i < 100; i++) {
                const token = createToken(`service${i}`);
                container.registerInstance(token, new SimpleService());
            }
            container.dispose();
        }, fastBenchOptions);

        bench('register factory (Singleton)', () => {
            const container = new DependencyContainer();
            const token = createToken('factory');
            container.registerFactory(
                token,
                () => new SimpleService(),
                ServiceLifetime.Singleton
            );
            container.dispose();
        }, defaultBenchOptions);

        bench('register factory (Transient)', () => {
            const container = new DependencyContainer();
            const token = createToken('factory');
            container.registerFactory(
                token,
                () => new SimpleService(),
                ServiceLifetime.Transient
            );
            container.dispose();
        }, defaultBenchOptions);
    });

    // ========================================
    // 服务解析测试 - 实例
    // ========================================

    describe('Service Resolution - Instances', () => {
        const instanceToken = Symbol.for('benchmark.instance.resolve');
        
        bench('resolve registered instance', () => {
            const container = new DependencyContainer();
            container.registerInstance(instanceToken, new SimpleService());
            container.resolve(instanceToken);
            container.dispose();
        }, defaultBenchOptions);

        bench('resolve instance 100 times', () => {
            const container = new DependencyContainer();
            container.registerInstance(instanceToken, new SimpleService());
            for (let i = 0; i < 100; i++) {
                container.resolve(instanceToken);
            }
            container.dispose();
        }, fastBenchOptions);
    });

    // ========================================
    // 服务解析测试 - Singleton 工厂
    // ========================================

    describe('Service Resolution - Singleton Factory', () => {
        const singletonToken = Symbol.for('benchmark.singleton');

        bench('resolve singleton (first call creates)', () => {
            const container = new DependencyContainer();
            container.registerFactory(
                singletonToken,
                () => new SimpleService(),
                ServiceLifetime.Singleton
            );
            container.resolve(singletonToken);
            container.dispose();
        }, defaultBenchOptions);

        bench('resolve singleton 100 times (cached after first)', () => {
            const container = new DependencyContainer();
            container.registerFactory(
                singletonToken,
                () => new SimpleService(),
                ServiceLifetime.Singleton
            );
            for (let i = 0; i < 100; i++) {
                container.resolve(singletonToken);
            }
            container.dispose();
        }, fastBenchOptions);
    });

    // ========================================
    // 服务解析测试 - Transient 工厂
    // ========================================

    describe('Service Resolution - Transient Factory', () => {
        const transientToken = Symbol.for('benchmark.transient');

        bench('resolve transient (creates new each time)', () => {
            const container = new DependencyContainer();
            container.registerFactory(
                transientToken,
                () => new SimpleService(),
                ServiceLifetime.Transient
            );
            container.resolve(transientToken);
            container.dispose();
        }, defaultBenchOptions);

        bench('resolve transient 100 times', () => {
            const container = new DependencyContainer();
            container.registerFactory(
                transientToken,
                () => new SimpleService(),
                ServiceLifetime.Transient
            );
            for (let i = 0; i < 100; i++) {
                container.resolve(transientToken);
            }
            container.dispose();
        }, fastBenchOptions);
    });

    // ========================================
    // 服务查询测试
    // ========================================

    describe('Service Query Operations', () => {
        const existingToken = Symbol.for('benchmark.existing');
        const nonExistingToken = Symbol.for('benchmark.nonexisting');

        bench('check service existence (exists)', () => {
            const container = new DependencyContainer();
            container.registerInstance(existingToken, new SimpleService());
            container.isRegistered(existingToken);
            container.dispose();
        }, defaultBenchOptions);

        bench('check service existence (not exists)', () => {
            const container = new DependencyContainer();
            container.isRegistered(nonExistingToken);
            container.dispose();
        }, defaultBenchOptions);

        bench('tryResolve (exists)', () => {
            const container = new DependencyContainer();
            container.registerInstance(existingToken, new SimpleService());
            container.tryResolve(existingToken);
            container.dispose();
        }, defaultBenchOptions);

        bench('tryResolve (not exists)', () => {
            const container = new DependencyContainer();
            container.tryResolve(nonExistingToken);
            container.dispose();
        }, defaultBenchOptions);
    });

    // ========================================
    // 大规模操作测试
    // ========================================

    describe('Large Scale Operations', () => {
        bench('register and resolve 100 services', () => {
            const container = new DependencyContainer();
            for (let i = 0; i < 100; i++) {
                const token = Symbol.for(`benchmark.large.${i}`);
                container.registerInstance(token, new SimpleService());
            }
            for (let i = 0; i < 100; i++) {
                const token = Symbol.for(`benchmark.large.${i}`);
                container.resolve(token);
            }
            container.dispose();
        }, fastBenchOptions);
    });

    // ========================================
    // 典型使用模式测试
    // ========================================

    describe('Typical Usage Patterns', () => {
        bench('CraftEngine service initialization pattern', () => {
            const container = new DependencyContainer();
            
            // 模拟 CraftEngine 的服务注册模式
            const loggerToken = Symbol.for('Logger');
            const configToken = Symbol.for('Configuration');
            const eventBusToken = Symbol.for('EventBus');
            const templateStoreToken = Symbol.for('TemplateStore');
            const schemaServiceToken = Symbol.for('SchemaService');
            
            container.registerFactory(loggerToken, () => ({ log: () => {} }), ServiceLifetime.Singleton);
            container.registerFactory(configToken, () => ({ get: () => {} }), ServiceLifetime.Singleton);
            container.registerFactory(eventBusToken, () => ({ publish: () => {} }), ServiceLifetime.Singleton);
            container.registerFactory(templateStoreToken, () => ({ add: () => {} }), ServiceLifetime.Singleton);
            container.registerFactory(schemaServiceToken, () => ({ validate: () => {} }), ServiceLifetime.Singleton);
            
            // 解析所有服务
            container.resolve(loggerToken);
            container.resolve(configToken);
            container.resolve(eventBusToken);
            container.resolve(templateStoreToken);
            container.resolve(schemaServiceToken);
            
            container.dispose();
        }, fastBenchOptions);
    });
});
