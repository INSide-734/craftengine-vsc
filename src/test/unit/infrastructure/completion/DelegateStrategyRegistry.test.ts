import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DelegateStrategyRegistry } from '../../../../infrastructure/completion/DelegateStrategyRegistry';
import { ILogger } from '../../../../core/interfaces/ILogger';
import { ICompletionStrategy } from '../../../../core/interfaces/ICompletionStrategy';

describe('DelegateStrategyRegistry', () => {
    let registry: DelegateStrategyRegistry;
    let mockLogger: ILogger;

    beforeEach(() => {
        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            createChild: vi.fn().mockReturnThis(),
        } as unknown as ILogger;

        registry = new DelegateStrategyRegistry(mockLogger);
    });

    describe('registerStrategy', () => {
        it('should register a strategy instance', () => {
            const strategy: ICompletionStrategy = {
                name: 'test-strategy',
                priority: 10,
                triggerCharacters: [],
                shouldActivate: vi.fn(),
                provideCompletionItems: vi.fn(),
            };

            registry.registerStrategy('test.provider', strategy);

            expect(registry.hasProvider('test.provider')).toBe(true);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Delegate strategy registered',
                expect.objectContaining({ providerId: 'test.provider' })
            );
        });

        it('should register a strategy factory', () => {
            const factory = vi.fn().mockReturnValue({
                name: 'test-strategy',
            } as ICompletionStrategy);

            registry.registerStrategy('test.factory', factory);

            expect(registry.hasProvider('test.factory')).toBe(true);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Delegate strategy factory registered',
                expect.objectContaining({ providerId: 'test.factory' })
            );
        });
    });

    describe('getStrategy', () => {
        it('should retrieve a registered strategy instance', () => {
            const strategy: ICompletionStrategy = {
                name: 'test-strategy',
                priority: 10,
                triggerCharacters: [],
                shouldActivate: vi.fn(),
                provideCompletionItems: vi.fn(),
            };

            registry.registerStrategy('test.provider', strategy);
            const retrieved = registry.getStrategy('test.provider');

            expect(retrieved).toBe(strategy);
        });

        it('should instantiate and retrieve a strategy from factory', () => {
            const strategy: ICompletionStrategy = {
                name: 'factory-strategy',
                priority: 10,
                triggerCharacters: [],
                shouldActivate: vi.fn(),
                provideCompletionItems: vi.fn(),
            };
            const factory = vi.fn().mockReturnValue(strategy);

            registry.registerStrategy('test.factory', factory);
            const retrieved = registry.getStrategy('test.factory');

            expect(retrieved).toBe(strategy);
            expect(factory).toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Delegate strategy instantiated from factory',
                expect.objectContaining({ providerId: 'test.factory' })
            );
        });

        it('should cache strategy instance after factory instantiation', () => {
            const factory = vi.fn().mockReturnValue({
                name: 'factory-strategy',
            } as ICompletionStrategy);

            registry.registerStrategy('test.factory', factory);
            
            registry.getStrategy('test.factory');
            registry.getStrategy('test.factory');

            expect(factory).toHaveBeenCalledTimes(1);
        });

        it('should handle factory errors gracefully', () => {
            const factory = vi.fn().mockImplementation(() => {
                throw new Error('Factory error');
            });

            registry.registerStrategy('test.error', factory);
            const result = registry.getStrategy('test.error');

            expect(result).toBeUndefined();
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to instantiate delegate strategy',
                expect.any(Error),
                expect.objectContaining({ providerId: 'test.error' })
            );
        });

        it('should warn and return undefined for non-existent provider', () => {
            const result = registry.getStrategy('non.existent');

            expect(result).toBeUndefined();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Delegate strategy not found',
                expect.objectContaining({ providerId: 'non.existent' })
            );
        });
    });

    describe('listProviders', () => {
        it('should list all registered providers', () => {
            registry.registerStrategy('provider1', {} as ICompletionStrategy);
            registry.registerStrategy('provider2', () => ({} as ICompletionStrategy));

            const providers = registry.listProviders();

            expect(providers).toHaveLength(2);
            expect(providers).toContain('provider1');
            expect(providers).toContain('provider2');
        });

        it('should return sorted list', () => {
            registry.registerStrategy('b', {} as ICompletionStrategy);
            registry.registerStrategy('a', {} as ICompletionStrategy);

            const providers = registry.listProviders();

            expect(providers).toEqual(['a', 'b']);
        });
    });

    describe('unregisterStrategy', () => {
        it('should unregister a strategy', () => {
            registry.registerStrategy('test', {} as ICompletionStrategy);
            registry.unregisterStrategy('test');

            expect(registry.hasProvider('test')).toBe(false);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Delegate strategy unregistered',
                expect.objectContaining({ providerId: 'test' })
            );
        });

        it('should warn when unregistering non-existent provider', () => {
            registry.unregisterStrategy('non.existent');

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Attempt to unregister non-existent provider',
                expect.objectContaining({ providerId: 'non.existent' })
            );
        });
    });

    describe('clear', () => {
        it('should clear all strategies', () => {
            registry.registerStrategy('p1', {} as ICompletionStrategy);
            registry.registerStrategy('p2', () => ({} as ICompletionStrategy));

            registry.clear();

            expect(registry.listProviders()).toHaveLength(0);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Delegate strategy registry cleared',
                expect.objectContaining({ count: 2 })
            );
        });
    });
});

