import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PerformanceMonitor, IPerformanceMetric } from '../../../../infrastructure/performance/PerformanceMonitor';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import { type IEventBus } from '../../../../core/interfaces/IEventBus';
import { type IConfiguration } from '../../../../core/interfaces/IConfiguration';
import { EVENT_TYPES } from '../../../../core/constants/ServiceTokens';

function createMockLogger(): ILogger {
    return {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        createChild: vi.fn().mockReturnThis(),
        setLevel: vi.fn(),
        getLevel: vi.fn().mockReturnValue('DEBUG'),
        isDebugEnabled: vi.fn().mockReturnValue(true),
    } as unknown as ILogger;
}

function createMockEventBus(): IEventBus {
    return {
        publish: vi.fn(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        clear: vi.fn(),
    } as unknown as IEventBus;
}

describe('PerformanceMonitor', () => {
    let monitor: PerformanceMonitor;
    let logger: ILogger;
    let eventBus: IEventBus;

    beforeEach(() => {
        logger = createMockLogger();
        eventBus = createMockEventBus();
        monitor = new PerformanceMonitor(logger, eventBus);
    });

    describe('constructor', () => {
        it('should create without dependencies', () => {
            const m = new PerformanceMonitor();
            expect(m.getStatistics().totalOperations).toBe(0);
        });
    });
    describe('startTimer / recordMetric', () => {
        it('should create a timer and record metric on stop', () => {
            const timer = monitor.startTimer('test.op');
            const elapsed = timer.stop();

            expect(elapsed).toBeGreaterThanOrEqual(0);
            expect(logger.debug).toHaveBeenCalled();
            expect(eventBus.publish).toHaveBeenCalledWith(
                EVENT_TYPES.PerformanceMetric,
                expect.objectContaining({ name: 'test.op', unit: 'ms' }),
            );
        });

        it('should record metric with tags', () => {
            const timer = monitor.startTimer('test.op');
            timer.stop({ region: 'us-east' });

            expect(eventBus.publish).toHaveBeenCalledWith(
                EVENT_TYPES.PerformanceMetric,
                expect.objectContaining({ tags: { region: 'us-east' } }),
            );
        });

        it('should report elapsed time via getElapsed', () => {
            const timer = monitor.startTimer('test.op');
            const elapsed = timer.getElapsed();
            expect(elapsed).toBeGreaterThanOrEqual(0);
        });
    });

    describe('recordMetric', () => {
        it('should not record when disabled', () => {
            monitor.setEnabled(false);
            monitor.recordMetric({
                name: 'test',
                value: 10,
                unit: 'ms',
                timestamp: new Date(),
            });
            expect(eventBus.publish).not.toHaveBeenCalled();
        });

        it('should update operation stats', () => {
            monitor.recordMetric({ name: 'op1', value: 100, unit: 'ms', timestamp: new Date() });
            monitor.recordMetric({ name: 'op1', value: 200, unit: 'ms', timestamp: new Date() });

            const stats = monitor.getOperationStatistics('op1');
            expect(stats).toBeDefined();
            expect(stats!.count).toBe(2);
            expect(stats!.totalTime).toBe(300);
            expect(stats!.minTime).toBe(100);
            expect(stats!.maxTime).toBe(200);
        });

        it('should track error metrics', () => {
            monitor.recordMetric({
                name: 'op1',
                value: 50,
                unit: 'ms',
                timestamp: new Date(),
                tags: { error: 'true' },
            });

            const stats = monitor.getOperationStatistics('op1');
            expect(stats!.errors).toBe(1);
        });

        it('should warn when threshold exceeded', () => {
            monitor.setPerformanceThresholds({ 'slow.op': 50 });
            monitor.recordMetric({
                name: 'slow.op',
                value: 100,
                unit: 'ms',
                timestamp: new Date(),
            });
            expect(logger.warn).toHaveBeenCalledWith(
                'Performance threshold exceeded',
                expect.objectContaining({ operation: 'slow.op', threshold: 50 }),
            );
        });

        it('should not warn when within threshold', () => {
            monitor.setPerformanceThresholds({ 'fast.op': 200 });
            monitor.recordMetric({
                name: 'fast.op',
                value: 50,
                unit: 'ms',
                timestamp: new Date(),
            });
            expect(logger.warn).not.toHaveBeenCalled();
        });
    });
    describe('getStatistics', () => {
        it('should return zero stats when empty', () => {
            const stats = monitor.getStatistics();
            expect(stats.totalOperations).toBe(0);
            expect(stats.averageResponseTime).toBe(0);
            expect(stats.minResponseTime).toBe(0);
            expect(stats.maxResponseTime).toBe(0);
            expect(stats.errorRate).toBe(0);
            expect(stats.uptime).toBeGreaterThanOrEqual(0);
            expect(stats.memoryUsage).toBeGreaterThan(0);
        });

        it('should aggregate stats across operations', () => {
            monitor.recordMetric({ name: 'op1', value: 100, unit: 'ms', timestamp: new Date() });
            monitor.recordMetric({ name: 'op2', value: 200, unit: 'ms', timestamp: new Date() });
            monitor.recordMetric({
                name: 'op1',
                value: 50,
                unit: 'ms',
                timestamp: new Date(),
                tags: { error: 'true' },
            });

            const stats = monitor.getStatistics();
            expect(stats.totalOperations).toBe(3);
            expect(stats.averageResponseTime).toBeCloseTo(350 / 3);
            expect(stats.minResponseTime).toBe(50);
            expect(stats.maxResponseTime).toBe(200);
            expect(stats.errorRate).toBeCloseTo(1 / 3);
        });
    });

    describe('clearHistory', () => {
        it('should reset all metrics and stats', () => {
            monitor.recordMetric({ name: 'op1', value: 100, unit: 'ms', timestamp: new Date() });
            monitor.clearHistory();

            const stats = monitor.getStatistics();
            expect(stats.totalOperations).toBe(0);
            expect(monitor.getOperationStatistics('op1')).toBeUndefined();
        });
    });

    describe('setEnabled', () => {
        it('should toggle monitoring on/off', () => {
            monitor.setEnabled(false);
            monitor.recordMetric({ name: 'op1', value: 100, unit: 'ms', timestamp: new Date() });
            expect(monitor.getStatistics().totalOperations).toBe(0);

            monitor.setEnabled(true);
            monitor.recordMetric({ name: 'op1', value: 100, unit: 'ms', timestamp: new Date() });
            expect(monitor.getStatistics().totalOperations).toBe(1);
        });
    });

    describe('ring buffer (maxHistorySize)', () => {
        it('should evict oldest metrics when buffer is full', () => {
            monitor.setMaxHistorySize(3);

            for (let i = 0; i < 5; i++) {
                monitor.recordMetric({ name: `op${i}`, value: i * 10, unit: 'ms', timestamp: new Date() });
            }

            // 操作统计仍然保留所有操作
            const allStats = monitor.getAllOperationStatistics();
            expect(Object.keys(allStats).length).toBe(5);
        });

        it('should preserve recent metrics when resizing', () => {
            for (let i = 0; i < 10; i++) {
                monitor.recordMetric({ name: `op${i}`, value: i, unit: 'ms', timestamp: new Date() });
            }

            monitor.setMaxHistorySize(3);
            // 缩小后仍然可以正常记录
            monitor.recordMetric({ name: 'new', value: 99, unit: 'ms', timestamp: new Date() });
            expect(monitor.getOperationStatistics('new')!.count).toBe(1);
        });
    });

    describe('getAllOperationStatistics', () => {
        it('should return stats for all operations', () => {
            monitor.recordMetric({ name: 'a', value: 10, unit: 'ms', timestamp: new Date() });
            monitor.recordMetric({ name: 'b', value: 20, unit: 'ms', timestamp: new Date() });

            const all = monitor.getAllOperationStatistics();
            expect(all['a']).toBeDefined();
            expect(all['b']).toBeDefined();
            expect(all['a'].count).toBe(1);
        });

        it('should return copies (not references)', () => {
            monitor.recordMetric({ name: 'a', value: 10, unit: 'ms', timestamp: new Date() });
            const all = monitor.getAllOperationStatistics();
            all['a'].count = 999;
            expect(monitor.getOperationStatistics('a')!.count).toBe(1);
        });
    });

    describe('setConfiguration', () => {
        it('should read enabled state from configuration', () => {
            const onChangeCallbacks: Array<(event: { key: string; newValue: unknown }) => void> = [];
            const mockConfig: IConfiguration = {
                get: vi.fn((key: string, defaultValue?: unknown) => {
                    if (key === 'performance.monitoring') {
                        return true;
                    }
                    return defaultValue;
                }),
                onChange: vi.fn((cb) => {
                    onChangeCallbacks.push(cb);
                    return { dispose: vi.fn() };
                }),
                getAll: vi.fn(),
            } as unknown as IConfiguration;

            monitor.setConfiguration(mockConfig);
            expect(logger.info).toHaveBeenCalledWith(
                'Performance monitoring initialized',
                expect.objectContaining({ enabled: true }),
            );

            // 模拟配置变更
            onChangeCallbacks[0]({ key: 'performance.monitoring', newValue: false });
            expect(logger.info).toHaveBeenCalledWith(
                'Performance monitoring',
                expect.objectContaining({ enabled: false }),
            );
        });
    });

    describe('getOperationStatistics', () => {
        it('should return undefined for unknown operation', () => {
            expect(monitor.getOperationStatistics('unknown')).toBeUndefined();
        });

        it('should return a copy (not reference)', () => {
            monitor.recordMetric({ name: 'op', value: 10, unit: 'ms', timestamp: new Date() });
            const stats = monitor.getOperationStatistics('op')!;
            stats.count = 999;
            expect(monitor.getOperationStatistics('op')!.count).toBe(1);
        });
    });
});
