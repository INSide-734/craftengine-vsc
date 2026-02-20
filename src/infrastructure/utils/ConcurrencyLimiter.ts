/**
 * 并发限制器
 *
 * 限制同时执行的异步操作数量。
 *
 * @example
 * ```typescript
 * const limiter = new ConcurrencyLimiter(5);
 *
 * // 最多同时执行 5 个请求
 * const results = await Promise.all(
 *     urls.map(url => limiter.run(() => fetch(url)))
 * );
 * ```
 */
export class ConcurrencyLimiter {
    private running = 0;
    private queue: Array<() => void> = [];

    /**
     * 构造并发限制器
     *
     * @param maxConcurrency - 最大并发数
     */
    constructor(private readonly maxConcurrency: number) {}

    /**
     * 执行受限的异步操作
     *
     * @param fn - 要执行的异步函数
     * @returns Promise
     */
    async run<T>(fn: () => Promise<T>): Promise<T> {
        // 如果已达到并发限制，等待
        if (this.running >= this.maxConcurrency) {
            await new Promise<void>((resolve) => {
                this.queue.push(resolve);
            });
        }

        this.running++;

        try {
            return await fn();
        } finally {
            this.running--;
            // 释放一个等待的任务
            const next = this.queue.shift();
            if (next) {
                next();
            }
        }
    }

    /**
     * 获取当前运行的任务数
     *
     * @returns 运行中的任务数
     */
    runningCount(): number {
        return this.running;
    }

    /**
     * 获取等待中的任务数
     *
     * @returns 等待中的任务数
     */
    pendingCount(): number {
        return this.queue.length;
    }
}
