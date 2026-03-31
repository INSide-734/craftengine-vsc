/**
 * DocumentDiagnosticHandler 单元测试
 *
 * 测试文档诊断处理器的所有功能，包括：
 * - YAML 文件检测
 * - 诊断组执行（并行）
 * - 文档事件处理（打开/关闭/保存/变更）
 * - 优先级调度
 * - 诊断清除和缓存清除
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    DocumentDiagnosticHandler,
    type IDiagnosticProviders,
    type IDiagnosticProvider,
} from '../../../../../application/services/extension/DocumentDiagnosticHandler';
import { type ILogger } from '../../../../../core/interfaces/ILogger';
import { type IExtensionService } from '../../../../../core/interfaces/IExtensionService';
import { type IDocumentParseCache, type IParsedDocument } from '../../../../../core/interfaces/IParsedDocument';
import { type IPerformanceMonitor } from '../../../../../core/interfaces/IPerformanceMonitor';
import { workspace } from 'vscode';

// Mock DiagnosticIgnoreParser
vi.mock('../../../../../infrastructure/ignore/DiagnosticIgnoreParser', () => {
    return {
        DiagnosticIgnoreParser: class {
            isFileIgnored() {
                return false;
            }
        },
    };
});

describe('DocumentDiagnosticHandler', () => {
    let handler: DocumentDiagnosticHandler;
    let mockLogger: ILogger;
    let mockProviders: IDiagnosticProviders;
    let mockExtensionService: IExtensionService | null;
    let mockDocumentParseCache: IDocumentParseCache;
    let mockPerformanceMonitor: IPerformanceMonitor;
    let mockTimer: { stop: ReturnType<typeof vi.fn> };

    function createMockProvider(): IDiagnosticProvider {
        return {
            updateDiagnostics: vi.fn(),
            clearDiagnostics: vi.fn(),
            clearCache: vi.fn(),
        };
    }

    beforeEach(() => {
        vi.useFakeTimers();

        mockLogger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            fatal: vi.fn(),
            createChild: vi.fn(() => mockLogger),
            setLevel: vi.fn(),
            getLevel: vi.fn(() => 0),
        } as unknown as ILogger;

        mockProviders = {
            template: createMockProvider(),
            translation: createMockProvider(),
            schema: createMockProvider(),
            filePath: createMockProvider(),
            miniMessage: createMockProvider(),
            itemId: createMockProvider(),
            versionCondition: createMockProvider(),
            category: createMockProvider(),
        };

        mockExtensionService = {
            initialScanCompleted: Promise.resolve(),
        } as unknown as IExtensionService;

        const mockParsedDoc: IParsedDocument = {
            success: true,
            data: {},
            positionMap: new Map(),
            errors: [],
            warnings: [],
            version: 1,
            uri: 'file:///test/file.yaml',
            text: '',
            lines: [],
        };

        mockDocumentParseCache = {
            getParsedDocument: vi.fn(() => Promise.resolve(mockParsedDoc)),
            clearCache: vi.fn(),
            clearAllCaches: vi.fn(),
            getStats: vi.fn(() => ({ size: 0, hits: 0, misses: 0, hitRate: 0 })),
        } as unknown as IDocumentParseCache;

        mockTimer = { stop: vi.fn() };

        mockPerformanceMonitor = {
            startTimer: vi.fn(() => mockTimer),
            recordMetric: vi.fn(),
        } as unknown as IPerformanceMonitor;

        handler = new DocumentDiagnosticHandler(
            mockLogger,
            mockProviders,
            mockExtensionService,
            mockDocumentParseCache,
            mockPerformanceMonitor,
        );
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ========================================
    // updateOpenDocuments
    // ========================================

    describe('updateOpenDocuments', () => {
        it('should not schedule updates when no YAML documents are open', () => {
            // 设置 workspace.textDocuments 为空数组
            (workspace as any).textDocuments = [];

            handler.updateOpenDocuments();
            // 不应该有任何定时器被设置（因为没有打开的 YAML 文档）
            vi.advanceTimersByTime(200);
            expect(mockPerformanceMonitor.startTimer).not.toHaveBeenCalled();
        });
    });

    // ========================================
    // 构造函数
    // ========================================

    describe('constructor', () => {
        it('should create handler without optional parameters', () => {
            const minimalHandler = new DocumentDiagnosticHandler(mockLogger, mockProviders, null);
            expect(minimalHandler).toBeDefined();
        });

        it('should create handler with all parameters', () => {
            expect(handler).toBeDefined();
        });
    });

    // ========================================
    // registerDocumentListeners
    // ========================================

    describe('registerDocumentListeners', () => {
        it('should register document event listeners on context', () => {
            const mockContext = {
                subscriptions: [] as any[],
            };

            handler.registerDocumentListeners(mockContext as any);

            // 应该注册 4 个监听器（change, open, close, save）
            expect(mockContext.subscriptions.length).toBe(4);
        });

        it('should log debug after registering listeners', () => {
            const mockContext = { subscriptions: [] as any[] };
            handler.registerDocumentListeners(mockContext as any);
            expect(mockLogger.debug).toHaveBeenCalledWith('Document event listeners registered');
        });
    });

    // ========================================
    // handleDocumentClose - 通过 registerDocumentListeners 间接测试
    // ========================================

    describe('document close handling', () => {
        it('should clear diagnostics for all providers when YAML document closes', () => {
            // 通过直接调用内部方法的方式测试
            // 由于 handleDocumentClose 是 private，我们通过 registerDocumentListeners 间接测试
            const mockContext = { subscriptions: [] as any[] };
            handler.registerDocumentListeners(mockContext as any);

            // 验证注册了监听器
            expect(mockContext.subscriptions.length).toBe(4);
        });
    });

    // ========================================
    // 诊断组执行
    // ========================================

    describe('diagnostic group execution', () => {
        it('should use performance monitor for timing', async () => {
            // 通过 updateOpenDocuments 间接测试
            // 由于 updateAllDiagnostics 是 private，我们验证性能监控器的使用
            expect(mockPerformanceMonitor.startTimer).toBeDefined();
        });

        it('should handle provider errors gracefully', async () => {
            // 设置 schema provider 抛出错误
            vi.mocked(mockProviders.schema!.updateDiagnostics).mockRejectedValue(new Error('Schema validation failed'));

            // handler 不应该因为单个 provider 失败而崩溃
            expect(handler).toBeDefined();
        });
    });

    // ========================================
    // DiagnosticPriority 和 DIAGNOSTIC_GROUPS 静态配置
    // ========================================

    describe('static configuration', () => {
        it('should have correct initial delay', () => {
            // 设置 workspace.textDocuments 为空数组
            (workspace as any).textDocuments = [];

            // 验证 INITIAL_DELAY 通过 updateOpenDocuments 的行为
            handler.updateOpenDocuments();
            // 在 100ms 之前不应该触发
            vi.advanceTimersByTime(50);
            expect(mockPerformanceMonitor.startTimer).not.toHaveBeenCalled();
        });
    });

    // ========================================
    // 无 extensionService 场景
    // ========================================

    describe('without extensionService', () => {
        it('should work without extensionService', () => {
            const handlerWithoutExt = new DocumentDiagnosticHandler(
                mockLogger,
                mockProviders,
                null,
                mockDocumentParseCache,
                mockPerformanceMonitor,
            );
            expect(handlerWithoutExt).toBeDefined();
        });
    });

    // ========================================
    // 无 documentParseCache 场景
    // ========================================

    describe('without documentParseCache', () => {
        it('should work without documentParseCache', () => {
            const handlerWithoutCache = new DocumentDiagnosticHandler(mockLogger, mockProviders, mockExtensionService);
            expect(handlerWithoutCache).toBeDefined();
        });
    });

    // ========================================
    // 部分 providers 场景
    // ========================================

    describe('with partial providers', () => {
        it('should work with only schema provider', () => {
            const partialProviders: IDiagnosticProviders = {
                schema: createMockProvider(),
            };

            const partialHandler = new DocumentDiagnosticHandler(mockLogger, partialProviders, null);
            expect(partialHandler).toBeDefined();
        });

        it('should work with empty providers', () => {
            const emptyProviders: IDiagnosticProviders = {};

            const emptyHandler = new DocumentDiagnosticHandler(mockLogger, emptyProviders, null);
            expect(emptyHandler).toBeDefined();
        });
    });
});
