/**
 * 事件处理器类型
 *
 * 定义事件处理函数的签名。
 * 支持同步和异步处理器。
 *
 * @typeParam T - 事件数据的类型
 * @param event - 事件数据对象
 * @returns void 或 Promise<void>
 *
 * @remarks
 * - 同步处理器：直接执行，返回 void
 * - 异步处理器：返回 Promise，支持 await
 * - 处理器不应抛出异常，异常会被事件总线捕获并记录
 *
 * @example
 * ```typescript
 * // 同步处理器
 * const syncHandler: EventHandler<TemplateCreated> = (event) => {
 *     console.log('Template created:', event.template.name);
 * };
 *
 * // 异步处理器
 * const asyncHandler: EventHandler<TemplateCreated> = async (event) => {
 *     await updateCache(event.template);
 *     await notifyUsers(event.template);
 * };
 * ```
 */
export type EventHandler<T = unknown> = (event: T) => void | Promise<void>;

/**
 * 事件订阅信息
 *
 * 表示一个事件订阅的控制对象。
 * 用于管理订阅的生命周期。
 *
 * @remarks
 * - 每次调用 subscribe() 返回一个新的订阅对象
 * - 可以通过 unsubscribe() 取消订阅
 * - 可以通过 isActive() 检查订阅状态
 *
 * @example
 * ```typescript
 * // 订阅事件
 * const subscription = eventBus.subscribe('template.created', (event) => {
 *     console.log('Handler called');
 * });
 *
 * // 检查订阅状态
 * if (subscription.isActive()) {
 *     console.log('Subscription is active');
 * }
 *
 * // 取消订阅
 * subscription.unsubscribe();
 *
 * // 订阅已失效
 * console.log(subscription.isActive()); // false
 * ```
 */
export interface IEventSubscription {
    /**
     * 取消订阅
     *
     * @remarks
     * - 取消后处理器不再接收事件
     * - 重复调用不会报错
     * - 订阅状态变为 inactive
     *
     * @example
     * ```typescript
     * const sub = eventBus.subscribe('event', handler);
     * // ... 使用订阅 ...
     * sub.unsubscribe(); // 不再接收事件
     * ```
     */
    unsubscribe(): void;

    /**
     * 订阅是否仍然活跃
     *
     * @returns 如果订阅仍活跃返回 true，否则返回 false
     *
     * @remarks
     * - 新创建的订阅为 active
     * - 调用 unsubscribe() 后为 inactive
     * - 事件总线 dispose 后所有订阅为 inactive
     *
     * @example
     * ```typescript
     * const sub = eventBus.subscribe('event', handler);
     * console.log(sub.isActive()); // true
     *
     * sub.unsubscribe();
     * console.log(sub.isActive()); // false
     * ```
     */
    isActive(): boolean;
}

/**
 * 事件总线接口
 *
 * 提供发布-订阅模式的事件通信机制，用于解耦模块间的通信。
 * 支持模式匹配、异步处理和错误隔离。
 *
 * @remarks
 * **核心功能**：
 *
 * 1. **事件发布**
 *    - 异步发布事件到所有订阅者
 *    - 并行调用处理器
 *    - 错误隔离（一个处理器失败不影响其他）
 *
 * 2. **事件订阅**
 *    - 精确匹配：订阅特定事件类型
 *    - 模式匹配：使用通配符订阅多个事件
 *    - 返回订阅对象用于取消
 *
 * 3. **订阅管理**
 *    - 取消单个订阅
 *    - 取消所有订阅
 *    - 查询订阅数量
 *
 * **事件命名约定**：
 * - 使用点号分隔的命名空间：`domain.action`
 * - 示例：`template.created`, `template.updated`, `file.modified`
 * - 支持通配符：`template.*` 匹配所有模板事件
 *
 * **使用场景**：
 * - 模块间解耦通信
 * - 领域事件发布
 * - 缓存失效通知
 * - 审计日志记录
 *
 * @example
 * ```typescript
 * // 订阅特定事件
 * eventBus.subscribe('template.created', (event: TemplateCreated) => {
 *     console.log('Template created:', event.template.name);
 * });
 *
 * // 模式订阅（所有模板事件）
 * eventBus.subscribe('template.*', (event) => {
 *     console.log('Template event:', event.type);
 * });
 *
 * // 发布事件
 * await eventBus.publish('template.created', {
 *     id: generateId(),
 *     type: 'template.created',
 *     timestamp: new Date(),
 *     template: newTemplate
 * });
 *
 * // 取消订阅
 * const sub = eventBus.subscribe('event', handler);
 * sub.unsubscribe();
 *
 * // 查询订阅数
 * const count = eventBus.getSubscriptionCount('template.created');
 *
 * // 清理
 * eventBus.dispose();
 * ```
 */
