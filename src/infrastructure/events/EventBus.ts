import { type IEventBus, type IEventSubscription, type EventHandler } from '../../core/interfaces/IEventBus';
import { type ILogger } from '../../core/interfaces/ILogger';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 事件模式 Trie 树节点
 *
 * 用于高效匹配事件模式订阅，将 O(n) 的线性搜索优化为 O(m) 的树遍历
 * 其中 n 是模式数量，m 是事件类型的段数
 */
interface IPatternTrieNode {
    /** 子节点：segment -> node */
    children: Map<string, IPatternTrieNode>;
    /** 通配符子节点（*） */
    wildcardChild: IPatternTrieNode | null;
    /** 此节点的订阅集合 */
    subscriptions: Set<EventSubscription>;
}

/**
 * 事件订阅实现
 *
 * 表示一个事件订阅，提供订阅管理和状态查询功能。
 *
 * @remarks
 * 每个订阅都有一个唯一的处理器和取消订阅的回调。
 * 订阅被取消后，不会再接收事件通知。
 */
class EventSubscription implements IEventSubscription {
    /** 订阅是否仍然活跃 */
    private active = true;

    /**
     * 构造事件订阅实例
     *
     * @param eventType - 订阅的事件类型
     * @param handler - 事件处理器函数
     * @param unsubscribeCallback - 取消订阅时的回调函数
     */
    constructor(
        private readonly eventType: string,
        private readonly handler: EventHandler,
        private readonly unsubscribeCallback: () => void,
    ) {}

    /**
     * 取消订阅
     *
     * 停止接收事件通知，并从事件总线中移除此订阅。
     */
    unsubscribe(): void {
        if (this.active) {
            this.unsubscribeCallback();
            this.active = false;
        }
    }

    /**
     * 检查订阅是否仍然活跃
     *
     * @returns 如果订阅活跃返回 true
     */
    isActive(): boolean {
        return this.active;
    }

    /**
     * 获取订阅的事件类型
     *
     * @returns 事件类型字符串
     */
    getEventType(): string {
        return this.eventType;
    }

    /**
     * 获取事件处理器
     *
     * @returns 处理器函数
     */
    getHandler(): EventHandler {
        return this.handler;
    }
}

/**
 * 事件总线实现
 *
 * 基于发布-订阅模式的事件总线，提供解耦的模块间通信机制。
 * 支持精确匹配、通配符和模式匹配三种订阅方式。
 *
 * @remarks
 * **三种订阅模式**：
 *
 * 1. **精确匹配**
 *    - 订阅特定的事件类型
 *    - 例：`eventBus.subscribe('template.created', handler)`
 *    - 只接收完全匹配的事件
 *
 * 2. **通配符匹配**
 *    - 订阅所有事件
 *    - 例：`eventBus.subscribe('*', handler)`
 *    - 接收所有发布的事件
 *
 * 3. **模式匹配**
 *    - 使用点号分隔的模式
 *    - 例：`eventBus.subscribe('template.*', handler)`
 *    - 匹配 `template.created`、`template.updated` 等
 *
 * **事件处理**：
 * - 异步事件处理，不阻塞发布者
 * - 错误隔离：一个处理器出错不影响其他处理器
 * - 并行执行：所有处理器并行调用
 * - 取消支持：支持中途取消订阅
 *
 * **使用场景**：
 * - 模块解耦：模块间通过事件通信
 * - 状态变更通知：领域事件发布
 * - 审计日志：订阅所有事件记录日志
 * - 缓存失效：监听数据变更事件
 *
 * **性能特点**：
 * - O(1) 精确匹配订阅查找
 * - O(n) 模式匹配（n 为模式数量）
 * - 异步并行处理，吞吐量高
 * - 支持订阅计数和统计
 *
 * @example
 * ```typescript
 * const eventBus = new EventBus(logger);
 *
 * // 精确订阅
 * const sub1 = eventBus.subscribe('template.created', (event) => {
 *     console.log('Template created:', event.template.name);
 * });
 *
 * // 模式订阅
 * const sub2 = eventBus.subscribe('template.*', (event) => {
 *     console.log('Template event:', event.type);
 * });
 *
 * // 通配符订阅（接收所有事件）
 * const sub3 = eventBus.subscribe('*', (event) => {
 *     console.log('Any event:', event);
 * });
 *
 * // 发布事件
 * await eventBus.publish('template.created', {
 *     id: '123',
 *     type: 'template.created',
 *     timestamp: new Date(),
 *     template: myTemplate
 * });
 *
 * // 取消订阅
 * sub1.unsubscribe();
 *
 * // 获取统计
 * const count = eventBus.getSubscriptionCount('template.created');
 * console.log(`${count} subscribers`);
 *
 * // 清理
 * eventBus.dispose();
 * ```
 */
