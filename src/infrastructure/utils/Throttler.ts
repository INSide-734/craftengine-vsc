/**
 * 节流工具类
 *
 * 限制函数的执行频率，在指定时间间隔内只允许执行一次。
 *
 * @example
 * ```typescript
 * const throttler = new Throttler();
 *
 * // 限制日志输出频率（每秒最多一次）
 * window.onScroll(() => {
 *     throttler.throttle('scroll-log', () => {
 *         console.log('Scrolled');
 *     }, 1000);
 * });
 * ```
 */
export class Throttler {
    private lastExecutionTime = new Map<string, number>();
    private pendingTimers = new Map<string, NodeJS.Timeout>();

    /**
     * 执行节流函数
     *
     * @param key - 节流键
     * @param fn - 要执行的函数
     * @param interval - 节流间隔（毫秒）
     * @param options - 节流选项
     */
    throttle(
        key: string,
        fn: () => void | Promise<void>,
        interval: number,
        options: { leading?: boolean; trailing?: boolean } = {}
    ): void {
        const { leading = true, trailing = true } = options;
        const now = Date.now();
        const lastExecution = this.lastExecutionTime.get(key) || 0;
        const elapsed = now - lastExecution;

        // 清除之前的尾随调用定时器
        const existingTimer = this.pendingTimers.get(key);
        if (existingTimer) {
            clearTimeout(existingTimer);
            this.pendingTimers.delete(key);
        }

        if (elapsed >= interval) {
            // 可以立即执行
            if (leading) {
                this.lastExecutionTime.set(key, now);
                this.execute(fn, key);
            }
        } else if (trailing) {
            // 设置尾随调用
            const timer = setTimeout(() => {
                this.lastExecutionTime.set(key, Date.now());
                this.pendingTimers.delete(key);
                this.execute(fn, key);
            }, interval - elapsed);
            this.pendingTimers.set(key, timer);
        }
    }

    /**
     * 执行函数
     */
    private async execute(fn: () => void | Promise<void>, key: string): Promise<void> {
        try {
            await fn();
        } catch (error) {
            // 工具函数无 Logger 上下文，使用 console
            console.error(`Throttled function error for key '${key}':`, error);
        }
    }

    /**
     * 取消指定键的节流任务
     *
     * @param key - 节流键
     */
    cancel(key: string): void {
        const timer = this.pendingTimers.get(key);
        if (timer) {
            clearTimeout(timer);
            this.pendingTimers.delete(key);
        }
        this.lastExecutionTime.delete(key);
    }

    /**
     * 清除所有节流状态
     */
    clear(): void {
        for (const timer of this.pendingTimers.values()) {
            clearTimeout(timer);
        }
        this.pendingTimers.clear();
        this.lastExecutionTime.clear();
    }
}
