import { window, workspace, type ExtensionContext } from 'vscode';
import { type IDependencyContainer, ServiceLifetime } from '../../../core/interfaces/IDependencyContainer';
import { type ILogger } from '../../../core/interfaces/ILogger';
import { type IConfiguration } from '../../../core/interfaces/IConfiguration';
import { type IEventBus } from '../../../core/interfaces/IEventBus';
import { type IPerformanceMonitor } from '../../../core/interfaces/IPerformanceMonitor';
import { type IYamlParser } from '../../../core/interfaces/IYamlParser';
import { type IYamlScanner } from '../../../core/interfaces/IYamlScanner';
import { type ISchemaParser } from '../../../core/interfaces/ISchemaParser';
import { type IDataConfigLoader } from '../../../core/interfaces/IDataConfigLoader';
import { type ITemplateExpander } from '../../../core/interfaces/ITemplateExpander';
import { type ISchemaFileLoader } from '../../../core/interfaces/ISchemaFileLoader';
import { SERVICE_TOKENS } from '../../../core/constants/ServiceTokens';
import { SCHEMA_CACHE } from '../../../core/constants/SchemaConstants';
import {
    LoggerManager,
    LogLevel,
    OutputChannelLogTarget,
    ConfigurationManager,
    VSCodeConfigurationProvider,
    EventBus,
    PerformanceMonitor,
} from '../../index';
import { VSCodeFileWatcher } from '../../filesystem/FileWatcher';
import { VscodeFileReader } from '../../filesystem/VscodeFileReader';
import { VscodeWorkspaceService } from '../../workspace/VscodeWorkspaceService';
import { VscodeFileWatcherFactory } from '../../filesystem/VscodeFileWatcherFactory';
import { VscodeExtensionRegistry } from '../../extensions/VscodeExtensionRegistry';
import { WorkspaceScanCache } from '../../filesystem/WorkspaceScanCache';
import { SchemaLoader, SchemaValidator, SchemaFileLoader } from '../../schema';
import { NotificationService } from '../../notification';
import { NamespaceDiscoveryService } from '../../filesystem/NamespaceDiscoveryService';
import { YamlPathParser } from '../../yaml/YamlPathParser';
import { YamlParser } from '../../yaml/YamlParser';
import { YamlScanner } from '../../yaml/YamlScanner';
import { DocumentParseCache } from '../../cache/DocumentParseCache';
import { MinecraftRendererAdapter } from '../../renderer/MinecraftRendererAdapter';
import { DataConfigLoader } from '../../data/DataConfigLoader';
import { MinecraftVersionService } from '../../data/MinecraftVersionService';
import { MinecraftDataService } from '../../data/MinecraftDataService';
import { MinecraftBuiltinItemLoader } from '../../data/MinecraftBuiltinItemLoader';
import * as path from 'path';
import { registerServices } from './shared';

// ============================================
// 基础设施层服务注册
// ============================================

/**
 * 从 VSCode 配置获取日志级别
 */
function getConfiguredLogLevel(): LogLevel {
    try {
        const config = workspace.getConfiguration('craftengine.logging');
        const levelStr = config.get<string>('level', 'INFO');
        return LogLevel[levelStr as keyof typeof LogLevel] ?? LogLevel.INFO;
    } catch (error) {
        // Logger 尚未注册，使用 console
        // eslint-disable-next-line no-console
        console.warn('Failed to read logging configuration, using INFO:', error);
        return LogLevel.INFO;
    }
}

/**
 * 注册日志服务
 *
 * @param container - 依赖注入容器
 * @param context - VSCode 扩展上下文（可选，用于创建 OutputChannel）
 */
export function registerLoggingServices(container: IDependencyContainer, context: ExtensionContext | null): void {
    const loggerManager = LoggerManager.getInstance();
    const logLevel = getConfiguredLogLevel();

    loggerManager.initialize({
        level: logLevel,
        enableHotReload: true,
    });

    if (context) {
        const outputChannel = window.createOutputChannel('CraftEngine');
        context.subscriptions.push(outputChannel);
        loggerManager.addGlobalTarget(new OutputChannelLogTarget(outputChannel));

        // 根据用户配置启用文件日志
        setupFileLogging(loggerManager, context);
    }

    const mainLogger = loggerManager.getLogger('CraftEngine');
    container.registerInstance(SERVICE_TOKENS.Logger, mainLogger);

    mainLogger.info('Logging services registered');
}

/**
 * 根据用户配置启用文件日志
 * 使用 context.logUri 作为默认日志目录，回退到 globalStorageUri
 */
