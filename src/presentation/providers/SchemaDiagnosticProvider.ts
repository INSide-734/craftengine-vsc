import { type TextDocument, Diagnostic, DiagnosticSeverity, Range, type Uri } from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { type IEventBus } from '../../core/interfaces/IEventBus';
import { type ISchemaParser } from '../../core/interfaces/ISchemaParser';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { SchemaValidator } from '../../infrastructure/schema/SchemaValidator';
import { generateEventId } from '../../infrastructure/utils';
import { type IParsedDocument, type IPositionInfo } from '../../core/interfaces/IParsedDocument';
import { DiagnosticCache } from '../../infrastructure/cache/DiagnosticCache';
import { SchemaDiagnosticFormatter } from './helpers/SchemaDiagnosticFormatter';
import { YamlPositionMapper } from './helpers/YamlPositionMapper';
import { BaseDiagnosticProvider } from './BaseDiagnosticProvider';
import * as yaml from 'yaml';

/**
 * Schema 诊断提供者
 *
 * 提供基于 JSON Schema 的 YAML 文档验证和实时诊断功能。
 * 位置解析和诊断格式化委托给 SchemaPositionResolver 和 SchemaDiagnosticFormatter。
 */
export class SchemaDiagnosticProvider extends BaseDiagnosticProvider {
    private readonly schemaValidator: SchemaValidator;
    private readonly eventBus: IEventBus;
    private readonly diagnosticFormatter: SchemaDiagnosticFormatter;
    private readonly positionMapper: YamlPositionMapper;

    private static readonly DEFAULT_CACHE_CAPACITY = 100;
    private static readonly DEFAULT_CACHE_TTL = 60000;
    private readonly diagnosticCache: DiagnosticCache<Diagnostic[]>;

    constructor() {
        super(
            'craftengine-schema',
            'CraftEngine Schema',
            'schema-diagnostics.update',
            'SchemaDiagnosticProvider',
            'craftengine.diagnostics.schemaValidation',
        );

        this.eventBus = ServiceContainer.getService<IEventBus>(SERVICE_TOKENS.EventBus);
        this.schemaValidator = new SchemaValidator(
            ServiceContainer.getService<ISchemaParser>(SERVICE_TOKENS.SchemaParser),
            this.configuration,
            ServiceContainer.getService(SERVICE_TOKENS.Logger),
        );
        this.diagnosticFormatter = new SchemaDiagnosticFormatter(this.logger);
        this.positionMapper = new YamlPositionMapper(this.logger);

        this.diagnosticCache = new DiagnosticCache<Diagnostic[]>(
            {
                capacity: SchemaDiagnosticProvider.DEFAULT_CACHE_CAPACITY,
                ttl: SchemaDiagnosticProvider.DEFAULT_CACHE_TTL,
                name: 'SchemaDiagnosticCache',
            },
            this.logger,
        );

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.disposeFns.push(
            this.configuration.onChange((event) => {
                if (event.key.startsWith('craftengine.validation')) {
                    this.logger.info('Validation configuration changed, clearing cache');
                    this.diagnosticCache.clear();
                }
            }),
        );

        this.subscriptions.push(
            this.eventBus.subscribe('schema.reloaded', () => {
                this.logger.info('Schema reloaded, clearing diagnostic cache');
                this.diagnosticCache.clear();
            }),
        );
    }

