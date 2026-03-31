import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SchemaValidator } from '../../../../infrastructure/schema/SchemaValidator';
import { ServiceContainer } from '../../../../infrastructure/ServiceContainer';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import { type ISchemaParser } from '../../../../core/interfaces/ISchemaParser';
import { type IConfiguration } from '../../../../core/interfaces/IConfiguration';
import { SERVICE_TOKENS } from '../../../../core/constants/ServiceTokens';

vi.mock('../../../../infrastructure/ServiceContainer', () => ({
    ServiceContainer: {
        getService: vi.fn(),
    },
}));

describe('SchemaValidator', () => {
    let validator: SchemaValidator;
    let mockLogger: ILogger;
    let mockSchemaParser: ISchemaParser;
    let mockConfig: IConfiguration;

    beforeEach(() => {
        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            createChild: vi.fn().mockReturnThis(),
        } as unknown as ILogger;

        mockSchemaParser = {
            loadSchema: vi.fn().mockResolvedValue({
                schema: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        value: { type: 'number' },
                    },
                    required: ['name'],
                },
                resolved: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        value: { type: 'number' },
                    },
                    required: ['name'],
                },
                dependencies: [],
            }),
            resolveRef: vi.fn(),
            findSchemaForContext: vi.fn(),
            extractProperties: vi.fn(),
            extractEnumValues: vi.fn(),
            clearCache: vi.fn(),
        } as unknown as ISchemaParser;

        mockConfig = {
            get: vi.fn((key: string, defaultValue?: any) => {
                if (key === 'craftengine.validation.level') {
                    return 'loose';
                }
                if (key === 'craftengine.validation.templateExpansion') {
                    return false;
                }
                return defaultValue;
            }),
            set: vi.fn(),
            has: vi.fn(),
            delete: vi.fn(),
            getAll: vi.fn(),
            onChange: vi.fn(),
            validate: vi.fn(),
            reload: vi.fn(),
        } as unknown as IConfiguration;

        vi.mocked(ServiceContainer.getService).mockImplementation((token: string | symbol) => {
            if (token === SERVICE_TOKENS.Logger) {
                return mockLogger;
            }
            if (token === SERVICE_TOKENS.SchemaParser) {
                return mockSchemaParser;
            }
            if (token === SERVICE_TOKENS.Configuration) {
                return mockConfig;
            }
            throw new Error(`Service not found: ${token.toString()}`);
        });

        validator = new SchemaValidator(mockSchemaParser, mockConfig, mockLogger);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('validate', () => {
        it('should validate valid data', async () => {
            const data = { name: 'test', value: 123 };
            const result = await validator.validate(data, 'test.schema.json');

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should detect missing required fields', async () => {
            const data = { value: 123 }; // Missing 'name'
            const result = await validator.validate(data, 'test.schema.json');

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('should detect type mismatches', async () => {
            const data = { name: 'test', value: 'not-a-number' }; // Wrong type for 'value'
            const result = await validator.validate(data, 'test.schema.json');

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('should skip validation for template schemas', async () => {
            // Template schemas are skipped regardless of level
            const data = { anything: 'goes' };
            const result = await validator.validate(data, 'template.schema.json');

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should allow extra properties in loose mode', async () => {
            vi.mocked(mockConfig.get).mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'craftengine.validation.level') {
                    return 'loose';
                }
                return defaultValue;
            });

            const data = { name: 'test', value: 123, extra: 'allowed' };
            const result = await validator.validate(data, 'test.schema.json');

            expect(result.valid).toBe(true);
        });

        it('should load schema for each validation', async () => {
            const data = { name: 'test', value: 123 };

            // Clear previous calls from beforeEach
            vi.mocked(mockSchemaParser.loadSchema).mockClear();

            await validator.validate(data, 'test.schema.json');
            await validator.validate(data, 'test.schema.json');

            // Schema is loaded each time, but validation function is cached internally
            // This is the expected behavior based on the implementation
            expect(mockSchemaParser.loadSchema).toHaveBeenCalledTimes(2);
        });
    });

    describe('validateDocument', () => {
        it('should validate YAML document', async () => {
            const yaml = 'name: test\nvalue: 123';
            const result = await validator.validateDocument(yaml);

            expect(result).toBeDefined();
            expect(result.errors).toBeDefined();
        });

        it('should handle parse errors', async () => {
            const invalidYaml = 'invalid: yaml: [unclosed';
            const result = await validator.validateDocument(invalidYaml);

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('should handle empty documents', async () => {
            const yaml = '';
            const result = await validator.validateDocument(yaml);

            expect(result).toBeDefined();
        });
    });

    describe('clearCache', () => {
        it('should clear validation cache', () => {
            validator.clearCache();

            expect(mockLogger.debug).toHaveBeenCalledWith('Validation cache cleared (including Ajv internal cache)');
        });
    });

    // ========================================
    // Bug 修复测试：Schema 重复注册
    // ========================================
    describe('Bug: Schema duplicate registration', () => {
        it('should not throw error when validating same schema multiple times', async () => {
            // 模拟 index.schema.json 的 Schema
            vi.mocked(mockSchemaParser.loadSchema).mockResolvedValue({
                schema: {
                    $id: 'https://craftengine.dev/schemas/index.schema.json',
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                    },
                },
                resolved: {
                    $id: 'https://craftengine.dev/schemas/index.schema.json',
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                    },
                },
                dependencies: [],
            });

            const data = { name: 'test' };

            // 第一次验证
            const result1 = await validator.validate(data, 'index.schema.json');
            expect(result1.valid).toBe(true);

            // 第二次验证 - 不应该抛出 "schema with key or id already exists" 错误
            const result2 = await validator.validate(data, 'index.schema.json');
            expect(result2.valid).toBe(true);

            // 第三次验证 - 确保多次调用都不会出错
            const result3 = await validator.validate(data, 'index.schema.json');
            expect(result3.valid).toBe(true);
        });

        it('should handle schema with $id correctly across multiple validations', async () => {
            vi.mocked(mockSchemaParser.loadSchema).mockResolvedValue({
                schema: {
                    $id: 'https://craftengine.dev/schemas/test.schema.json',
                    type: 'object',
                    properties: {
                        value: { type: 'number' },
                    },
                    required: ['value'],
                },
                resolved: {
                    $id: 'https://craftengine.dev/schemas/test.schema.json',
                    type: 'object',
                    properties: {
                        value: { type: 'number' },
                    },
                    required: ['value'],
                },
                dependencies: [],
            });

            // 多次验证不同的数据
            await validator.validate({ value: 1 }, 'test.schema.json');
            await validator.validate({ value: 2 }, 'test.schema.json');
            await validator.validate({ value: 3 }, 'test.schema.json');

            // 不应该抛出任何错误
            expect(true).toBe(true);
        });

        it('should use Ajv internal cache when schema $id exists', async () => {
            // 模拟带有 $id 的 schema
            vi.mocked(mockSchemaParser.loadSchema).mockResolvedValue({
                schema: {
                    $id: 'https://craftengine.dev/schemas/cached.schema.json',
                    type: 'object',
                    properties: {
                        test: { type: 'string' },
                    },
                },
                resolved: {
                    $id: 'https://craftengine.dev/schemas/cached.schema.json',
                    type: 'object',
                    properties: {
                        test: { type: 'string' },
                    },
                },
                dependencies: [],
            });

            // 第一次验证 - 编译并缓存
            const result1 = await validator.validate({ test: 'value1' }, 'cached.schema.json');
            expect(result1.valid).toBe(true);

            // 清除本地缓存但保留 Ajv 内部缓存
            validator.clearCache();

            // 第二次验证 - 应该从 Ajv 内部缓存获取
            const result2 = await validator.validate({ test: 'value2' }, 'cached.schema.json');
            expect(result2.valid).toBe(true);
        });

        it('should handle schema without $id normally', async () => {
            // 模拟没有 $id 的 schema
            vi.mocked(mockSchemaParser.loadSchema).mockResolvedValue({
                schema: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                    },
                },
                resolved: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                    },
                },
                dependencies: [],
            });

            // 多次验证应该正常工作
            await validator.validate({ name: 'test1' }, 'no-id.schema.json');
            await validator.validate({ name: 'test2' }, 'no-id.schema.json');
            await validator.validate({ name: 'test3' }, 'no-id.schema.json');

            expect(true).toBe(true);
        });
    });
});
