import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExtendedTypeService } from '../../../../domain/services/ExtendedTypeService';
import { type IDataConfigLoader } from '../../../../core/interfaces/IDataConfigLoader';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import { ServiceNotInitializedError } from '../../../../core/errors/ExtensionErrors';

describe('ExtendedTypeService', () => {
    let service: ExtendedTypeService;
    let mockLogger: ILogger;
    let mockConfigLoader: IDataConfigLoader;

    const mockConfig = {
        types: {
            'custom:type1': {
                name: 'Custom Type 1',
                description: 'A custom type',
                baseType: 'string',
            },
            'custom:type2': {
                name: 'Custom Type 2',
                description: 'Another custom type',
                baseType: 'number',
            },
        },
        propertyDefinitions: {
            'custom:type1': [
                { name: 'prop1', type: 'string', required: true },
                { name: 'prop2', type: 'number', required: false },
            ],
        },
        snippets: {
            'custom:type1': 'snippet for type1',
        },
    };

    beforeEach(() => {
        mockLogger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            fatal: vi.fn(),
            createChild: vi.fn(() => mockLogger),
        } as unknown as ILogger;

        mockConfigLoader = {
            loadExtendedTypesConfig: vi.fn().mockResolvedValue(mockConfig),
        } as unknown as IDataConfigLoader;

        service = new ExtendedTypeService(mockLogger, mockConfigLoader);
    });

    describe('initialize', () => {
        it('should load config on initialize', async () => {
            await service.initialize();
            expect(mockConfigLoader.loadExtendedTypesConfig).toHaveBeenCalledTimes(1);
        });

        it('should be idempotent', async () => {
            await service.initialize();
            await service.initialize();
            expect(mockConfigLoader.loadExtendedTypesConfig).toHaveBeenCalledTimes(1);
        });
    });

    describe('getTypeNames', () => {
        it('should return all type names after initialization', async () => {
            await service.initialize();
            const names = service.getTypeNames();
            expect(names).toEqual(['custom:type1', 'custom:type2']);
        });

        it('should throw ServiceNotInitializedError before initialization', () => {
            expect(() => service.getTypeNames()).toThrow(ServiceNotInitializedError);
        });
    });

    describe('isValidType', () => {
        it('should return true for valid types', async () => {
            await service.initialize();
            expect(service.isValidType('custom:type1')).toBe(true);
        });

        it('should return false for invalid types', async () => {
            await service.initialize();
            expect(service.isValidType('nonexistent')).toBe(false);
        });
    });

    describe('getTypeDefinition', () => {
        it('should return definition for existing type', async () => {
            await service.initialize();
            const def = service.getTypeDefinition('custom:type1');
            expect(def).toBeDefined();
            expect(def!.name).toBe('Custom Type 1');
        });

        it('should return undefined for non-existing type', async () => {
            await service.initialize();
            expect(service.getTypeDefinition('nonexistent')).toBeUndefined();
        });
    });

    describe('getTypeProperties', () => {
        it('should return properties for existing type', async () => {
            await service.initialize();
            const props = service.getTypeProperties('custom:type1');
            expect(props).toHaveLength(2);
            expect(props[0].name).toBe('prop1');
        });

        it('should return empty array for type without properties', async () => {
            await service.initialize();
            const props = service.getTypeProperties('custom:type2');
            expect(props).toEqual([]);
        });
    });

    describe('getTypeSnippet', () => {
        it('should return snippet for existing type', async () => {
            await service.initialize();
            expect(service.getTypeSnippet('custom:type1')).toBe('snippet for type1');
        });

        it('should return undefined for type without snippet', async () => {
            await service.initialize();
            expect(service.getTypeSnippet('custom:type2')).toBeUndefined();
        });
    });

    describe('clearCache', () => {
        it('should force reload on next access', async () => {
            await service.initialize();
            service.clearCache();

            // 清除后应该需要重新初始化
            expect(() => service.getTypeNames()).toThrow(ServiceNotInitializedError);

            // 重新初始化应该再次加载
            await service.initialize();
            expect(mockConfigLoader.loadExtendedTypesConfig).toHaveBeenCalledTimes(2);
        });
    });
});
