/**
 * SchemaPathNavigator 单元测试
 *
 * 测试 Schema 路径导航器的所有功能，包括：
 * - 精确属性匹配 (properties)
 * - 模式属性匹配 (patternProperties)
 * - 附加属性匹配 (additionalProperties)
 * - 数组项匹配 (items)
 * - 版本条件键处理
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchemaPathNavigator } from '../../../../../application/services/schema/SchemaPathNavigator';
import { type SchemaReferenceResolver } from '../../../../../application/services/schema/SchemaReferenceResolver';
import { type ILogger } from '../../../../../core/interfaces/ILogger';
import { SCHEMA_METADATA } from '../../../../../application/services/schema/SchemaConstants';

describe('SchemaPathNavigator', () => {
    let navigator: SchemaPathNavigator;
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
            resolveReferences: vi.fn((schema) => Promise.resolve(schema)),
        } as unknown as SchemaReferenceResolver;

        navigator = new SchemaPathNavigator(mockResolver, mockLogger);
    });

    // ========================================
    // isVersionConditionKey 测试
    // ========================================

    describe('isVersionConditionKey', () => {
        it('should return true for valid version condition keys', () => {
            expect(navigator.isVersionConditionKey('$$>=1.21.2')).toBe(true);
            expect(navigator.isVersionConditionKey('$$<=1.20.0')).toBe(true);
            expect(navigator.isVersionConditionKey('$$>1.19')).toBe(true);
            expect(navigator.isVersionConditionKey('$$<1.18.0')).toBe(true);
            expect(navigator.isVersionConditionKey('$$=1.21.0')).toBe(true);
            expect(navigator.isVersionConditionKey('$$1.21.0')).toBe(true);
        });

        it('should return true for version range keys', () => {
            expect(navigator.isVersionConditionKey('$$>=1.20.0~1.21.0')).toBe(true);
            expect(navigator.isVersionConditionKey('$$1.20~1.21.2')).toBe(true);
        });

        it('should return true for version keys with hash suffix', () => {
            expect(navigator.isVersionConditionKey('$$>=1.21.0#myid')).toBe(true);
            expect(navigator.isVersionConditionKey('$$1.20.0#custom-id')).toBe(true);
        });

        it('should return false for non-version keys', () => {
            expect(navigator.isVersionConditionKey('items')).toBe(false);
            expect(navigator.isVersionConditionKey('template')).toBe(false);
            expect(navigator.isVersionConditionKey('$ref')).toBe(false);
            expect(navigator.isVersionConditionKey('$version')).toBe(false);
        });

        it('should return false for invalid version format', () => {
            expect(navigator.isVersionConditionKey('$$')).toBe(false);
            expect(navigator.isVersionConditionKey('$$abc')).toBe(false);
            expect(navigator.isVersionConditionKey('$$1')).toBe(false);
        });
    });

    // ========================================
    // getSchemaForPath - 基础导航测试
    // ========================================

    describe('getSchemaForPath - basic navigation', () => {
        it('should return undefined for null rootSchema', async () => {
            const result = await navigator.getSchemaForPath(null as any, ['items']);

            expect(result).toBeUndefined();
        });

        it('should return undefined for undefined rootSchema', async () => {
            const result = await navigator.getSchemaForPath(undefined as any, ['items']);

            expect(result).toBeUndefined();
        });

        it('should return rootSchema for empty path', async () => {
            const rootSchema = { type: 'object' };

            const result = await navigator.getSchemaForPath(rootSchema, []);

            expect(result!.type).toBe('object');
        });

        it('should navigate to nested property', async () => {
            const rootSchema = {
                type: 'object',
                properties: {
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                        },
                    },
                },
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['items', 'name']);

            expect(result!.type).toBe('string');
        });

        it('should return undefined for invalid path', async () => {
            const rootSchema = {
                type: 'object',
                properties: {
                    items: { type: 'object' },
                },
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['nonexistent']);

            expect(result).toBeUndefined();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Schema path segment not found',
                expect.objectContaining({ segment: 'nonexistent' }),
            );
        });
    });

    // ========================================
    // getSchemaForPath - properties 匹配测试
    // ========================================

    describe('getSchemaForPath - properties matching', () => {
        it('should match exact property name', async () => {
            const rootSchema = {
                properties: {
                    template: { type: 'string', description: 'Template name' },
                },
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['template']);

            expect(result!.type).toBe('string');
            expect(result!.description).toBe('Template name');
        });

        it('should navigate through multiple levels', async () => {
            const rootSchema = {
                properties: {
                    level1: {
                        type: 'object',
                        properties: {
                            level2: {
                                type: 'object',
                                properties: {
                                    level3: { type: 'boolean' },
                                },
                            },
                        },
                    },
                },
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['level1', 'level2', 'level3']);

            expect(result!.type).toBe('boolean');
        });
    });

    // ========================================
    // getSchemaForPath - patternProperties 匹配测试
    // ========================================

    describe('getSchemaForPath - patternProperties matching', () => {
        it('should match pattern property', async () => {
            const rootSchema = {
                patternProperties: {
                    '^[a-z]+:[a-z]+$': { type: 'object', description: 'Namespaced item' },
                },
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['mypack:myitem']);

            expect(result!.type).toBe('object');
            expect(result!.description).toBe('Namespaced item');
        });

        it('should match numeric pattern', async () => {
            const rootSchema = {
                patternProperties: {
                    '^[0-9]+$': { type: 'object', description: 'Array index' },
                },
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['123']);

            expect(result!.description).toBe('Array index');
        });

        it('should prefer properties over patternProperties', async () => {
            const rootSchema = {
                properties: {
                    special: { type: 'string', description: 'Exact match' },
                },
                patternProperties: {
                    '^.*$': { type: 'object', description: 'Pattern match' },
                },
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['special']);

            expect(result!.description).toBe('Exact match');
        });

        it('should handle invalid regex gracefully', async () => {
            const rootSchema = {
                patternProperties: {
                    '[invalid': { type: 'string' }, // 无效正则
                },
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['test']);

            expect(result).toBeUndefined();
        });
    });

    // ========================================
    // getSchemaForPath - additionalProperties 匹配测试
    // ========================================

    describe('getSchemaForPath - additionalProperties matching', () => {
        it('should match additionalProperties object', async () => {
            const rootSchema = {
                additionalProperties: { type: 'number', description: 'Any numeric value' },
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['anyKey']);

            expect(result!.type).toBe('number');
            expect(result!.description).toBe('Any numeric value');
        });

        it('should not match additionalProperties when true', async () => {
            const rootSchema = {
                additionalProperties: true,
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['anyKey']);

            // additionalProperties: true 不返回 schema
            expect(result).toBeUndefined();
        });

        it('should prefer patternProperties over additionalProperties', async () => {
            const rootSchema = {
                patternProperties: {
                    '^item_.*$': { type: 'string', description: 'Item pattern' },
                },
                additionalProperties: { type: 'number', description: 'Additional' },
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['item_123']);

            expect(result!.description).toBe('Item pattern');
        });

        it('should fall back to additionalProperties when no pattern matches', async () => {
            const rootSchema = {
                patternProperties: {
                    '^item_.*$': { type: 'string', description: 'Item pattern' },
                },
                additionalProperties: { type: 'number', description: 'Additional' },
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['other_key']);

            expect(result!.description).toBe('Additional');
        });
    });

    // ========================================
    // getSchemaForPath - items 匹配测试
    // ========================================

    describe('getSchemaForPath - items matching', () => {
        it('should match array items', async () => {
            const rootSchema = {
                type: 'array',
                items: { type: 'string', description: 'Array element' },
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['0']);

            expect(result!.type).toBe('string');
            expect(result!.description).toBe('Array element');
        });

        it('should navigate into array item properties', async () => {
            const rootSchema = {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                    },
                },
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['0', 'name']);

            expect(result!.type).toBe('string');
        });
    });

    // ========================================
    // getSchemaForPath - 版本条件键测试
    // ========================================

    describe('getSchemaForPath - version condition keys', () => {
        it('should skip version condition key and continue with parent schema', async () => {
            const rootSchema = {
                properties: {
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                        },
                    },
                },
            };

            // 版本条件键应该被跳过
            const result = await navigator.getSchemaForPath(rootSchema, ['items', '$$>=1.21.0', 'name']);

            expect(result!.type).toBe('string');
        });

        it('should handle multiple version condition keys', async () => {
            const rootSchema = {
                properties: {
                    config: {
                        type: 'object',
                        properties: {
                            value: { type: 'number' },
                        },
                    },
                },
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['config', '$$>=1.20.0', '$$<1.22.0', 'value']);

            expect(result!.type).toBe('number');
        });
    });

    // ========================================
    // getSchemaForPath - 引用解析测试
    // ========================================

    describe('getSchemaForPath - reference resolution', () => {
        it('should resolve $ref before navigation', async () => {
            // 根据实际导航逻辑，resolver 需要返回正确解析后的 schema
            // 第一次调用解析 rootSchema，返回带有 properties 的对象
            // 第二次调用解析 name 属性的 schema
            const resolvedRootSchema = {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                },
            };

            const nameSchema = { type: 'string' };

            vi.mocked(mockResolver.resolveReferences)
                .mockResolvedValueOnce(resolvedRootSchema) // 第一次解析 root
                .mockResolvedValueOnce(nameSchema); // 第二次解析 name

            const rootSchema = {
                $ref: '#/$defs/ItemType',
                $defs: {
                    ItemType: resolvedRootSchema,
                },
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['name']);

            // 解析后导航到 name 属性
            expect(result!.type).toBe('string');
        });

        it('should resolve schema with ref and return resolved type', async () => {
            const resolvedSchema = {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                },
            };

            vi.mocked(mockResolver.resolveReferences).mockResolvedValue(resolvedSchema);

            const rootSchema = {
                $ref: '#/$defs/ItemType',
                $defs: {
                    ItemType: resolvedSchema,
                },
            };

            // 空路径应该返回解析后的 schema
            const result = await navigator.getSchemaForPath(rootSchema, []);

            expect(result!.type).toBe('object');
        });

        it('should update context schema for external references', async () => {
            const externalSchema = {
                type: 'object',
                properties: {
                    external: { type: 'boolean' },
                },
                [SCHEMA_METADATA.CONTEXT_SCHEMA]: {
                    /* external context */
                },
            };

            vi.mocked(mockResolver.resolveReferences).mockResolvedValue(externalSchema);

            const rootSchema = {
                properties: {
                    ref: { $ref: './external.schema.json' },
                },
            };

            await navigator.getSchemaForPath(rootSchema, ['ref', 'external']);

            // 验证解析器被调用
            expect(mockResolver.resolveReferences).toHaveBeenCalled();
        });

        it('should inherit context metadata for nested navigation', async () => {
            const rootSchema = {
                properties: {
                    items: {
                        type: 'object',
                        properties: {
                            nested: { type: 'string' },
                        },
                    },
                },
                [SCHEMA_METADATA.SCHEMA_FILE]: 'root.schema.json',
                [SCHEMA_METADATA.SCHEMA_DIR]: 'schemas',
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['items', 'nested']);

            expect(result!.type).toBe('string');
            // 应该继承上下文元数据
            expect(result![SCHEMA_METADATA.CONTEXT_SCHEMA]).toBeDefined();
        });
    });

    // ========================================
    // 边缘情况测试
    // ========================================

    describe('edge cases', () => {
        it('should handle deeply nested path', async () => {
            const rootSchema = {
                properties: {
                    a: {
                        properties: {
                            b: {
                                properties: {
                                    c: {
                                        properties: {
                                            d: {
                                                properties: {
                                                    e: { type: 'string' },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['a', 'b', 'c', 'd', 'e']);

            expect(result!.type).toBe('string');
        });

        it('should handle schema with $id', async () => {
            const rootSchema = {
                $id: 'https://example.com/schema',
                properties: {
                    name: { type: 'string' },
                },
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['name']);

            expect(result!.type).toBe('string');
        });

        it('should handle schema with $defs', async () => {
            const rootSchema = {
                properties: {
                    item: { type: 'object' },
                },
                $defs: {
                    CommonType: { type: 'string' },
                },
            };

            // 解析器应该更新上下文
            vi.mocked(mockResolver.resolveReferences).mockImplementation(async (schema) => {
                if (schema.$defs) {
                    return { ...schema, [SCHEMA_METADATA.CONTEXT_SCHEMA]: schema };
                }
                return schema;
            });

            await navigator.getSchemaForPath(rootSchema, ['item']);

            expect(mockResolver.resolveReferences).toHaveBeenCalled();
        });

        it('should handle empty properties object', async () => {
            const rootSchema = {
                properties: {},
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['anyKey']);

            expect(result).toBeUndefined();
        });

        it('should handle mixed matching strategies', async () => {
            const rootSchema = {
                properties: {
                    exact: { type: 'string', description: 'Exact' },
                },
                patternProperties: {
                    '^pat_.*$': { type: 'number', description: 'Pattern' },
                },
                additionalProperties: {
                    type: 'boolean',
                    description: 'Additional',
                },
            };

            const exactResult = await navigator.getSchemaForPath(rootSchema, ['exact']);
            const patternResult = await navigator.getSchemaForPath(rootSchema, ['pat_123']);
            const additionalResult = await navigator.getSchemaForPath(rootSchema, ['other']);

            expect(exactResult!.description).toBe('Exact');
            expect(patternResult!.description).toBe('Pattern');
            expect(additionalResult!.description).toBe('Additional');
        });

        it('should handle path with special characters', async () => {
            const rootSchema = {
                patternProperties: {
                    '^.*$': { type: 'object' },
                },
            };

            const result = await navigator.getSchemaForPath(rootSchema, ['key-with-dashes']);

            expect(result!.type).toBe('object');
        });

        it('should resolve final schema after navigation', async () => {
            const rootSchema = {
                properties: {
                    item: {
                        $ref: '#/$defs/ItemType',
                    },
                },
                $defs: {
                    ItemType: { type: 'object', properties: { name: { type: 'string' } } },
                },
            };

            vi.mocked(mockResolver.resolveReferences).mockImplementation(async (schema) => {
                if (schema.$ref === '#/$defs/ItemType') {
                    return rootSchema.$defs.ItemType;
                }
                return schema;
            });

            const result = await navigator.getSchemaForPath(rootSchema, ['item']);

            // 最终的 schema 应该被解析
            expect(result!.type).toBe('object');
        });
    });
});