export class EventBus implements IEventBus {
    /** 精确匹配的订阅：事件类型 -> 订阅集合 */
    private readonly subscriptions = new Map<string, Set<EventSubscription>>();
    /** 通配符订阅（*） */
    private readonly wildcardSubscriptions = new Set<EventSubscription>();
    /** 模式订阅：模式 -> 订阅集合（用于 unsubscribe 时快速查找） */
    private readonly patternSubscriptions = new Map<string, Set<EventSubscription>>();

    /** 模式 Trie 树根节点（用于高效匹配） */
    private readonly patternTrie: IPatternTrieNode = {
        children: new Map(),
        wildcardChild: null,
        subscriptions: new Set(),
    };

    /** 事件总线是否已释放 */
    private disposed = false;

    /**
     * 构造事件总线实例
     *
     * @param logger - 日志记录器（可选），用于记录事件发布和错误
     */
    constructor(private readonly logger?: ILogger) {}

    /**
     * 发布事件
     *
     * 将事件发送给所有匹配的订阅者。处理器并行异步执行。
     *
     * @param eventType - 事件类型标识符
     * @param event - 事件数据
     * @returns Promise，表示所有处理器执行完成
     *
     * @remarks
     * 发布流程：
     * 1. 检查事件总线是否已释放
     * 2. 查找所有匹配的订阅（精确 + 模式 + 通配符）
     * 3. 并行调用所有处理器
     * 4. 使用 Promise.allSettled 避免单个处理器错误影响整体
     * 5. 记录错误但不抛出异常
     *
     * 匹配规则：
     * - 精确匹配：`template.created` 匹配 `template.created`
     * - 模式匹配：`template.*` 匹配 `template.created`、`template.updated`
     * - 通配符：`*` 匹配所有事件
     *
     * @example
     * ```typescript
     * // 发布领域事件
     * await eventBus.publish('template.created', {
     *     id: generateId(),
     *     type: 'template.created',
     *     timestamp: new Date(),
     *     template: newTemplate
     * });
     *
     * // 发布系统事件
     * await eventBus.publish('system.startup', {
     *     id: generateId(),
     *     type: 'system.startup',
     *     timestamp: new Date(),
     *     version: '1.0.0'
     * });
     * ```
     */
    async publish<T = unknown>(eventType: string, event: T): Promise<void> {
        this.ensureNotDisposed();

        this.logger?.debug('Publishing event', {
            eventType,
            hasData: !!event,
        });

        const promises: Promise<void>[] = [];

        // 处理特定事件订阅
        const eventSubscriptions = this.subscriptions.get(eventType);
        if (eventSubscriptions) {
            for (const subscription of eventSubscriptions) {
                if (subscription.isActive()) {
                    promises.push(this.executeHandler(subscription.getHandler(), event, eventType));
                }
            }
        }

        // 处理通配符订阅
        for (const subscription of this.wildcardSubscriptions) {
            if (subscription.isActive()) {
                promises.push(this.executeHandler(subscription.getHandler(), event, eventType));
            }
        }

        // 使用 Trie 树高效查找匹配的模式订阅（O(m) 其中 m 是事件类型的段数）
        const matchingSubscriptions = this.findMatchingPatternSubscriptions(eventType);
        for (const subscription of matchingSubscriptions) {
            promises.push(this.executeHandler(subscription.getHandler(), event, eventType));
        }

        // 等待所有处理器完成
        await Promise.allSettled(promises);

        this.logger?.debug('Event published', {
            eventType,
            handlerCount: promises.length,
        });
    }

