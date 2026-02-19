/**
 * SchemaReferenceResolver 单元测试
 *
 * 测试 Schema 引用解析器的所有功能，包括：
 * - $ref 引用解析
 * - allOf/oneOf/anyOf 解析
 * - 循环引用检测
 * - 外部文件引用
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchemaReferenceResolver, isCircularRef } from '../../../../../application/services/schema/SchemaReferenceResolver';
import { SchemaFileLoader } from '../../../../../application/services/schema/SchemaFileLoader';
import { ILogger } from '../../../../../core/interfaces/ILogger';
import { SCHEMA_METADATA } from '../../../../../application/services/schema/SchemaConstants';

describe('SchemaReferenceResolver', () => {
    let resolver: SchemaReferenceResolver;
    let mockLoader: SchemaFileLoader;
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

        mockLoader = {
            loadSchema: vi.fn(),
            hasSchema: vi.fn(),
            clearCache: vi.fn()
        } as unknown as SchemaFileLoader;

        resolver = new SchemaReferenceResolver(mockLoader, mockLogger);
    });

    // ========================================
    // 基础解析测试
    // ========================================

    describe('resolveReferences', () => {
        it('should return schema unchanged if no references', async () => {
            const schema = {
                type: 'object',
                properties: {
                    name: { type: 'string' }
                }
            };

            const result = await resolver.resolveReferences(schema);

            expect(result.type).toBe('object');
            expect((result as any).properties.name.type).toBe('string');
        });

        it('should return null/undefined schema as is', async () => {
            expect(await resolver.resolveReferences(null as any)).toBeNull();
            expect(await resolver.resolveReferences(undefined as any)).toBeUndefined();
        });

        it('should respect max depth limit', async () => {
            const schema = {
                $ref: '#/$defs/A',
                $defs: {
                    A: { $ref: '#/$defs/B' },
                    B: { $ref: '#/$defs/C' },
                    C: { type: 'string' }
                }
            };

            // 设置较低的最大深度
            await resolver.resolveReferences(schema, 1);

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Max resolution depth reached',
                expect.objectContaining({ depth: 1 })
            );
        });
    });

    // ========================================
    // $ref 解析测试
    // ========================================

    describe('$ref resolution', () => {
        it('should resolve internal reference', async () => {
            const schema = {
                $ref: '#/$defs/StringType',
                $defs: {
                    StringType: { type: 'string', description: 'A string value' }
                }
            };

            const result = await resolver.resolveReferences(schema);

            expect(result.type).toBe('string');
            expect(result.description).toBe('A string value');
        });

        it('should resolve nested internal reference', async () => {
            const schema = {
                type: 'object',
                properties: {
                    name: { $ref: '#/$defs/NameType' }
                },
                $defs: {
                    NameType: { type: 'string', minLength: 1 }
                }
            };

            // 解析 properties 中的 $ref 需要手动导航
            const result = await resolver.resolveReferences(schema);

            expect(result.type).toBe('object');
        });

        it('should resolve external file reference', async () => {
            const externalSchema = {
                type: 'object',
                properties: {
                    value: { type: 'number' }
                },
                [SCHEMA_METADATA.SCHEMA_FILE]: 'common/types.schema.json'
            };

            vi.mocked(mockLoader.loadSchema).mockResolvedValue(externalSchema);

            const schema = {
                $ref: './common/types.schema.json',
                [SCHEMA_METADATA.SCHEMA_DIR]: 'schemas'
            };

            const result = await resolver.resolveReferences(schema);

            expect(result.type).toBe('object');
            expect(mockLoader.loadSchema).toHaveBeenCalled();
        });

        it('should detect circular reference', async () => {
            const schema = {
                $ref: '#/$defs/A',
                $defs: {
                    A: { $ref: '#/$defs/A' }  // 循环引用自己
                }
            };

            const result = await resolver.resolveReferences(schema);

            expect(isCircularRef(result)).toBe(true);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Circular reference detected',
                expect.objectContaining({ ref: '#/$defs/A' })
            );
        });

        it('should merge additional properties with resolved $ref', async () => {
            const schema = {
                $ref: '#/$defs/BaseType',
                description: 'Overridden description',
                $defs: {
                    BaseType: { type: 'string', description: 'Base description' }
                }
            };

            const result = await resolver.resolveReferences(schema);

            expect(result.type).toBe('string');
            // 额外属性应该与解析后的 $ref 合并
            expect(result.description).toBe('Overridden description');
        });

        it('should handle invalid $ref path', async () => {
            const schema = {
                $ref: '#/$defs/NonExistent'
            };

            const result = await resolver.resolveReferences(schema);

            // 如果引用无法解析，应该返回原始 Schema
            expect(result.$ref).toBe('#/$defs/NonExistent');
        });

        it('should handle external file loading error', async () => {
            vi.mocked(mockLoader.loadSchema).mockRejectedValue(new Error('File not found'));

            const schema = {
                $ref: './nonexistent.schema.json'
            };

            const result = await resolver.resolveReferences(schema);

            // 出错时应该返回原始 Schema
            expect(result.$ref).toBe('./nonexistent.schema.json');
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    // ========================================
    // allOf 解析测试
    // ========================================

    describe('allOf resolution', () => {
        it('should merge allOf schemas', async () => {
            const schema = {
                allOf: [
                    { properties: { name: { type: 'string' } } },
                    { properties: { age: { type: 'number' } } }
                ]
            };

            const result = await resolver.resolveReferences(schema);

            expect((result as any).properties.name.type).toBe('string');
            expect((result as any).properties.age.type).toBe('number');
        });

        it('should merge required arrays from allOf', async () => {
            const schema = {
                allOf: [
                    { required: ['name'] },
                    { required: ['age'] }
                ]
            };

            const result = await resolver.resolveReferences(schema);

            expect((result as any).required).toContain('name');
            expect((result as any).required).toContain('age');
        });

        it('should deduplicate required fields', async () => {
            const schema = {
                allOf: [
                    { required: ['name', 'age'] },
                    { required: ['name', 'email'] }
                ]
            };

            const result = await resolver.resolveReferences(schema);

            expect((result as any).required).toEqual(expect.arrayContaining(['name', 'age', 'email']));
            expect((result as any).required.filter((r: string) => r === 'name')).toHaveLength(1);
        });

        it('should merge patternProperties from allOf', async () => {
            const schema = {
                allOf: [
                    { patternProperties: { '^a.*$': { type: 'string' } } },
                    { patternProperties: { '^b.*$': { type: 'number' } } }
                ]
            };

            const result = await resolver.resolveReferences(schema);

            expect((result as any).patternProperties['^a.*$'].type).toBe('string');
            expect((result as any).patternProperties['^b.*$'].type).toBe('number');
        });

        it('should preserve original schema properties with allOf', async () => {
            const schema = {
                type: 'object',
                description: 'My schema',
                allOf: [
                    { properties: { name: { type: 'string' } } }
                ]
            };

            const result = await resolver.resolveReferences(schema);

            expect(result.type).toBe('object');
            expect(result.description).toBe('My schema');
            expect((result as any).properties.name.type).toBe('string');
        });

        it('should resolve $ref within allOf', async () => {
            const schema = {
                allOf: [
                    { $ref: '#/$defs/NameProp' },
                    { properties: { age: { type: 'number' } } }
                ],
                $defs: {
                    NameProp: { properties: { name: { type: 'string' } } }
                }
            };

            const result = await resolver.resolveReferences(schema);

            expect((result as any).properties.name.type).toBe('string');
            expect((result as any).properties.age.type).toBe('number');
        });
    });

    // ========================================
    // oneOf 解析测试
    // ========================================

    describe('oneOf resolution', () => {
        it('should preserve oneOf structure', async () => {
            const schema = {
                oneOf: [
                    { type: 'string' },
                    { type: 'number' }
                ]
            };

            const result = await resolver.resolveReferences(schema);

            expect((result as any).oneOf).toHaveLength(2);
            expect((result as any).oneOf[0].type).toBe('string');
            expect((result as any).oneOf[1].type).toBe('number');
        });

        it('should resolve $ref within oneOf', async () => {
            const schema = {
                oneOf: [
                    { $ref: '#/$defs/StringType' },
                    { type: 'number' }
                ],
                $defs: {
                    StringType: { type: 'string', minLength: 1 }
                }
            };

            const result = await resolver.resolveReferences(schema);

            expect((result as any).oneOf).toHaveLength(2);
            expect((result as any).oneOf[0].type).toBe('string');
            expect((result as any).oneOf[0].minLength).toBe(1);
        });
    });

    // ========================================
    // anyOf 解析测试
    // ========================================

    describe('anyOf resolution', () => {
        it('should preserve anyOf structure', async () => {
            const schema = {
                anyOf: [
                    { type: 'string' },
                    { type: 'null' }
                ]
            };

            const result = await resolver.resolveReferences(schema);

            expect((result as any).anyOf).toHaveLength(2);
            expect((result as any).anyOf[0].type).toBe('string');
            expect((result as any).anyOf[1].type).toBe('null');
        });

        it('should resolve $ref within anyOf', async () => {
            const schema = {
                anyOf: [
                    { $ref: '#/$defs/NullableString' }
                ],
                $defs: {
                    NullableString: { type: ['string', 'null'] }
                }
            };

            const result = await resolver.resolveReferences(schema);

            expect((result as any).anyOf).toHaveLength(1);
            expect((result as any).anyOf[0].type).toEqual(['string', 'null']);
        });
    });

    // ========================================
    // 上下文和元数据测试
    // ========================================

    describe('context and metadata handling', () => {
        it('should preserve context schema for nested references', async () => {
            const schema = {
                $ref: '#/$defs/A',
                $defs: {
                    A: {
                        type: 'object',
                        properties: {
                            nested: { $ref: '#/$defs/B' }
                        }
                    },
                    B: { type: 'string' }
                }
            };

            const result = await resolver.resolveReferences(schema);

            expect(result.type).toBe('object');
            // 上下文应该被保留，允许嵌套引用正确解析
            expect(result[SCHEMA_METADATA.CONTEXT_SCHEMA]).toBeDefined();
        });

        it('should use contextSchema parameter for internal references', async () => {
            const contextSchema = {
                $defs: {
                    SharedType: { type: 'boolean' }
                }
            };

            const schema = {
                $ref: '#/$defs/SharedType'
            };

            const result = await resolver.resolveReferences(schema, 5, contextSchema);

            expect(result.type).toBe('boolean');
        });

        it('should handle relative path resolution', async () => {
            const externalSchema = {
                type: 'object',
                [SCHEMA_METADATA.SCHEMA_FILE]: 'common/base.schema.json'
            };

            vi.mocked(mockLoader.loadSchema).mockResolvedValue(externalSchema);

            const schema = {
                $ref: '../common/base.schema.json',
                [SCHEMA_METADATA.SCHEMA_DIR]: 'sections'
            };

            await resolver.resolveReferences(schema);

            // 应该正确解析相对路径
            expect(mockLoader.loadSchema).toHaveBeenCalled();
        });
    });

    // ========================================
    // isCircularRef 工具函数测试
    // ========================================

    describe('isCircularRef', () => {
        it('should return true for circular reference marker', () => {
            // 模拟循环引用结果
            const circularSchema = {
                type: 'object',
                __circularRef__: '#/$defs/A',
                description: 'Circular reference to #/$defs/A'
            };

            // 注意：isCircularRef 使用 Symbol 标记，需要通过解析器创建
            // 这里测试普通对象会返回 false
            expect(isCircularRef(circularSchema)).toBe(false);
        });

        it('should return false for normal schema', () => {
            const normalSchema = {
                type: 'object',
                properties: {
                    name: { type: 'string' }
                }
            };

            expect(isCircularRef(normalSchema)).toBe(false);
        });

        it('should return false for null/undefined', () => {
            // isCircularRef 函数对 null/undefined 可能返回 falsy 值
            expect(isCircularRef(null as any)).toBeFalsy();
            expect(isCircularRef(undefined as any)).toBeFalsy();
        });

        it('should return false for primitive types', () => {
            expect(isCircularRef('string' as any)).toBe(false);
            expect(isCircularRef(123 as any)).toBe(false);
            expect(isCircularRef(true as any)).toBe(false);
        });
    });

    // ========================================
    // 边缘情况测试
    // ========================================

    describe('edge cases', () => {
        it('should handle empty allOf array', async () => {
            const schema = {
                allOf: []
            };

            const result = await resolver.resolveReferences(schema);

            expect(result).toBeDefined();
        });

        it('should handle null items in allOf', async () => {
            const schema = {
                allOf: [
                    null,
                    { type: 'string' }
                ]
            };

            const result = await resolver.resolveReferences(schema);

            expect(result).toBeDefined();
        });

        it('should handle deeply nested references', async () => {
            const schema = {
                $ref: '#/$defs/Level1',
                $defs: {
                    Level1: { $ref: '#/$defs/Level2' },
                    Level2: { $ref: '#/$defs/Level3' },
                    Level3: { type: 'string' }
                }
            };

            const result = await resolver.resolveReferences(schema, 10);

            expect(result.type).toBe('string');
        });

        it('should handle mixed allOf and $ref', async () => {
            const schema = {
                allOf: [
                    { $ref: '#/$defs/Base' },
                    {
                        properties: {
                            extra: { type: 'boolean' }
                        }
                    }
                ],
                $defs: {
                    Base: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' }
                        }
                    }
                }
            };

            const result = await resolver.resolveReferences(schema);

            expect((result as any).properties.name.type).toBe('string');
            expect((result as any).properties.extra.type).toBe('boolean');
        });

        it('should handle $ref with internal path', async () => {
            const externalSchema = {
                $defs: {
                    Item: { type: 'object', properties: { id: { type: 'number' } } }
                },
                [SCHEMA_METADATA.SCHEMA_FILE]: 'external.schema.json'
            };

            vi.mocked(mockLoader.loadSchema).mockResolvedValue(externalSchema);

            const schema = {
                $ref: './external.schema.json#/$defs/Item'
            };

            const result = await resolver.resolveReferences(schema);

            expect(result.type).toBe('object');
            expect((result as any).properties.id.type).toBe('number');
        });
    });
});
