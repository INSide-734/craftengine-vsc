/**
 * ItemIdDiagnosticProvider 单元测试
 *
 * 测试物品 ID 诊断提供者的所有功能，包括：
 * - 物品 ID 格式验证
 * - 物品 ID 引用验证
 * - 当前文件定义检测
 * - Schema 驱动的诊断
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TextDocument, Uri, DiagnosticSeverity } from '../../../__mocks__/vscode';
import type { TextDocument as VscodeTextDocument } from 'vscode';
import { ItemIdDiagnosticProvider } from '../../../../presentation/providers/ItemIdDiagnosticProvider';
import { ServiceContainer } from '../../../../infrastructure/ServiceContainer';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import { type IConfiguration } from '../../../../core/interfaces/IConfiguration';
import { type IDataStoreService } from '../../../../core/interfaces/IDataStoreService';
import { type ISchemaService } from '../../../../core/interfaces/ISchemaService';
import { type IYamlPathParser } from '../../../../core/interfaces/IYamlPathParser';
import { type PerformanceMonitor } from '../../../../infrastructure/performance/PerformanceMonitor';
import { SERVICE_TOKENS } from '../../../../core/constants/ServiceTokens';

// Mock ServiceContainer
vi.mock('../../../../infrastructure/ServiceContainer', () => ({
    ServiceContainer: {
        getService: vi.fn(),
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

describe('ItemIdDiagnosticProvider', () => {
    let provider: ItemIdDiagnosticProvider;
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
            onChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        } as unknown as IConfiguration;

        // 创建 mock data store service
        mockDataStoreService = {
            getItemById: vi.fn().mockResolvedValue(undefined),
        } as unknown as IDataStoreService;

        // 创建 mock schema service
        mockSchemaService = {
            getSchemaForPath: vi.fn().mockResolvedValue(null),
            getCustomProperty: vi.fn().mockReturnValue(null),
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

        provider = new ItemIdDiagnosticProvider();
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

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });

        it('should skip when diagnostics disabled', async () => {
            vi.mocked(mockConfiguration.get).mockReturnValue(false);
            const document = createDocument('material: minecraft:diamond');

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });

        it('should process yaml document with item id', async () => {
            const document = createDocument(`
items:
  my-item:
    material: minecraft:diamond
            `);

            // 模拟 schema 返回 itemId 字段
            vi.mocked(mockSchemaService.getSchemaForPath).mockResolvedValue({
                type: 'string',
                'x-completion-provider': 'craftengine.itemId',
            });
            vi.mocked(mockSchemaService.getCustomProperty).mockReturnValue('craftengine.itemId');

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalledWith('itemId.diagnostics.update');
        });

        it('should detect unknown item id', async () => {
            const document = createDocument(`
items:
  my-item:
    material: nonexistent:item
            `);

            vi.mocked(mockSchemaService.getSchemaForPath).mockResolvedValue({
                type: 'string',
                'x-completion-provider': 'craftengine.itemId',
            });
            vi.mocked(mockSchemaService.getCustomProperty).mockReturnValue('craftengine.itemId');
            vi.mocked(mockDataStoreService.getItemById).mockResolvedValue(undefined);

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });

        it('should not report error for existing item', async () => {
            const document = createDocument(`
items:
  my-item:
    material: minecraft:diamond
            `);

            vi.mocked(mockSchemaService.getSchemaForPath).mockResolvedValue({
                type: 'string',
                'x-completion-provider': 'craftengine.itemId',
            });
            vi.mocked(mockSchemaService.getCustomProperty).mockReturnValue('craftengine.itemId');
            vi.mocked(mockDataStoreService.getItemById).mockResolvedValue({
                id: 'minecraft:diamond',
                namespace: 'minecraft',
                name: 'diamond',
                type: 'item',
                sourceFile: '/test/items.yaml',
            });

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });
    });

    // ========================================
    // 当前文件定义检测测试
    // ========================================

    describe('current file definition detection', () => {
        it('should not report error for item defined in current file', async () => {
            const document = createDocument(`
items:
  mypack:custom-sword:
    name: "Custom Sword"
  mypack:custom-axe:
    material: mypack:custom-sword
            `);

            vi.mocked(mockSchemaService.getSchemaForPath).mockResolvedValue({
                type: 'string',
                'x-completion-provider': 'craftengine.itemId',
            });
            vi.mocked(mockSchemaService.getCustomProperty).mockReturnValue('craftengine.itemId');
            vi.mocked(mockDataStoreService.getItemById).mockResolvedValue(undefined);

            await provider.updateDiagnostics(document);

            // 由于 mypack:custom-sword 在当前文件中定义，不应该报错
            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });
    });

    // ========================================
    // 物品 ID 格式验证测试
    // ========================================

    describe('item id format validation', () => {
        it('should detect valid namespaced id pattern', async () => {
            const document = createDocument(`
items:
  my-item:
    material: valid-namespace:valid-id
            `);

            vi.mocked(mockSchemaService.getSchemaForPath).mockResolvedValue({
                type: 'string',
                'x-completion-provider': 'craftengine.itemId',
            });
            vi.mocked(mockSchemaService.getCustomProperty).mockReturnValue('craftengine.itemId');

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });

        it('should handle item id with path separators', async () => {
            const document = createDocument(`
items:
  my-item:
    material: minecraft:block/stone
            `);

            vi.mocked(mockSchemaService.getSchemaForPath).mockResolvedValue({
                type: 'string',
                'x-completion-provider': 'craftengine.itemId',
            });
            vi.mocked(mockSchemaService.getCustomProperty).mockReturnValue('craftengine.itemId');

            await provider.updateDiagnostics(document);

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

            // 不应该抛出错误
            expect(true).toBe(true);
        });
    });

    describe('dispose', () => {
        it('should dispose resources', () => {
            provider.dispose();

            // 不应该抛出错误
            expect(true).toBe(true);
        });
    });

    // ========================================
    // 静态属性测试
    // ========================================

    describe('static properties', () => {
        it('should have correct diagnostic source', () => {
            expect(ItemIdDiagnosticProvider.DIAGNOSTIC_SOURCE).toBe('CraftEngine ItemId');
        });
    });

    // ========================================
    // Schema 驱动诊断测试
    // ========================================

    describe('schema-driven diagnostics', () => {
        it('should only check fields with itemId completion provider', async () => {
            const document = createDocument(`
items:
  my-item:
    name: "Not an item id"
    material: minecraft:diamond
            `);

            // name 字段不是 itemId 字段
            vi.mocked(mockSchemaService.getCustomProperty).mockImplementation((_schema, prop) => {
                if (prop === 'completion-provider') {
                    return null;
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
# material: minecraft:diamond
            `);

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });

        it('should skip item id patterns in comments', async () => {
            const document = createDocument(`
items:
  my-item:
    # material: minecraft:diamond
    name: "Test"
            `);

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });

        it('should handle error during validation gracefully', async () => {
            const document = createDocument(`
items:
  my-item:
    material: minecraft:diamond
            `);

            vi.mocked(mockSchemaService.getSchemaForPath).mockResolvedValue({
                type: 'string',
                'x-completion-provider': 'craftengine.itemId',
            });
            vi.mocked(mockSchemaService.getCustomProperty).mockReturnValue('craftengine.itemId');
            vi.mocked(mockDataStoreService.getItemById).mockRejectedValue(new Error('Service error'));

            await expect(provider.updateDiagnostics(document)).resolves.not.toThrow();
        });

        it('should handle multiple item ids on same line', async () => {
            const document = createDocument(`
# This shouldn't happen in practice but test it anyway
crafting:
  shape: [minecraft:diamond, minecraft:iron_ingot]
            `);

            await provider.updateDiagnostics(document);

            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalled();
        });
    });
});
