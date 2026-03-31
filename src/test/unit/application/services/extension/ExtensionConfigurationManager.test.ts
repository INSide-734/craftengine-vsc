/**
 * ExtensionConfigurationManager 单元测试
 *
 * 测试扩展配置管理器的所有功能，包括：
 * - 初始化流程
 * - 配置验证
 * - 配置变更监听
 * - 事件发布
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExtensionConfigurationManager } from '../../../../../application/services/extension/ExtensionConfigurationManager';
import { type ILogger } from '../../../../../core/interfaces/ILogger';
import { type IConfiguration, type IConfigurationChangeEvent } from '../../../../../core/interfaces/IConfiguration';
import { type IEventBus } from '../../../../../core/interfaces/IEventBus';
import { EVENT_TYPES } from '../../../../../core/constants/ServiceTokens';

describe('ExtensionConfigurationManager', () => {
    let manager: ExtensionConfigurationManager;
    let mockLogger: ILogger;
    let mockConfiguration: IConfiguration;
    let mockEventBus: IEventBus;
    let mockGenerateEventId: ReturnType<typeof vi.fn>;
    let capturedOnChangeCallback: ((event: IConfigurationChangeEvent) => void) | null;

    beforeEach(() => {
        capturedOnChangeCallback = null;

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

        mockConfiguration = {
            get: vi.fn(),
            set: vi.fn(),
            has: vi.fn(),
            delete: vi.fn(),
            getAll: vi.fn(),
            onChange: vi.fn((cb: (event: IConfigurationChangeEvent) => void) => {
                capturedOnChangeCallback = cb;
                return vi.fn();
            }),
            validate: vi.fn(() => Promise.resolve([])),
            reload: vi.fn(),
        } as unknown as IConfiguration;

        mockEventBus = {
            publish: vi.fn(() => Promise.resolve()),
            subscribe: vi.fn(),
            unsubscribe: vi.fn(),
        } as unknown as IEventBus;

        mockGenerateEventId = vi.fn(() => 'test-event-id');

        manager = new ExtensionConfigurationManager(
            mockLogger,
            mockConfiguration,
            mockEventBus,
            mockGenerateEventId as unknown as () => string,
        );
    });

    // ========================================
    // initialize
    // ========================================

    describe('initialize', () => {
        it('should validate configuration during initialization', async () => {
            await manager.initialize();
            expect(mockConfiguration.validate).toHaveBeenCalled();
        });

        it('should setup configuration change listener', async () => {
            await manager.initialize();
            expect(mockConfiguration.onChange).toHaveBeenCalled();
        });

        it('should log debug on successful initialization', async () => {
            await manager.initialize();
            expect(mockLogger.debug).toHaveBeenCalledWith('Configuration initialized');
        });

        it('should log warning when validation has errors', async () => {
            vi.mocked(mockConfiguration.validate).mockResolvedValue(['Invalid path', 'Missing value']);

            await manager.initialize();

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Configuration validation warnings',
                expect.objectContaining({
                    errors: ['Invalid path', 'Missing value'],
                }),
            );
        });

        it('should throw and log error when initialization fails', async () => {
            const error = new Error('Validate failed');
            vi.mocked(mockConfiguration.validate).mockRejectedValue(error);

            await expect(manager.initialize()).rejects.toThrow('Validate failed');
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to initialize configuration', error);
        });
    });

    // ========================================
    // 配置变更监听
    // ========================================

    describe('configuration change listener', () => {
        it('should publish ConfigurationChanged event when config changes', async () => {
            await manager.initialize();

            expect(capturedOnChangeCallback).not.toBeNull();

            const changeEvent: IConfigurationChangeEvent = {
                key: 'templates.maxResults',
                oldValue: 50,
                newValue: 100,
                timestamp: new Date('2025-06-01T00:00:00Z'),
            };

            capturedOnChangeCallback!(changeEvent);

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                EVENT_TYPES.ConfigurationChanged,
                expect.objectContaining({
                    id: 'test-event-id',
                    type: EVENT_TYPES.ConfigurationChanged,
                    source: 'ExtensionService',
                    key: 'templates.maxResults',
                    oldValue: 50,
                    newValue: 100,
                }),
            );
        });

        it('should log configuration change info', async () => {
            await manager.initialize();

            const changeEvent: IConfigurationChangeEvent = {
                key: 'logging.level',
                oldValue: 'info',
                newValue: 'debug',
                timestamp: new Date(),
            };

            capturedOnChangeCallback!(changeEvent);

            expect(mockLogger.info).toHaveBeenCalledWith(
                'Configuration changed',
                expect.objectContaining({
                    key: 'logging.level',
                    oldValue: 'info',
                    newValue: 'debug',
                }),
            );
        });
    });
});
