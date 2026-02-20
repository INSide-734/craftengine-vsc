import { type TextDocument, Diagnostic, DiagnosticSeverity, Range, type Uri } from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { type ITemplateService } from '../../core/interfaces/ITemplateService';
import { type IEventBus } from '../../core/interfaces/IEventBus';
import { type ISchemaService } from '../../core/interfaces/ISchemaService';
import { type IYamlPathParser } from '../../core/interfaces/IYamlPathParser';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { type IExtendedTypeService } from '../../core/interfaces/IExtendedParameterType';
import { ErrorNotificationManager } from '../ErrorNotificationManager';
import { generateEventId } from '../../infrastructure/utils';
import { DiagnosticCache } from '../../infrastructure/cache/DiagnosticCache';
import { ExtendedTypeValidator } from './helpers/ExtendedTypeValidator';
import { TemplateReferenceFinder } from './helpers/TemplateReferenceFinder';
import { TemplateParameterValidator } from './helpers/TemplateParameterValidator';
import { BaseDiagnosticProvider } from './BaseDiagnosticProvider';

/**
 * 模板诊断提供者
 *
 * 提供实时模板错误检测和详细的诊断信息
 */
export class TemplateDiagnosticProvider extends BaseDiagnosticProvider {
    private readonly templateService: ITemplateService;
    private readonly eventBus: IEventBus;
    private readonly errorNotificationManager: ErrorNotificationManager;

    /** 诊断源标识 */
    static readonly DIAGNOSTIC_SOURCE = 'CraftEngine Template';

    /** 默认诊断缓存配置 */
    private static readonly DEFAULT_CACHE_CAPACITY = 300;
    private static readonly DEFAULT_CACHE_TTL = 120000;

    /** 默认事件节流延迟（毫秒） */
    private static readonly DEFAULT_EVENT_THROTTLE_DELAY = 100;

    // 使用通用诊断缓存
    private readonly diagnosticCache: DiagnosticCache<Diagnostic[]>;

    // 委托模块
    private readonly extendedTypeValidator: ExtendedTypeValidator;
    private readonly templateReferenceFinder: TemplateReferenceFinder;
    private readonly templateParameterValidator: TemplateParameterValidator;

    // 事件节流器
    private pendingEventPublish: NodeJS.Timeout | null = null;

    constructor() {
        super('craftengine-template', 'CraftEngine Template', 'diagnostics.update', 'TemplateDiagnosticProvider');

        this.templateService = ServiceContainer.getService<ITemplateService>(SERVICE_TOKENS.TemplateService);
        this.eventBus = ServiceContainer.getService<IEventBus>(SERVICE_TOKENS.EventBus);
        this.errorNotificationManager =
            ServiceContainer.tryGetService<ErrorNotificationManager>(SERVICE_TOKENS.ErrorNotificationManager) ??
            new ErrorNotificationManager();

        const schemaService = ServiceContainer.getService<ISchemaService>(SERVICE_TOKENS.SchemaService);
        const yamlPathParser = ServiceContainer.getService<IYamlPathParser>(SERVICE_TOKENS.YamlPathParser);
        const extendedTypeService = ServiceContainer.getService<IExtendedTypeService>(
            SERVICE_TOKENS.ExtendedTypeService,
        );

        // 初始化诊断缓存
        this.diagnosticCache = new DiagnosticCache<Diagnostic[]>(
            {
                capacity: TemplateDiagnosticProvider.DEFAULT_CACHE_CAPACITY,
                ttl: TemplateDiagnosticProvider.DEFAULT_CACHE_TTL,
                name: 'TemplateDiagnosticCache',
            },
            this.logger,
        );

        // 初始化委托模块
        this.extendedTypeValidator = new ExtendedTypeValidator(this.logger, extendedTypeService);
        this.templateReferenceFinder = new TemplateReferenceFinder(
            this.logger,
            this.templateService,
            schemaService,
            yamlPathParser,
        );
        this.templateParameterValidator = new TemplateParameterValidator(
            this.logger,
            this.templateService,
            this.templateReferenceFinder,
        );

        this.setupEventListeners();
    }

