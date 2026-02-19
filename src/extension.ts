/**
 * CraftEngine VSCode 扩展入口点
 *
 * 采用分层架构设计：
 * - 表现层: VSCode 提供者、命令
 * - 应用层: 扩展服务、Schema 服务
 * - 领域层: 模板、翻译等业务逻辑
 * - 基础设施层: 依赖注入、日志、事件总线
 */

import * as vscode from 'vscode';

// 基础设施
import { ServiceContainer } from './infrastructure/ServiceContainer';
import { SERVICE_TOKENS } from './core/constants/ServiceTokens';

// 核心接口
import { ILogger } from './core/interfaces/ILogger';
import { IExtensionService } from './core/interfaces/IExtensionService';
import { ISchemaService } from './core/interfaces/ISchemaService';
import { IDocumentParseCache } from './core/interfaces/IParsedDocument';
import { IPerformanceMonitor } from './core/interfaces/IPerformanceMonitor';

// 表现层
import { ProviderRegistry } from './presentation/ProviderRegistry';
import { TemplateDiagnosticProvider } from './presentation/providers/TemplateDiagnosticProvider';
import { SchemaDiagnosticProvider } from './presentation/providers/SchemaDiagnosticProvider';
import { SchemaCommands } from './presentation/commands/SchemaCommands';

// 应用层
import { DocumentDiagnosticHandler, IDiagnosticProviders } from './application/services/extension/DocumentDiagnosticHandler';

// ============================================================================
// 全局状态
// ============================================================================

let extensionService: IExtensionService | null = null;
let providerRegistry: ProviderRegistry | null = null;
let diagnosticProvider: TemplateDiagnosticProvider | null = null;
let schemaDiagnosticProvider: SchemaDiagnosticProvider | null = null;
let documentHandler: DocumentDiagnosticHandler | null = null;

// 早期日志缓冲区（在 Logger 服务可用之前使用）
const earlyLogs: Array<{
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    data?: Record<string, unknown>;
    error?: Error;
}> = [];

/**
 * 获取 Logger 实例（如果可用）
 */
function getLogger(): ILogger | null {
    try {
        return ServiceContainer.tryGetService<ILogger>(SERVICE_TOKENS.Logger) ?? null;
    } catch {
        return null;
    }
}

/**
 * 记录日志（支持早期缓冲）
 */
function log(level: 'info' | 'warn' | 'debug', message: string, data?: Record<string, unknown>): void {
    const logger = getLogger();
    if (logger) {
        // 先刷新早期日志
        flushEarlyLogs(logger);
        // 记录当前日志
        logger[level](message, data as Record<string, unknown>);
    } else {
        // 缓冲早期日志
        earlyLogs.push({ level, message, data });
    }
}

/**
 * 刷新早期日志到 Logger 服务
 */
function flushEarlyLogs(logger: ILogger): void {
    while (earlyLogs.length > 0) {
        const entry = earlyLogs.shift()!;
        if (entry.level === 'error') {
            logger.error(entry.message, entry.error, entry.data as Record<string, unknown>);
        } else {
            logger[entry.level](entry.message, entry.data as Record<string, unknown>);
        }
    }
}

// ============================================================================
// 生命周期函数
// ============================================================================

/**
 * 扩展激活入口
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const startTime = performance.now();

    try {
        log('info', 'Starting CraftEngine extension...');

        // 阶段 1-2: 必须串行（依赖关系）
        await initializeServiceContainer(context);
        await initializeExtensionService(context);

        // 阶段 3 和 5: 并行执行（无依赖关系）
        await Promise.all([
            registerProviders(context),
            registerSchemaProvider(context)
        ]);

        // 阶段 4: 依赖 registerProviders 完成
        await setupDocumentHandling(context);

        // 阶段 6: 后台任务
        await performPostActivationTasks();

        logActivationSuccess(startTime);

    } catch (error) {
        handleActivationError(error);
        throw error;
    }
}

/**
 * 扩展停用入口
 */
export async function deactivate(): Promise<void> {
    const logger = getLogger();

    try {
        logger?.info('Deactivating CraftEngine extension...');

        // 停用扩展服务
        await extensionService?.deactivate();

        // 清理诊断提供者
        diagnosticProvider?.dispose();
        schemaDiagnosticProvider?.dispose();

        // 重置全局状态
        extensionService = null;
        providerRegistry = null;
        diagnosticProvider = null;
        schemaDiagnosticProvider = null;
        documentHandler = null;

        // 最终日志必须在 ServiceContainer.dispose() 之前写入，
        // 否则 FileLogTarget 已 disposed，消息会被丢弃
        logger?.info('CraftEngine extension deactivated');

        // 清理服务容器（会 dispose 所有日志目标并轮转日志文件）
        await ServiceContainer.dispose();

    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger?.error('Deactivation error', err);
    }
}

// ============================================================================
// 初始化阶段
// ============================================================================

/** 阶段 1: 初始化服务容器 */
async function initializeServiceContainer(context: vscode.ExtensionContext): Promise<void> {
    log('info', 'Initializing service container...');
    await ServiceContainer.initialize(context);
}

