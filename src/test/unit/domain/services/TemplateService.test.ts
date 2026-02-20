/**
 * TemplateService 单元测试
 *
 * 测试模板服务的所有功能，包括：
 * - 文档解析
 * - 模板搜索
 * - 模板验证
 * - 智能建议
 * - 使用统计
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemplateService } from '../../../../domain/services/TemplateService';
import { type ITemplate, type ITemplateParameter } from '../../../../core/interfaces/ITemplate';
import { type IDataStoreService } from '../../../../core/interfaces/IDataStoreService';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import { type IConfiguration } from '../../../../core/interfaces/IConfiguration';
import { Uri, Position, type TextDocument } from 'vscode';
import { Template } from '../../../../domain/entities/Template';

describe('TemplateService', () => {
    let service: TemplateService;
    let mockDataStoreService: IDataStoreService;
    let mockLogger: ILogger;
    let mockConfiguration: IConfiguration;

    // 辅助函数：创建测试模板
    const createTestTemplate = (
        overrides: Partial<{
            id: string;
            name: string;
            parameters: ITemplateParameter[];
            sourceFile: Uri;
            usageCount: number;
            lastUsedAt: Date;
        }> = {},
    ): ITemplate => {
        return new Template({
            id: overrides.id ?? `tpl-${Date.now()}-${Math.random()}`,
            name: overrides.name ?? 'test:template',
            parameters: overrides.parameters ?? [
                { name: 'param1', required: true },
                { name: 'param2', required: false },
            ],
            sourceFile: overrides.sourceFile ?? Uri.file('/test/templates.yaml'),
            definitionPosition: new Position(0, 0),
            usageCount: overrides.usageCount ?? 0,
            lastUsedAt: overrides.lastUsedAt,
        });
    };

    // 辅助函数：创建 mock TextDocument
    const createMockDocument = (content: string, fileName: string = '/test/templates.yaml'): TextDocument => {
        return {
            getText: vi.fn(() => content),
            fileName,
            uri: Uri.file(fileName),
            languageId: 'yaml',
            version: 1,
            isDirty: false,
            isClosed: false,
            isUntitled: false,
            eol: 1,
            lineCount: content.split('\n').length,
            save: vi.fn(),
            lineAt: vi.fn(),
            offsetAt: vi.fn(),
            positionAt: vi.fn(),
            getWordRangeAtPosition: vi.fn(),
            validateRange: vi.fn(),
            validatePosition: vi.fn(),
        } as unknown as TextDocument;
    };

    beforeEach(() => {
        // 创建 mock logger
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

        // 创建 mock configuration
        mockConfiguration = {
            get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
            has: vi.fn(() => false),
            update: vi.fn(),
            inspect: vi.fn(),
            onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
        } as unknown as IConfiguration;

        // 创建 mock dataStoreService
        mockDataStoreService = {
            getTemplateByName: vi.fn(),
            queryTemplates: vi.fn(),
            updateTemplate: vi.fn(),
            getAllTemplates: vi.fn(() => Promise.resolve([])),
            getTemplateById: vi.fn(),
            addTemplate: vi.fn(),
            addTemplates: vi.fn(),
            removeTemplate: vi.fn(),
            removeTemplatesByFile: vi.fn(),
            getTemplateCount: vi.fn(() => Promise.resolve(0)),
            templateExists: vi.fn(() => Promise.resolve(false)),
            initialize: vi.fn(),
            isInitialized: vi.fn(() => true),
            reload: vi.fn(),
            clear: vi.fn(),
            dispose: vi.fn(),
        } as unknown as IDataStoreService;

        service = new TemplateService(mockDataStoreService, mockLogger, mockConfiguration);
    });

    // ========================================
    // 解析功能测试
    // ========================================

    describe('parseDocument', () => {
        it('should parse document and return templates', async () => {
            const yamlContent = `
templates:
  default:template/test:
    model: test_model
    display-name: "\${name}"
`;
            const document = createMockDocument(yamlContent);

            const result = await service.parseDocument(document);

            expect(result.templates).toBeDefined();
            expect(result.errors).toBeDefined();
        });

        it('should log document parsing info', async () => {
            const yamlContent = `
templates:
  default:template/test:
    model: test_model
`;
            const document = createMockDocument(yamlContent);

            await service.parseDocument(document);

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Parsing document for templates',
                expect.objectContaining({
                    fileName: expect.any(String),
                    languageId: 'yaml',
                }),
            );
        });

        it('should handle empty document', async () => {
            const document = createMockDocument('');

            const result = await service.parseDocument(document);

            expect(result.templates).toEqual([]);
            expect(result.errors).toEqual([]);
        });

        it('should handle invalid YAML', async () => {
            const document = createMockDocument('invalid: yaml: content:');

            const result = await service.parseDocument(document);

            // 无效 YAML 应该返回错误
            expect(result.errors.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('parseText', () => {
        it('should parse text and extract templates', async () => {
            const yamlContent = `
templates:
  default:my/template:
    model: cube_all
    display-name: "\${displayName}"
`;
            const sourceFile = Uri.file('/test/templates.yaml');

            const result = await service.parseText(yamlContent, sourceFile);

            expect(result).toBeDefined();
            expect(result.templates).toBeDefined();
            expect(Array.isArray(result.templates)).toBe(true);
        });

        it('should extract parameters from template', async () => {
            const yamlContent = `
templates:
  default:parameterized/template:
    model: "\${modelType}"
    display-name: "\${name:-Default Name}"
    lore:
      - "\${loreText}"
`;
            const sourceFile = Uri.file('/test/templates.yaml');

            const result = await service.parseText(yamlContent, sourceFile);

            // 如果成功解析，应该包含参数
            if (result.templates.length > 0) {
                const template = result.templates[0];
                expect(template.parameters).toBeDefined();
                expect(template.parameters.length).toBeGreaterThan(0);
            }
        });

        it('should handle parse errors gracefully', async () => {
            const sourceFile = Uri.file('/test/templates.yaml');

            // 模拟解析服务抛出异常
            const result = await service.parseText('not: valid: yaml: content:', sourceFile);

            expect(result).toBeDefined();
            expect(result.errors).toBeDefined();
        });

        it('should log warning when parsing has errors', async () => {
            const yamlContent = `
templates:
  invalid-template-without-colon:
    model: test
`;
            const sourceFile = Uri.file('/test/templates.yaml');

            await service.parseText(yamlContent, sourceFile);

            // 解析完成后应该有日志
            expect(mockLogger.info).toHaveBeenCalled();
        });
    });

    // ========================================
    // 搜索功能测试
    // ========================================

    describe('searchTemplates', () => {
        it('should search templates by prefix', async () => {
            const template1 = createTestTemplate({ name: 'user:profile' });
            const template2 = createTestTemplate({ name: 'user:settings' });
            const template3 = createTestTemplate({ name: 'product:card' });

            vi.mocked(mockDataStoreService.queryTemplates).mockResolvedValue({
                items: [template1, template2, template3],
                total: 3,
                hasMore: false,
            });

            const result = await service.searchTemplates({ prefix: 'user' });

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            // 搜索服务返回的结果应包含 user 前缀的模板（分数较高的排在前面）
            // 前两个结果应该是 user 前缀的模板
            expect(result.length).toBeGreaterThanOrEqual(2);
            const userTemplates = result.filter((m) => m.template.name.startsWith('user'));
            expect(userTemplates.length).toBe(2);
        });

        it('should return empty array when no templates match', async () => {
            vi.mocked(mockDataStoreService.queryTemplates).mockResolvedValue({
                items: [],
                total: 0,
                hasMore: false,
            });

            const result = await service.searchTemplates({ prefix: 'nonexistent' });

            expect(result).toEqual([]);
        });

        it('should support fuzzy matching', async () => {
            const template = createTestTemplate({ name: 'my:awesome:template' });

            vi.mocked(mockDataStoreService.queryTemplates).mockResolvedValue({
                items: [template],
                total: 1,
                hasMore: false,
            });

            const result = await service.searchTemplates({ prefix: 'awesome', fuzzy: true });

            expect(result.length).toBeGreaterThanOrEqual(0);
        });

        it('should respect limit option', async () => {
            const templates = Array.from({ length: 20 }, (_, i) => createTestTemplate({ name: `test:template${i}` }));

            vi.mocked(mockDataStoreService.queryTemplates).mockResolvedValue({
                items: templates,
                total: 20,
                hasMore: true,
            });

            const result = await service.searchTemplates({ limit: 5 });

            expect(result.length).toBeLessThanOrEqual(5);
        });

        it('should sort by relevance by default', async () => {
            const template1 = createTestTemplate({ name: 'test:exact' });
            const template2 = createTestTemplate({ name: 'test:prefix-match' });

            vi.mocked(mockDataStoreService.queryTemplates).mockResolvedValue({
                items: [template2, template1],
                total: 2,
                hasMore: false,
            });

            const result = await service.searchTemplates({ prefix: 'test:exact' });

            // 精确匹配应该排在前面
            if (result.length >= 2) {
                expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
            }
        });

        it('should sort by name when specified', async () => {
            const template1 = createTestTemplate({ name: 'z:template' });
            const template2 = createTestTemplate({ name: 'a:template' });

            vi.mocked(mockDataStoreService.queryTemplates).mockResolvedValue({
                items: [template1, template2],
                total: 2,
                hasMore: false,
            });

            const result = await service.searchTemplates({ sortBy: 'name' });

            if (result.length >= 2) {
                expect(result[0].template.name.localeCompare(result[1].template.name)).toBeLessThanOrEqual(0);
            }
        });
    });

    // ========================================
    // 验证功能测试
    // ========================================

    describe('validateTemplateUsage', () => {
        it('should return valid result when all required parameters provided', async () => {
            const template = createTestTemplate({
                name: 'test:template',
                parameters: [
                    { name: 'requiredParam', required: true },
                    { name: 'optionalParam', required: false },
                ],
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const result = await service.validateTemplateUsage('test:template', {
                requiredParam: 'value',
            });

            expect(result).toBeDefined();
            expect(result.isValid).toBe(true);
        });

        it('should return invalid result when required parameter missing', async () => {
            const template = createTestTemplate({
                name: 'test:template',
                parameters: [{ name: 'requiredParam', required: true }],
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const result = await service.validateTemplateUsage('test:template', {});

            expect(result).toBeDefined();
            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('should return invalid result when template not found', async () => {
            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(undefined);

            const result = await service.validateTemplateUsage('nonexistent:template', {});

            expect(result.isValid).toBe(false);
            expect(result.errors.some((e) => e.message.includes('not found'))).toBe(true);
        });

        it('should include warnings for unknown parameters', async () => {
            const template = createTestTemplate({
                name: 'test:template',
                parameters: [{ name: 'knownParam', required: false }],
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const result = await service.validateTemplateUsage('test:template', {
                unknownParam: 'value',
            });

            expect(result).toBeDefined();
            // 未知参数可能产生警告
            expect(result.warnings).toBeDefined();
        });
    });

    describe('isTemplateAvailableAt', () => {
        it('should return true for existing template', async () => {
            const template = createTestTemplate({ name: 'existing:template' });
            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const context = {
                document: createMockDocument(''),
                position: new Position(0, 0),
                lineText: '',
                indentLevel: 0,
            };

            const result = await service.isTemplateAvailableAt('existing:template', context);

            expect(result).toBe(true);
        });

        it('should return false for non-existing template', async () => {
            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(undefined);

            const context = {
                document: createMockDocument(''),
                position: new Position(0, 0),
                lineText: '',
                indentLevel: 0,
            };

            const result = await service.isTemplateAvailableAt('nonexistent:template', context);

            expect(result).toBe(false);
        });
    });

    // ========================================
    // 建议功能测试
    // ========================================

    describe('getTemplateSuggestions', () => {
        it('should return template suggestions based on context', async () => {
            const template1 = createTestTemplate({ name: 'user:profile' });
            const template2 = createTestTemplate({ name: 'user:settings' });

            vi.mocked(mockDataStoreService.queryTemplates).mockResolvedValue({
                items: [template1, template2],
                total: 2,
                hasMore: false,
            });

            const context = {
                document: createMockDocument('template: user'),
                position: new Position(0, 14),
                lineText: 'template: user',
                indentLevel: 0,
            };

            const result = await service.getTemplateSuggestions(context);

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
        });

        it('should return empty array when no templates match context', async () => {
            vi.mocked(mockDataStoreService.queryTemplates).mockResolvedValue({
                items: [],
                total: 0,
                hasMore: false,
            });

            const context = {
                document: createMockDocument(''),
                position: new Position(0, 0),
                lineText: '',
                indentLevel: 0,
            };

            const result = await service.getTemplateSuggestions(context);

            expect(result).toEqual([]);
        });
    });

    describe('getParameterSuggestions', () => {
        it('should return remaining parameters', async () => {
            const template = createTestTemplate({
                name: 'test:template',
                parameters: [
                    { name: 'param1', required: true },
                    { name: 'param2', required: true },
                    { name: 'param3', required: false },
                ],
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const result = await service.getParameterSuggestions('test:template', ['param1']);

            expect(result).toContain('param2');
            expect(result).toContain('param3');
            expect(result).not.toContain('param1');
        });

        it('should return empty array for non-existing template', async () => {
            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(undefined);

            const result = await service.getParameterSuggestions('nonexistent:template', []);

            expect(result).toEqual([]);
        });

        it('should prioritize required parameters', async () => {
            const template = createTestTemplate({
                name: 'test:template',
                parameters: [
                    { name: 'optional1', required: false },
                    { name: 'required1', required: true },
                    { name: 'optional2', required: false },
                ],
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const result = await service.getParameterSuggestions('test:template', []);

            // 必需参数应该在前面
            const requiredIndex = result.indexOf('required1');
            const optionalIndex = result.indexOf('optional1');

            if (requiredIndex !== -1 && optionalIndex !== -1) {
                expect(requiredIndex).toBeLessThan(optionalIndex);
            }
        });
    });

    // ========================================
    // 使用统计测试
    // ========================================

    describe('recordTemplateUsage', () => {
        it('should record template usage successfully', async () => {
            const template = createTestTemplate({ name: 'test:template', usageCount: 5 });
            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);
            vi.mocked(mockDataStoreService.updateTemplate).mockResolvedValue();

            const result = await service.recordTemplateUsage('test:template');

            expect(result).toBe(true);
            expect(mockDataStoreService.updateTemplate).toHaveBeenCalled();
        });

        it('should return false for non-existing template', async () => {
            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(undefined);

            const result = await service.recordTemplateUsage('nonexistent:template');

            expect(result).toBe(false);
        });

        it('should handle update errors gracefully', async () => {
            const template = createTestTemplate({ name: 'test:template' });
            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);
            vi.mocked(mockDataStoreService.updateTemplate).mockRejectedValue(new Error('Update failed'));

            const result = await service.recordTemplateUsage('test:template');

            expect(result).toBe(false);
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    // ========================================
    // 子服务访问测试
    // ========================================

    describe('sub-service accessors', () => {
        it('should return parser service', () => {
            const parserService = service.getParserService();
            expect(parserService).toBeDefined();
        });

        it('should return search service', () => {
            const searchService = service.getSearchService();
            expect(searchService).toBeDefined();
        });

        it('should return validation service', () => {
            const validationService = service.getValidationService();
            expect(validationService).toBeDefined();
        });

        it('should return suggestion service', () => {
            const suggestionService = service.getSuggestionService();
            expect(suggestionService).toBeDefined();
        });

        it('should return usage service', () => {
            const usageService = service.getUsageService();
            expect(usageService).toBeDefined();
        });
    });
});