function setupFileLogging(loggerManager: LoggerManager, context: ExtensionContext): void {
    try {
        const config = workspace.getConfiguration('craftengine.logging');
        const fileEnabled = config.get<boolean>('fileEnabled', false);

        if (!fileEnabled) {
            return;
        }

        const customPath = config.get<string>('filePath', '');
        const maxFileSize = config.get<number>('maxFileSize', 10 * 1024 * 1024);
        const maxBackupCount = config.get<number>('maxBackupCount', 5);

        let logFilePath: string;

        if (customPath) {
            logFilePath = customPath;
        } else {
            // 优先使用 logUri，回退到 globalStorageUri
            const logDir =
                context.logUri?.fsPath ?? context.globalStorageUri?.fsPath ?? path.join(context.extensionPath, 'logs');
            logFilePath = path.join(logDir, 'craftengine.log');
        }

        loggerManager.enableFileLoggingFromConfig(logFilePath, {
            maxFileSize,
            maxBackupCount,
        });
    } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[CraftEngine] Failed to setup file logging:', error);
    }
}

/**
 * 注册配置服务
 */
export function registerConfigurationServices(container: IDependencyContainer): void {
    const configProvider = new VSCodeConfigurationProvider();
    const logger = container.resolve<ILogger>(SERVICE_TOKENS.Logger);

    container.registerFactory(
        SERVICE_TOKENS.Configuration,
        () => new ConfigurationManager(configProvider, logger),
        ServiceLifetime.Singleton,
    );

    logger.info('Configuration services registered');
}

/**
 * 注册事件服务
 */
export function registerEventServices(container: IDependencyContainer): void {
    container.registerFactory(
        SERVICE_TOKENS.EventBus,
        (c) => new EventBus(c.resolve<ILogger>(SERVICE_TOKENS.Logger)),
        ServiceLifetime.Singleton,
    );

    container.resolve<ILogger>(SERVICE_TOKENS.Logger).info('Event services registered');
}

/**
 * 注册性能监控服务
 */
export function registerPerformanceServices(container: IDependencyContainer): void {
    container.registerFactory(
        SERVICE_TOKENS.PerformanceMonitor,
        (c) => {
            const monitor = new PerformanceMonitor(
                c.resolve<ILogger>(SERVICE_TOKENS.Logger),
                c.resolve<IEventBus>(SERVICE_TOKENS.EventBus),
            );

            // 延迟注入配置服务，避免循环依赖
            const config = c.tryResolve<IConfiguration>(SERVICE_TOKENS.Configuration);
            if (config) {
                monitor.setConfiguration(config);
            }

            return monitor;
        },
        ServiceLifetime.Singleton,
    );

    container.resolve<ILogger>(SERVICE_TOKENS.Logger).info('Performance services registered');
}

/**
 * 注册基础设施服务
 *
 * 包括文件系统、YAML 处理、Schema 验证、渲染器等底层服务。
 */