    subscribe<T = unknown>(eventType: string, handler: EventHandler<T>): IEventSubscription {
        this.ensureNotDisposed();

        const subscription = new EventSubscription(eventType, handler as EventHandler, () =>
            this.removeSubscription(eventType, subscription),
        );

        if (eventType === '*') {
            // 通配符订阅（匹配所有事件）
            this.wildcardSubscriptions.add(subscription);
        } else if (eventType.includes('*')) {
            // 模式订阅（例如 'template.*'）
            if (!this.patternSubscriptions.has(eventType)) {
                this.patternSubscriptions.set(eventType, new Set());
            }
            const patternSet = this.patternSubscriptions.get(eventType);
            if (patternSet) {
                patternSet.add(subscription);
            }

            // 同时添加到 Trie 树
            this.addPatternToTrie(eventType, subscription);
        } else {
            // 特定事件订阅
            if (!this.subscriptions.has(eventType)) {
                this.subscriptions.set(eventType, new Set());
            }
            const subSet = this.subscriptions.get(eventType);
            if (subSet) {
                subSet.add(subscription);
            }
        }

        this.logger?.debug('Event subscription added', {
            eventType,
            totalSubscriptions: this.getSubscriptionCount(eventType),
        });

        return subscription;
    }

    unsubscribeAll(eventType?: string): void {
        this.ensureNotDisposed();

        if (eventType) {
            if (eventType === '*') {
                // 清除所有通配符订阅
                this.wildcardSubscriptions.clear();
            } else if (eventType.includes('*')) {
                // 清除特定模式的订阅
                const patternSubs = this.patternSubscriptions.get(eventType);
                if (patternSubs) {
                    // 从 Trie 树中移除
                    for (const sub of patternSubs) {
                        this.removePatternFromTrie(eventType, sub);
                    }
                    patternSubs.clear();
                    this.patternSubscriptions.delete(eventType);
                }
            } else {
                // 清除特定事件的所有订阅
                const subscriptions = this.subscriptions.get(eventType);
                if (subscriptions) {
                    subscriptions.clear();
                    this.subscriptions.delete(eventType);
                }
            }

            this.logger?.debug('Unsubscribed all handlers for event type', { eventType });
        } else {
            // 清除所有订阅
            this.subscriptions.clear();
            this.wildcardSubscriptions.clear();
            this.patternSubscriptions.clear();
            // 重置 Trie 树
            this.patternTrie.children.clear();
            this.patternTrie.wildcardChild = null;
            this.patternTrie.subscriptions.clear();

            this.logger?.debug('Unsubscribed all handlers for all events');
        }
    }

    getSubscriptionCount(eventType: string): number {
        this.ensureNotDisposed();

        if (eventType === '*') {
            return this.wildcardSubscriptions.size;
        }

        const subscriptions = this.subscriptions.get(eventType);
        return subscriptions ? subscriptions.size : 0;
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }

        // 注意：在停用时不要使用 logger，因为 VSCode 的输出通道可能已经关闭

        // 清除所有订阅
        this.unsubscribeAll();

