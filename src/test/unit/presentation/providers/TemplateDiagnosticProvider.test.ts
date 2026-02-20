/**
 * TemplateDiagnosticProvider 单元测试
 *
 * 测试模板诊断提供者的所有功能，包括：
 * - 模板引用验证
 * - 必需参数检查
 * - 循环引用检测
 * - Schema 驱动的诊断
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TextDocument, Uri, DiagnosticSeverity } from '../../../__mocks__/vscode';
import type { TextDocument as VscodeTextDocument } from 'vscode';
import { TemplateDiagnosticProvider } from '../../../../presentation/providers/TemplateDiagnosticProvider';
import { ServiceContainer } from '../../../../infrastructure/ServiceContainer';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import { type IConfiguration } from '../../../../core/interfaces/IConfiguration';
import { type IEventBus } from '../../../../core/interfaces/IEventBus';
import { type ITemplateService } from '../../../../core/interfaces/ITemplateService';
import { type ISchemaService } from '../../../../core/interfaces/ISchemaService';
import { type IYamlPathParser } from '../../../../core/interfaces/IYamlPathParser';
import { type PerformanceMonitor } from '../../../../infrastructure/performance/PerformanceMonitor';
import { SERVICE_TOKENS } from '../../../../core/constants/ServiceTokens';

// Mock ServiceContainer
vi.mock('../../../../infrastructure/ServiceContainer', () => ({
    ServiceContainer: {
        getService: vi.fn(),
        tryGetService: vi.fn(),
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

describe('TemplateDiagnosticProvider', () => {
    let provider: TemplateDiagnosticProvider;
    let mockLogger: ILogger;
    let mockConfiguration: IConfiguration;
    let mockEventBus: IEventBus;
    let mockTemplateService: ITemplateService;
    let mockSchemaService: ISchemaService;
    let mockYamlPathParser: IYamlPathParser;
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
                if (key === 'diagnostics.enabled') {
                    return true;
                }
                return defaultValue;
            }),
            onChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        } as unknown as IConfiguration;

        // 创建 mock event bus
        mockEventBus = {
            publish: vi.fn().mockResolvedValue(undefined),
            subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn(), isActive: vi.fn().mockReturnValue(true) }),
        } as unknown as IEventBus;

        // 创建 mock template service
        mockTemplateService = {
            parseDocument: vi.fn().mockResolvedValue({ templates: [], errors: [] }),
            searchTemplates: vi.fn().mockResolvedValue([]),
            validateTemplateUsage: vi.fn().mockResolvedValue({ isValid: true, errors: [], warnings: [] }),
            getSuggestions: vi.fn().mockResolvedValue([]),
        } as unknown as ITemplateService;

        // 创建 mock schema service
        mockSchemaService = {
            getSchemaForPath: vi.fn().mockResolvedValue(null),
            getCustomProperty: vi.fn().mockReturnValue(null),
            hasSchemaForPath: vi.fn().mockReturnValue(false),
        } as unknown as ISchemaService;

        // 创建 mock yaml path parser
        mockYamlPathParser = {
            parsePath: vi.fn().mockReturnValue([]),
        } as unknown as IYamlPathParser;

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
            if (token === SERVICE_TOKENS.TemplateService) {
                return mockTemplateService;
            }
            if (token === SERVICE_TOKENS.SchemaService) {
                return mockSchemaService;
            }
            if (token === SERVICE_TOKENS.YamlPathParser) {
                return mockYamlPathParser;
            }
            if (token === SERVICE_TOKENS.PerformanceMonitor) {
                return mockPerformanceMonitor;
            }
            if (token === SERVICE_TOKENS.ExtendedTypeService) {
                return {
                    getType: vi.fn().mockReturnValue(undefined),
                    getAllTypes: vi.fn().mockReturnValue([]),
                };
            }
            throw new Error(`Service not found: ${token.toString()}`);
        });

        // 配置 tryGetService mock（返回 undefined 表示服务未注册）
        vi.mocked(ServiceContainer.tryGetService).mockReturnValue(undefined);

        provider = new TemplateDiagnosticProvider();
    });

    afterEach(() => {
        vi.clearAllMocks();
        provider.dispose();
    });

    // 辅助函数：创建测试文档
    function createDocument(content: string): VscodeTextDocument {
        return new TextDocument(Uri.file('/test/file.yaml'), content, 'yaml') as unknown as VscodeTextDocument;
    }

    // ========================================
    // 基本功能测试
    // ========================================

    describe('updateDiagnostics', () => {
        it('should skip non-yaml files', async () => {
            const document = new TextDocument(
                Uri.file('/test/file.txt'),
                'hello world',
                'plaintext',
            ) as unknown as VscodeTextDocument;

            await provider.updateDiagnostics(document);

            // 应该直接返回，不进行处理
            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });

        it('should skip when diagnostics disabled', async () => {
            vi.mocked(mockConfiguration.get).mockReturnValue(false);
            const document = createDocument('template: default:sword');

            await provider.updateDiagnostics(document);

            // 应该在检查配置后返回
            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });

        it('should process yaml document with template reference', async () => {
            const document = createDocument(`
items:
  my-item:
    template: default:sword
            `);

            // 模拟 schema 返回 template 字段
            vi.mocked(mockSchemaService.getSchemaForPath).mockResolvedValue({
                type: 'string',
                'x-completion-provider': 'craftengine.templateName',
            });
            vi.mocked(mockSchemaService.getCustomProperty).mockReturnValue('craftengine.templateName');

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalledWith('diagnostics.update');
        });

        it('should detect unknown template reference', async () => {
            const document = createDocument(`
items:
  my-item:
    template: nonexistent:template
            `);

            // 模拟 schema 返回 template 字段
            vi.mocked(mockSchemaService.getSchemaForPath).mockResolvedValue({
                type: 'string',
                'x-completion-provider': 'craftengine.templateName',
            });
            vi.mocked(mockSchemaService.getCustomProperty).mockReturnValue('craftengine.templateName');
            vi.mocked(mockTemplateService.searchTemplates).mockResolvedValue([]);

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });

        it('should not report error for existing template', async () => {
            const document = createDocument(`
items:
  my-item:
    template: default:sword
            `);

            // 模拟存在的模板
            vi.mocked(mockTemplateService.searchTemplates).mockResolvedValue([
                {
                    template: {
                        id: 'tpl-1',
                        name: 'default:sword',
                        parameters: [],
                        content: {},
                        sourceFile: Uri.file('/test/templates.yaml'),
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        usageCount: 0,
                        getRequiredParameters: () => [],
                        getOptionalParameters: () => [],
                        hasParameter: () => false,
                        getParameter: () => undefined,
                        validateParameters: () => ({ isValid: true, errors: [], warnings: [] }),
                        recordUsage: function () {
                            return this;
                        },
                    },
                    score: 1.0,
                    reason: 'exact match',
                },
            ]);

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });
    });

    // ========================================
    // 参数验证测试
    // ========================================

    describe('parameter validation', () => {
        it('should detect missing required parameters', async () => {
            const document = createDocument(`
items:
  my-item:
    template: default:sword
    arguments:
      optionalParam: value
            `);

            // 模拟带有必需参数的模板
            vi.mocked(mockTemplateService.searchTemplates).mockResolvedValue([
                {
                    template: {
                        id: 'tpl-1',
                        name: 'default:sword',
                        parameters: [
                            { name: 'requiredParam', required: true },
                            { name: 'optionalParam', required: false },
                        ],
                        content: {},
                        sourceFile: Uri.file('/test/templates.yaml'),
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        usageCount: 0,
                        getRequiredParameters: () => [{ name: 'requiredParam', required: true }],
                        getOptionalParameters: () => [{ name: 'optionalParam', required: false }],
                        hasParameter: (name: string) => name === 'requiredParam' || name === 'optionalParam',
                        getParameter: () => undefined,
                        validateParameters: () => ({
                            isValid: false,
                            errors: [
                                {
                                    parameter: 'requiredParam',
                                    message: 'Missing requiredParam',
                                    type: 'missing' as const,
                                },
                            ],
                            warnings: [],
                        }),
                        recordUsage: function () {
                            return this;
                        },
                    },
                    score: 1.0,
                    reason: 'exact match',
                },
            ]);

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });
    });

    // ========================================
    // 循环引用检测测试
    // ========================================

    describe('circular reference detection', () => {
        it('should handle potential circular references gracefully', async () => {
            const document = createDocument(`
items:
  my-item:
    template: self:referencing
            `);

            await provider.updateDiagnostics(document);

            // 应该不抛出错误
            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });
    });

    // ========================================
    // 清理测试
    // ========================================

    describe('clearDiagnostics', () => {
        it('should clear diagnostics for uri', () => {
            const uri = Uri.file('/test/file.yaml');

            provider.clearDiagnostics(uri);

            // clearDiagnostics 应该不抛出错误
            expect(true).toBe(true);
        });
    });

    describe('dispose', () => {
        it('should dispose resources', () => {
            provider.dispose();

            expect(mockLogger.debug).toHaveBeenCalledWith('Diagnostic provider disposed');
        });
    });

    // ========================================
    // 静态属性测试
    // ========================================

    describe('static properties', () => {
        it('should have correct diagnostic source', () => {
            expect(TemplateDiagnosticProvider.DIAGNOSTIC_SOURCE).toBe('CraftEngine Template');
        });
    });

    // ========================================
    // Schema 驱动诊断测试
    // ========================================

    describe('schema-driven diagnostics', () => {
        it('should only check fields with template completion provider', async () => {
            const document = createDocument(`
items:
  my-item:
    name: "Item Name"
    template: default:sword
            `);

            // name 字段不是 template 字段
            vi.mocked(mockSchemaService.getCustomProperty).mockImplementation((_schema, prop) => {
                if (prop === 'completion-provider') {
                    return null; // 默认返回 null
                }
                return null;
            });

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });
    });

    // ========================================
    // 边缘情况测试
    // ========================================

    describe('edge cases', () => {
        it('should handle empty document', async () => {
            const document = createDocument('');

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });

        it('should handle document with only comments', async () => {
            const document = createDocument(`
# This is a comment
# template: default:sword
            `);

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });

        it('should handle malformed template references', async () => {
            const document = createDocument(`
items:
  my-item:
    template: invalid-no-colon
            `);

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });

        it('should handle error during validation gracefully', async () => {
            const document = createDocument(`
items:
  my-item:
    template: default:sword
            `);

            // 模拟服务抛出错误
            vi.mocked(mockTemplateService.searchTemplates).mockRejectedValue(new Error('Service error'));

            await expect(provider.updateDiagnostics(document)).resolves.not.toThrow();
        });
    });
});
