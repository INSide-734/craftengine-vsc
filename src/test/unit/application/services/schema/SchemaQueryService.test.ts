/**
 * SchemaQueryService 单元测试
 *
 * 测试 Schema 查询服务的所有功能，包括：
 * - Schema 路径导航和查询
 * - 属性缓存管理
 * - Schema 可用性快速检查
 * - 顶级字段提取
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchemaQueryService } from '../../../../../application/services/schema/SchemaQueryService';
import { SchemaPathNavigator } from '../../../../../application/services/schema/SchemaPathNavigator';
import { SchemaPropertyExtractor } from '../../../../../application/services/schema/SchemaPropertyExtractor';
import { ILogger } from '../../../../../core/interfaces/ILogger';
import { IPerformanceMonitor } from '../../../../../core/interfaces/IPerformanceMonitor';
import { SchemaProperty } from '../../../../../application/services/schema/SchemaUtils';

describe('SchemaQueryService', () => {
    let service: SchemaQueryService;
    let mockNavigator: SchemaPathNavigator;
    let mockExtractor: SchemaPropertyExtractor;
    let mockLogger: ILogger;
    let mockPerformanceMonitor: IPerformanceMonitor;

    // 辅助函数：创建测试 Schema
    const createTestSchema = () => ({
        type: 'object',
        properties: {
            name: { type: 'string', description: 'Item name' },
            amount: { type: 'number', description: 'Item amount' }
        },
        patternProperties: {
            '^items(#.*)?$': { type: 'object', description: 'Items section' }
        },
        required: ['name']
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

        mockNavigator = {
            getSchemaForPath: vi.fn(),
            isVersionConditionKey: vi.fn(() => false)
        } as unknown as SchemaPathNavigator;

        mockExtractor = {
            extractProperties: vi.fn(),
            findPropertySchema: vi.fn(),
            extractPropertyDetails: vi.fn()
        } as unknown as SchemaPropertyExtractor;

        const mockTimer = {
            stop: vi.fn()
        };

        mockPerformanceMonitor = {
            startTimer: vi.fn(() => mockTimer),
            recordMetric: vi.fn(),
            getMetrics: vi.fn(() => ({})),
            clearMetrics: vi.fn()
        } as unknown as IPerformanceMonitor;

        service = new SchemaQueryService(
            mockNavigator,
            mockExtractor,
            mockLogger,
            mockPerformanceMonitor
        );
    });

    // ========================================
    // getSchemaForPath 测试
    // ========================================

    describe('getSchemaForPath', () => {
        it('should return schema for valid path', async () => {
            const rootSchema = createTestSchema();
            const expectedSchema = { type: 'string', description: 'Nested value' };

            vi.mocked(mockNavigator.getSchemaForPath).mockResolvedValue(expectedSchema);

            const result = await service.getSchemaForPath(rootSchema, ['items', 'myItem', 'name']);

            expect(result).toEqual(expectedSchema);
            expect(mockNavigator.getSchemaForPath).toHaveBeenCalledWith(rootSchema, ['items', 'myItem', 'name']);
        });

        it('should return undefined when rootSchema is null', async () => {
            const result = await service.getSchemaForPath(null as any, ['items']);

            expect(result).toBeUndefined();
        });

        it('should return undefined when rootSchema is undefined', async () => {
            const result = await service.getSchemaForPath(undefined as any, ['items']);

            expect(result).toBeUndefined();
        });

        it('should return undefined when path navigation fails', async () => {
            const rootSchema = createTestSchema();
            vi.mocked(mockNavigator.getSchemaForPath).mockRejectedValue(new Error('Navigation failed'));

            const result = await service.getSchemaForPath(rootSchema, ['invalid', 'path']);

            expect(result).toBeUndefined();
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to get schema for path',
                expect.any(Error),
                expect.objectContaining({ path: 'invalid.path' })
            );
        });

        it('should handle empty path', async () => {
            const rootSchema = createTestSchema();
            vi.mocked(mockNavigator.getSchemaForPath).mockResolvedValue(rootSchema);

            const result = await service.getSchemaForPath(rootSchema, []);

            expect(result).toEqual(rootSchema);
        });
    });

    // ========================================
    // hasSchemaForPath 测试
    // ========================================

    describe('hasSchemaForPath', () => {
        it('should return true for valid path', () => {
            const rootSchema = createTestSchema();

            const result = service.hasSchemaForPath(rootSchema, ['name']);

            expect(result).toBe(true);
        });

        it('should return false when rootSchema is null', () => {
            const result = service.hasSchemaForPath(null as any, ['items']);

            expect(result).toBe(false);
        });

        it('should cache availability results', () => {
            const rootSchema = createTestSchema();

            // 第一次调用
            const result1 = service.hasSchemaForPath(rootSchema, ['name']);
            // 第二次调用（应该从缓存返回）
            const result2 = service.hasSchemaForPath(rootSchema, ['name']);

            expect(result1).toBe(true);
            expect(result2).toBe(true);
        });

        it('should return true when schema has $ref', () => {
            const rootSchema = {
                properties: {
                    item: { $ref: '#/$defs/ItemSchema' }
                },
                $defs: {
                    ItemSchema: { type: 'object' }
                }
            };

            const result = service.hasSchemaForPath(rootSchema, ['item', 'nested']);

            expect(result).toBe(true);
        });

        it('should return true for patternProperties match', () => {
            const rootSchema = {
                patternProperties: {
                    '^item_[0-9]+$': { type: 'object' }
                }
            };

            const result = service.hasSchemaForPath(rootSchema, ['item_123']);

            expect(result).toBe(true);
        });

        it('should return true for additionalProperties', () => {
            const rootSchema = {
                additionalProperties: { type: 'string' }
            };

            const result = service.hasSchemaForPath(rootSchema, ['anyKey']);

            expect(result).toBe(true);
        });

        it('should return true for array items', () => {
            const rootSchema = {
                type: 'array',
                items: { type: 'object' }
            };

            const result = service.hasSchemaForPath(rootSchema, ['0']);

            expect(result).toBe(true);
        });

        it('should return false for invalid path', () => {
            const rootSchema = {
                properties: {
                    name: { type: 'string' }
                }
            };

            const result = service.hasSchemaForPath(rootSchema, ['nonexistent']);

            expect(result).toBe(false);
        });

        it('should handle allOf/oneOf/anyOf', () => {
            const rootSchema = {
                allOf: [
                    { properties: { name: { type: 'string' } } }
                ]
            };

            const result = service.hasSchemaForPath(rootSchema, ['name']);

            expect(result).toBe(true);
        });
    });

    // ========================================
    // getAvailableProperties 测试
    // ========================================

    describe('getAvailableProperties', () => {
        it('should return properties for valid path', async () => {
            const rootSchema = createTestSchema();
            const properties: SchemaProperty[] = [
                { key: 'name', schema: { type: 'string' } },
                { key: 'amount', schema: { type: 'number' } }
            ];

            vi.mocked(mockNavigator.getSchemaForPath).mockResolvedValue(rootSchema);
            vi.mocked(mockExtractor.extractProperties).mockResolvedValue(properties);

            const result = await service.getAvailableProperties(rootSchema, []);

            expect(result).toEqual(properties);
            expect(mockExtractor.extractProperties).toHaveBeenCalled();
        });

        it('should cache properties', async () => {
            const rootSchema = createTestSchema();
            const properties: SchemaProperty[] = [
                { key: 'name', schema: { type: 'string' } }
            ];

            vi.mocked(mockNavigator.getSchemaForPath).mockResolvedValue(rootSchema);
            vi.mocked(mockExtractor.extractProperties).mockResolvedValue(properties);

            // 第一次调用
            await service.getAvailableProperties(rootSchema, ['items']);
            // 第二次调用
            const result = await service.getAvailableProperties(rootSchema, ['items']);

            expect(result).toEqual(properties);
            // extractProperties 应该只被调用一次（第二次使用缓存）
            expect(mockExtractor.extractProperties).toHaveBeenCalledTimes(1);
        });

        it('should return empty array when schema not found', async () => {
            const rootSchema = createTestSchema();
            vi.mocked(mockNavigator.getSchemaForPath).mockResolvedValue(undefined);

            const result = await service.getAvailableProperties(rootSchema, ['invalid']);

            expect(result).toEqual([]);
        });

        it('should return empty array on error', async () => {
            const rootSchema = createTestSchema();
            vi.mocked(mockNavigator.getSchemaForPath).mockRejectedValue(new Error('Test error'));

            const result = await service.getAvailableProperties(rootSchema, ['items']);

            expect(result).toEqual([]);
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should log properties loaded from cache', async () => {
            const rootSchema = createTestSchema();
            const properties: SchemaProperty[] = [
                { key: 'name', schema: { type: 'string' } }
            ];

            vi.mocked(mockNavigator.getSchemaForPath).mockResolvedValue(rootSchema);
            vi.mocked(mockExtractor.extractProperties).mockResolvedValue(properties);

            // 第一次调用（填充缓存）
            await service.getAvailableProperties(rootSchema, ['items']);
            // 第二次调用（从缓存加载）
            await service.getAvailableProperties(rootSchema, ['items']);

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Properties loaded from cache',
                expect.objectContaining({ path: 'items' })
            );
        });
    });

    // ========================================
    // getPropertyDetails 测试
    // ========================================

    describe('getPropertyDetails', () => {
        it('should return property details', async () => {
            const rootSchema = createTestSchema();
            const propertySchema = { type: 'string', description: 'Item name' };
            const details = {
                type: 'string',
                description: 'Item name',
                required: true
            };

            vi.mocked(mockNavigator.getSchemaForPath).mockResolvedValue(rootSchema);
            vi.mocked(mockExtractor.findPropertySchema).mockResolvedValue(propertySchema);
            vi.mocked(mockExtractor.extractPropertyDetails).mockReturnValue(details);

            const result = await service.getPropertyDetails(rootSchema, ['name']);

            expect(result).toEqual(details);
        });

        it('should return undefined for empty path', async () => {
            const rootSchema = createTestSchema();

            const result = await service.getPropertyDetails(rootSchema, []);

            expect(result).toBeUndefined();
        });

        it('should return undefined when parent schema not found', async () => {
            const rootSchema = createTestSchema();
            vi.mocked(mockNavigator.getSchemaForPath).mockResolvedValue(undefined);

            const result = await service.getPropertyDetails(rootSchema, ['items', 'nested', 'prop']);

            expect(result).toBeUndefined();
        });

        it('should return undefined when property schema not found', async () => {
            const rootSchema = createTestSchema();
            vi.mocked(mockNavigator.getSchemaForPath).mockResolvedValue(rootSchema);
            vi.mocked(mockExtractor.findPropertySchema).mockResolvedValue(undefined);

            const result = await service.getPropertyDetails(rootSchema, ['nonexistent']);

            expect(result).toBeUndefined();
        });

        it('should handle errors gracefully', async () => {
            const rootSchema = createTestSchema();
            vi.mocked(mockNavigator.getSchemaForPath).mockRejectedValue(new Error('Test error'));

            const result = await service.getPropertyDetails(rootSchema, ['items', 'prop']);

            expect(result).toBeUndefined();
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should use rootSchema when path length is 1', async () => {
            const rootSchema = createTestSchema();
            const propertySchema = { type: 'string', description: 'Item name' };
            const details = { type: 'string', description: 'Item name' };

            vi.mocked(mockExtractor.findPropertySchema).mockResolvedValue(propertySchema);
            vi.mocked(mockExtractor.extractPropertyDetails).mockReturnValue(details);

            await service.getPropertyDetails(rootSchema, ['name']);

            // 当路径长度为 1 时，应该直接使用 rootSchema 作为父 Schema
            expect(mockExtractor.findPropertySchema).toHaveBeenCalledWith(
                rootSchema,
                'name',
                rootSchema
            );
        });
    });

    // ========================================
    // getTopLevelFields 测试
    // ========================================

    describe('getTopLevelFields', () => {
        it('should extract fields from properties', async () => {
            const rootSchema = {
                properties: {
                    items: { type: 'object' },
                    templates: { type: 'object' }
                }
            };

            const result = await service.getTopLevelFields(rootSchema);

            expect(result).toContain('items');
            expect(result).toContain('templates');
        });

        it('should extract fields from patternProperties', async () => {
            const rootSchema = {
                patternProperties: {
                    '^items(#.*)?$': { type: 'object' },
                    '^templates(#.*)?$': { type: 'object' }
                }
            };

            const result = await service.getTopLevelFields(rootSchema);

            expect(result).toContain('items');
            expect(result).toContain('templates');
        });

        it('should cache top level fields', async () => {
            const rootSchema = {
                properties: {
                    items: { type: 'object' }
                }
            };

            // 第一次调用
            const result1 = await service.getTopLevelFields(rootSchema);
            // 第二次调用（应该从缓存返回）
            const result2 = await service.getTopLevelFields(rootSchema);

            expect(result1).toEqual(result2);
        });

        it('should return fallback fields when rootSchema is null', async () => {
            const result = await service.getTopLevelFields(null as any);

            expect(result).toContain('items');
            expect(result).toContain('templates');
            expect(mockLogger.warn).toHaveBeenCalledWith('Root schema not available, using fallback');
        });

        it('should return fallback fields on error', async () => {
            // 创建一个会导致错误的 Schema
            const badSchema = {
                get patternProperties() {
                    throw new Error('Test error');
                }
            };

            const result = await service.getTopLevelFields(badSchema);

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should merge fields from both properties and patternProperties', async () => {
            const rootSchema = {
                properties: {
                    categories: { type: 'object' }
                },
                patternProperties: {
                    '^items(#.*)?$': { type: 'object' }
                }
            };

            const result = await service.getTopLevelFields(rootSchema);

            expect(result).toContain('categories');
            expect(result).toContain('items');
        });

        it('should sort fields alphabetically', async () => {
            const rootSchema = {
                properties: {
                    zebra: { type: 'object' },
                    apple: { type: 'object' },
                    mango: { type: 'object' }
                }
            };

            const result = await service.getTopLevelFields(rootSchema);

            expect(result).toEqual(['apple', 'mango', 'zebra']);
        });
    });

    // ========================================
    // clearCaches 测试
    // ========================================

    describe('clearCaches', () => {
        it('should clear all caches', async () => {
            const rootSchema = createTestSchema();
            const properties: SchemaProperty[] = [
                { key: 'name', schema: { type: 'string' } }
            ];

            vi.mocked(mockNavigator.getSchemaForPath).mockResolvedValue(rootSchema);
            vi.mocked(mockExtractor.extractProperties).mockResolvedValue(properties);

            // 填充缓存
            await service.getAvailableProperties(rootSchema, ['items']);
            await service.getTopLevelFields(rootSchema);
            service.hasSchemaForPath(rootSchema, ['name']);

            // 清除缓存
            service.clearCaches();

            // 验证缓存已清除（再次调用应该重新计算）
            await service.getAvailableProperties(rootSchema, ['items']);

            // extractProperties 应该被调用两次（一次在清除前，一次在清除后）
            expect(mockExtractor.extractProperties).toHaveBeenCalledTimes(2);

            expect(mockLogger.debug).toHaveBeenCalledWith('All schema caches cleared');
        });
    });

    // ========================================
    // 边缘情况测试
    // ========================================

    describe('edge cases', () => {
        it('should handle schema with $id', async () => {
            const rootSchema = {
                $id: 'https://example.com/schema.json',
                properties: {
                    name: { type: 'string' }
                }
            };

            // 使用 $id 作为缓存键的一部分
            const result1 = service.hasSchemaForPath(rootSchema, ['name']);
            const result2 = service.hasSchemaForPath(rootSchema, ['name']);

            expect(result1).toBe(true);
            expect(result2).toBe(true);
        });

        it('should handle performance monitor not provided', async () => {
            // 创建一个没有 performance monitor 的服务实例
            const serviceWithoutMonitor = new SchemaQueryService(
                mockNavigator,
                mockExtractor,
                mockLogger
            );

            const rootSchema = createTestSchema();
            const properties: SchemaProperty[] = [];

            vi.mocked(mockNavigator.getSchemaForPath).mockResolvedValue(rootSchema);
            vi.mocked(mockExtractor.extractProperties).mockResolvedValue(properties);

            // 应该不抛出错误
            const result = await serviceWithoutMonitor.getAvailableProperties(rootSchema, []);

            expect(result).toEqual(properties);
        });

        it('should use different cache keys for different schemas', () => {
            const schema1 = { $id: 'schema1', properties: { name: { type: 'string' } } };
            const schema2 = { $id: 'schema2', properties: { name: { type: 'number' } } };

            const result1 = service.hasSchemaForPath(schema1, ['name']);
            const result2 = service.hasSchemaForPath(schema2, ['name']);

            expect(result1).toBe(true);
            expect(result2).toBe(true);
        });
    });
});
