/**
 * TemplateValidationService 单元测试
 *
 * 测试模板验证服务的所有功能，包括：
 * - 单个模板验证
 * - 批量模板验证
 * - 模板可用性检查
 * - 参数验证
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemplateValidationService } from '../../../../../domain/services/template/TemplateValidationService';
import { ITemplate, ITemplateParameter } from '../../../../../core/interfaces/ITemplate';
import { IDataStoreService } from '../../../../../core/interfaces/IDataStoreService';
import { ILogger } from '../../../../../core/interfaces/ILogger';
import { Uri, Position } from 'vscode';
import { Template } from '../../../../../domain/entities/Template';

describe('TemplateValidationService', () => {
    let service: TemplateValidationService;
    let mockDataStoreService: IDataStoreService;
    let mockLogger: ILogger;

    // 辅助函数：创建测试模板
    const createTestTemplate = (overrides: Partial<{
        id: string;
        name: string;
        parameters: ITemplateParameter[];
    }> = {}): ITemplate => {
        return new Template({
            id: overrides.id ?? 'tpl-001',
            name: overrides.name ?? 'test:template',
            parameters: overrides.parameters ?? [
                { name: 'requiredParam', required: true },
                { name: 'optionalParam', required: false },
            ],
            sourceFile: Uri.file('/test/templates.yaml'),
            definitionPosition: new Position(0, 0),
        });
    };

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

        service = new TemplateValidationService(mockDataStoreService, mockLogger);
    });

    // ========================================
    // validateTemplateUsage 测试
    // ========================================

    describe('validateTemplateUsage', () => {
        it('should return valid result when all required parameters provided', async () => {
            const template = createTestTemplate({
                name: 'test:template',
                parameters: [
                    { name: 'requiredParam', required: true },
                    { name: 'optionalParam', required: false }
                ]
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const result = await service.validateTemplateUsage('test:template', {
                requiredParam: 'value'
            });

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should return valid result when all parameters provided', async () => {
            const template = createTestTemplate({
                name: 'test:template',
                parameters: [
                    { name: 'requiredParam', required: true },
                    { name: 'optionalParam', required: false }
                ]
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const result = await service.validateTemplateUsage('test:template', {
                requiredParam: 'value1',
                optionalParam: 'value2'
            });

            expect(result.isValid).toBe(true);
        });

        it('should return invalid result when required parameter missing', async () => {
            const template = createTestTemplate({
                name: 'test:template',
                parameters: [
                    { name: 'requiredParam1', required: true },
                    { name: 'requiredParam2', required: true }
                ]
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const result = await service.validateTemplateUsage('test:template', {
                requiredParam1: 'value'
                // requiredParam2 missing
            });

            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors.some(e => e.parameter === 'requiredParam2')).toBe(true);
        });

        it('should return invalid result when template not found', async () => {
            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(undefined);

            const result = await service.validateTemplateUsage('nonexistent:template', {});

            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBe(1);
            expect(result.errors[0].message).toContain('not found');
            expect(result.errors[0].type).toBe('missing');
        });

        it('should log validation request', async () => {
            const template = createTestTemplate({ name: 'test:template' });
            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            await service.validateTemplateUsage('test:template', { param1: 'value' });

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Validating template usage',
                expect.objectContaining({
                    templateName: 'test:template',
                    parameterCount: 1
                })
            );
        });

        it('should validate with empty parameters object', async () => {
            const template = createTestTemplate({
                name: 'test:template',
                parameters: [
                    { name: 'optionalParam', required: false }
                ]
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const result = await service.validateTemplateUsage('test:template', {});

            expect(result.isValid).toBe(true);
        });

        it('should return warnings for unknown parameters', async () => {
            const template = createTestTemplate({
                name: 'test:template',
                parameters: [
                    { name: 'knownParam', required: false }
                ]
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const result = await service.validateTemplateUsage('test:template', {
                unknownParam: 'value'
            });

            // 未知参数应该产生警告
            expect(result.warnings).toBeDefined();
        });

        it('should handle template with no parameters', async () => {
            const template = createTestTemplate({
                name: 'test:template',
                parameters: []
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const result = await service.validateTemplateUsage('test:template', {});

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should validate multiple missing required parameters', async () => {
            const template = createTestTemplate({
                name: 'test:template',
                parameters: [
                    { name: 'required1', required: true },
                    { name: 'required2', required: true },
                    { name: 'required3', required: true }
                ]
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const result = await service.validateTemplateUsage('test:template', {});

            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBe(3);
        });
    });

    // ========================================
    // isTemplateAvailable 测试
    // ========================================

    describe('isTemplateAvailable', () => {
        it('should return true for existing template', async () => {
            const template = createTestTemplate({ name: 'existing:template' });
            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const result = await service.isTemplateAvailable('existing:template');

            expect(result).toBe(true);
        });

        it('should return false for non-existing template', async () => {
            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(undefined);

            const result = await service.isTemplateAvailable('nonexistent:template');

            expect(result).toBe(false);
        });

        it('should call repository with correct template name', async () => {
            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(undefined);

            await service.isTemplateAvailable('my:template');

            expect(mockDataStoreService.getTemplateByName).toHaveBeenCalledWith('my:template');
        });
    });

    // ========================================
    // validateMultipleTemplateUsages 测试
    // ========================================

    describe('validateMultipleTemplateUsages', () => {
        it('should validate multiple templates', async () => {
            const template1 = createTestTemplate({
                name: 'template1',
                parameters: [{ name: 'param1', required: true }]
            });
            const template2 = createTestTemplate({
                name: 'template2',
                parameters: [{ name: 'param2', required: true }]
            });

            vi.mocked(mockDataStoreService.getTemplateByName)
                .mockImplementation(async (name: string) => {
                    if (name === 'template1') {return template1;}
                    if (name === 'template2') {return template2;}
                    return undefined;
                });

            const usages = [
                { templateName: 'template1', parameters: { param1: 'value1' } },
                { templateName: 'template2', parameters: { param2: 'value2' } }
            ];

            const results = await service.validateMultipleTemplateUsages(usages);

            expect(results.size).toBe(2);
            expect(results.get('template1')?.isValid).toBe(true);
            expect(results.get('template2')?.isValid).toBe(true);
        });

        it('should return mixed results for valid and invalid usages', async () => {
            const template1 = createTestTemplate({
                name: 'template1',
                parameters: [{ name: 'param1', required: true }]
            });
            const template2 = createTestTemplate({
                name: 'template2',
                parameters: [{ name: 'param2', required: true }]
            });

            vi.mocked(mockDataStoreService.getTemplateByName)
                .mockImplementation(async (name: string) => {
                    if (name === 'template1') {return template1;}
                    if (name === 'template2') {return template2;}
                    return undefined;
                });

            const usages = [
                { templateName: 'template1', parameters: { param1: 'value1' } }, // valid
                { templateName: 'template2', parameters: {} } // invalid - missing required param
            ];

            const results = await service.validateMultipleTemplateUsages(usages);

            expect(results.get('template1')?.isValid).toBe(true);
            expect(results.get('template2')?.isValid).toBe(false);
        });

        it('should handle empty usages array', async () => {
            const results = await service.validateMultipleTemplateUsages([]);

            expect(results.size).toBe(0);
        });

        it('should handle non-existing templates in batch', async () => {
            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(undefined);

            const usages = [
                { templateName: 'nonexistent1', parameters: {} },
                { templateName: 'nonexistent2', parameters: {} }
            ];

            const results = await service.validateMultipleTemplateUsages(usages);

            expect(results.size).toBe(2);
            expect(results.get('nonexistent1')?.isValid).toBe(false);
            expect(results.get('nonexistent2')?.isValid).toBe(false);
        });

        it('should validate same template with different parameters', async () => {
            const template = createTestTemplate({
                name: 'template1',
                parameters: [
                    { name: 'param1', required: true },
                    { name: 'param2', required: false }
                ]
            });

            vi.mocked(mockDataStoreService.getTemplateByName).mockResolvedValue(template);

            const usages = [
                { templateName: 'template1', parameters: { param1: 'value1' } },
                { templateName: 'template1', parameters: { param1: 'value2', param2: 'value3' } }
            ];

            const results = await service.validateMultipleTemplateUsages(usages);

            // 同名模板会覆盖结果，最后一个会保留
            expect(results.size).toBe(1);
            expect(results.get('template1')?.isValid).toBe(true);
        });
    });
});
