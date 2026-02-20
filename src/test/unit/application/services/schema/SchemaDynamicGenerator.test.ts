/**
 * SchemaDynamicGenerator 单元测试
 *
 * 测试 Schema 动态生成器的所有功能，包括：
 * - 动态 Schema 生成
 * - 模板名称枚举生成
 * - 空模板处理
 * - 错误回退机制
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchemaDynamicGenerator } from '../../../../../application/services/schema/SchemaDynamicGenerator';
import { type IDataStoreService } from '../../../../../core/interfaces/IDataStoreService';
import { type ILogger } from '../../../../../core/interfaces/ILogger';

describe('SchemaDynamicGenerator', () => {
    let generator: SchemaDynamicGenerator;
    let mockDataStoreService: IDataStoreService;
    let mockLogger: ILogger;

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
            getAllTemplates: vi.fn(() => Promise.resolve([])),
        } as unknown as IDataStoreService;

        generator = new SchemaDynamicGenerator(mockDataStoreService, mockLogger);
    });

    // ========================================
    // generateDynamicSchema - 基本功能
    // ========================================

    describe('generateDynamicSchema', () => {
        it('should return valid JSON string', async () => {
            const result = await generator.generateDynamicSchema();
            expect(() => JSON.parse(result)).not.toThrow();
        });

        it('should include $schema field', async () => {
            const result = await generator.generateDynamicSchema();
            const schema = JSON.parse(result);
            expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
        });

        it('should include title and description', async () => {
            const result = await generator.generateDynamicSchema();
            const schema = JSON.parse(result);
            expect(schema.title).toBe('CraftEngine Template Schema');
            expect(schema.description).toBeDefined();
        });

        it('should include templates and items properties', async () => {
            const result = await generator.generateDynamicSchema();
            const schema = JSON.parse(result);
            expect(schema.properties.templates).toBeDefined();
            expect(schema.properties.items).toBeDefined();
        });

        it('should set type to object', async () => {
            const result = await generator.generateDynamicSchema();
            const schema = JSON.parse(result);
            expect(schema.type).toBe('object');
        });
    });

    // ========================================
    // generateDynamicSchema - 模板枚举
    // ========================================

    describe('generateDynamicSchema - template enums', () => {
        it('should generate enum from template names', async () => {
            vi.mocked(mockDataStoreService.getAllTemplates).mockResolvedValue([
                { name: 'sword-template' },
                { name: 'armor-template' },
                { name: 'potion-template' },
            ] as any[]);

            const result = await generator.generateDynamicSchema();
            const schema = JSON.parse(result);

            // 检查 items 中的 template enum
            const itemPattern = schema.properties.items.patternProperties['^[a-zA-Z][a-zA-Z0-9_-]*$'];
            expect(itemPattern.properties.template.enum).toEqual([
                'sword-template',
                'armor-template',
                'potion-template',
            ]);
        });

        it('should generate oneOf with string and array in templates section', async () => {
            vi.mocked(mockDataStoreService.getAllTemplates).mockResolvedValue([{ name: 'base-item' }] as any[]);

            const result = await generator.generateDynamicSchema();
            const schema = JSON.parse(result);

            const templatePattern = schema.properties.templates.patternProperties['^[a-zA-Z][a-zA-Z0-9_-]*$'];
            expect(templatePattern.properties.template.oneOf).toHaveLength(2);
            // 第一个是 string enum
            expect(templatePattern.properties.template.oneOf[0].type).toBe('string');
            expect(templatePattern.properties.template.oneOf[0].enum).toEqual(['base-item']);
            // 第二个是 array
            expect(templatePattern.properties.template.oneOf[1].type).toBe('array');
        });

        it('should handle empty template list', async () => {
            vi.mocked(mockDataStoreService.getAllTemplates).mockResolvedValue([]);

            const result = await generator.generateDynamicSchema();
            const schema = JSON.parse(result);

            const itemPattern = schema.properties.items.patternProperties['^[a-zA-Z][a-zA-Z0-9_-]*$'];
            expect(itemPattern.properties.template.enum).toEqual([]);
        });
    });

    // ========================================
    // generateDynamicSchema - 日志
    // ========================================

    describe('generateDynamicSchema - logging', () => {
        it('should log template count and schema size', async () => {
            vi.mocked(mockDataStoreService.getAllTemplates).mockResolvedValue([{ name: 'test' }] as any[]);

            await generator.generateDynamicSchema();

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Dynamic schema generated',
                expect.objectContaining({
                    templateCount: 1,
                    schemaSize: expect.any(Number),
                }),
            );
        });
    });

    // ========================================
    // generateDynamicSchema - 错误回退
    // ========================================

    describe('generateDynamicSchema - fallback', () => {
        it('should return fallback schema when getAllTemplates throws', async () => {
            vi.mocked(mockDataStoreService.getAllTemplates).mockRejectedValue(new Error('Database error'));

            const result = await generator.generateDynamicSchema();
            const schema = JSON.parse(result);

            expect(schema.title).toContain('Fallback');
            expect(schema.properties.templates).toBeDefined();
            expect(schema.properties.items).toBeDefined();
        });

        it('should log error when falling back', async () => {
            vi.mocked(mockDataStoreService.getAllTemplates).mockRejectedValue(new Error('Database error'));

            await generator.generateDynamicSchema();

            expect(mockLogger.error).toHaveBeenCalledWith('Error generating dynamic schema', expect.any(Error));
        });

        it('should return valid JSON in fallback schema', async () => {
            vi.mocked(mockDataStoreService.getAllTemplates).mockRejectedValue(new Error('fail'));

            const result = await generator.generateDynamicSchema();
            expect(() => JSON.parse(result)).not.toThrow();
        });
    });
});