    /**
     * 更新文档的诊断信息
     *
     * 覆盖基类模板方法以支持缓存逻辑
     */
    override async updateDiagnostics(document: TextDocument, _parsedDoc?: unknown): Promise<void> {
        const timer = this.performanceMonitor.startTimer(this.timerName);
        // 记录开始时的文档版本，用于检测异步执行期间文档是否变更
        const startVersion = document.version;

        try {
            // 检查功能是否启用
            if (!this.configuration.get('diagnostics.enabled', true)) {
                return;
            }

            // 只处理YAML文件
            if (document.languageId !== 'yaml') {
                return;
            }

            // 检查缓存
            const cacheKey = document.uri.toString();
            const cached = this.diagnosticCache.get(cacheKey, document.version);
            if (cached) {
                this.logger.debug('Using cached diagnostics', {
                    file: document.fileName,
                    diagnosticCount: cached.length,
                });
                this.diagnosticCollection.set(document.uri, cached);
                timer.stop({ success: 'true', fromCache: 'true' });
                return;
            }

            const diagnostics = await this.doUpdateDiagnostics(document);

            // 异步操作完成后检查文档版本是否已变更
            if (document.version !== startVersion) {
                this.logger.debug('Document changed during diagnostics, discarding results', {
                    file: document.fileName,
                    startVersion,
                    currentVersion: document.version,
                });
                timer.stop({ success: 'true', discarded: 'true' });
                return;
            }

            // 设置诊断信息
            this.diagnosticCollection.set(document.uri, diagnostics);
            this.diagnosticCache.set(cacheKey, diagnostics, document.version);

            // 通知错误管理器
            await this.errorNotificationManager.handleDiagnosticsUpdate(document.uri, diagnostics);

            this.logger.debug('Diagnostics updated', {
                file: document.fileName,
                diagnosticCount: diagnostics.length,
                errorCount: diagnostics.filter((d) => d.severity === DiagnosticSeverity.Error).length,
                warningCount: diagnostics.filter((d) => d.severity === DiagnosticSeverity.Warning).length,
            });

            // 发布诊断更新事件（节流处理，避免事件风暴）
            this.publishDiagnosticsEventThrottled(document.uri, diagnostics.length);
        } catch (error) {
            this.logger.error('Error updating diagnostics', error as Error, {
                file: document.fileName,
            });
        } finally {
            timer.stop({
                document: document.fileName,
            });
        }
    }

    /**
     * 核心诊断逻辑
     */
    protected async doUpdateDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
        this.logger.debug('Updating diagnostics', {
            file: document.fileName,
            languageId: document.languageId,
        });

        const diagnostics: Diagnostic[] = [];

        // 1. 解析文档获取解析错误
        const parseResult = await this.templateService.parseDocument(document);

        // 处理解析错误
        for (const error of parseResult.errors) {
            const diagnostic = new Diagnostic(
                error.range || new Range(0, 0, 0, 0),
                error.message,
                this.mapSeverity(error.severity),
            );
            diagnostic.source = TemplateDiagnosticProvider.DIAGNOSTIC_SOURCE;
            diagnostics.push(diagnostic);
        }

        // 2. 查找和验证模板使用
        const templateUsages = await this.templateReferenceFinder.findTemplateUsages(document);

        for (const usage of templateUsages) {
            const validationDiagnostics = await this.templateParameterValidator.validateTemplateUsage(usage, document);
            diagnostics.push(...validationDiagnostics);
        }

        // 3. 验证扩展参数类型
        const extendedTypeDiagnostics = await this.extendedTypeValidator.validateExtendedParameterTypes(document);
        diagnostics.push(...extendedTypeDiagnostics);

