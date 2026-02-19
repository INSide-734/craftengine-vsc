import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SchemaValidator } from '../../../../infrastructure/schema/SchemaValidator';
import { ServiceContainer } from '../../../../infrastructure/ServiceContainer';
import { ILogger } from '../../../../core/interfaces/ILogger';
import { ISchemaParser } from '../../../../core/interfaces/ISchemaParser';
import { IConfiguration } from '../../../../core/interfaces/IConfiguration';
import { SERVICE_TOKENS } from '../../../../core/constants/ServiceTokens';

vi.mock('../../../../infrastructure/ServiceContainer', () => ({
    ServiceContainer: {
        getService: vi.fn()
    }
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
                        value: { type: 'number' }
                    },
                    required: ['name']
                },
                resolved: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        value: { type: 'number' }
                    },
                    required: ['name']
                },
                dependencies: []
            }),
            resolveRef: vi.fn(),
            findSchemaForContext: vi.fn(),
            extractProperties: vi.fn(),
            extractEnumValues: vi.fn(),
            clearCache: vi.fn()
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

            expect(mockLogger.debug).toHaveBeenCalledWith('Validation cache cleared');
        });
    });
});
