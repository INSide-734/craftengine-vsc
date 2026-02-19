import { IDependencyContainer } from '../../../core/interfaces/IDependencyContainer';
import { ILogger } from '../../../core/interfaces/ILogger';
import { IConfiguration } from '../../../core/interfaces/IConfiguration';
import { IEventBus } from '../../../core/interfaces/IEventBus';
import { IFileWatcher } from '../../../core/interfaces/IFileWatcher';
import { IPerformanceMonitor } from '../../../core/interfaces/IPerformanceMonitor';
import { IDataStoreService } from '../../../core/interfaces/IDataStoreService';
import { IFileReader } from '../../../core/interfaces/IFileReader';
import { IWorkspaceService } from '../../../core/interfaces/IWorkspaceService';
import { IDataConfigLoader } from '../../../core/interfaces/IDataConfigLoader';
import { SERVICE_TOKENS } from '../../../core/constants/ServiceTokens';
import { initializeDiagnosticCodes } from '../../../core/constants/DiagnosticCodes';
import { initializeDiagnosticSeverityRules } from '../../../core/constants/DiagnosticSeverityRules';
import { initializeSchemaConfig } from '../../../core/constants/SchemaConstants';
import { initializeMinecraftVersions } from '../../../domain/services/model/utils/MinecraftVersion';
import { initializeModelProperties } from '../../../domain/services/model/ModelPropertiesInit';
import { initializeMiniMessagePatterns } from '../../../presentation/strategies/delegates/richtext/types';
import { initializeTypeDisplayNames } from '../../../core/constants/DiagnosticMessages';
import { ConfigurationManager } from '../../config/ConfigurationManager';
import { ExtendedTypeService } from '../../../domain/services/ExtendedTypeService';
import { ExtensionService } from '../../../application/services/ExtensionService';
import { SchemaService } from '../../../application/services/SchemaService';
import { ModelPreviewService } from '../../../application/services/ModelPreviewService';
import { ResourcePackDiscovery } from '../../filesystem/ResourcePackDiscovery';
import { registerServices } from './shared';

// ============================================
// 应用层服务注册
// ============================================

/**
 * 注册应用服务
 *
 * 包括扩展服务和 Schema 服务，是最顶层的服务编排。
 */
export function registerApplicationServices(container: IDependencyContainer): void {
    registerServices(container, [
        {
            token: SERVICE_TOKENS.ExtensionService,
            factory: (c) => new ExtensionService(
                c.resolve<ILogger>(SERVICE_TOKENS.Logger),
                c.resolve<IConfiguration>(SERVICE_TOKENS.Configuration),
                c.resolve<IEventBus>(SERVICE_TOKENS.EventBus),
                c.resolve<IDataStoreService>(SERVICE_TOKENS.DataStoreService),
                c.resolve<IFileWatcher>(SERVICE_TOKENS.FileWatcher),
                c.resolve<IPerformanceMonitor>(SERVICE_TOKENS.PerformanceMonitor)
            )
        },
        {
            token: SERVICE_TOKENS.SchemaService,
            factory: (c) => new SchemaService(
                c.resolve<ILogger>(SERVICE_TOKENS.Logger),
                c.resolve<IDataStoreService>(SERVICE_TOKENS.DataStoreService),
                c.resolve<IEventBus>(SERVICE_TOKENS.EventBus),
                c.resolve<IConfiguration>(SERVICE_TOKENS.Configuration),
                c.resolve<IFileReader>(SERVICE_TOKENS.FileReader),
                c.resolve<IWorkspaceService>(SERVICE_TOKENS.WorkspaceService),
                c.tryResolve<IPerformanceMonitor>(SERVICE_TOKENS.PerformanceMonitor)
            )
        },
        {
            token: SERVICE_TOKENS.ModelPreviewService,
            factory: (c) => {
                // 创建资源包发现适配器，包装静态类为实例接口
                const resourcePackDiscovery = {
                    discoverInWorkspace: () => ResourcePackDiscovery.discoverInWorkspace()
                };
                return new ModelPreviewService(
                    c.resolve<ILogger>(SERVICE_TOKENS.Logger),
                    c.resolve<IConfiguration>(SERVICE_TOKENS.Configuration),
                    c.resolve<IDataStoreService>(SERVICE_TOKENS.DataStoreService),
                    c.resolve(SERVICE_TOKENS.ModelGenerator),
                    c.resolve(SERVICE_TOKENS.RendererAdapter),
                    c.resolve(SERVICE_TOKENS.YamlParser),
                    c.resolve(SERVICE_TOKENS.TemplateExpander),
                    c.resolve<IWorkspaceService>(SERVICE_TOKENS.WorkspaceService),
                    resourcePackDiscovery
                );
            }
        }
    ]);

    container.resolve<ILogger>(SERVICE_TOKENS.Logger).info('Application services registered');
}