export interface IEventBus {
    /**
     * 发布事件
     *
     * 异步发布事件到所有匹配的订阅者。
     *
     * @typeParam T - 事件数据的类型
     * @param eventType - 事件类型标识符
     * @param event - 事件数据对象
     * @returns Promise，在所有处理器执行完成后 resolve
     *
     * @remarks
     * - 所有匹配的处理器并行执行
     * - 单个处理器失败不影响其他处理器
     * - 所有异常会被捕获并记录到日志
     * - 支持模式匹配订阅
     *
     * @example
     * ```typescript
     * // 发布简单事件
     * await eventBus.publish('user.login', {
     *     id: '123',
     *     type: 'user.login',
     *     timestamp: new Date(),
     *     userId: 'user-123'
     * });
     *
     * // 发布领域事件
     * await eventBus.publish('template.created', {
     *     id: generateId(),
     *     type: 'template.created',
     *     timestamp: new Date(),
     *     source: 'TemplateService',
     *     aggregateId: template.id,
     *     template: template
     * });
     *
     * // 错误处理
     * try {
     *     await eventBus.publish('event', data);
     * } catch (error) {
     *     // 通常不会抛出异常，错误会被内部处理
     *     logger.error('Event publish failed', error);
     * }
     * ```
     */
    publish<T = unknown>(eventType: string, event: T): Promise<void>;

    /**
     * 订阅事件
     *
     * 注册事件处理器以接收特定类型的事件。
     *
     * @typeParam T - 事件数据的类型
     * @param eventType - 事件类型标识符（支持模式匹配）
     * @param handler - 事件处理函数
     * @returns 订阅对象，用于管理订阅生命周期
     *
     * @remarks
     * **事件类型匹配**：
     * - 精确匹配：`'template.created'`
     * - 通配符：`'template.*'` 匹配 `template.created`、`template.updated` 等
     * - 全局：`'*'` 匹配所有事件
     *
     * **处理器执行**：
     * - 处理器可以是同步或异步的
     * - 处理器按注册顺序调用
     * - 处理器异常不会中断其他处理器
     *
     * @example
     * ```typescript
     * // 精确订阅
     * const sub1 = eventBus.subscribe('template.created', (event) => {
     *     console.log('New template:', event.template.name);
     * });
     *
     * // 模式订阅
     * const sub2 = eventBus.subscribe('template.*', (event) => {
     *     console.log('Template event:', event.type);
     * });
     *
     * // 异步处理器
     * const sub3 = eventBus.subscribe('template.created', async (event) => {
     *     await cache.invalidate(event.template.id);
     *     await notifyClients(event);
     * });
     *
     * // 全局监听（用于日志、审计等）
     * const sub4 = eventBus.subscribe('*', (event) => {
     *     auditLogger.log(event);
     * });
     *
     * // 取消订阅
     * sub1.unsubscribe();
     * ```
     */
    subscribe<T = unknown>(eventType: string, handler: EventHandler<T>): IEventSubscription;