        // 4. 增强诊断信息（添加相关信息和标签）
        return this.enhanceDiagnostics(diagnostics);
    }

    /**
     * 增强诊断信息（不可变，返回新数组）
     */
    private enhanceDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
        return diagnostics.map((diagnostic) => {
            let message = diagnostic.message;

            // 添加更友好的消息
            if (diagnostic.code === 'syntax-error') {
                message = `${message}\n💡 Hint: Check YAML syntax and ensure correct indentation`;
            }

            // 为错误级别的诊断添加严重性指示（避免重复添加 emoji 前缀）
            if (diagnostic.severity === DiagnosticSeverity.Error && !message.startsWith('❌')) {
                message = `❌ ${message}`;
            } else if (diagnostic.severity === DiagnosticSeverity.Warning && !message.startsWith('⚠️')) {
                message = `⚠️  ${message}`;
            }

            // 未修改则返回原对象
            if (message === diagnostic.message) {
                return diagnostic;
            }

            const enhanced = new Diagnostic(diagnostic.range, message, diagnostic.severity);
            enhanced.source = diagnostic.source;
            enhanced.code = diagnostic.code;
            enhanced.relatedInformation = diagnostic.relatedInformation;
            return enhanced;
        });
    }

    /**
     * 映射严重级别
     */
    private mapSeverity(severity: string): DiagnosticSeverity {
        switch (severity.toLowerCase()) {
            case 'error':
                return DiagnosticSeverity.Error;
            case 'warning':
                return DiagnosticSeverity.Warning;
            case 'info':
                return DiagnosticSeverity.Information;
            case 'hint':
                return DiagnosticSeverity.Hint;
            default:
                return DiagnosticSeverity.Error;
        }
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners(): void {
        // 监听模板变更事件，清除缓存
        this.subscriptions.push(
            this.eventBus.subscribe('template.*', () => {
                this.diagnosticCache.clear();
            }),
        );

        // 监听配置变更
        this.subscriptions.push(
            this.eventBus.subscribe<{ key: string; newValue: unknown }>('extension.configuration.changed', (event) => {
                if (event.key.startsWith('diagnostics.')) {
                    this.logger.info('Diagnostics configuration changed', {
                        key: event.key,
                        newValue: event.newValue,
                    });
                    this.diagnosticCache.clear();
                }
            }),
        );
    }

    override clearDiagnostics(uri: Uri): void {
        super.clearDiagnostics(uri);
        this.diagnosticCache.delete(uri.toString());
        this.logger.debug('Diagnostics cleared', {
            file: uri.fsPath,
        });
    }

    /**
     * 清除文档的诊断缓存（不清除 UI 上的诊断）
     */
    clearCache(uri: Uri): void {
        this.diagnosticCache.delete(uri.toString());
    }

    /**
     * 获取缓存统计信息
     */
    getCacheStats(): { size: number; hits: number; misses: number; hitRate: number } {
        return this.diagnosticCache.getStats();
    }

    /**
     * 节流发布诊断更新事件
     *
     * 避免快速连续编辑时产生事件风暴
     *
     * @param uri 文档 URI
     * @param diagnosticCount 诊断数量
     */
    private publishDiagnosticsEventThrottled(uri: Uri, diagnosticCount: number): void {
        // 清除之前的待发布事件
        if (this.pendingEventPublish) {
            clearTimeout(this.pendingEventPublish);
        }

        // 延迟发布事件
        this.pendingEventPublish = setTimeout(() => {
            this.pendingEventPublish = null;
            this.eventBus
                .publish('diagnostics.updated', {
                    id: generateEventId('diag'),
                    type: 'diagnostics.updated',
                    timestamp: new Date(),
                    source: 'DiagnosticProvider',
                    uri,
                    diagnosticCount,
                })
                .catch((error) => {
                    this.logger.debug('Failed to publish diagnostics event', {
                        error: (error as Error).message,
                    });
                });
        }, TemplateDiagnosticProvider.DEFAULT_EVENT_THROTTLE_DELAY);
    }

    override dispose(): void {
        // 清除待发布的事件
        if (this.pendingEventPublish) {
            clearTimeout(this.pendingEventPublish);
            this.pendingEventPublish = null;
        }
        this.errorNotificationManager.dispose();
        this.diagnosticCache.clear();
        this.logger.debug('Diagnostic provider disposed');
        super.dispose();
    }
}
