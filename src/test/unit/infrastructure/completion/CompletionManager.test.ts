import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CompletionManager } from '../../../../infrastructure/completion/CompletionManager';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import { type ICompletionStrategy, type ICompletionContextInfo } from '../../../../core/interfaces/ICompletionStrategy';

describe('CompletionManager', () => {
    let completionManager: CompletionManager;
    let mockLogger: ILogger;

    beforeEach(() => {
        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            createChild: vi.fn().mockReturnThis(),
        } as unknown as ILogger;

        completionManager = new CompletionManager(mockLogger);
    });

    describe('registerStrategy', () => {
        it('should register a strategy', () => {
            const strategy: ICompletionStrategy = {
                name: 'test-strategy',
                priority: 10,
                triggerCharacters: ['.'],
                shouldActivate: vi.fn(),
                provideCompletionItems: vi.fn(),
            };

            completionManager.registerStrategy(strategy);

            expect(completionManager.getStrategies()).toContain(strategy);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Completion strategy registered',
                expect.objectContaining({ strategyName: 'test-strategy' }),
            );
        });

        it('should not register duplicate strategy', () => {
            const strategy: ICompletionStrategy = {
                name: 'test-strategy',
                priority: 10,
                triggerCharacters: ['.'],
                shouldActivate: vi.fn(),
                provideCompletionItems: vi.fn(),
            };

            completionManager.registerStrategy(strategy);
            completionManager.registerStrategy(strategy);

            expect(completionManager.getStrategies().length).toBe(1);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Completion strategy already registered',
                expect.objectContaining({ strategyName: 'test-strategy' }),
            );
        });
    });

    describe('unregisterStrategy', () => {
        it('should unregister a strategy', () => {
            const strategy: ICompletionStrategy = {
                name: 'test-strategy',
                priority: 10,
                triggerCharacters: ['.'],
                shouldActivate: vi.fn(),
                provideCompletionItems: vi.fn(),
            };

            completionManager.registerStrategy(strategy);
            completionManager.unregisterStrategy('test-strategy');

            expect(completionManager.getStrategies()).not.toContain(strategy);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Completion strategy unregistered',
                expect.objectContaining({ strategyName: 'test-strategy' }),
            );
        });

        it('should warn when unregistering non-existent strategy', () => {
            completionManager.unregisterStrategy('non-existent');

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Completion strategy not found for unregistration',
                expect.objectContaining({ strategyName: 'non-existent' }),
            );
        });
    });

    describe('getActiveStrategies', () => {
        it('should return activated strategies sorted by priority', async () => {
            const strategy1: ICompletionStrategy = {
                name: 'strategy-1',
                priority: 10,
                triggerCharacters: [],
                shouldActivate: vi.fn().mockResolvedValue(true),
                provideCompletionItems: vi.fn(),
            };
            const strategy2: ICompletionStrategy = {
                name: 'strategy-2',
                priority: 20,
                triggerCharacters: [],
                shouldActivate: vi.fn().mockResolvedValue(true),
                provideCompletionItems: vi.fn(),
            };
            const strategy3: ICompletionStrategy = {
                name: 'strategy-3',
                priority: 5,
                triggerCharacters: [],
                shouldActivate: vi.fn().mockResolvedValue(false),
                provideCompletionItems: vi.fn(),
            };

            completionManager.registerStrategy(strategy1);
            completionManager.registerStrategy(strategy2);
            completionManager.registerStrategy(strategy3);

            const context = { position: { line: 0, character: 0 } } as unknown as ICompletionContextInfo;
            const activeStrategies = await completionManager.getActiveStrategies(context);

            expect(activeStrategies).toHaveLength(2);
            expect(activeStrategies[0]).toBe(strategy2); // Higher priority first
            expect(activeStrategies[1]).toBe(strategy1);
        });

        it('should handle errors in shouldActivate gracefully', async () => {
            const strategy: ICompletionStrategy = {
                name: 'error-strategy',
                priority: 10,
                triggerCharacters: [],
                shouldActivate: vi.fn().mockRejectedValue(new Error('Test error')),
                provideCompletionItems: vi.fn(),
            };

            completionManager.registerStrategy(strategy);

            const context = { position: { line: 0, character: 0 } } as unknown as ICompletionContextInfo;
            const activeStrategies = await completionManager.getActiveStrategies(context);

            expect(activeStrategies).toHaveLength(0);
            // 修改后使用 warn 而不是 error，因为超时或错误不应阻塞其他策略
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Strategy activation check failed',
                expect.objectContaining({ strategyName: 'error-strategy' }),
            );
        });
    });

    describe('getAllTriggerCharacters', () => {
        it('should return unique trigger characters from all strategies', () => {
            const strategy1: ICompletionStrategy = {
                name: 's1',
                priority: 1,
                triggerCharacters: ['.', ':'],
                shouldActivate: vi.fn(),
                provideCompletionItems: vi.fn(),
            };
            const strategy2: ICompletionStrategy = {
                name: 's2',
                priority: 1,
                triggerCharacters: [':', '@'],
                shouldActivate: vi.fn(),
                provideCompletionItems: vi.fn(),
            };

            completionManager.registerStrategy(strategy1);
            completionManager.registerStrategy(strategy2);

            const chars = completionManager.getAllTriggerCharacters();

            expect(chars).toHaveLength(3);
            expect(chars).toContain('.');
            expect(chars).toContain(':');
            expect(chars).toContain('@');
        });
    });
});