/**
 * 初始化需要预热的服务
 *
 * 在容器注册完成后，预热关键服务以确保启动性能。
 */
export async function initializeServices(container: IDependencyContainer): Promise<void> {
    const logger = container.resolve<ILogger>(SERVICE_TOKENS.Logger);

    try {
        // 初始化配置管理器
        const configuration = container.resolve<IConfiguration>(SERVICE_TOKENS.Configuration);
        await (configuration as ConfigurationManager).initialize();

        // 预加载数据配置文件到缓存
        const dataConfigLoader = container.resolve<IDataConfigLoader>(
            SERVICE_TOKENS.DataConfigLoader
        );
        await dataConfigLoader.preloadAllConfigs();

        // 从 JSON 配置初始化核心常量模块
        const diagnosticCodesConfig = dataConfigLoader.getDiagnosticCodesConfigSync();
        if (diagnosticCodesConfig) {
            initializeDiagnosticCodes(diagnosticCodesConfig);
            // 初始化类型显示名称
            if (diagnosticCodesConfig.typeDisplayNames) {
                initializeTypeDisplayNames(diagnosticCodesConfig.typeDisplayNames);
            }
        }
        const severityRulesConfig = dataConfigLoader.getDiagnosticSeverityRulesConfigSync();
        if (severityRulesConfig) {
            initializeDiagnosticSeverityRules(severityRulesConfig);
        }
        const schemaConfig = dataConfigLoader.getSchemaConfigSync();
        if (schemaConfig) {
            initializeSchemaConfig(schemaConfig);
        }

        // 从 JSON 配置初始化 Minecraft 版本和模型属性模块
        const minecraftVersionsConfig = dataConfigLoader.getMinecraftVersionsConfigSync();
        if (minecraftVersionsConfig) {
            initializeMinecraftVersions(minecraftVersionsConfig);
        }
        const modelPropertiesConfig = dataConfigLoader.getModelPropertiesConfigSync();
        if (modelPropertiesConfig) {
            initializeModelProperties(modelPropertiesConfig);
        }

        // 从 JSON 配置初始化 MiniMessage 模式和常用语言
        const miniMessageConfig = dataConfigLoader.getMiniMessageConstantsConfigSync();
        if (miniMessageConfig) {
            initializeMiniMessagePatterns(miniMessageConfig.patterns, miniMessageConfig.commonLanguages);
        }

        // 预热核心服务实例
        container.resolve<IEventBus>(SERVICE_TOKENS.EventBus);
        container.resolve<IPerformanceMonitor>(SERVICE_TOKENS.PerformanceMonitor);
        container.resolve<IDataStoreService>(SERVICE_TOKENS.DataStoreService);

        // 初始化 ExtendedTypeService（需要异步加载配置）
        const extendedTypeService = container.resolve<ExtendedTypeService>(SERVICE_TOKENS.ExtendedTypeService);
        await extendedTypeService.initialize();

        logger.info('Core services initialized');

    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Failed to initialize services', err);
        throw error;
    }
}
