import { IDependencyContainer, ServiceLifetime } from '../../../core/interfaces/IDependencyContainer';
import { ILogger } from '../../../core/interfaces/ILogger';
import { IEventBus } from '../../../core/interfaces/IEventBus';
import { IYamlScanner } from '../../../core/interfaces/IYamlScanner';
import { IYamlParser } from '../../../core/interfaces/IYamlParser';
import { IDataStoreService } from '../../../core/interfaces/IDataStoreService';
import { IMinecraftDataService } from '../../../core/interfaces/IMinecraftDataService';
import { IDataConfigLoader } from '../../../core/interfaces/IDataConfigLoader';
import { IBuiltinItemLoader } from '../../../core/interfaces/IItemId';

import { IFileReader } from '../../../core/interfaces/IFileReader';
import { SERVICE_TOKENS } from '../../../core/constants/ServiceTokens';
import { TemplateService, DataStoreService } from '../../../domain/index';
import { WorkspaceScanCache } from '../../filesystem/WorkspaceScanCache';
import { CompletionManager } from '../../completion/CompletionManager';
import { TemplateExpander } from '../../../application/services/schema/TemplateExpander';
import { ModelGenerationService } from '../../../domain/services/ModelGenerationService';
import { ExtendedTypeService } from '../../../domain/services/ExtendedTypeService';
import { DelegateStrategyRegistry } from '../../completion/DelegateStrategyRegistry';
import { registerServices } from './shared';

// ============================================
// 领域层 + 补全服务注册
// ============================================

/**
 * 注册领域服务
 *
 * 包括数据存储、模板处理等核心业务服务。
 * DataStoreService 同时注册到多个细粒度 Token，实现接口隔离。
 */
export function registerDomainServices(container: IDependencyContainer): void {
    // 核心数据存储服务
    container.registerFactory(
        SERVICE_TOKENS.DataStoreService,
        (c) => new DataStoreService(
            c.resolve<ILogger>(SERVICE_TOKENS.Logger),
            c.resolve<IEventBus>(SERVICE_TOKENS.EventBus),
            c.resolve<IYamlScanner>(SERVICE_TOKENS.YamlScanner),
            c.resolve<IYamlParser>(SERVICE_TOKENS.YamlParser),
            c.resolve<IFileReader>(SERVICE_TOKENS.FileReader),
            c.tryResolve<WorkspaceScanCache>(SERVICE_TOKENS.WorkspaceScanCache),
            c.tryResolve<IBuiltinItemLoader>(SERVICE_TOKENS.BuiltinItemLoader)
        ),
        ServiceLifetime.Singleton
    );

    // 将同一个 DataStoreService 实例注册到细粒度 Token
    // 消费者可以按需依赖更小的接口，而非整个 IDataStoreService
    registerDataStoreAliases(container);

    // 模板业务服务
    registerServices(container, [
        {
            token: SERVICE_TOKENS.TemplateService,
            factory: (c) => new TemplateService(
                c.resolve<IDataStoreService>(SERVICE_TOKENS.DataStoreService),
                c.resolve<ILogger>(SERVICE_TOKENS.Logger)
            )
        },
        {
            token: SERVICE_TOKENS.TemplateExpander,
            factory: (c) => {
                return new TemplateExpander(
                    c.resolve<IDataStoreService>(SERVICE_TOKENS.DataStoreService),
                    c.resolve<ILogger>(SERVICE_TOKENS.Logger)
                );
            }
        },
        {
            token: SERVICE_TOKENS.ModelGenerator,
            factory: (c) => {
                return new ModelGenerationService(
                    c.resolve<ILogger>(SERVICE_TOKENS.Logger),
                    c.resolve<IMinecraftDataService>(SERVICE_TOKENS.MinecraftDataService),
                    c.resolve<IDataConfigLoader>(SERVICE_TOKENS.DataConfigLoader)
                );
            }
        },
        {
            token: SERVICE_TOKENS.ExtendedTypeService,
            factory: (c) => {
                return new ExtendedTypeService(
                    c.resolve<ILogger>(SERVICE_TOKENS.Logger),
                    c.resolve<IDataConfigLoader>(SERVICE_TOKENS.DataConfigLoader)
                );
            }
        }
    ]);

    container.resolve<ILogger>(SERVICE_TOKENS.Logger).info('Domain services registered');
}

/**
 * 将 DataStoreService 实例注册到细粒度 Token
 *
 * 所有别名 Token 解析到同一个单例实例，实现接口隔离原则（ISP）。
 */
function registerDataStoreAliases(container: IDependencyContainer): void {
    const aliasTokens = [
        SERVICE_TOKENS.DataStoreLifecycle,
        SERVICE_TOKENS.TemplateRepository,
        SERVICE_TOKENS.TranslationRepository,
        SERVICE_TOKENS.ItemIdRepository,
        SERVICE_TOKENS.CategoryRepository,
    ];

    for (const token of aliasTokens) {
        container.registerFactory(
            token,
            (c) => c.resolve<IDataStoreService>(SERVICE_TOKENS.DataStoreService),
            ServiceLifetime.Singleton
        );
    }
}

/**
 * 注册补全系统服务
 */
export function registerCompletionServices(container: IDependencyContainer): void {
    registerServices(container, [
        {
            token: SERVICE_TOKENS.CompletionManager,
            factory: (c) => new CompletionManager(
                c.resolve<ILogger>(SERVICE_TOKENS.Logger)
            )
        },
        {
            token: SERVICE_TOKENS.DelegateStrategyRegistry,
            factory: (c) => {
                return new DelegateStrategyRegistry(
                    c.resolve<ILogger>(SERVICE_TOKENS.Logger)
                );
            }
        }
    ]);

    container.resolve<ILogger>(SERVICE_TOKENS.Logger).info('Completion services registered');
}
