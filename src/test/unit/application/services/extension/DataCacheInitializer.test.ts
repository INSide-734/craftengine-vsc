/**
 * DataCacheInitializer 单元测试
 *
 * 测试数据缓存初始化器的所有功能，包括：
 * - 初始化流程
 * - 初始扫描执行
 * - initialScanCompleted Promise 解析
 * - 事件发布
 * - 错误处理
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataCacheInitializer } from '../../../../../application/services/extension/DataCacheInitializer';
import { ILogger } from '../../../../../core/interfaces/ILogger';
import { IEventBus } from '../../../../../core/interfaces/IEventBus';
import { IDataStoreService } from '../../../../../core/interfaces/IDataStoreService';
import { IPerformanceMonitor } from '../../../../../core/interfaces/IPerformanceMonitor';

describe('DataCacheInitializer', () => {
    let initializer: DataCacheInitializer;
    let mockLogger: ILogger;
    let mockEventBus: IEventBus;
    let mockDataStoreService: IDataStoreService;
    let mockPerformanceMonitor: IPerformanceMonitor;
    let mockGenerateEventId: ReturnType<typeof vi.fn>;
    let mockTimer: { stop: ReturnType<typeof vi.fn> };

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

        mockEventBus = {
            publish: vi.fn(() => Promise.resolve()),
            subscribe: vi.fn(),
            unsubscribe: vi.fn(),
        } as unknown as IEventBus;

        mockTimer = { stop: vi.fn() };

        mockPerformanceMonitor = {
            startTimer: vi.fn(() => mockTimer),
            recordMetric: vi.fn(),
            getStatistics: vi.fn(),
            getAllStatistics: vi.fn(() => []),
            getAllOperationStatistics: vi.fn(() => ({})),
            setThreshold: vi.fn(),
            isAboveThreshold: vi.fn(),
            clearStatistics: vi.fn(),
            reset: vi.fn(),
            dispose: vi.fn(),
        } as unknown as IPerformanceMonitor;

        mockDataStoreService = {
            initialize: vi.fn(() => Promise.resolve()),
            getStatistics: vi.fn(() => Promise.resolve({
                templateCount: 10,
                translationKeyCount: 20,
                itemCount: 5,
                categoryCount: 3,
                indexedFileCount: 15,
                languageCount: 2,
                namespaceCount: 1,
                lastUpdated: new Date(),
                isInitialized: true,
            })),
        } as unknown as IDataStoreService;

        mockGenerateEventId = vi.fn(() => 'test-event-id');

        initializer = new DataCacheInitializer(
            mockLogger,
            mockEventBus,
            mockDataStoreService,
            mockPerformanceMonitor,
            mockGenerateEventId as unknown as () => string
        );
    });

    // ========================================
    // initialScanCompleted
    // ========================================

    describe('initialScanCompleted', () => {
        it('should be a Promise', () => {
            expect(initializer.initialScanCompleted).toBeInstanceOf(Promise);
        });

        it('should resolve after initialize completes the scan', async () => {
            await initializer.initialize();
            // 等待异步扫描完成
            await initializer.initialScanCompleted;
            // 如果到达这里说明 Promise 已解析
            expect(true).toBe(true);
        });

        it('should resolve even when dataStoreService.initialize fails', async () => {
            vi.mocked(mockDataStoreService.initialize).mockRejectedValue(
                new Error('Init failed')
            );

            await initializer.initialize();
            // 即使初始化失败，Promise 也应该解析（finally 块）
            await initializer.initialScanCompleted;
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Initial data scan failed',
                expect.any(Error)
            );
        });
    });

    // ========================================
    // initialize
    // ========================================

    describe('initialize', () => {
        it('should start a performance timer during scan', async () => {
            await initializer.initialize();
            await initializer.initialScanCompleted;
            expect(mockPerformanceMonitor.startTimer).toHaveBeenCalledWith('extension.initialScan');
        });

        it('should stop the timer after scan completes', async () => {
            await initializer.initialize();
            await initializer.initialScanCompleted;
            expect(mockTimer.stop).toHaveBeenCalled();
        });

        it('should call dataStoreService.initialize during scan', async () => {
            await initializer.initialize();
            await initializer.initialScanCompleted;
            expect(mockDataStoreService.initialize).toHaveBeenCalled();
        });

        it('should publish data.scan.completed event after successful scan', async () => {
            await initializer.initialize();
            await initializer.initialScanCompleted;

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                'data.scan.completed',
                expect.objectContaining({
                    id: 'test-event-id',
                    type: 'data.scan.completed',
                    source: 'DataCacheInitializer',
                    filesProcessed: 15,
                    templatesFound: 10,
                    translationKeysFound: 20,
                    languageCount: 2,
                })
            );
        });

        it('should log data cache initialized with statistics', async () => {
            await initializer.initialize();
            await initializer.initialScanCompleted;

            expect(mockLogger.info).toHaveBeenCalledWith(
                'Data cache initialized',
                expect.objectContaining({
                    filesProcessed: 15,
                    templateCount: 10,
                    translationKeyCount: 20,
                    languageCount: 2,
                })
            );
        });
    });
});
