/**
 * ExtensionStatistics 单元测试
 *
 * 测试扩展统计信息管理器的所有功能，包括：
 * - 激活时间管理
 * - 文档处理计数
 * - 补全提供计数
 * - 统计信息获取
 * - 缓存命中率计算
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExtensionStatistics } from '../../../../../application/services/extension/ExtensionStatistics';
import { IPerformanceMonitor } from '../../../../../core/interfaces/IPerformanceMonitor';
import { ILogger } from '../../../../../core/interfaces/ILogger';

describe('ExtensionStatistics', () => {
    let statistics: ExtensionStatistics;
    let mockPerformanceMonitor: IPerformanceMonitor;
    let mockLogger: ILogger;

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

        mockPerformanceMonitor = {
            startTimer: vi.fn(),
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

        statistics = new ExtensionStatistics(mockPerformanceMonitor, mockLogger);
    });

    // ========================================
    // 激活时间管理
    // ========================================

    describe('activationTime', () => {
        it('should return undefined before setting activation time', () => {
            expect(statistics.getActivationTime()).toBeUndefined();
        });

        it('should store and return activation time', () => {
            const time = new Date('2025-01-01T00:00:00Z');
            statistics.setActivationTime(time);
            expect(statistics.getActivationTime()).toBe(time);
        });

        it('should overwrite previous activation time', () => {
            const time1 = new Date('2025-01-01T00:00:00Z');
            const time2 = new Date('2025-06-01T00:00:00Z');
            statistics.setActivationTime(time1);
            statistics.setActivationTime(time2);
            expect(statistics.getActivationTime()).toBe(time2);
        });
    });

    // ========================================
    // 计数器
    // ========================================

    describe('counters', () => {
        it('should increment processed documents count', () => {
            statistics.incrementProcessedDocuments();
            statistics.incrementProcessedDocuments();
            const stats = statistics.getStatistics();
            expect(stats.processedDocuments).toBe(2);
        });

        it('should increment completions provided count', () => {
            statistics.incrementCompletionsProvided();
            statistics.incrementCompletionsProvided();
            statistics.incrementCompletionsProvided();
            const stats = statistics.getStatistics();
            expect(stats.completionsProvided).toBe(3);
        });

        it('should log on each increment', () => {
            statistics.incrementProcessedDocuments();
            expect(mockLogger.debug).toHaveBeenCalledWith('Document processed', { totalDocuments: 1 });

            statistics.incrementCompletionsProvided();
            expect(mockLogger.debug).toHaveBeenCalledWith('Completion provided', { totalCompletions: 1 });
        });
    });

    // ========================================
    // reset
    // ========================================

    describe('reset', () => {
        it('should reset all counters to zero', () => {
            statistics.incrementProcessedDocuments();
            statistics.incrementProcessedDocuments();
            statistics.incrementCompletionsProvided();

            statistics.reset();

            const stats = statistics.getStatistics();
            expect(stats.processedDocuments).toBe(0);
            expect(stats.completionsProvided).toBe(0);
        });

        it('should log reset action', () => {
            statistics.reset();
            expect(mockLogger.debug).toHaveBeenCalledWith('Statistics reset');
        });
    });

    // ========================================
    // getStatistics
    // ========================================

    describe('getStatistics', () => {
        it('should return zero uptime when no activation time set', () => {
            const stats = statistics.getStatistics();
            expect(stats.uptime).toBe(0);
        });

        it('should calculate uptime from activation time', () => {
            const pastTime = new Date(Date.now() - 5000);
            statistics.setActivationTime(pastTime);
            const stats = statistics.getStatistics();
            // 允许一定误差
            expect(stats.uptime).toBeGreaterThanOrEqual(4900);
            expect(stats.uptime).toBeLessThan(6000);
        });

        it('should return current date as activationTime when not set', () => {
            const before = Date.now();
            const stats = statistics.getStatistics();
            const after = Date.now();
            expect(stats.activationTime.getTime()).toBeGreaterThanOrEqual(before);
            expect(stats.activationTime.getTime()).toBeLessThanOrEqual(after);
        });

        it('should return memory usage as a number', () => {
            const stats = statistics.getStatistics();
            expect(typeof stats.memoryUsage).toBe('number');
            expect(stats.memoryUsage).toBeGreaterThan(0);
        });
    });

    // ========================================
    // 缓存命中率
    // ========================================

    describe('cacheHitRate', () => {
        it('should return undefined when no cache statistics exist', () => {
            vi.mocked(mockPerformanceMonitor.getAllOperationStatistics).mockReturnValue({});
            const stats = statistics.getStatistics();
            expect(stats.cacheHitRate).toBeUndefined();
        });

        it('should calculate cache hit rate from performance monitor', () => {
            vi.mocked(mockPerformanceMonitor.getAllOperationStatistics).mockReturnValue({
                'schema.cache.lookup': { count: 100, totalTime: 50, minTime: 0, maxTime: 5, errors: 10 },
                'template.cache.get': { count: 50, totalTime: 25, minTime: 0, maxTime: 3, errors: 5 },
            });

            const stats = statistics.getStatistics();
            // hits = (100-10) + (50-5) = 135, total = 150
            expect(stats.cacheHitRate).toBe(135 / 150);
        });

        it('should return undefined when no cache operations found', () => {
            vi.mocked(mockPerformanceMonitor.getAllOperationStatistics).mockReturnValue({
                'template.parse': { count: 200, totalTime: 100, minTime: 0, maxTime: 10, errors: 50 },
            });

            const stats = statistics.getStatistics();
            // 没有 cache 相关操作，返回 undefined
            expect(stats.cacheHitRate).toBeUndefined();
        });

        it('should return undefined when getAllOperationStatistics throws', () => {
            vi.mocked(mockPerformanceMonitor.getAllOperationStatistics).mockImplementation(() => {
                throw new Error('Monitor error');
            });

            const stats = statistics.getStatistics();
            expect(stats.cacheHitRate).toBeUndefined();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Failed to get cache hit rate',
                expect.objectContaining({ error: 'Monitor error' })
            );
        });
    });
});
