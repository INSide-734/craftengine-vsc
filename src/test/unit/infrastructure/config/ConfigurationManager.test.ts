import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigurationManager } from '../../../../infrastructure/config/ConfigurationManager';
import { IConfigurationProvider } from '../../../../core/interfaces/IConfiguration';

describe('ConfigurationManager', () => {
    let configManager: ConfigurationManager;
    let mockProvider: IConfigurationProvider;
    let mockConfig: Record<string, any>;

    beforeEach(async () => {
        mockConfig = {
            'simple': 'value',
            'nested': {
                'key': 'nestedValue'
            },
            'logging': {
                'level': 'INFO'
            }
        };

        mockProvider = {
            load: vi.fn().mockResolvedValue(mockConfig),
            save: vi.fn().mockResolvedValue(undefined),
            watch: vi.fn().mockReturnValue(() => {}),
        };

        configManager = new ConfigurationManager(mockProvider);
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
            expect(mockProvider.save).toHaveBeenCalledWith({ 'newKey': 'newValue' });
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

            expect(listener).toHaveBeenCalledWith(expect.objectContaining({
                key: 'simple',
                oldValue: 'value',
                newValue: 'newValue'
            }));
        });
    });

    describe('reload', () => {
        it('should reload config from provider', async () => {
            const newConfig = { ...mockConfig, 'simple': 'updated' };
            vi.mocked(mockProvider.load).mockResolvedValue(newConfig);

            await configManager.reload();

            expect(configManager.get('simple')).toBe('updated');
        });

        it('should notify listeners of changes after reload', async () => {
            const listener = vi.fn();
            configManager.onChange(listener);

            const newConfig = { ...mockConfig, 'simple': 'updated' };
            vi.mocked(mockProvider.load).mockResolvedValue(newConfig);

            await configManager.reload();

            expect(listener).toHaveBeenCalledWith(expect.objectContaining({
                key: 'simple',
                oldValue: 'value',
                newValue: 'updated'
            }));
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
});