/** 阶段 2: 初始化扩展服务 */
async function initializeExtensionService(context: vscode.ExtensionContext): Promise<void> {
    log('info', 'Initializing extension service...');
    extensionService = ServiceContainer.getService<IExtensionService>(SERVICE_TOKENS.ExtensionService);
    await extensionService.initialize(context);
    await extensionService.activate();
}

/** 阶段 3: 注册所有提供者 */
async function registerProviders(context: vscode.ExtensionContext): Promise<void> {
    log('info', 'Registering providers...');
    providerRegistry = new ProviderRegistry();
    diagnosticProvider = await providerRegistry.registerAll(context);

    // 注册 Schema 命令
    const schemaCommands = new SchemaCommands();
    schemaCommands.register(context);
}

/** 阶段 4: 设置文档事件处理 */
async function setupDocumentHandling(context: vscode.ExtensionContext): Promise<void> {
    log('info', 'Setting up document handling...');

    if (!diagnosticProvider || !providerRegistry) {
        throw new Error('Providers not initialized');
    }

    const logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger);
    const documentParseCache = ServiceContainer.tryGetService<IDocumentParseCache>(SERVICE_TOKENS.DocumentParseCache);
    const performanceMonitor = ServiceContainer.tryGetService<IPerformanceMonitor>(SERVICE_TOKENS.PerformanceMonitor);

    // 收集所有诊断提供者
    const providers: IDiagnosticProviders = {
        template: diagnosticProvider,
        translation: providerRegistry.getTranslationDiagnosticProvider(),
        schema: providerRegistry.getSchemaDiagnosticProvider(),
        filePath: providerRegistry.getFilePathDiagnosticProvider(),
        miniMessage: providerRegistry.getMiniMessageDiagnosticProvider(),
        itemId: providerRegistry.getItemIdDiagnosticProvider(),
        versionCondition: providerRegistry.getVersionConditionDiagnosticProvider(),
        category: providerRegistry.getCategoryDiagnosticProvider()
    };

    // 创建文档处理器并注册监听器（传入文档解析缓存和性能监控）
    documentHandler = new DocumentDiagnosticHandler(
        logger,
        providers,
        extensionService,
        documentParseCache ?? undefined,
        performanceMonitor ?? undefined
    );
    documentHandler.registerDocumentListeners(context);
}

/** 阶段 5: 注册 Schema 提供者 */
async function registerSchemaProvider(context: vscode.ExtensionContext): Promise<void> {
    log('info', 'Registering schema provider...');

    const schemaService = ServiceContainer.getService<ISchemaService>(SERVICE_TOKENS.SchemaService);

    try {
        await schemaService.registerSchemaProvider(context);
        log('info', 'Schema provider registered');
    } catch (error) {
        // Schema 注册失败不阻止扩展运行
        const logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger);
        logger.warn('Schema provider registration failed', {
            error: (error as Error).message,
            suggestion: 'Install Red Hat YAML extension for full schema validation'
        });
    }
}

/** 阶段 6: 执行激活后任务（非阻塞） */
async function performPostActivationTasks(): Promise<void> {
    log('info', 'Performing post-activation tasks...');

    const logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger);

    // 非阻塞：后台等待初始扫描完成
    // 不阻塞激活流程，让扩展立即可用
    extensionService?.initialScanCompleted
        .then(async () => {
            logger.info('Initial scan completed');

            // 检查扩展健康状态
            await checkExtensionHealth(logger);

            // 更新已打开文档的诊断
            documentHandler?.updateOpenDocuments();

            logger.info('Post-activation tasks completed');
        })
        .catch(error => {
            logger.error('Initial scan failed', error as Error);
        });

    // 立即返回，不阻塞激活
    logger.debug('Post-activation tasks scheduled in background');
}

// ============================================================================
// 辅助函数
// ============================================================================

/** 检查扩展健康状态 */
async function checkExtensionHealth(logger: ILogger): Promise<void> {
    if (!extensionService) {
        return;
    }

    const isHealthy = await extensionService.checkHealth();
    logger.info('Extension health check', { healthy: isHealthy });

    if (!isHealthy) {
        logger.warn('Extension health check indicates potential issues');
    }
}

/** 记录激活成功信息 */
function logActivationSuccess(startTime: number): void {
    const duration = performance.now() - startTime;

    const logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger);
    logger.info('CraftEngine extension activated', {
        activationTime: duration,
        activationTimeFormatted: `${duration.toFixed(2)}ms`,
        features: ['completion', 'hover', 'definition', 'diagnostics', 'schema']
    });
}

/** 处理激活错误 */
function handleActivationError(error: unknown): void {
    const logger = getLogger();
    const err = error instanceof Error ? error : new Error(String(error));

    logger?.error('Activation failed', err);

    vscode.window.showErrorMessage(
        `CraftEngine activation failed: ${err.message}`,
        'View Logs'
    ).then(selection => {
        if (selection === 'View Logs') {
            vscode.commands.executeCommand('workbench.action.openSettings', '@ext:craftengine');
        }
    });
}
