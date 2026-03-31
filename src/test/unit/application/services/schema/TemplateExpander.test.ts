/**
 * TemplateExpander 单元测试
 *
 * 测试模板展开器的所有功能，包括：
 * - 文档模板展开
 * - 参数替换
 * - 循环引用检测
 * - 位置映射生成
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemplateExpander } from '../../../../../application/services/schema/TemplateExpander';
import { type IDataStoreService } from '../../../../../core/interfaces/IDataStoreService';
import { type ILogger } from '../../../../../core/interfaces/ILogger';
import { type ITemplate } from '../../../../../core/interfaces/ITemplate';
import { Uri, Position } from 'vscode';

// 辅助类型：用于类型断言
type ExpandedData = Record<string, unknown> & {
    items?: Record<string, Record<string, unknown>>;
    type?: string;
    extra?: string;
    value?: string;
};

describe('TemplateExpander', () => {
    let expander: TemplateExpander;
    let mockDataStoreService: IDataStoreService;
    let mockLogger: ILogger;

    // 辅助函数：创建测试模板
    const createTestTemplate = (name: string, content: Record<string, unknown>): ITemplate => ({
        id: `tpl-${name}`,
        name,
        parameters: [],
        sourceFile: Uri.file('/test/templates.yaml'),
        definitionPosition: new Position(0, 0),
        content,
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
    });

    beforeEach(() => {
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

        mockDataStoreService = {
            getTemplateByName: vi.fn(),
            queryTemplates: vi.fn(),
            getAllTemplates: vi.fn(() => Promise.resolve([])),
            getTemplateById: vi.fn(),
            addTemplate: vi.fn(),
            addTemplates: vi.fn(),
            removeTemplate: vi.fn(),
            removeTemplatesByFile: vi.fn(),
            getTemplateCount: vi.fn(() => Promise.resolve(0)),
            templateExists: vi.fn(() => Promise.resolve(false)),
            updateTemplate: vi.fn(),
            initialize: vi.fn(),
            isInitialized: vi.fn(() => true),
            reload: vi.fn(),
            clear: vi.fn(),
            dispose: vi.fn(),
        } as unknown as IDataStoreService;

        expander = new TemplateExpander(mockDataStoreService, mockLogger);
    });

    // ========================================
    // expandDocument 测试
    // ========================================

    describe('expandDocument', () => {
        it('should return unchanged data when no templates', async () => {
            const content = `
items:
  my_item:
    name: "Test Item"
    amount: 10
`;

            const result = await expander.expandDocument(content);

            expect(result.success).toBe(true);
            expect((result.expanded as ExpandedData).items!.my_item.name).toBe('Test Item');
            expect(result.usedTemplates).toHaveLength(0);
        });

        it('should expand template reference', async () => {
            const template = createTestTemplate('base:item', {
                material: 'DIAMOND',
                displayName: '<red>Base Item',
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const content = `
items:
  my_item:
    template: "base:item"
    amount: 64
`;

            const result = await expander.expandDocument(content);

            expect(result.success).toBe(true);
            expect((result.expanded as ExpandedData).items!.my_item.material).toBe('DIAMOND');
            expect((result.expanded as ExpandedData).items!.my_item.displayName).toBe('<red>Base Item');
            expect((result.expanded as ExpandedData).items!.my_item.amount).toBe(64);
            expect(result.usedTemplates).toContain('base:item');
        });

        it('should apply multiple templates in order', async () => {
            const template1 = createTestTemplate('base:item', {
                material: 'STONE',
                name: 'Base',
            });
            const template2 = createTestTemplate('override:item', {
                material: 'DIAMOND', // 覆盖 base:item 的 material
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockImplementation(async (name) => {
                if (name === 'base:item') {
                    return template1;
                }
                if (name === 'override:item') {
                    return template2;
                }
                return undefined;
            });

            const content = `
items:
  my_item:
    template:
      - "base:item"
      - "override:item"
`;

            const result = await expander.expandDocument(content);

            expect(result.success).toBe(true);
            expect((result.expanded as ExpandedData).items!.my_item.material).toBe('DIAMOND');
            expect((result.expanded as ExpandedData).items!.my_item.name).toBe('Base');
        });

        it('should substitute parameters', async () => {
            const template = createTestTemplate('param:item', {
                displayName: '${name}',
                amount: '${count:-1}',
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const content = `
items:
  my_item:
    template: "param:item"
    arguments:
      name: "Custom Name"
      count: 10
`;

            const result = await expander.expandDocument(content);

            expect(result.success).toBe(true);
            expect((result.expanded as ExpandedData).items!.my_item.displayName).toBe('Custom Name');
            expect((result.expanded as ExpandedData).items!.my_item.amount).toBe('10');
        });

        it('should use default value when parameter not provided', async () => {
            const template = createTestTemplate('default:item', {
                amount: '${count:-5}',
                name: '${title:-Default Title}',
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const content = `
items:
  my_item:
    template: "default:item"
`;

            const result = await expander.expandDocument(content);

            expect(result.success).toBe(true);
            expect((result.expanded as ExpandedData).items!.my_item.amount).toBe('5');
            expect((result.expanded as ExpandedData).items!.my_item.name).toBe('Default Title');
        });

        it('should handle YAML parse error', async () => {
            const invalidYaml = `
items:
  my_item:
    - invalid: [yaml
`;

            const result = await expander.expandDocument(invalidYaml);

            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0].type).toBe('file_read_error');
        });

        it('should report template not found as non-critical error', async () => {
            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(undefined);

            const content = `
items:
  my_item:
    template: "nonexistent:template"
`;

            const result = await expander.expandDocument(content);

            // template_not_found 不是关键错误
            expect(result.success).toBe(true);
            expect(result.errors.some((e) => e.type === 'template_not_found')).toBe(true);
        });
    });

    // ========================================
    // expandObject 测试
    // ========================================

    describe('expandObject', () => {
        it('should expand single object', async () => {
            const template = createTestTemplate('test:template', {
                type: 'expanded',
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const obj = {
                template: 'test:template',
                extra: 'value',
            };

            const result = await expander.expandObject(obj);

            expect(result.success).toBe(true);
            expect((result.expanded as ExpandedData).type).toBe('expanded');
            expect((result.expanded as ExpandedData).extra).toBe('value');
        });

        it('should handle expansion context', async () => {
            const template = createTestTemplate('test:template', {
                value: 'from template',
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const obj = {
                template: 'test:template',
            };

            const context = {
                path: ['items', 'my_item'],
                visited: new Set<string>(),
                currentDepth: 0,
            };

            const result = await expander.expandObject(obj, context);

            expect(result.success).toBe(true);
            expect((result.expanded as ExpandedData).value).toBe('from template');
        });

        it('should return primitive values unchanged', async () => {
            const result1 = await expander.expandObject('string value');
            const result2 = await expander.expandObject(123);
            const result3 = await expander.expandObject(null);

            expect(result1.expanded).toBe('string value');
            expect(result2.expanded).toBe(123);
            expect(result3.expanded).toBeNull();
        });

        it('should expand arrays recursively', async () => {
            const template = createTestTemplate('test:template', {
                type: 'expanded',
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const arr = [{ template: 'test:template' }, { normal: 'object' }];

            const result = await expander.expandObject(arr);
            const expanded = result.expanded as Array<Record<string, unknown>>;

            expect(result.success).toBe(true);
            expect(expanded[0].type).toBe('expanded');
            expect(expanded[1].normal).toBe('object');
        });
    });

    // ========================================
    // 循环引用检测测试
    // ========================================

    describe('circular reference detection', () => {
        it('should detect direct circular reference', async () => {
            // 模板 A 引用自己
            const templateA = createTestTemplate('circular:a', {
                template: 'circular:a', // 自我引用
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(templateA);

            const content = `
items:
  my_item:
    template: "circular:a"
`;

            const result = await expander.expandDocument(content);

            expect(result.errors.some((e) => e.type === 'circular_reference')).toBe(true);
        });

        it('should detect indirect circular reference', async () => {
            // A -> B -> A
            const templateA = createTestTemplate('circular:a', {
                template: 'circular:b',
            });
            const templateB = createTestTemplate('circular:b', {
                template: 'circular:a',
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockImplementation(async (name) => {
                if (name === 'circular:a') {
                    return templateA;
                }
                if (name === 'circular:b') {
                    return templateB;
                }
                return undefined;
            });

            const content = `
items:
  my_item:
    template: "circular:a"
`;

            const result = await expander.expandDocument(content);

            expect(result.errors.some((e) => e.type === 'circular_reference')).toBe(true);
        });
    });

    // ========================================
    // 最大深度限制测试
    // ========================================

    describe('max depth limit', () => {
        it('should stop expansion at max depth', async () => {
            // 创建深度嵌套的模板链
            const templates: Record<string, ITemplate> = {};
            for (let i = 0; i < 15; i++) {
                templates[`deep:level${i}`] = createTestTemplate(`deep:level${i}`, {
                    level: i,
                    template: `deep:level${i + 1}`,
                });
            }

            vi.mocked(mockDataStoreService.getTemplateByName).mockImplementation(async (name) => templates[name]);

            const content = `
items:
  my_item:
    template: "deep:level0"
`;

            const result = await expander.expandDocument(content);

            expect(result.errors.some((e) => e.type === 'max_depth_exceeded')).toBe(true);
        });
    });

    // ========================================
    // 参数替换测试
    // ========================================

    describe('parameter substitution', () => {
        it('should substitute object parameters directly', async () => {
            const template = createTestTemplate('object:param', {
                settings: '${config}',
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const content = `
items:
  my_item:
    template: "object:param"
    arguments:
      config:
        enabled: true
        value: 42
`;

            const result = await expander.expandDocument(content);

            expect(result.success).toBe(true);
            // 当整个字符串是占位符且参数是对象时，应直接返回对象
            const expanded = result.expanded as ExpandedData;
            const myItem = expanded.items!.my_item as Record<string, unknown>;
            const settings = myItem.settings as Record<string, unknown>;
            expect(settings.enabled).toBe(true);
            expect(settings.value).toBe(42);
        });

        it('should substitute array parameters directly', async () => {
            const template = createTestTemplate('array:param', {
                items: '${list}',
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const content = `
items:
  my_item:
    template: "array:param"
    arguments:
      list:
        - item1
        - item2
        - item3
`;

            const result = await expander.expandDocument(content);

            expect(result.success).toBe(true);
            expect((result.expanded as ExpandedData).items!.my_item.items).toEqual(['item1', 'item2', 'item3']);
        });

        it('should skip special parameters', async () => {
            const template = createTestTemplate('special:param', {
                namespace: '${__NAMESPACE__}',
                id: '${__ID__}',
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const content = `
items:
  my_item:
    template: "special:param"
`;

            const result = await expander.expandDocument(content);

            expect(result.success).toBe(true);
            // 特殊参数应保持原样
            expect((result.expanded as ExpandedData).items!.my_item.namespace).toBe('${__NAMESPACE__}');
            expect((result.expanded as ExpandedData).items!.my_item.id).toBe('${__ID__}');
        });

        it('should substitute parameters in keys', async () => {
            const template = createTestTemplate('key:param', {
                'prefix_${suffix}': 'value',
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const content = `
items:
  my_item:
    template: "key:param"
    arguments:
      suffix: "custom"
`;

            const result = await expander.expandDocument(content);

            expect(result.success).toBe(true);
            expect((result.expanded as ExpandedData).items!.my_item['prefix_custom']).toBe('value');
        });

        it('should handle mixed parameter and text', async () => {
            const template = createTestTemplate('mixed:param', {
                message: 'Hello ${name}, you have ${count} items',
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const content = `
items:
  my_item:
    template: "mixed:param"
    arguments:
      name: "User"
      count: 5
`;

            const result = await expander.expandDocument(content);

            expect(result.success).toBe(true);
            expect((result.expanded as ExpandedData).items!.my_item.message).toBe('Hello User, you have 5 items');
        });

        it('should convert objects to JSON in mixed strings', async () => {
            const template = createTestTemplate('json:param', {
                data: 'Config: ${config}',
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const content = `
items:
  my_item:
    template: "json:param"
    arguments:
      config:
        key: value
`;

            const result = await expander.expandDocument(content);

            expect(result.success).toBe(true);
            expect((result.expanded as ExpandedData).items!.my_item.data).toBe('Config: {"key":"value"}');
        });
    });

    // ========================================
    // 深度合并测试
    // ========================================

    describe('deep merge', () => {
        it('should deep merge nested objects', async () => {
            const template = createTestTemplate('nested:template', {
                settings: {
                    display: {
                        color: 'red',
                        size: 'large',
                    },
                },
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const content = `
items:
  my_item:
    template: "nested:template"
    settings:
      display:
        color: "blue"
`;

            const result = await expander.expandDocument(content);

            expect(result.success).toBe(true);
            // 应该深度合并，color 被覆盖，size 保留
            const expanded = result.expanded as ExpandedData;
            const myItem = expanded.items!.my_item as Record<string, unknown>;
            const settings = myItem.settings as Record<string, unknown>;
            const display = settings.display as Record<string, unknown>;
            expect(display.color).toBe('blue');
            expect(display.size).toBe('large');
        });

        it('should override arrays instead of merging', async () => {
            const template = createTestTemplate('array:template', {
                list: [1, 2, 3],
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const content = `
items:
  my_item:
    template: "array:template"
    list:
      - 4
      - 5
`;

            const result = await expander.expandDocument(content);

            expect(result.success).toBe(true);
            // 数组应该被覆盖，不是合并
            expect((result.expanded as ExpandedData).items!.my_item.list).toEqual([4, 5]);
        });
    });

    // ========================================
    // 动态模板名测试
    // ========================================

    describe('dynamic template names', () => {
        it('should skip templates with dynamic names', async () => {
            const content = `
items:
  my_item:
    template: "\${dynamic:template}"
    name: "Static Name"
`;

            const result = await expander.expandDocument(content);

            expect(result.success).toBe(true);
            expect((result.expanded as ExpandedData).items!.my_item.name).toBe('Static Name');
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Skipping dynamic template name',
                expect.objectContaining({ templateName: '${dynamic:template}' }),
            );
        });
    });

    // ========================================
    // 位置映射测试
    // ========================================

    describe('position mapping', () => {
        it('should record position mappings for template content', async () => {
            const template = createTestTemplate('test:template', {
                name: 'From Template',
                nested: {
                    value: 123,
                },
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const content = `
items:
  my_item:
    template: "test:template"
`;

            const result = await expander.expandDocument(content);

            expect(result.success).toBe(true);
            expect(result.positionMap.size).toBeGreaterThan(0);
        });
    });

    // ========================================
    // 边缘情况测试
    // ========================================

    describe('edge cases', () => {
        it('should handle empty template content', async () => {
            const template = createTestTemplate('empty:template', {});

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const content = `
items:
  my_item:
    template: "empty:template"
    name: "My Item"
`;

            const result = await expander.expandDocument(content);

            expect(result.success).toBe(true);
            expect((result.expanded as ExpandedData).items!.my_item.name).toBe('My Item');
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Template has no content',
                expect.objectContaining({ templateName: 'empty:template' }),
            );
        });

        it('should handle null template field', async () => {
            const content = `
items:
  my_item:
    template: null
    name: "My Item"
`;

            const result = await expander.expandDocument(content);

            expect(result.success).toBe(true);
            expect((result.expanded as ExpandedData).items!.my_item.name).toBe('My Item');
        });

        it('should handle invalid template name type', async () => {
            const content = `
items:
  my_item:
    template: 123
    name: "My Item"
`;

            const result = await expander.expandDocument(content);

            expect(result.success).toBe(true);
            // 无效的模板名应该被跳过
            expect((result.expanded as ExpandedData).items!.my_item.name).toBe('My Item');
        });

        it('should handle empty YAML document', async () => {
            const result = await expander.expandDocument('');

            expect(result.success).toBe(true);
            expect(result.expanded).toBeNull();
        });

        it('should handle scalar YAML document', async () => {
            const result = await expander.expandDocument('just a string');

            expect(result.success).toBe(true);
            expect(result.expanded).toBe('just a string');
        });
    });
});