        this.disposed = true;
    }

    /**
     * 获取所有事件类型的统计信息
     */
    getStatistics(): Record<string, number> {
        const stats: Record<string, number> = {};

        for (const [eventType, subscriptions] of this.subscriptions) {
            stats[eventType] = subscriptions.size;
        }

        if (this.wildcardSubscriptions.size > 0) {
            stats['*'] = this.wildcardSubscriptions.size;
        }

        return stats;
    }

    /**
     * 执行事件处理器
     */
    private async executeHandler(handler: EventHandler, event: unknown, eventType: string): Promise<void> {
        try {
            const result = handler(event);

            // 如果处理器返回 Promise，等待它完成
            if (result && typeof result.then === 'function') {
                await result;
            }
        } catch (error) {
            this.logger?.error('Error in event handler', error instanceof Error ? error : new Error(String(error)), {
                eventType,
                error: error instanceof Error ? error.message : String(error),
            });

            // 继续处理其他处理器，不让一个处理器的错误影响其他处理器
        }
    }

    /**
     * 移除订阅
     */
    private removeSubscription(eventType: string, subscription: EventSubscription): void {
        if (eventType === '*') {
            this.wildcardSubscriptions.delete(subscription);
        } else if (eventType.includes('*')) {
            // 模式订阅
            const patternSubs = this.patternSubscriptions.get(eventType);
            if (patternSubs) {
                patternSubs.delete(subscription);

                // 从 Trie 树中移除
                this.removePatternFromTrie(eventType, subscription);

                if (patternSubs.size === 0) {
                    this.patternSubscriptions.delete(eventType);
                }
            }
        } else {
            const subscriptions = this.subscriptions.get(eventType);
            if (subscriptions) {
                subscriptions.delete(subscription);

                // 如果没有更多订阅，清除事件类型
                if (subscriptions.size === 0) {
                    this.subscriptions.delete(eventType);
                }
            }
        }

        this.logger?.debug('Event subscription removed', {
            eventType,
            remainingSubscriptions: this.getSubscriptionCount(eventType),
        });
    }

    // ========================================================================
    // Trie 树操作方法
    // ========================================================================

    /**
     * 添加模式订阅到 Trie 树
     */
    private addPatternToTrie(pattern: string, subscription: EventSubscription): void {
        const segments = pattern.split('.');
        let node = this.patternTrie;

        for (const segment of segments) {
            if (segment === '*') {
                if (!node.wildcardChild) {
                    node.wildcardChild = {
                        children: new Map(),
                        wildcardChild: null,
                        subscriptions: new Set(),
                    };
                }
                node = node.wildcardChild;
            } else {
                if (!node.children.has(segment)) {
                    node.children.set(segment, {
                        children: new Map(),
                        wildcardChild: null,
                        subscriptions: new Set(),
                    });
                }
                const nextNode = node.children.get(segment);
                if (!nextNode) {
                    return;
                }
                node = nextNode;
            }
        }

        node.subscriptions.add(subscription);
    }

    /**
     * 从 Trie 树中移除模式订阅
     */
    private removePatternFromTrie(pattern: string, subscription: EventSubscription): void {
        const segments = pattern.split('.');
        let node = this.patternTrie;

        for (const segment of segments) {
            if (segment === '*') {
                if (!node.wildcardChild) {
                    return; // 路径不存在
                }
                node = node.wildcardChild;
            } else {
                const nextNode = node.children.get(segment);
                if (!nextNode) {
                    return; // 路径不存在
                }
                node = nextNode;
            }
        }

        node.subscriptions.delete(subscription);
    }

    /**
     * 查找匹配的模式订阅（使用 Trie 树，O(m) 复杂度）
     *
     * @param eventType 事件类型
     * @returns 匹配的活跃订阅列表
     */
    private findMatchingPatternSubscriptions(eventType: string): EventSubscription[] {
        const segments = eventType.split('.');
        const results: EventSubscription[] = [];

        this.traverseTrie(this.patternTrie, segments, 0, results);

        return results;
    }

    /**
     * 遍历 Trie 树查找匹配的订阅
     */
    private traverseTrie(node: IPatternTrieNode, segments: string[], index: number, results: EventSubscription[]): void {
        if (index === segments.length) {
            // 收集此节点的活跃订阅
            for (const sub of node.subscriptions) {
                if (sub.isActive()) {
                    results.push(sub);
                }
            }
            return;
        }

        const segment = segments[index];

        // 精确匹配
        const exactChild = node.children.get(segment);
        if (exactChild) {
            this.traverseTrie(exactChild, segments, index + 1, results);
        }

        // 通配符匹配
        if (node.wildcardChild) {
            this.traverseTrie(node.wildcardChild, segments, index + 1, results);
        }
    }

    /**
     * 确保未被释放
     */
    private ensureNotDisposed(): void {
        if (this.disposed) {
            throw new Error('EventBus has been disposed');
        }
    }
}
