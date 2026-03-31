/**
 * 事件总线性能测试
 *
 * 测试 EventBus 相关的同步操作性能
 */
import { describe, bench } from 'vitest';
import { EventBus } from '../../infrastructure/events/EventBus';
import { type ILogger } from '../../core/interfaces/ILogger';
import { type IEventSubscription } from '../../core/interfaces/IEventBus';
import { defaultBenchOptions, fastBenchOptions } from './bench-options';

// ========================================
// Mock Logger（静默）
// ========================================

function createMockLogger(): ILogger {
    const noop = () => {};
    return {
        debug: noop,
        info: noop,
        warn: noop,
        error: noop,
        fatal: noop,
        createChild: () => createMockLogger(),
        setLevel: noop,
        getLevel: () => 0,
    } as unknown as ILogger;
}

const mockLogger = createMockLogger();

describe('EventBus Performance', () => {
    // ========================================
    // 订阅操作测试
    // ========================================

    describe('Subscription Operations', () => {
        bench(
            'subscribe single handler',
            () => {
                const eventBus = new EventBus(mockLogger);
                const sub = eventBus.subscribe('test.event', () => {});
                sub.unsubscribe();
                eventBus.dispose();
            },
            defaultBenchOptions,
        );

        bench(
            'subscribe 10 handlers to same event',
            () => {
                const eventBus = new EventBus(mockLogger);
                const subs: IEventSubscription[] = [];
                for (let i = 0; i < 10; i++) {
                    subs.push(eventBus.subscribe('test.event', () => {}));
                }
                subs.forEach((s) => s.unsubscribe());
                eventBus.dispose();
            },
            defaultBenchOptions,
        );

        bench(
            'subscribe 100 handlers to different events',
            () => {
                const eventBus = new EventBus(mockLogger);
                const subs: IEventSubscription[] = [];
                for (let i = 0; i < 100; i++) {
                    subs.push(eventBus.subscribe(`test.event.${i}`, () => {}));
                }
                subs.forEach((s) => s.unsubscribe());
                eventBus.dispose();
            },
            fastBenchOptions,
        );

        bench(
            'subscribe with wildcard pattern',
            () => {
                const eventBus = new EventBus(mockLogger);
                const sub = eventBus.subscribe('test.*', () => {});
                sub.unsubscribe();
                eventBus.dispose();
            },
            defaultBenchOptions,
        );

        bench(
            'unsubscribe operation',
            () => {
                const eventBus = new EventBus(mockLogger);
                const sub = eventBus.subscribe('test.event', () => {});
                sub.unsubscribe();
                eventBus.dispose();
            },
            defaultBenchOptions,
        );
    });

    // ========================================
    // 订阅状态查询测试
    // ========================================

    describe('Subscription Query', () => {
        bench(
            'getSubscriptionCount',
            () => {
                const eventBus = new EventBus(mockLogger);
                for (let i = 0; i < 50; i++) {
                    eventBus.subscribe(`test.event.${i}`, () => {});
                }
                eventBus.getSubscriptionCount('test.event.0');
                eventBus.dispose();
            },
            defaultBenchOptions,
        );

        bench(
            'getSubscriptionCount (non-existent)',
            () => {
                const eventBus = new EventBus(mockLogger);
                eventBus.getSubscriptionCount('non.existent.event');
                eventBus.dispose();
            },
            defaultBenchOptions,
        );

        bench(
            'check subscription isActive',
            () => {
                const eventBus = new EventBus(mockLogger);
                const sub = eventBus.subscribe('test.event', () => {});
                sub.isActive();
                eventBus.dispose();
            },
            defaultBenchOptions,
        );
    });

    // ========================================
    // 批量订阅/取消订阅测试
    // ========================================

    describe('Batch Subscription Operations', () => {
        bench(
            'subscribe and unsubscribe 50 handlers',
            () => {
                const eventBus = new EventBus(mockLogger);
                const subs: IEventSubscription[] = [];
                for (let i = 0; i < 50; i++) {
                    subs.push(eventBus.subscribe(`batch.event.${i}`, () => {}));
                }
                subs.forEach((s) => s.unsubscribe());
                eventBus.dispose();
            },
            fastBenchOptions,
        );

        bench(
            'unsubscribeAll for event type',
            () => {
                const eventBus = new EventBus(mockLogger);
                for (let i = 0; i < 10; i++) {
                    eventBus.subscribe('cleanup.test', () => {});
                }
                eventBus.unsubscribeAll('cleanup.test');
                eventBus.dispose();
            },
            defaultBenchOptions,
        );
    });

    // ========================================
    // 事件类型模式匹配模拟测试
    // ========================================

    describe('Event Pattern Matching (Simulated)', () => {
        function matchesWildcard(pattern: string, eventType: string): boolean {
            if (pattern === '*') {
                return true;
            }
            if (pattern.endsWith('.*')) {
                const prefix = pattern.slice(0, -2);
                return eventType.startsWith(prefix + '.');
            }
            return pattern === eventType;
        }

        function matchesRegex(pattern: RegExp, eventType: string): boolean {
            return pattern.test(eventType);
        }

        const eventTypes = [
            'template.created',
            'template.updated',
            'template.deleted',
            'translation.added',
            'translation.removed',
            'cache.invalidated',
            'config.changed',
            'file.changed',
            'file.deleted',
            'system.ready',
        ];

        bench(
            'exact match (10 event types)',
            () => {
                const target = 'template.created';
                for (const eventType of eventTypes) {
                    void (eventType === target);
                }
            },
            defaultBenchOptions,
        );

        bench(
            'wildcard match (10 event types)',
            () => {
                const pattern = 'template.*';
                for (const eventType of eventTypes) {
                    matchesWildcard(pattern, eventType);
                }
            },
            defaultBenchOptions,
        );

        bench(
            'regex match (10 event types)',
            () => {
                const pattern = /^template\./;
                for (const eventType of eventTypes) {
                    matchesRegex(pattern, eventType);
                }
            },
            defaultBenchOptions,
        );

        bench(
            'multiple pattern check (5 patterns x 10 events)',
            () => {
                const patterns = ['template.*', 'translation.*', 'cache.*', 'config.*', 'file.*'];
                for (const pattern of patterns) {
                    for (const eventType of eventTypes) {
                        matchesWildcard(pattern, eventType);
                    }
                }
            },
            defaultBenchOptions,
        );
    });

    // ========================================
    // 内存效率测试
    // ========================================

    describe('Memory Efficiency', () => {
        bench(
            'create and dispose event bus',
            () => {
                const bus = new EventBus(mockLogger);
                bus.dispose();
            },
            defaultBenchOptions,
        );

        bench(
            'create event bus with 100 subscriptions then dispose',
            () => {
                const bus = new EventBus(mockLogger);
                for (let i = 0; i < 100; i++) {
                    bus.subscribe(`event.${i}`, () => {});
                }
                bus.dispose();
            },
            fastBenchOptions,
        );
    });

    // ========================================
    // CraftEngine 使用模式测试
    // ========================================

    describe('CraftEngine Usage Patterns', () => {
        bench(
            'typical subscription setup',
            () => {
                const bus = new EventBus(mockLogger);
                bus.subscribe('template.created', () => {});
                bus.subscribe('template.updated', () => {});
                bus.subscribe('template.deleted', () => {});
                bus.subscribe('translation.added', () => {});
                bus.subscribe('translation.removed', () => {});
                bus.subscribe('cache.invalidated', () => {});
                bus.subscribe('config.changed', () => {});
                bus.subscribe('file.*', () => {});
                bus.dispose();
            },
            defaultBenchOptions,
        );

        bench(
            'rapid subscribe/unsubscribe cycle',
            () => {
                const eventBus = new EventBus(mockLogger);
                const sub = eventBus.subscribe('rapid.event', () => {});
                sub.unsubscribe();
                eventBus.dispose();
            },
            defaultBenchOptions,
        );
    });
});