    /**
     * 取消所有订阅
     *
     * 批量取消事件订阅。
     *
     * @param eventType - 事件类型（可选）。如果提供则只取消该类型的订阅，否则取消所有订阅
     *
     * @remarks
     * - 不提供 eventType：取消所有订阅
     * - 提供 eventType：只取消匹配的订阅
     * - 精确匹配，不支持模式
     *
     * @example
     * ```typescript
     * // 取消特定事件的所有订阅
     * eventBus.unsubscribeAll('template.created');
     *
     * // 取消所有订阅
     * eventBus.unsubscribeAll();
     *
     * // 使用场景：模块卸载时清理
     * export class MyModule {
     *     dispose() {
     *         eventBus.unsubscribeAll('my-module.*');
     *     }
     * }
     * ```
     */
    unsubscribeAll(eventType?: string): void;

    /**
     * 获取事件订阅数量
     *
     * 查询特定事件类型的订阅者数量。
     *
     * @param eventType - 事件类型标识符
     * @returns 订阅数量
     *
     * @remarks
     * - 只统计精确匹配的订阅
     * - 不包括模式匹配和通配符订阅
     * - 用于监控和调试
     *
     * @example
     * ```typescript
     * const count = eventBus.getSubscriptionCount('template.created');
     * console.log(`${count} subscribers`);
     *
     * // 监控订阅数
     * if (eventBus.getSubscriptionCount('critical.event') === 0) {
     *     logger.warn('No subscribers for critical event!');
     * }
     *
     * // 性能监控
     * const stats = {
     *     'template.created': eventBus.getSubscriptionCount('template.created'),
     *     'template.updated': eventBus.getSubscriptionCount('template.updated'),
     *     'file.modified': eventBus.getSubscriptionCount('file.modified')
     * };
     * ```
     */
    getSubscriptionCount(eventType: string): number;

    /**
     * 清理资源
     *
     * 释放事件总线的所有资源。
     *
     * @remarks
     * - 取消所有订阅
     * - 清空订阅表
     * - 所有订阅对象状态变为 inactive
     * - dispose 后不应再使用事件总线
     *
     * @example
     * ```typescript
     * // 扩展停用时清理
     * export function deactivate() {
     *     eventBus.dispose();
     * }
     *
     * // 测试清理
     * afterEach(() => {
     *     eventBus.dispose();
     * });
     * ```
     */
    dispose(): void;
}

/**
 * 事件元数据
 *
 * 事件的附加元信息，用于追踪和关联事件。
 *
 * @remarks
 * **元数据用途**：
 * - **eventType**: 事件分类和路由
 * - **timestamp**: 事件发生时间，用于排序和过期判断
 * - **source**: 事件来源，用于调试和审计
 * - **correlationId**: 关联ID，用于追踪跨服务的事件流
 *
 * @example
 * ```typescript
 * const metadata: IEventMetadata = {
 *     eventType: 'template.created',
 *     timestamp: new Date(),
 *     source: 'TemplateService',
 *     correlationId: '550e8400-e29b-41d4-a716-446655440000'
 * };
 *
 * // 在事件中携带元数据
 * await eventBus.publish('template.created', {
 *     ...metadata,
 *     template: newTemplate
 * });
 * ```
 */
export interface IEventMetadata {
    /** 事件类型 - 事件的分类标识符 */
    eventType: string;

    /** 时间戳 - 事件发生的准确时间 */
    timestamp: Date;

    /** 事件源 - 发布事件的组件或服务名称（可选） */
    source?: string;

    /** 关联ID - 用于追踪相关事件的唯一标识符（可选） */
    correlationId?: string;
}

/**
 * 组合订阅接口
 *
 * 批量管理多个事件订阅的生命周期。
 *
 * @example
 * ```typescript
 * const composite: ICompositeSubscription = new CompositeSubscription();
 * composite.add(eventBus.subscribe('template.*', handler));
 * composite.unsubscribeAll();
 * ```
 */
export interface ICompositeSubscription {
    /** 添加订阅 */
    add(subscription: IEventSubscription): this;
    /** 取消所有订阅并清空 */
    unsubscribeAll(): void;
    /** 当前管理的订阅数量 */
    readonly count: number;
}
