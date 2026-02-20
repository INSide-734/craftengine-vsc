/**
 * SchemaDiagnosticProvider 单元测试
 *
 * 测试 Schema 诊断提供者的基本功能
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TextDocument, Uri, DiagnosticSeverity } from '../../../__mocks__/vscode';
import type { TextDocument as VscodeTextDocument } from 'vscode';
import { ServiceContainer } from '../../../../infrastructure/ServiceContainer';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import { type IConfiguration } from '../../../../core/interfaces/IConfiguration';
import { type IEventBus } from '../../../../core/interfaces/IEventBus';
import { type PerformanceMonitor } from '../../../../infrastructure/performance/PerformanceMonitor';
import { SERVICE_TOKENS } from '../../../../core/constants/ServiceTokens';

// Mock ServiceContainer
vi.mock('../../../../infrastructure/ServiceContainer', () => ({
    ServiceContainer: {
        getService: vi.fn(),
    },
}));

// Mock SchemaValidator
const mockSchemaValidator = {
    validateDocument: vi.fn().mockResolvedValue({ valid: true, errors: [], warnings: [] }),
};
vi.mock('../../../../infrastructure/schema/SchemaValidator', () => ({
    SchemaValidator: class {
        validateDocument = mockSchemaValidator.validateDocument;
    },
}));

// Mock DiagnosticSeverityConfig
const mockSeverityConfig = {
    getSeverity: vi.fn().mockReturnValue(DiagnosticSeverity.Error),
    shouldIgnore: vi.fn().mockReturnValue(false),
};
vi.mock('../../../../infrastructure/config/DiagnosticSeverityConfig', () => ({
    DiagnosticSeverityConfig: class {
        getSeverity = mockSeverityConfig.getSeverity;
        shouldIgnore = mockSeverityConfig.shouldIgnore;
    },
}));

// Mock DiagnosticCache
const mockDiagnosticCache = {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    getStats: vi
        .fn()
        .mockReturnValue({ size: 0, capacity: 100, hits: 0, misses: 0, hitRate: 0, expirations: 0, evictions: 0 }),
};
vi.mock('../../../../infrastructure/cache/DiagnosticCache', () => ({
    DiagnosticCache: class {
        get = mockDiagnosticCache.get;
        set = mockDiagnosticCache.set;
        delete = mockDiagnosticCache.delete;
        clear = mockDiagnosticCache.clear;
        getStats = mockDiagnosticCache.getStats;
    },
}));

// Mock generateEventId
vi.mock('../../../../infrastructure/utils', () => ({
    generateEventId: vi.fn().mockReturnValue('test-event-id'),
}));

// Mock DiagnosticCodes
vi.mock('../../../../core/constants/DiagnosticCodes', () => ({
    getDiagnosticCodeInfo: vi.fn().mockReturnValue(null),
    mapAjvKeywordToCode: vi.fn().mockImplementation((keyword: string) => keyword),
}));

// Mock DiagnosticMessages
vi.mock('../../../../core/constants/DiagnosticMessages', () => ({
    SCHEMA_MESSAGES: {
        required: (field: string) => `Missing required field: ${field}`,
        type: (type: string) => `Invalid type, expected ${type}`,
        enum: (values: string[]) => `Invalid value, must be one of: ${values.join(', ')}`,
        additionalProperties: (prop: string) => `Unknown property: ${prop}`,
        pattern: () => 'Value does not match the required pattern',
        minLength: (len: number) => `String is too short, minimum length is ${len}`,
        maxLength: (len: number) => `String is too long, maximum length is ${len}`,
        minimum: (val: number) => `Value is too small, minimum is ${val}`,
        maximum: (val: number) => `Value is too large, maximum is ${val}`,
    },
}));

describe('SchemaDiagnosticProvider', () => {
    let mockLogger: ILogger;
    let mockConfiguration: IConfiguration;
    let mockEventBus: IEventBus;
    let mockPerformanceMonitor: PerformanceMonitor;

    beforeEach(() => {
        // 创建 mock logger
        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            createChild: vi.fn().mockReturnThis(),
        } as unknown as ILogger;

        // 创建 mock configuration
        mockConfiguration = {
            get: vi.fn().mockImplementation((key: string, defaultValue?: unknown) => {
                if (key === 'craftengine.diagnostics.schemaValidation') {
                    return true;
                }
                return defaultValue;
            }),
            onChange: vi.fn().mockReturnValue(vi.fn()),
        } as unknown as IConfiguration;

        // 创建 mock event bus
        mockEventBus = {
            publish: vi.fn().mockResolvedValue(undefined),
            subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn(), isActive: vi.fn().mockReturnValue(true) }),
        } as unknown as IEventBus;

        // 创建 mock performance monitor
        mockPerformanceMonitor = {
            startTimer: vi.fn().mockReturnValue({
                stop: vi.fn(),
            }),
        } as unknown as PerformanceMonitor;

        // 配置 ServiceContainer mock
        vi.mocked(ServiceContainer.getService).mockImplementation((token: string | symbol) => {
            if (token === SERVICE_TOKENS.Logger) {
                return mockLogger;
            }
            if (token === SERVICE_TOKENS.Configuration) {
                return mockConfiguration;
            }
            if (token === SERVICE_TOKENS.EventBus) {
                return mockEventBus;
            }
            if (token === SERVICE_TOKENS.PerformanceMonitor) {
                return mockPerformanceMonitor;
            }
            if (token === SERVICE_TOKENS.SchemaParser) {
                return {};
            }
            throw new Error(`Service not found: ${token.toString()}`);
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
        mockDiagnosticCache.get.mockReturnValue(null);
    });

    // 辅助函数：创建测试文档
    function createDocument(content: string, languageId: string = 'yaml'): VscodeTextDocument {
        return new TextDocument(Uri.file('/test/file.yaml'), content, languageId) as unknown as VscodeTextDocument;
    }

    // ========================================
    // 基本功能测试（延迟加载 provider）
    // ========================================

    describe('SchemaDiagnosticProvider basic tests', () => {
        it('should be importable', async () => {
            // 动态导入以避免在模块加载时崩溃
            const { SchemaDiagnosticProvider } =
                await import('../../../../presentation/providers/SchemaDiagnosticProvider.js');
            expect(SchemaDiagnosticProvider).toBeDefined();
        });

        it('should create instance', async () => {
            const { SchemaDiagnosticProvider } =
                await import('../../../../presentation/providers/SchemaDiagnosticProvider.js');
            const provider = new SchemaDiagnosticProvider();
            expect(provider).toBeDefined();
            provider.dispose();
        });

        it('should skip non-yaml files', async () => {
            const { SchemaDiagnosticProvider } =
                await import('../../../../presentation/providers/SchemaDiagnosticProvider.js');
            const provider = new SchemaDiagnosticProvider();
            const document = createDocument('hello world', 'plaintext');

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalledWith('schema-diagnostics.update');
            provider.dispose();
        });

        it('should skip when diagnostics disabled', async () => {
            // 仅禁用 schema validation，保持全局 diagnostics.enabled 为 true
            vi.mocked(mockConfiguration.get).mockImplementation((key: string, defaultValue?: unknown) => {
                if (key === 'craftengine.diagnostics.schemaValidation') {
                    return false;
                }
                if (key === 'diagnostics.enabled') {
                    return true;
                }
                return defaultValue;
            });
            const { SchemaDiagnosticProvider } =
                await import('../../../../presentation/providers/SchemaDiagnosticProvider.js');
            const provider = new SchemaDiagnosticProvider();
            const document = createDocument('key: value');

            await provider.updateDiagnostics(document);

            expect(mockLogger.debug).toHaveBeenCalledWith('Schema validation is disabled');
            provider.dispose();
        });

        it('should process valid yaml document', async () => {
            const { SchemaDiagnosticProvider } =
                await import('../../../../presentation/providers/SchemaDiagnosticProvider.js');
            const provider = new SchemaDiagnosticProvider();
            const document = createDocument('key: value');

            await provider.updateDiagnostics(document);

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Updating schema diagnostics',
                expect.objectContaining({
                    file: expect.any(String),
                }),
            );
            provider.dispose();
        });

        it('should publish diagnostics updated event', async () => {
            const { SchemaDiagnosticProvider } =
                await import('../../../../presentation/providers/SchemaDiagnosticProvider.js');
            const provider = new SchemaDiagnosticProvider();
            const document = createDocument('key: value');

            await provider.updateDiagnostics(document);

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                'schema-diagnostics.updated',
                expect.objectContaining({
                    type: 'schema-diagnostics.updated',
                    uri: document.uri,
                }),
            );
            provider.dispose();
        });

        it('should provide cache stats', async () => {
            const { SchemaDiagnosticProvider } =
                await import('../../../../presentation/providers/SchemaDiagnosticProvider.js');
            const provider = new SchemaDiagnosticProvider();

            const stats = provider.getCacheStats();

            expect(stats).toHaveProperty('size');
            expect(stats).toHaveProperty('hits');
            expect(stats).toHaveProperty('misses');
            expect(stats).toHaveProperty('hitRate');
            provider.dispose();
        });

        it('should clear cache on clearDiagnostics', async () => {
            const { SchemaDiagnosticProvider } =
                await import('../../../../presentation/providers/SchemaDiagnosticProvider.js');
            const provider = new SchemaDiagnosticProvider();
            const uri = Uri.file('/test/file.yaml');

            provider.clearDiagnostics(uri);

            expect(mockDiagnosticCache.delete).toHaveBeenCalled();
            provider.dispose();
        });

        it('should clear all cache on clearAll', async () => {
            const { SchemaDiagnosticProvider } =
                await import('../../../../presentation/providers/SchemaDiagnosticProvider.js');
            const provider = new SchemaDiagnosticProvider();

            provider.clearAll();

            expect(mockDiagnosticCache.clear).toHaveBeenCalled();
            provider.dispose();
        });

        it('should dispose resources', async () => {
            const { SchemaDiagnosticProvider } =
                await import('../../../../presentation/providers/SchemaDiagnosticProvider.js');
            const provider = new SchemaDiagnosticProvider();

            provider.dispose();

            expect(mockLogger.info).toHaveBeenCalledWith('SchemaDiagnosticProvider disposed');
        });

        it('should subscribe to configuration changes', async () => {
            const { SchemaDiagnosticProvider } =
                await import('../../../../presentation/providers/SchemaDiagnosticProvider.js');
            const provider = new SchemaDiagnosticProvider();

            expect(mockConfiguration.onChange).toHaveBeenCalled();
            provider.dispose();
        });

        it('should subscribe to schema reload events', async () => {
            const { SchemaDiagnosticProvider } =
                await import('../../../../presentation/providers/SchemaDiagnosticProvider.js');
            const provider = new SchemaDiagnosticProvider();

            expect(mockEventBus.subscribe).toHaveBeenCalledWith('schema.reloaded', expect.any(Function));
            provider.dispose();
        });
    });
});
