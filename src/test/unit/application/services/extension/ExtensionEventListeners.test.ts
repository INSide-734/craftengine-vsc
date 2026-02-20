/**
 * ExtensionEventListeners 单元测试
 *
 * 测试扩展事件监听器管理器的所有功能，包括：
 * - 事件监听器设置
 * - 各类事件处理（性能、模板、补全、文档、配置、文件系统）
 * - 统计计数器更新
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExtensionEventListeners } from '../../../../../application/services/extension/ExtensionEventListeners';
import { type ILogger } from '../../../../../core/interfaces/ILogger';
import { type IEventBus } from '../../../../../core/interfaces/IEventBus';
import { type ExtensionStatistics } from '../../../../../application/services/extension/ExtensionStatistics';
import { EVENT_TYPES } from '../../../../../core/constants/ServiceTokens';

describe('ExtensionEventListeners', () => {
    let listeners: ExtensionEventListeners;
    let mockLogger: ILogger;
    let mockEventBus: IEventBus;
    let mockStatistics: ExtensionStatistics;
    let subscribedHandlers: Map<string, ((event: any) => void)[]>;

    beforeEach(() => {
        subscribedHandlers = new Map();

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

        mockEventBus = {
            publish: vi.fn(() => Promise.resolve()),
            subscribe: vi.fn((eventType: string, handler: (event: any) => void) => {
                if (!subscribedHandlers.has(eventType)) {
                    subscribedHandlers.set(eventType, []);
                }
                subscribedHandlers.get(eventType)!.push(handler);
            }),
            unsubscribe: vi.fn(),
        } as unknown as IEventBus;

        mockStatistics = {
            incrementCompletionsProvided: vi.fn(),
            incrementProcessedDocuments: vi.fn(),
        } as unknown as ExtensionStatistics;

        listeners = new ExtensionEventListeners(mockLogger, mockEventBus, mockStatistics);
    });

    // ========================================
    // setup
    // ========================================

    describe('setup', () => {
        it('should subscribe to all event types', () => {
            listeners.setup();

            // 应该注册 6 个事件监听器
            expect(mockEventBus.subscribe).toHaveBeenCalledTimes(6);
        });

        it('should log debug on successful setup', () => {
            listeners.setup();
            expect(mockLogger.debug).toHaveBeenCalledWith('Event listeners setup completed');
        });

        it('should subscribe to performance metric events', () => {
            listeners.setup();
            expect(mockEventBus.subscribe).toHaveBeenCalledWith(EVENT_TYPES.PerformanceMetric, expect.any(Function));
        });

        it('should subscribe to template wildcard events', () => {
            listeners.setup();
            expect(mockEventBus.subscribe).toHaveBeenCalledWith('template.*', expect.any(Function));
        });

        it('should subscribe to completion.provided events', () => {
            listeners.setup();
            expect(mockEventBus.subscribe).toHaveBeenCalledWith('completion.provided', expect.any(Function));
        });

        it('should subscribe to document.processed events', () => {
            listeners.setup();
            expect(mockEventBus.subscribe).toHaveBeenCalledWith('document.processed', expect.any(Function));
        });

        it('should subscribe to extension.configuration.changed events', () => {
            listeners.setup();
            expect(mockEventBus.subscribe).toHaveBeenCalledWith(
                'extension.configuration.changed',
                expect.any(Function),
            );
        });

        it('should subscribe to file.created events', () => {
            listeners.setup();
            expect(mockEventBus.subscribe).toHaveBeenCalledWith('file.created', expect.any(Function));
        });
    });

    // ========================================
    // 事件处理回调
    // ========================================

    describe('event handlers', () => {
        beforeEach(() => {
            listeners.setup();
        });

        it('should increment completions counter on completion.provided', () => {
            const handlers = subscribedHandlers.get('completion.provided');
            expect(handlers).toBeDefined();
            expect(handlers!.length).toBeGreaterThan(0);

            handlers![0]({ itemCount: 5 });

            expect(mockStatistics.incrementCompletionsProvided).toHaveBeenCalled();
        });

        it('should increment processed documents counter on document.processed', () => {
            const handlers = subscribedHandlers.get('document.processed');
            expect(handlers).toBeDefined();

            handlers![0]({ uri: '/test/file.yaml' });

            expect(mockStatistics.incrementProcessedDocuments).toHaveBeenCalled();
        });

        it('should log performance metric events', () => {
            const handlers = subscribedHandlers.get(EVENT_TYPES.PerformanceMetric);
            expect(handlers).toBeDefined();

            handlers![0]({ metric: 'completion.time', value: 50, unit: 'ms' });

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Performance metric recorded',
                expect.objectContaining({
                    metric: 'completion.time',
                    value: 50,
                    unit: 'ms',
                }),
            );
        });

        it('should log configuration change events', () => {
            const handlers = subscribedHandlers.get('extension.configuration.changed');
            expect(handlers).toBeDefined();

            handlers![0]({
                key: 'diagnostics.enabled',
                oldValue: true,
                newValue: false,
            });

            expect(mockLogger.info).toHaveBeenCalledWith(
                'Configuration changed',
                expect.objectContaining({
                    key: 'diagnostics.enabled',
                    oldValue: true,
                    newValue: false,
                }),
            );
        });

        it('should log diagnostics config change debug message', () => {
            const handlers = subscribedHandlers.get('extension.configuration.changed');

            handlers![0]({
                key: 'diagnostics.severity',
                oldValue: 'warning',
                newValue: 'error',
            });

            expect(mockLogger.debug).toHaveBeenCalledWith('Diagnostics configuration changed, may need to refresh');
        });

        it('should log completion config change debug message', () => {
            const handlers = subscribedHandlers.get('extension.configuration.changed');

            handlers![0]({
                key: 'completion.maxItems',
                oldValue: 50,
                newValue: 100,
            });

            expect(mockLogger.debug).toHaveBeenCalledWith('Completion configuration changed');
        });

        it('should log template events', () => {
            const handlers = subscribedHandlers.get('template.*');
            expect(handlers).toBeDefined();

            handlers![0]({ type: 'template.created', timestamp: new Date() });

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Template event received',
                expect.objectContaining({
                    eventType: 'template.created',
                }),
            );
        });
    });
});
