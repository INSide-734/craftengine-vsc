import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SchemaLoader } from '../../../../infrastructure/schema/SchemaLoader';
import * as fs from 'fs/promises';
import { ServiceContainer } from '../../../../infrastructure/ServiceContainer';
import { ILogger } from '../../../../core/interfaces/ILogger';

vi.mock('fs/promises');
vi.mock('../../../../infrastructure/ServiceContainer', () => ({
    ServiceContainer: {
        getService: vi.fn()
    }
}));

describe('SchemaLoader', () => {
    let schemaLoader: SchemaLoader;
    let mockLogger: ILogger;

    beforeEach(() => {
        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            createChild: vi.fn().mockReturnThis(),
        } as unknown as ILogger;

        vi.mocked(ServiceContainer.getService).mockReturnValue(mockLogger);

        // Reset fs mocks
        vi.mocked(fs.readFile).mockReset();

        schemaLoader = new SchemaLoader(mockLogger, '/mock/schemas');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('loadSchema', () => {
        it('should load and parse schema file', async () => {
            const schemaContent = JSON.stringify({
                $id: 'test.schema.json',
                type: 'object',
                properties: {
                    name: { type: 'string' }
                }
            });

            vi.mocked(fs.readFile).mockResolvedValue(schemaContent);

            const result = await schemaLoader.loadSchema('test.schema.json');

            expect(result.schema).toEqual(JSON.parse(schemaContent));
            expect(result.resolved).toBeDefined();
            expect(fs.readFile).toHaveBeenCalled();
        });

        it('should use cache for subsequent loads', async () => {
            const schemaContent = JSON.stringify({
                $id: 'test.schema.json',
                type: 'object'
            });

            vi.mocked(fs.readFile).mockResolvedValue(schemaContent);

            await schemaLoader.loadSchema('test.schema.json');
            await schemaLoader.loadSchema('test.schema.json');

            expect(fs.readFile).toHaveBeenCalledTimes(1);
        });

        it('should handle load errors', async () => {
            vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

            await expect(schemaLoader.loadSchema('nonexistent.json'))
                .rejects.toThrow('Failed to load schema nonexistent.json');
            
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe('resolveRef', () => {
        it('should resolve internal refs', async () => {
            const schemaContent = JSON.stringify({
                $id: 'test.schema.json',
                type: 'object',
                properties: {
                    user: { $ref: '#/$defs/user' }
                },
                $defs: {
                    user: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' }
                        }
                    }
                }
            });

            vi.mocked(fs.readFile).mockResolvedValue(schemaContent);

            const result = await schemaLoader.loadSchema('test.schema.json');
            
            // Note: resolveRef in SchemaLoader keeps internal refs for Ajv, 
            // so we check if the loading process completed successfully.
            expect(result.resolved.properties?.user).toHaveProperty('$ref', '#/$defs/user');
        });

        it('should resolve external refs', async () => {
            const mainSchema = JSON.stringify({
                $id: 'main.json',
                type: 'object',
                properties: {
                    other: { $ref: 'other.json' }
                }
            });

            const otherSchema = JSON.stringify({
                $id: 'other.json',
                type: 'string'
            });

            vi.mocked(fs.readFile).mockImplementation(async (path) => {
                if (path.toString().includes('main.json')) {return mainSchema;}
                if (path.toString().includes('other.json')) {return otherSchema;}
                throw new Error('Not found');
            });

            const result = await schemaLoader.loadSchema('main.json');
            const resolved = result.resolved;

            // External refs are resolved and merged
            expect(resolved.properties?.other).toEqual(expect.objectContaining({
                type: 'string'
            }));
        });
    });

    describe('findSchemaForContext', () => {
        it('should match schema path', async () => {
            const mainSchema = JSON.stringify({
                type: 'object',
                properties: {
                    items: {
                        type: 'object',
                        properties: {
                            my_item: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' }
                                }
                            }
                        }
                    }
                }
            });

            vi.mocked(fs.readFile).mockResolvedValue(mainSchema);

            const matches = await schemaLoader.findSchemaForContext({
                yamlPath: ['items', 'my_item'],
                inObject: true,
                inArray: false
            });

            expect(matches).toHaveLength(2);
            const targetMatch = matches.find(m => m.path.join('/') === 'items/my_item');
            expect(targetMatch).toBeDefined();
            expect(targetMatch?.schema.properties).toHaveProperty('name');
        });

        it('should match pattern properties', async () => {
            const mainSchema = JSON.stringify({
                type: 'object',
                patternProperties: {
                    "^item_.*$": {
                        type: 'object',
                        properties: {
                            id: { type: 'number' }
                        }
                    }
                }
            });

            vi.mocked(fs.readFile).mockResolvedValue(mainSchema);

            const matches = await schemaLoader.findSchemaForContext({
                yamlPath: ['item_123'],
                inObject: true,
                inArray: false
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
                            prop1: { type: 'string' }
                        }
                    },
                    {
                        properties: {
                            prop2: { type: 'number' }
                        }
                    }
                ]
            };

            // Using any to access private method or public method if exposed
            // SchemaLoader.extractProperties is public
            const props = schemaLoader.extractProperties(schema as any);
            
            expect(props.has('prop1')).toBe(true);
            expect(props.has('prop2')).toBe(true);
        });
    });
});