export function registerInfrastructureServices(container: IDependencyContainer): void {
    // 文件系统服务
    registerServices(container, [
        {
            token: SERVICE_TOKENS.FileWatcher,
            factory: (c) =>
                new VSCodeFileWatcher(
                    c.resolve<ILogger>(SERVICE_TOKENS.Logger),
                    c.resolve<IEventBus>(SERVICE_TOKENS.EventBus),
                ),
        },
        {
            token: SERVICE_TOKENS.FileReader,
            factory: () => new VscodeFileReader(),
        },
        {
            token: SERVICE_TOKENS.WorkspaceService,
            factory: () => new VscodeWorkspaceService(),
        },
        {
            token: SERVICE_TOKENS.NamespaceDiscoveryService,
            factory: (c) => {
                return new NamespaceDiscoveryService(
                    c.resolve<ILogger>(SERVICE_TOKENS.Logger),
                    c.tryResolve<IDataConfigLoader>(SERVICE_TOKENS.DataConfigLoader),
                );
            },
        },
    ]);

    // YAML 处理服务
    registerServices(container, [
        {
            token: SERVICE_TOKENS.YamlPathParser,
            factory: (c) => {
                return new YamlPathParser(c.resolve<ILogger>(SERVICE_TOKENS.Logger));
            },
        },
        {
            token: SERVICE_TOKENS.YamlParser,
            factory: (c) => {
                return new YamlParser(c.resolve<ILogger>(SERVICE_TOKENS.Logger));
            },
        },
        {
            token: SERVICE_TOKENS.YamlScanner,
            factory: (c) => {
                return new YamlScanner(
                    c.resolve<IYamlParser>(SERVICE_TOKENS.YamlParser),
                    c.resolve<ILogger>(SERVICE_TOKENS.Logger),
                );
            },
        },
        {
            token: SERVICE_TOKENS.WorkspaceScanCache,
            factory: (c) =>
                new WorkspaceScanCache(
                    c.resolve<IYamlScanner>(SERVICE_TOKENS.YamlScanner),
                    c.resolve<ILogger>(SERVICE_TOKENS.Logger).createChild('WorkspaceScanCache'),
                ),
        },
        {
            token: SERVICE_TOKENS.DocumentParseCache,
            factory: (c) => {
                return new DocumentParseCache(
                    c.resolve<ILogger>(SERVICE_TOKENS.Logger).createChild('DocumentParseCache'),
                    c.resolve<IPerformanceMonitor>(SERVICE_TOKENS.PerformanceMonitor),
                );
            },
        },
    ]);

    // 通知服务
    registerServices(container, [
        {
            token: SERVICE_TOKENS.NotificationService,
            factory: () => new NotificationService(),
        },
        {
            token: SERVICE_TOKENS.FileWatcherFactory,
            factory: () => new VscodeFileWatcherFactory(),
        },
        {
            token: SERVICE_TOKENS.ExtensionRegistry,
            factory: () => new VscodeExtensionRegistry(),
        },
    ]);

    // Schema 处理服务
    registerServices(container, [
        {
            token: SERVICE_TOKENS.SchemaFileLoader,
            factory: (c) => {
                // esbuild 打包后 __dirname = <root>/out/，schemas 在 <root>/schemas/
                const schemasDir = path.join(__dirname, '../schemas');
                return new SchemaFileLoader(
                    schemasDir,
                    c.resolve<ILogger>(SERVICE_TOKENS.Logger),
                    SCHEMA_CACHE.FILE_CACHE_SIZE,
                );
            },
        },
        {
            token: SERVICE_TOKENS.SchemaParser,
            factory: (c) =>
                new SchemaLoader(
                    c.resolve<ILogger>(SERVICE_TOKENS.Logger),
                    c.resolve<ISchemaFileLoader>(SERVICE_TOKENS.SchemaFileLoader),
                ),
        },
        {
            token: SERVICE_TOKENS.SchemaValidator,
            factory: (c) => {
                // TemplateExpander 可能尚未注册，使用 tryResolve
                const templateExpander = c.tryResolve<ITemplateExpander>(SERVICE_TOKENS.TemplateExpander);
                return new SchemaValidator(
                    c.resolve<ISchemaParser>(SERVICE_TOKENS.SchemaParser),
                    c.resolve<IConfiguration>(SERVICE_TOKENS.Configuration),
                    c.resolve<ILogger>(SERVICE_TOKENS.Logger),
                    templateExpander,
                );
            },
        },
    ]);

    // 渲染器适配器
    registerServices(container, [
        {
            token: SERVICE_TOKENS.RendererAdapter,
            factory: (c) => {
                return new MinecraftRendererAdapter(c.resolve<ILogger>(SERVICE_TOKENS.Logger));
            },
        },
    ]);

    container.resolve<ILogger>(SERVICE_TOKENS.Logger).info('Infrastructure services registered');
}

/**
 * 注册数据服务
 *
 * 包括 Minecraft 版本数据等外部数据服务。
 */
export function registerDataServices(container: IDependencyContainer): void {
    registerServices(container, [
        {
            token: SERVICE_TOKENS.DataConfigLoader,
            factory: (c) => {
                return new DataConfigLoader(c.resolve<ILogger>(SERVICE_TOKENS.Logger));
            },
        },
        {
            token: SERVICE_TOKENS.MinecraftVersionService,
            factory: () => {
                return new MinecraftVersionService();
            },
        },
        {
            token: SERVICE_TOKENS.MinecraftDataService,
            factory: (c) => {
                return new MinecraftDataService(
                    c.resolve<ILogger>(SERVICE_TOKENS.Logger),
                    c.resolve<IDataConfigLoader>(SERVICE_TOKENS.DataConfigLoader),
                );
            },
        },
        {
            token: SERVICE_TOKENS.BuiltinItemLoader,
            factory: () => {
                return new MinecraftBuiltinItemLoader();
            },
        },
    ]);

    container.resolve<ILogger>(SERVICE_TOKENS.Logger).info('Data services registered');
}