    /**
     * 更新文档的诊断信息
     *
     * 覆盖基类模板方法以支持缓存、版本检查和去重逻辑
     */
    override async updateDiagnostics(document: TextDocument, parsedDoc?: unknown): Promise<void> {
        const timer = this.performanceMonitor.startTimer(this.timerName);
        const startVersion = document.version;

        try {
            if (!this.configuration.get('diagnostics.enabled', true)) {
                return;
            }
            if (!this.configuration.get('craftengine.diagnostics.schemaValidation', true)) {
                this.logger.debug('Schema validation is disabled');
                return;
            }
            if (document.languageId !== 'yaml') {
                return;
            }

            this.logger.debug('Updating schema diagnostics', {
                file: document.fileName,
                version: document.version,
                useParsedDoc: !!parsedDoc,
            });

            // 检查缓存
            const cacheKey = document.uri.toString();
            const cached = this.diagnosticCache.get(cacheKey, document.version);
            if (cached) {
                this.diagnosticCollection.set(document.uri, cached);
                timer.stop({ success: 'true', fromCache: 'true' });
                return;
            }

            const diagnostics = await this.doSchemaUpdateDiagnostics(
                document,
                parsedDoc as IParsedDocument | undefined,
                startVersion,
            );

            if (diagnostics === null) {
                // 版本已变更，跳过设置诊断
                timer.stop({ success: 'true', skipped: 'version_changed' });
                return;
            }

            // 去重后设置诊断
            this.setDiagnosticsDeduped(document, diagnostics);
            this.diagnosticCache.set(cacheKey, diagnostics, document.version);

            timer.stop({ success: 'true', diagnosticsCount: String(diagnostics.length) });

            await this.eventBus.publish('schema-diagnostics.updated', {
                id: generateEventId('schema-diag'),
                type: 'schema-diagnostics.updated',
                timestamp: new Date(),
                uri: document.uri,
                diagnosticsCount: diagnostics.length,
            });
        } catch (error) {
            this.logger.error('Failed to update schema diagnostics', error as Error, {
                file: document.fileName,
            });
            timer.stop({ success: 'false', error: (error as Error).message });
        }
    }

