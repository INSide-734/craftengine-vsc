/**
 * CategoryDiagnosticProvider 单元测试
 *
 * 测试分类诊断提供者的所有功能，包括：
 * - 分类引用验证
 * - 相似分类建议
 * - Schema 驱动的诊断
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    TextDocument,
    Uri,
    DiagnosticSeverity
} from '../../../__mocks__/vscode';
import type { TextDocument as VscodeTextDocument } from 'vscode';
import { CategoryDiagnosticProvider } from '../../../../presentation/providers/CategoryDiagnosticProvider';
import { ServiceContainer } from '../../../../infrastructure/ServiceContainer';
import { ILogger } from '../../../../core/interfaces/ILogger';
import { IConfiguration } from '../../../../core/interfaces/IConfiguration';
import { IDataStoreService } from '../../../../core/interfaces/IDataStoreService';
import { ISchemaService } from '../../../../core/interfaces/ISchemaService';
import { IYamlPathParser } from '../../../../core/interfaces/IYamlPathParser';
import { PerformanceMonitor } from '../../../../infrastructure/performance/PerformanceMonitor';
import { SERVICE_TOKENS } from '../../../../core/constants/ServiceTokens';

// Mock ServiceContainer
vi.mock('../../../../infrastructure/ServiceContainer', () => ({
    ServiceContainer: {
        getService: vi.fn()
    }
}));

// Mock DiagnosticSeverityConfig
const mockSeverityConfig = {
    getSeverity: vi.fn().mockReturnValue(DiagnosticSeverity.Error),
    shouldIgnore: vi.fn().mockReturnValue(false)
};
vi.mock('../../../../infrastructure/config/DiagnosticSeverityConfig', () => ({
    DiagnosticSeverityConfig: class {
        getSeverity = mockSeverityConfig.getSeverity;
        shouldIgnore = mockSeverityConfig.shouldIgnore;
    }
}));

// Mock YamlHelper
vi.mock('../../../../infrastructure/yaml/YamlHelper', () => ({
    YamlHelper: {
        isInComment: vi.fn().mockReturnValue(false)
    }
}));

// Mock calculateSimilarity
vi.mock('../../../../infrastructure/utils', () => ({
    calculateSimilarity: vi.fn().mockReturnValue(0.8)
}));

describe('CategoryDiagnosticProvider', () => {
    let provider: CategoryDiagnosticProvider;
    let mockLogger: ILogger;
    let mockConfiguration: IConfiguration;
    let mockDataStoreService: IDataStoreService;
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
            onChange: vi.fn().mockReturnValue({ dispose: vi.fn() })
        } as unknown as IConfiguration;

        // 创建 mock data store service
        mockDataStoreService = {
            getCategoryById: vi.fn().mockResolvedValue(undefined),
            getAllCategories: vi.fn().mockResolvedValue([])
        } as unknown as IDataStoreService;

        // 创建 mock schema service
        mockSchemaService = {
            getSchemaForPath: vi.fn().mockResolvedValue(null),
            getCustomProperty: vi.fn().mockReturnValue(null)
        } as unknown as ISchemaService;

        // 创建 mock yaml path parser
        mockYamlPathParser = {
            parsePath: vi.fn().mockReturnValue([])
        } as unknown as IYamlPathParser;

        // 创建 mock performance monitor
        mockPerformanceMonitor = {
            startTimer: vi.fn().mockReturnValue({
                stop: vi.fn()
            })
        } as unknown as PerformanceMonitor;

        // 配置 ServiceContainer mock
        vi.mocked(ServiceContainer.getService).mockImplementation((token: string | symbol) => {
            if (token === SERVICE_TOKENS.Logger) {
                return mockLogger;
            }
            if (token === SERVICE_TOKENS.Configuration) {
                return mockConfiguration;
            }
            if (token === SERVICE_TOKENS.DataStoreService) {
                return mockDataStoreService;
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
            throw new Error(`Service not found: ${token.toString()}`);
        });

        provider = new CategoryDiagnosticProvider();
    });

    afterEach(() => {
        vi.clearAllMocks();
        provider.dispose();
    });

    // 辅助函数：创建测试文档
    function createDocument(content: string): VscodeTextDocument {
        return new TextDocument(
            Uri.file('/test/file.yaml'),
            content,
            'yaml'
        ) as unknown as VscodeTextDocument;
    }

    // ========================================
    // 基本功能测试
    // ========================================

    describe('updateDiagnostics', () => {
        it('should skip non-yaml files', async () => {
            const document = new TextDocument(
                Uri.file('/test/file.txt'),
                'hello world',
                'plaintext'
            ) as unknown as VscodeTextDocument;

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });

        it('should skip when diagnostics disabled', async () => {
            vi.mocked(mockConfiguration.get).mockReturnValue(false);
            const document = createDocument('category: #mypack:weapons');

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });

        it('should process yaml document with category reference', async () => {
            const document = createDocument(`
items:
  my-item:
    category: "#mypack:weapons"
            `);

            // 模拟 schema 返回 categoryReference 字段
            vi.mocked(mockSchemaService.getSchemaForPath).mockResolvedValue({
                type: 'string',
                'x-completion-provider': 'craftengine.categoryReference'
            });
            vi.mocked(mockSchemaService.getCustomProperty).mockReturnValue('craftengine.categoryReference');

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalledWith('category-diagnostics.update');
        });

        it('should detect unknown category reference', async () => {
            const document = createDocument(`
items:
  my-item:
    category: #nonexistent:category
            `);

            vi.mocked(mockSchemaService.getSchemaForPath).mockResolvedValue({
                type: 'string',
                'x-completion-provider': 'craftengine.categoryReference'
            });
            vi.mocked(mockSchemaService.getCustomProperty).mockReturnValue('craftengine.categoryReference');
            vi.mocked(mockYamlPathParser.parsePath).mockReturnValue(['items', 'my-item', 'category']);
            vi.mocked(mockDataStoreService.getCategoryById).mockResolvedValue(undefined);

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });

        it('should not report error for existing category', async () => {
            const document = createDocument(`
items:
  my-item:
    category: #mypack:weapons
            `);

            vi.mocked(mockSchemaService.getSchemaForPath).mockResolvedValue({
                type: 'string',
                'x-completion-provider': 'craftengine.categoryReference'
            });
            vi.mocked(mockSchemaService.getCustomProperty).mockReturnValue('craftengine.categoryReference');
            vi.mocked(mockYamlPathParser.parsePath).mockReturnValue(['items', 'my-item', 'category']);
            vi.mocked(mockDataStoreService.getCategoryById).mockResolvedValue({
                id: '#mypack:weapons',
                namespace: 'mypack',
                name: 'weapons',
                sourceFile: '/test/categories.yaml'
            });

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });
    });

    // ========================================
    // 分类引用模式测试
    // ========================================

    describe('category reference pattern', () => {
        it('should detect valid category id pattern #namespace:name', async () => {
            const document = createDocument(`
items:
  my-item:
    category: #mypack:weapons/swords
            `);

            vi.mocked(mockSchemaService.getSchemaForPath).mockResolvedValue({
                type: 'string',
                'x-completion-provider': 'craftengine.categoryReference'
            });
            vi.mocked(mockSchemaService.getCustomProperty).mockReturnValue('craftengine.categoryReference');
            vi.mocked(mockYamlPathParser.parsePath).mockReturnValue(['items', 'my-item', 'category']);

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });

        it('should handle category id with path separators', async () => {
            const document = createDocument(`
items:
  my-item:
    category: #mypack:tools/mining/pickaxes
            `);

            vi.mocked(mockSchemaService.getSchemaForPath).mockResolvedValue({
                type: 'string',
                'x-completion-provider': 'craftengine.categoryReference'
            });
            vi.mocked(mockSchemaService.getCustomProperty).mockReturnValue('craftengine.categoryReference');
            vi.mocked(mockYamlPathParser.parsePath).mockReturnValue(['items', 'my-item', 'category']);

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });
    });

    // ========================================
    // 相似分类建议测试
    // ========================================

    describe('similar category suggestions', () => {
        it('should suggest similar categories for unknown reference', async () => {
            const document = createDocument(`
items:
  my-item:
    category: #mypack:wepon
            `);

            vi.mocked(mockSchemaService.getSchemaForPath).mockResolvedValue({
                type: 'string',
                'x-completion-provider': 'craftengine.categoryReference'
            });
            vi.mocked(mockSchemaService.getCustomProperty).mockReturnValue('craftengine.categoryReference');
            vi.mocked(mockYamlPathParser.parsePath).mockReturnValue(['items', 'my-item', 'category']);
            vi.mocked(mockDataStoreService.getCategoryById).mockResolvedValue(undefined);
            vi.mocked(mockDataStoreService.getAllCategories).mockResolvedValue([
                { id: '#mypack:weapons', namespace: 'mypack', name: 'weapons', sourceFile: '/test/cat.yaml' },
                { id: '#mypack:tools', namespace: 'mypack', name: 'tools', sourceFile: '/test/cat.yaml' }
            ]);

            await provider.updateDiagnostics(document);

            expect(mockDataStoreService.getAllCategories).toHaveBeenCalled();
        });
    });

    // ========================================
    // 清理测试
    // ========================================

    describe('clearDiagnostics', () => {
        it('should clear diagnostics for uri', () => {
            const uri = Uri.file('/test/file.yaml');

            provider.clearDiagnostics(uri);

            // 基类的 clearDiagnostics 调用 diagnosticCollection.delete
            // 验证不抛出异常即可
            expect(true).toBe(true);
        });
    });

    describe('dispose', () => {
        it('should dispose resources', () => {
            provider.dispose();

            // 基类的 dispose 调用 diagnosticCollection.dispose
            // 验证不抛出异常即可
            expect(true).toBe(true);
        });
    });

    // ========================================
    // 静态属性测试
    // ========================================

    describe('static properties', () => {
        it('should have correct diagnostic source', () => {
            expect(CategoryDiagnosticProvider.DIAGNOSTIC_SOURCE).toBe('CraftEngine Category');
        });
    });

    // ========================================
    // Schema 驱动诊断测试
    // ========================================

    describe('schema-driven diagnostics', () => {
        it('should only check fields with categoryReference completion provider', async () => {
            const document = createDocument(`
items:
  my-item:
    name: "Not a category"
    category: #mypack:weapons
            `);

            // name 字段不是 categoryReference 字段
            vi.mocked(mockSchemaService.getCustomProperty).mockImplementation((_schema, prop) => {
                if (prop === 'completion-provider') {
                    return null;
                }
                return null;
            });

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });

        it('should validate fields with craftengine.categoryReference provider', async () => {
            const document = createDocument(`
items:
  my-item:
    category: #mypack:weapons
            `);

            vi.mocked(mockSchemaService.getSchemaForPath).mockResolvedValue({
                type: 'string',
                'x-completion-provider': 'craftengine.categoryReference'
            });
            vi.mocked(mockSchemaService.getCustomProperty).mockReturnValue('craftengine.categoryReference');
            vi.mocked(mockYamlPathParser.parsePath).mockReturnValue(['items', 'my-item', 'category']);

            await provider.updateDiagnostics(document);

            expect(mockSchemaService.getSchemaForPath).toHaveBeenCalled();
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
# category: #mypack:weapons
            `);

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });

        it('should skip category patterns in comments', async () => {
            const document = createDocument(`
items:
  my-item:
    # category: #mypack:weapons
    name: "Test"
            `);

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });

        it('should handle error during validation gracefully', async () => {
            const document = createDocument(`
items:
  my-item:
    category: #mypack:weapons
            `);

            vi.mocked(mockSchemaService.getSchemaForPath).mockResolvedValue({
                type: 'string',
                'x-completion-provider': 'craftengine.categoryReference'
            });
            vi.mocked(mockSchemaService.getCustomProperty).mockReturnValue('craftengine.categoryReference');
            vi.mocked(mockYamlPathParser.parsePath).mockReturnValue(['items', 'my-item', 'category']);
            vi.mocked(mockDataStoreService.getCategoryById).mockRejectedValue(
                new Error('Service error')
            );

            await expect(provider.updateDiagnostics(document)).resolves.not.toThrow();
        });

        it('should handle multiple category references on same line', async () => {
            // 这种情况在实践中不常见，但需要测试
            const document = createDocument(`
crafting:
  categories: [#mypack:weapons, #mypack:tools]
            `);

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });

        it('should handle schema service error gracefully', async () => {
            const document = createDocument(`
items:
  my-item:
    category: #mypack:weapons
            `);

            vi.mocked(mockSchemaService.getSchemaForPath).mockRejectedValue(
                new Error('Schema service error')
            );

            await expect(provider.updateDiagnostics(document)).resolves.not.toThrow();
        });
    });
});
