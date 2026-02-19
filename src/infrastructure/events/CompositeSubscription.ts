import { IEventSubscription } from '../../core/interfaces/IEventBus';

/**
 * 组合订阅管理器
 *
 * 批量管理多个事件订阅的生命周期，支持一次性取消所有订阅。
 * 适用于需要在 dispose 时统一清理多个订阅的场景。
 *
 * @example
 * ```typescript
 * const composite = new CompositeSubscription();
 * composite.add(eventBus.subscribe('template.*', handler1));
 * composite.add(eventBus.subscribe('file.*', handler2));
 *
 * // 一次性取消所有订阅
 * composite.unsubscribeAll();
 * ```
 */
export class CompositeSubscription {
    private readonly subscriptions: IEventSubscription[] = [];

    /**
     * 添加订阅
     *
     * @param subscription - 要管理的事件订阅
     * @returns 当前实例（支持链式调用）
     */
    add(subscription: IEventSubscription): this {
        this.subscriptions.push(subscription);
        return this;
    }

    /**
     * 取消所有订阅并清空列表
     */
    unsubscribeAll(): void {
        for (const sub of this.subscriptions) {
            sub.unsubscribe();
        }
        this.subscriptions.length = 0;
    }

    /**
     * 当前管理的订阅数量
     */
    get count(): number {
        return this.subscriptions.length;
    }
}
