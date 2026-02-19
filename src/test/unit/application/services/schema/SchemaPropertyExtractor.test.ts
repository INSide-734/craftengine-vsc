/**
 * SchemaPropertyExtractor 单元测试
 *
 * 测试 Schema 属性提取器的所有功能，包括：
 * - 从 properties 提取
 * - 从 patternProperties 提取
 * - 从 allOf/oneOf/anyOf 提取
 * - 属性详情提取
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchemaPropertyExtractor } from '../../../../../application/services/schema/SchemaPropertyExtractor';
import { SchemaReferenceResolver } from '../../../../../application/services/schema/SchemaReferenceResolver';
import { ILogger } from '../../../../../core/interfaces/ILogger';

describe('SchemaPropertyExtractor', () => {
    let extractor: SchemaPropertyExtractor;
    let mockResolver: SchemaReferenceResolver;
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

        mockResolver = {
            resolveReferences: vi.fn((schema) => Promise.resolve(schema))
        } as unknown as SchemaReferenceResolver;

        extractor = new SchemaPropertyExtractor(mockResolver, mockLogger);
    });

    // ========================================
    // extractProperties 测试
    // ========================================

    describe('extractProperties', () => {
        it('should extract properties from schema', async () => {
            const schema = {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Item name' },
                    amount: { type: 'number', description: 'Item amount' }
                }
            };

            const result = await extractor.extractProperties(schema);

            expect(result).toHaveLength(2);
            expect(result.find(p => p.key === 'name')).toBeDefined();
            expect(result.find(p => p.key === 'amount')).toBeDefined();
        });

        it('should extract patternProperties', async () => {
            const schema = {
                type: 'object',
                patternProperties: {
                    '^item_[0-9]+$': { type: 'object', description: 'Dynamic item' }
                }
            };

            const result = await extractor.extractProperties(schema);

            expect(result).toHaveLength(1);
            expect(result[0].key).toBe('[^item_[0-9]+$]');
            expect(result[0].schema['x-pattern']).toBe('^item_[0-9]+$');
        });

        it('should extract from allOf', async () => {
            const schema = {
                allOf: [
                    { properties: { name: { type: 'string' } } },
                    { properties: { age: { type: 'number' } } }
                ]
            };

            const result = await extractor.extractProperties(schema);

            expect(result).toHaveLength(2);
            expect(result.find(p => p.key === 'name')).toBeDefined();
            expect(result.find(p => p.key === 'age')).toBeDefined();
        });

        it('should extract from oneOf with conditional marker', async () => {
            const schema = {
                oneOf: [
                    { properties: { optionA: { type: 'string' } } },
                    { properties: { optionB: { type: 'number' } } }
                ]
            };

            const result = await extractor.extractProperties(schema);

            expect(result).toHaveLength(2);
            expect(result[0].schema._conditional).toBe(true);
            expect(result[0].schema._conditionType).toBe('oneOf');
        });

        it('should extract from anyOf with conditional marker', async () => {
            const schema = {
                anyOf: [
                    { properties: { fieldA: { type: 'string' } } },
                    { properties: { fieldB: { type: 'number' } } }
                ]
            };

            const result = await extractor.extractProperties(schema);

            expect(result).toHaveLength(2);
            expect(result[0].schema._conditional).toBe(true);
            expect(result[0].schema._conditionType).toBe('anyOf');
        });

        it('should not duplicate properties', async () => {
            const schema = {
                properties: {
                    name: { type: 'string' }
                },
                allOf: [
                    { properties: { name: { type: 'string', description: 'From allOf' } } }
                ]
            };

            const result = await extractor.extractProperties(schema);

            // 应该只有一个 name 属性
            const nameProps = result.filter(p => p.key === 'name');
            expect(nameProps).toHaveLength(1);
        });

        it('should resolve $ref in allOf', async () => {
            const resolvedSchema = {
                properties: {
                    refProp: { type: 'boolean' }
                }
            };

            vi.mocked(mockResolver.resolveReferences).mockResolvedValue(resolvedSchema);

            const schema = {
                allOf: [
                    { $ref: '#/$defs/SomeType' }
                ],
                $defs: {
                    SomeType: resolvedSchema
                }
            };

            const result = await extractor.extractProperties(schema);

            expect(result.find(p => p.key === 'refProp')).toBeDefined();
        });

        it('should handle empty schema', async () => {
            const result = await extractor.extractProperties({});

            expect(result).toEqual([]);
        });

        it('should handle null values in patternProperties', async () => {
            const schema = {
                patternProperties: {
                    '^valid$': { type: 'string' },
                    '^null$': null
                }
            };

            const result = await extractor.extractProperties(schema);

            // 只应该提取有效的 patternProperty
            expect(result).toHaveLength(1);
            expect(result[0].key).toBe('[^valid$]');
        });

        it('should not extract patternProperties from allOf', async () => {
            const schema = {
                allOf: [
                    {
                        patternProperties: {
                            '^inherited$': { type: 'string' }
                        }
                    }
                ]
            };

            const result = await extractor.extractProperties(schema);

            // 不应该从 allOf 中继承 patternProperties
            expect(result.find(p => p.key.includes('inherited'))).toBeUndefined();
        });
    });

    // ========================================
    // findPropertySchema 测试
    // ========================================

    describe('findPropertySchema', () => {
        it('should find property from properties', async () => {
            const parentSchema = {
                properties: {
                    name: { type: 'string', description: 'Item name' }
                }
            };

            const result = await extractor.findPropertySchema(parentSchema, 'name');

            expect(result!.type).toBe('string');
            expect(result!.description).toBe('Item name');
        });

        it('should find property from patternProperties', async () => {
            const parentSchema = {
                patternProperties: {
                    '^item_[0-9]+$': { type: 'object', description: 'Dynamic item' }
                }
            };

            const result = await extractor.findPropertySchema(parentSchema, 'item_123');

            expect(result!.type).toBe('object');
        });

        it('should find property from allOf', async () => {
            const parentSchema = {
                allOf: [
                    { properties: { inherited: { type: 'boolean' } } }
                ]
            };

            const result = await extractor.findPropertySchema(parentSchema, 'inherited');

            expect(result!.type).toBe('boolean');
        });

        it('should return undefined for non-existent property', async () => {
            const parentSchema = {
                properties: {
                    name: { type: 'string' }
                }
            };

            const result = await extractor.findPropertySchema(parentSchema, 'nonexistent');

            expect(result).toBeUndefined();
        });

        it('should resolve $ref in found property', async () => {
            const resolvedSchema = { type: 'number', minimum: 0 };
            vi.mocked(mockResolver.resolveReferences).mockResolvedValue(resolvedSchema);

            const parentSchema = {
                properties: {
                    amount: { $ref: '#/$defs/PositiveNumber' }
                },
                $defs: {
                    PositiveNumber: resolvedSchema
                }
            };

            const result = await extractor.findPropertySchema(parentSchema, 'amount');

            expect(result!.type).toBe('number');
            expect(result!.minimum).toBe(0);
        });

        it('should handle invalid regex in patternProperties', async () => {
            const parentSchema = {
                patternProperties: {
                    '[invalid': { type: 'string' }  // 无效的正则
                }
            };

            const result = await extractor.findPropertySchema(parentSchema, 'test');

            expect(result).toBeUndefined();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Invalid regex pattern',
                expect.objectContaining({ pattern: '[invalid' })
            );
        });

        it('should use contextSchema for reference resolution', async () => {
            const contextSchema = {
                $defs: {
                    SharedType: { type: 'string', format: 'email' }
                }
            };

            vi.mocked(mockResolver.resolveReferences).mockImplementation(
                async (schema) => schema.$ref ? contextSchema.$defs.SharedType : schema
            );

            const parentSchema = {
                properties: {
                    email: { $ref: '#/$defs/SharedType' }
                }
            };

            await extractor.findPropertySchema(parentSchema, 'email', contextSchema);

            expect(mockResolver.resolveReferences).toHaveBeenCalledWith(
                expect.objectContaining({ $ref: '#/$defs/SharedType' }),
                5,
                contextSchema
            );
        });
    });

    // ========================================
    // extractPropertyDetails 测试
    // ========================================

    describe('extractPropertyDetails', () => {
        it('should extract all property details', () => {
            const propertySchema = {
                type: 'string',
                description: 'User email address',
                examples: ['user@example.com'],
                pattern: '^[a-z]+@[a-z]+\\.[a-z]+$',
                default: 'default@example.com',
                deprecated: true
            };

            const parentSchema = {
                required: ['email']
            };

            const result = extractor.extractPropertyDetails(propertySchema, parentSchema, 'email');

            expect(result.type).toBe('string');
            expect(result.description).toBe('User email address');
            expect(result.examples).toEqual(['user@example.com']);
            expect(result.pattern).toBe('^[a-z]+@[a-z]+\\.[a-z]+$');
            expect(result.default).toBe('default@example.com');
            expect(result.deprecated).toBe(true);
            expect(result.required).toBe(true);
        });

        it('should handle enum property', () => {
            const propertySchema = {
                type: 'string',
                enum: ['option1', 'option2', 'option3']
            };

            const result = extractor.extractPropertyDetails(propertySchema, {}, 'choice');

            expect(result.enum).toEqual(['option1', 'option2', 'option3']);
        });

        it('should detect required property', () => {
            const propertySchema = { type: 'string' };
            const parentSchema = {
                required: ['name', 'email']
            };

            const result = extractor.extractPropertyDetails(propertySchema, parentSchema, 'name');

            expect(result.required).toBe(true);
        });

        it('should detect non-required property', () => {
            const propertySchema = { type: 'string' };
            const parentSchema = {
                required: ['email']
            };

            const result = extractor.extractPropertyDetails(propertySchema, parentSchema, 'name');

            // 当属性不在 required 数组中时，required 为 false
            expect(result.required).toBe(false);
        });

        it('should handle missing optional fields', () => {
            const propertySchema = { type: 'number' };

            const result = extractor.extractPropertyDetails(propertySchema, {}, 'amount');

            expect(result.type).toBe('number');
            expect(result.description).toBeUndefined();
            expect(result.examples).toBeUndefined();
            expect(result.enum).toBeUndefined();
            expect(result.default).toBeUndefined();
            expect(result.pattern).toBeUndefined();
            expect(result.deprecated).toBeUndefined();
        });

        it('should handle array type', () => {
            const propertySchema = {
                type: ['string', 'null'],
                description: 'Nullable string'
            };

            const result = extractor.extractPropertyDetails(propertySchema, {}, 'nullable');

            expect(result.type).toEqual(['string', 'null']);
        });

        it('should handle default value of false', () => {
            const propertySchema = {
                type: 'boolean',
                default: false
            };

            const result = extractor.extractPropertyDetails(propertySchema, {}, 'enabled');

            expect(result.default).toBe(false);
        });

        it('should handle default value of 0', () => {
            const propertySchema = {
                type: 'number',
                default: 0
            };

            const result = extractor.extractPropertyDetails(propertySchema, {}, 'count');

            expect(result.default).toBe(0);
        });

        it('should handle default value of empty string', () => {
            const propertySchema = {
                type: 'string',
                default: ''
            };

            const result = extractor.extractPropertyDetails(propertySchema, {}, 'prefix');

            expect(result.default).toBe('');
        });
    });

    // ========================================
    // 边缘情况测试
    // ========================================

    describe('edge cases', () => {
        it('should handle schema with only patternProperties', async () => {
            const schema = {
                type: 'object',
                patternProperties: {
                    '^[a-z]+$': { type: 'string' }
                }
            };

            const result = await extractor.extractProperties(schema);

            expect(result).toHaveLength(1);
        });

        it('should handle nested allOf', async () => {
            const schema = {
                allOf: [
                    {
                        allOf: [
                            { properties: { deep: { type: 'string' } } }
                        ]
                    }
                ]
            };

            const result = await extractor.extractProperties(schema);

            // 只解析一层 allOf
            expect(result.find(p => p.key === 'deep')).toBeUndefined();
        });

        it('should handle oneOf with no properties', async () => {
            const schema = {
                oneOf: [
                    { type: 'string' },
                    { type: 'number' }
                ]
            };

            const result = await extractor.extractProperties(schema);

            expect(result).toEqual([]);
        });

        it('should handle anyOf with mixed content', async () => {
            const schema = {
                anyOf: [
                    { properties: { a: { type: 'string' } } },
                    { type: 'null' }  // 没有 properties
                ]
            };

            const result = await extractor.extractProperties(schema);

            expect(result).toHaveLength(1);
            expect(result[0].key).toBe('a');
        });

        it('should handle primitive values in properties', async () => {
            const schema = {
                properties: {
                    valid: { type: 'string' },
                    invalid: 'not an object'  // 非法的属性定义
                }
            };

            const result = await extractor.extractProperties(schema);

            // 只应该提取有效的属性
            expect(result).toHaveLength(1);
            expect(result[0].key).toBe('valid');
        });

        it('should handle circular reference in resolver', async () => {
            const circularSchema = {
                __circularRef__: '#/$defs/A',
                type: 'object'
            };

            // 模拟 isCircularRef 返回 true 的情况
            vi.mocked(mockResolver.resolveReferences).mockImplementation(async (schema) => {
                if (schema.$ref) {
                    return circularSchema;
                }
                return schema;
            });

            const schema = {
                allOf: [
                    { $ref: '#/$defs/A' }
                ],
                $defs: {
                    A: { $ref: '#/$defs/A' }
                }
            };

            // 应该不抛出错误
            const result = await extractor.extractProperties(schema);

            expect(result).toBeDefined();
        });

        it('should preserve description in patternProperties', async () => {
            const schema = {
                patternProperties: {
                    '^item_[0-9]+$': {
                        type: 'object',
                        description: 'A numbered item'
                    }
                }
            };

            const result = await extractor.extractProperties(schema);

            expect(result[0].schema.description).toBe('A numbered item');
        });

        it('should use pattern as description fallback', async () => {
            const schema = {
                patternProperties: {
                    '^item_[0-9]+$': {
                        type: 'object'
                        // 没有 description
                    }
                }
            };

            const result = await extractor.extractProperties(schema);

            expect(result[0].schema.description).toBe('^item_[0-9]+$');
        });
    });
});
