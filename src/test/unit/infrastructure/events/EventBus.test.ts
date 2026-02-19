/**
 * EventBus 单元测试
 * 
 * 测试事件总线的所有功能，包括：
 * - 事件订阅和发布
 * - 精确匹配、通配符匹配、模式匹配
 * - 订阅取消
 * - 错误处理
 * - 资源清理
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from '../../../../infrastructure/events/EventBus';
import { ILogger } from '../../../../core/interfaces/ILogger';

describe('EventBus', () => {
    let eventBus: EventBus;
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
        eventBus = new EventBus(mockLogger);
    });

    describe('subscribe', () => {
        it('should subscribe to specific event type', () => {
            const handler = vi.fn();
            const subscription = eventBus.subscribe('test.event', handler);

            expect(subscription).toBeDefined();
            expect(subscription.isActive()).toBe(true);
        });

        it('should return active subscription', () => {
            const handler = vi.fn();
            const subscription = eventBus.subscribe('test.event', handler);

            expect(subscription.isActive()).toBe(true);
        });

        it('should increment subscription count', () => {
            eventBus.subscribe('test.event', () => {});
            eventBus.subscribe('test.event', () => {});

            expect(eventBus.getSubscriptionCount('test.event')).toBe(2);
        });
    });

    describe('publish', () => {
        it('should call handler when event is published', async () => {
            const handler = vi.fn();
            eventBus.subscribe('test.event', handler);

            await eventBus.publish('test.event', { data: 'test' });

            expect(handler).toHaveBeenCalledWith({ data: 'test' });
        });

        it('should call all handlers for same event type', async () => {
            const handler1 = vi.fn();
            const handler2 = vi.fn();
            const handler3 = vi.fn();

            eventBus.subscribe('test.event', handler1);
            eventBus.subscribe('test.event', handler2);
            eventBus.subscribe('test.event', handler3);

            await eventBus.publish('test.event', { data: 'test' });

            expect(handler1).toHaveBeenCalled();
            expect(handler2).toHaveBeenCalled();
            expect(handler3).toHaveBeenCalled();
        });

        it('should not call handlers for different event types', async () => {
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            eventBus.subscribe('event.a', handler1);
            eventBus.subscribe('event.b', handler2);

            await eventBus.publish('event.a', {});

            expect(handler1).toHaveBeenCalled();
            expect(handler2).not.toHaveBeenCalled();
        });

        it('should handle async handlers', async () => {
            const results: number[] = [];
            const asyncHandler = vi.fn(async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
                results.push(1);
            });

            eventBus.subscribe('async.event', asyncHandler);
            await eventBus.publish('async.event', {});

            expect(results).toEqual([1]);
        });

        it('should handle multiple async handlers in parallel', async () => {
            const order: number[] = [];
            
            eventBus.subscribe('parallel.event', async () => {
                await new Promise((resolve) => setTimeout(resolve, 30));
                order.push(1);
            });
            eventBus.subscribe('parallel.event', async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
                order.push(2);
            });

            await eventBus.publish('parallel.event', {});

            // 由于并行执行，短延迟的应该先完成
            expect(order).toEqual([2, 1]);
        });
    });

    describe('wildcard subscription', () => {
        it('should receive all events with wildcard subscription', async () => {
            const handler = vi.fn();
            eventBus.subscribe('*', handler);

            await eventBus.publish('event.a', { type: 'a' });
            await eventBus.publish('event.b', { type: 'b' });
            await eventBus.publish('something.else', { type: 'c' });

            expect(handler).toHaveBeenCalledTimes(3);
        });

        it('should return correct subscription count for wildcard', () => {
            eventBus.subscribe('*', () => {});
            eventBus.subscribe('*', () => {});

            expect(eventBus.getSubscriptionCount('*')).toBe(2);
        });
    });

    describe('pattern subscription', () => {
        it('should match events with pattern subscription', async () => {
            const handler = vi.fn();
            eventBus.subscribe('template.*', handler);

            await eventBus.publish('template.created', {});
            await eventBus.publish('template.updated', {});
            await eventBus.publish('template.deleted', {});

            expect(handler).toHaveBeenCalledTimes(3);
        });

        it('should not match events that do not fit pattern', async () => {
            const handler = vi.fn();
            eventBus.subscribe('template.*', handler);

            await eventBus.publish('other.event', {});
            await eventBus.publish('template', {}); // 没有点后面的部分

            expect(handler).not.toHaveBeenCalled();
        });

        it('should support multiple pattern subscriptions', async () => {
            const templateHandler = vi.fn();
            const userHandler = vi.fn();

            eventBus.subscribe('template.*', templateHandler);
            eventBus.subscribe('user.*', userHandler);

            await eventBus.publish('template.created', {});
            await eventBus.publish('user.login', {});

            expect(templateHandler).toHaveBeenCalledTimes(1);
            expect(userHandler).toHaveBeenCalledTimes(1);
        });
    });

    describe('unsubscribe', () => {
        it('should stop receiving events after unsubscribe', async () => {
            const handler = vi.fn();
            const subscription = eventBus.subscribe('test.event', handler);

            await eventBus.publish('test.event', { before: true });
            subscription.unsubscribe();
            await eventBus.publish('test.event', { after: true });

            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith({ before: true });
        });

        it('should mark subscription as inactive after unsubscribe', () => {
            const subscription = eventBus.subscribe('test.event', () => {});

            subscription.unsubscribe();

            expect(subscription.isActive()).toBe(false);
        });

        it('should be idempotent', () => {
            const subscription = eventBus.subscribe('test.event', () => {});

            subscription.unsubscribe();
            subscription.unsubscribe(); // 第二次调用

            expect(subscription.isActive()).toBe(false);
        });

        it('should decrement subscription count', () => {
            const sub1 = eventBus.subscribe('test.event', () => {});
            const sub2 = eventBus.subscribe('test.event', () => {});

            expect(eventBus.getSubscriptionCount('test.event')).toBe(2);

            sub1.unsubscribe();

            expect(eventBus.getSubscriptionCount('test.event')).toBe(1);

            sub2.unsubscribe();

            expect(eventBus.getSubscriptionCount('test.event')).toBe(0);
        });
    });

    describe('unsubscribeAll', () => {
        it('should remove all subscriptions for specific event type', async () => {
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            eventBus.subscribe('test.event', handler1);
            eventBus.subscribe('test.event', handler2);
            eventBus.unsubscribeAll('test.event');

            await eventBus.publish('test.event', {});

            expect(handler1).not.toHaveBeenCalled();
            expect(handler2).not.toHaveBeenCalled();
        });

        it('should not affect other event types', async () => {
            const handlerA = vi.fn();
            const handlerB = vi.fn();

            eventBus.subscribe('event.a', handlerA);
            eventBus.subscribe('event.b', handlerB);
            eventBus.unsubscribeAll('event.a');

            await eventBus.publish('event.a', {});
            await eventBus.publish('event.b', {});

            expect(handlerA).not.toHaveBeenCalled();
            expect(handlerB).toHaveBeenCalled();
        });

        it('should remove all wildcard subscriptions', async () => {
            const handler = vi.fn();

            eventBus.subscribe('*', handler);
            eventBus.unsubscribeAll('*');

            await eventBus.publish('any.event', {});

            expect(handler).not.toHaveBeenCalled();
        });

        it('should remove all subscriptions when called without argument', async () => {
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            eventBus.subscribe('event.a', handler1);
            eventBus.subscribe('event.b', handler2);
            eventBus.unsubscribeAll();

            await eventBus.publish('event.a', {});
            await eventBus.publish('event.b', {});

            expect(handler1).not.toHaveBeenCalled();
            expect(handler2).not.toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        it('should continue processing other handlers when one throws', async () => {
            const failingHandler = vi.fn(() => {
                throw new Error('Handler failed');
            });
            const successHandler = vi.fn();

            eventBus.subscribe('test.event', failingHandler);
            eventBus.subscribe('test.event', successHandler);

            await eventBus.publish('test.event', {});

            expect(failingHandler).toHaveBeenCalled();
            expect(successHandler).toHaveBeenCalled();
        });

        it('should log error when handler throws', async () => {
            const error = new Error('Handler failed');
            eventBus.subscribe('test.event', () => {
                throw error;
            });

            await eventBus.publish('test.event', {});

            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should not throw when handler throws async error', async () => {
            eventBus.subscribe('test.event', async () => {
                throw new Error('Async error');
            });

            await expect(eventBus.publish('test.event', {})).resolves.not.toThrow();
        });
    });

    describe('getSubscriptionCount', () => {
        it('should return 0 for event type with no subscriptions', () => {
            expect(eventBus.getSubscriptionCount('no.subscriptions')).toBe(0);
        });

        it('should return correct count for event type', () => {
            eventBus.subscribe('test.event', () => {});
            eventBus.subscribe('test.event', () => {});
            eventBus.subscribe('test.event', () => {});

            expect(eventBus.getSubscriptionCount('test.event')).toBe(3);
        });
    });

    describe('getStatistics', () => {
        it('should return empty object when no subscriptions', () => {
            expect(eventBus.getStatistics()).toEqual({});
        });

        it('should return subscription counts per event type', () => {
            eventBus.subscribe('event.a', () => {});
            eventBus.subscribe('event.a', () => {});
            eventBus.subscribe('event.b', () => {});
            eventBus.subscribe('*', () => {});

            const stats = eventBus.getStatistics();

            expect(stats['event.a']).toBe(2);
            expect(stats['event.b']).toBe(1);
            expect(stats['*']).toBe(1);
        });
    });

    describe('dispose', () => {
        it('should remove all subscriptions', async () => {
            const handler = vi.fn();
            eventBus.subscribe('test.event', handler);

            eventBus.dispose();

            // 发布事件应该抛出错误，因为已经 disposed
            await expect(eventBus.publish('test.event', {})).rejects.toThrow();
        });

        it('should throw on operations after dispose', () => {
            eventBus.dispose();

            expect(() => eventBus.subscribe('test', () => {})).toThrow();
            expect(() => eventBus.getSubscriptionCount('test')).toThrow();
        });

        it('should be idempotent', () => {
            eventBus.dispose();
            expect(() => eventBus.dispose()).not.toThrow();
        });
    });

    describe('type safety', () => {
        interface TestEvent {
            id: string;
            data: { value: number };
        }

        it('should preserve event data type', async () => {
            const handler = vi.fn();
            eventBus.subscribe<TestEvent>('typed.event', handler);

            const event: TestEvent = { id: '123', data: { value: 42 } };
            await eventBus.publish('typed.event', event);

            expect(handler).toHaveBeenCalledWith(event);
        });
    });

    describe('edge cases', () => {
        it('should handle empty event type', async () => {
            const handler = vi.fn();
            eventBus.subscribe('', handler);

            await eventBus.publish('', { data: 'empty' });

            expect(handler).toHaveBeenCalledWith({ data: 'empty' });
        });

        it('should handle null event data', async () => {
            const handler = vi.fn();
            eventBus.subscribe('null.event', handler);

            await eventBus.publish('null.event', null);

            expect(handler).toHaveBeenCalledWith(null);
        });

        it('should handle undefined event data', async () => {
            const handler = vi.fn();
            eventBus.subscribe('undefined.event', handler);

            await eventBus.publish('undefined.event', undefined);

            expect(handler).toHaveBeenCalledWith(undefined);
        });

        it('should handle many subscriptions', async () => {
            const handlers: ReturnType<typeof vi.fn>[] = [];
            
            for (let i = 0; i < 100; i++) {
                const handler = vi.fn();
                handlers.push(handler);
                eventBus.subscribe('mass.event', handler);
            }

            await eventBus.publish('mass.event', { id: 1 });

            handlers.forEach((handler) => {
                expect(handler).toHaveBeenCalledTimes(1);
            });
        });
    });

    describe('without logger', () => {
        it('should work without logger', async () => {
            const busWithoutLogger = new EventBus();
            const handler = vi.fn();

            busWithoutLogger.subscribe('test', handler);
            await busWithoutLogger.publish('test', { data: 'test' });

            expect(handler).toHaveBeenCalled();
        });

        it('should handle errors without logger', async () => {
            const busWithoutLogger = new EventBus();
            
            busWithoutLogger.subscribe('test', () => {
                throw new Error('No logger to catch this');
            });

            // 不应该抛出异常
            await expect(busWithoutLogger.publish('test', {})).resolves.not.toThrow();
        });
    });
});

