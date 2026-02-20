import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SchemaLoader } from '../../../../infrastructure/schema/SchemaLoader';
import { type ISchemaFileLoader } from '../../../../core/interfaces/ISchemaFileLoader';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import { type JsonSchemaNode } from '../../../../core/types/JsonSchemaTypes';

describe('SchemaLoader', () => {
    let schemaLoader: SchemaLoader;
    let mockLogger: ILogger;
    let mockFileLoader: ISchemaFileLoader;

    beforeEach(() => {
        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            createChild: vi.fn().mockReturnThis(),
        } as unknown as ILogger;

        mockFileLoader = {
            loadSchema: vi.fn(),
            clearCache: vi.fn(),
        };

        schemaLoader = new SchemaLoader(mockLogger, mockFileLoader, '/mock/schemas');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('loadSchema', () => {
        it('should load and parse schema file via fileLoader', async () => {
            const schemaObj: JsonSchemaNode = {
                $id: 'test.schema.json',
                type: 'object',
                properties: {
                    name: { type: 'string' },
                },
            };
            // PLACEHOLDER_REST

            vi.mocked(mockFileLoader.loadSchema).mockResolvedValue(schemaObj);

            const result = await schemaLoader.loadSchema('test.schema.json');

            expect(result.schema).toEqual(schemaObj);
            expect(result.resolved).toBeDefined();
            expect(mockFileLoader.loadSchema).toHaveBeenCalledWith('test.schema.json');
        });

        it('should use cache for subsequent loads', async () => {
            const schemaObj: JsonSchemaNode = {
                $id: 'test.schema.json',
                type: 'object',
            };

            vi.mocked(mockFileLoader.loadSchema).mockResolvedValue(schemaObj);

            await schemaLoader.loadSchema('test.schema.json');
            await schemaLoader.loadSchema('test.schema.json');

            expect(mockFileLoader.loadSchema).toHaveBeenCalledTimes(1);
        });

        it('should handle load errors', async () => {
            vi.mocked(mockFileLoader.loadSchema).mockRejectedValue(new Error('File not found'));

            await expect(schemaLoader.loadSchema('nonexistent.json')).rejects.toThrow(
                'Failed to load schema nonexistent.json',
            );

            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe('resolveRef', () => {
        it('should resolve internal refs', async () => {
            const schemaObj: JsonSchemaNode = {
                $id: 'test.schema.json',
                type: 'object',
                properties: {
                    user: { $ref: '#/$defs/user' },
                },
                $defs: {
                    user: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                        },
                    },
                },
            };

            vi.mocked(mockFileLoader.loadSchema).mockResolvedValue(schemaObj);

            const result = await schemaLoader.loadSchema('test.schema.json');

            // SchemaLoader 保留内部引用让 Ajv 处理
            expect(result.resolved.properties?.user).toHaveProperty('$ref', '#/$defs/user');
        });

        it('should resolve external refs', async () => {
            const mainSchemaObj: JsonSchemaNode = {
                $id: 'main.json',
                type: 'object',
                properties: {
                    other: { $ref: 'other.json' },
                },
            };

            const otherSchemaObj: JsonSchemaNode = {
                $id: 'other.json',
                type: 'string',
            };

            vi.mocked(mockFileLoader.loadSchema).mockImplementation(async (filename: string) => {
                if (filename === 'main.json') {
                    return structuredClone(mainSchemaObj);
                }
                if (filename === 'other.json') {
                    return structuredClone(otherSchemaObj);
                }
                throw new Error('Not found');
            });

            const result = await schemaLoader.loadSchema('main.json');
            const resolved = result.resolved;

            // 外部引用被解析并合并
            expect(resolved.properties?.other).toEqual(
                expect.objectContaining({
                    type: 'string',
                }),
            );
        });
    });

    describe('findSchemaForContext', () => {
        it('should match schema path', async () => {
            const mainSchemaObj: JsonSchemaNode = {
                type: 'object',
                properties: {
                    items: {
                        type: 'object',
                        properties: {
                            my_item: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                },
                            },
                        },
                    },
                },
            };

            vi.mocked(mockFileLoader.loadSchema).mockResolvedValue(mainSchemaObj);

            const matches = await schemaLoader.findSchemaForContext({
                yamlPath: ['items', 'my_item'],
                inObject: true,
                inArray: false,
            });

            expect(matches).toHaveLength(2);
            const targetMatch = matches.find((m) => m.path.join('/') === 'items/my_item');
            expect(targetMatch).toBeDefined();
            expect(targetMatch?.schema.properties).toHaveProperty('name');
        });

        it('should match pattern properties', async () => {
            const mainSchemaObj: JsonSchemaNode = {
                type: 'object',
                patternProperties: {
                    '^item_.*$': {
                        type: 'object',
                        properties: {
                            id: { type: 'number' },
                        },
                    },
                },
            };

            vi.mocked(mockFileLoader.loadSchema).mockResolvedValue(mainSchemaObj);

            const matches = await schemaLoader.findSchemaForContext({
                yamlPath: ['item_123'],
                inObject: true,
                inArray: false,
            });

            expect(matches).toHaveLength(1);
            expect(matches[0].path).toEqual(['item_123']);
            expect(matches[0].schema.properties).toHaveProperty('id');
        });
    });

    describe('extractProperties', () => {
        it('should extract properties from allOf', () => {
            const schema = {
                allOf: [
                    {
                        properties: {
                            prop1: { type: 'string' },
                        },
                    },
                    {
                        properties: {
                            prop2: { type: 'number' },
                        },
                    },
                ],
            };

            const props = schemaLoader.extractProperties(schema as any);

            expect(props.has('prop1')).toBe(true);
            expect(props.has('prop2')).toBe(true);
        });
    });

    describe('clearCache', () => {
        it('should clear both schema cache and file loader cache', () => {
            schemaLoader.clearCache();

            expect(mockFileLoader.clearCache).toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith('Schema cache cleared');
        });
    });
});
