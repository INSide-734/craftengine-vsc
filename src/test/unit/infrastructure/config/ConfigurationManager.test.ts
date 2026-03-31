import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigurationManager } from '../../../../infrastructure/config/ConfigurationManager';
import { type IConfigurationProvider } from '../../../../core/interfaces/IConfiguration';
import { type ILogger } from '../../../../core/interfaces/ILogger';

describe('ConfigurationManager', () => {
    let configManager: ConfigurationManager;
    let mockProvider: IConfigurationProvider;
    let mockLogger: ILogger;
    let mockConfig: Record<string, any>;

    beforeEach(async () => {
        mockConfig = {
            simple: 'value',
            nested: {
                key: 'nestedValue',
            },
            logging: {
                level: 'INFO',
            },
        };

        mockProvider = {
            load: vi.fn().mockResolvedValue(mockConfig),
            save: vi.fn().mockResolvedValue(undefined),
            watch: vi.fn().mockReturnValue(() => {}),
        };

        mockLogger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            fatal: vi.fn(),
            createChild: vi.fn(),
            setLevel: vi.fn(),
            getLevel: vi.fn(),
        };

        configManager = new ConfigurationManager(mockProvider, mockLogger);
        await configManager.initialize();
    });

    afterEach(() => {
        configManager.dispose();
    });

    describe('get', () => {
        it('should return simple value', () => {
            expect(configManager.get('simple')).toBe('value');
        });

        it('should return nested value using dot notation', () => {
            expect(configManager.get('nested.key')).toBe('nestedValue');
        });

        it('should return default value if key does not exist', () => {
            expect(configManager.get('non.existent', 'default')).toBe('default');
        });

        it('should return undefined if key does not exist and no default', () => {
            expect(configManager.get('non.existent')).toBeUndefined();
        });
    });

    describe('set', () => {
        it('should update local config and save to provider', async () => {
            await configManager.set('newKey', 'newValue');

            expect(configManager.get('newKey')).toBe('newValue');
            expect(mockProvider.save).toHaveBeenCalledWith({ newKey: 'newValue' });
        });

        it('should update nested value', async () => {
            await configManager.set('nested.newKey', 'newValue');

            expect(configManager.get('nested.newKey')).toBe('newValue');
            expect(mockProvider.save).toHaveBeenCalledWith({ 'nested.newKey': 'newValue' });
        });

        it('should notify listeners on change', async () => {
            const listener = vi.fn();
            configManager.onChange(listener);

            await configManager.set('simple', 'newValue');

            expect(listener).toHaveBeenCalledWith(
                expect.objectContaining({
                    key: 'simple',
                    oldValue: 'value',
                    newValue: 'newValue',
                }),
            );
        });
    });

    describe('reload', () => {
        it('should reload config from provider', async () => {
            const newConfig = { ...mockConfig, simple: 'updated' };
            vi.mocked(mockProvider.load).mockResolvedValue(newConfig);

            await configManager.reload();

            expect(configManager.get('simple')).toBe('updated');
        });

        it('should notify listeners of changes after reload', async () => {
            const listener = vi.fn();
            configManager.onChange(listener);

            const newConfig = { ...mockConfig, simple: 'updated' };
            vi.mocked(mockProvider.load).mockResolvedValue(newConfig);

            await configManager.reload();

            expect(listener).toHaveBeenCalledWith(
                expect.objectContaining({
                    key: 'simple',
                    oldValue: 'value',
                    newValue: 'updated',
                }),
            );
        });
    });

    describe('validate', () => {
        it('should validate types', async () => {
            await configManager.set('logging.level', 123); // Invalid type, expected string

            const errors = await configManager.validate();

            // Note: In real scenario set() doesn't validate, only validate() does.
            // But set() updates the internal state which validate() checks.
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]).toContain('Invalid type for logging.level');
        });

        it('should validate enum values', async () => {
            await configManager.set('logging.level', 'INVALID_LEVEL');

            const errors = await configManager.validate();

            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]).toContain('Invalid value for logging.level');
        });
    });

    describe('error handling with Logger', () => {
        it('should use logger.error when reload fails', async () => {
            const error = new Error('Failed to load config');
            vi.mocked(mockProvider.load).mockRejectedValue(error);

            // 触发 watch 回调来测试 setupWatcher 中的错误处理
            const watchCallback = vi.mocked(mockProvider.watch).mock.calls[0][0];

            // 调用回调并等待异步操作完成
            watchCallback();

            // 等待 Promise 链完成
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to reload configuration after file change',
                expect.any(Error),
                expect.objectContaining({
                    errorMessage: expect.any(String),
                }),
            );
        });

        it('should use logger.error when listener throws error', async () => {
            const listener = vi.fn().mockImplementation(() => {
                throw new Error('Listener error');
            });
            configManager.onChange(listener);

            await configManager.set('simple', 'newValue');

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Error in configuration change listener',
                expect.any(Error),
                expect.any(Object),
            );
        });
    });
});