    /**
     * 基类抽象方法实现（不由基类模板方法调用，因为 updateDiagnostics 已被覆盖）
     */
    protected async doUpdateDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
        return (await this.doSchemaUpdateDiagnostics(document)) ?? [];
    }

    /**
     * 核心诊断逻辑
     *
     * 由 updateDiagnostics 调用，不直接由基类模板方法调用
     */
    private async doSchemaUpdateDiagnostics(
        document: TextDocument,
        parsedDoc?: IParsedDocument,
        startVersion?: number,
    ): Promise<Diagnostic[] | null> {
        const version = startVersion ?? document.version;
        const diagnostics: Diagnostic[] = [];

        // 1. 解析 YAML 文档
        let parseResult: {
            success: boolean;
            data?: unknown;
            positionMap?: Map<string, IPositionInfo>;
            diagnostics: Diagnostic[];
        };

        if (parsedDoc && parsedDoc.version === version) {
            parseResult = this.convertParsedDocument(parsedDoc);
        } else {
            parseResult = await this.parseDocument(document);
        }

        if (!parseResult.success) {
            diagnostics.push(...parseResult.diagnostics);
            if (document.version !== version) {
                return null;
            }
            this.setDiagnosticsDeduped(document, diagnostics);
            return diagnostics;
        }

        // 2. Schema 验证
        if (!parseResult.data) {
            return diagnostics;
        }
        const validationDiagnostics = await this.validateAgainstSchema(
            document,
            parseResult.data,
            parseResult.positionMap,
        );
        diagnostics.push(...validationDiagnostics);

        if (document.version !== version) {
            return null;
        }

        return diagnostics;
    }

    /**
     * 将预解析文档转换为内部格式
     */
    private convertParsedDocument(parsedDoc: IParsedDocument): {
        success: boolean;
        data?: unknown;
        positionMap?: Map<string, IPositionInfo>;
        diagnostics: Diagnostic[];
    } {
        const diagnostics: Diagnostic[] = [];

        for (const error of parsedDoc.errors) {
            const diagnostic = new Diagnostic(
                error.range,
                error.message,
                error.severity === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
            );
            diagnostic.source = 'CraftEngine Schema';
            diagnostic.code = error.code || 'yaml_error';
            diagnostics.push(diagnostic);
        }

        for (const warning of parsedDoc.warnings) {
            const diagnostic = new Diagnostic(warning.range, warning.message, DiagnosticSeverity.Warning);
            diagnostic.source = 'CraftEngine Schema';
            diagnostic.code = warning.code || 'yaml_warning';
            diagnostics.push(diagnostic);
        }

        return { success: parsedDoc.success, data: parsedDoc.data, positionMap: parsedDoc.positionMap, diagnostics };
    }

    /**
     * 解析 YAML 文档
     */
    private async parseDocument(document: TextDocument): Promise<{
        success: boolean;
        data?: unknown;
        positionMap?: Map<string, IPositionInfo>;
        diagnostics: Diagnostic[];
    }> {
        const diagnostics: Diagnostic[] = [];

        try {
            const text = document.getText();
            const astDocument = yaml.parseDocument(text, { strict: false, prettyErrors: true });

            if (astDocument.errors && astDocument.errors.length > 0) {
                for (const error of astDocument.errors) {
                    diagnostics.push(this.diagnosticFormatter.createParseErrorDiagnostic(error, document));
                }
                return { success: false, diagnostics };
            }

            if (astDocument.warnings && astDocument.warnings.length > 0) {
                for (const warning of astDocument.warnings) {
                    diagnostics.push(this.diagnosticFormatter.createParseWarningDiagnostic(warning, document));
                }
            }

            const data = astDocument.toJS();
            const positionMap = this.positionMapper.buildPositionMap(astDocument, document);

            return { success: true, data, positionMap, diagnostics };
        } catch (error) {
            const diagnostic = new Diagnostic(
                new Range(0, 0, 0, 1),
                `YAML parse error: ${(error as Error).message}`,
                DiagnosticSeverity.Error,
            );
            diagnostic.source = 'CraftEngine Schema';
            diagnostic.code = 'yaml_parse_error';
            diagnostics.push(diagnostic);
            return { success: false, diagnostics };
        }
    }

    /**
     * 针对 Schema 进行验证
     */
    private async validateAgainstSchema(
        document: TextDocument,
        _data: unknown,
        positionMap?: Map<string, IPositionInfo>,
    ): Promise<Diagnostic[]> {
        const diagnostics: Diagnostic[] = [];

        try {
            const validationResult = await this.schemaValidator.validateDocument(document.getText());

            if (validationResult.valid) {
                return diagnostics;
            }

            for (const error of validationResult.errors) {
                const diagnostic = await this.diagnosticFormatter.createValidationDiagnostic(
                    error,
                    document,
                    positionMap,
                );
                if (diagnostic) {
                    diagnostics.push(diagnostic);
                }
            }

            for (const warning of validationResult.warnings || []) {
                const diagnostic = await this.diagnosticFormatter.createValidationDiagnostic(
                    warning,
                    document,
                    positionMap,
                    DiagnosticSeverity.Warning,
                );
                if (diagnostic) {
                    diagnostics.push(diagnostic);
                }
            }
        } catch (error) {
            this.logger.error('Schema validation failed', error as Error);
        }

        return diagnostics;
    }

    /**
     * 设置诊断信息（去重）
     */
    private setDiagnosticsDeduped(document: TextDocument, diagnostics: Diagnostic[]): void {
        const seen = new Set<string>();
        const uniqueDiagnostics = diagnostics.filter((d) => {
            const codeValue =
                typeof d.code === 'object' && d.code !== null ? (d.code as { value: string | number }).value : d.code;

            const key = [
                d.range.start.line,
                d.range.start.character,
                d.range.end.line,
                d.range.end.character,
                d.message,
                d.source || '',
                codeValue ?? '',
            ].join(':');

            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });

        this.diagnosticCollection.set(document.uri, uniqueDiagnostics);
    }

    override clearDiagnostics(uri: Uri): void {
        super.clearDiagnostics(uri);
        this.diagnosticCache.delete(uri.toString());
    }

    clearCache(uri: Uri): void {
        this.diagnosticCache.delete(uri.toString());
    }

    clearAll(): void {
        this.diagnosticCollection.clear();
        this.diagnosticCache.clear();
    }

    getCacheStats(): { size: number; hits: number; misses: number; hitRate: number } {
        return this.diagnosticCache.getStats();
    }

    override dispose(): void {
        this.diagnosticCache.clear();
        this.logger.info('SchemaDiagnosticProvider disposed');
        super.dispose();
    }
}
