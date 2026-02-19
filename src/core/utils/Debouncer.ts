/**
 * 防抖工具类
 *
 * 用于延迟执行频繁调用的函数，只有在最后一次调用后的指定延迟时间内
 * 没有新的调用时才会执行。
 *
 * @example
 * ```typescript
 * const debouncer = new Debouncer();
 *
 * // 在文档变化时更新诊断（防抖 500ms）
 * document.onDidChange(() => {
 *     debouncer.debounce('diagnostics', async () => {
 *         await updateDiagnostics();
 *     }, 500);
 * });
 *
 * // 清理
 * debouncer.clear();
 * ```
 */
export class Debouncer {
    private timers = new Map<string, NodeJS.Timeout>();

    /**
     * 执行防抖函数
     *
     * @param key - 防抖键，用于区分不同的防抖任务
     * @param fn - 要执行的函数
     * @param delay - 延迟时间（毫秒）
     */
    debounce(key: string, fn: () => void | Promise<void>, delay: number): void {
        // 清除现有的定时器
        const existingTimer = this.timers.get(key);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // 设置新的定时器
        const timer = setTimeout(async () => {
            this.timers.delete(key);
            try {
                await fn();
            } catch (error) {
                // 工具函数无 Logger 上下文，使用 console
                console.error(`Debounced function error for key '${key}':`, error);
            }
        }, delay);

        this.timers.set(key, timer);
    }

    /**
     * 取消指定键的防抖任务
     *
     * @param key - 防抖键
     * @returns 是否成功取消
     */
    cancel(key: string): boolean {
        const timer = this.timers.get(key);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(key);
            return true;
        }
        return false;
    }

    /**
     * 检查是否有待执行的防抖任务
     *
     * @param key - 防抖键
     * @returns 是否有待执行的任务
     */
    isPending(key: string): boolean {
        return this.timers.has(key);
    }

    /**
     * 清除所有定时器
     */
    clear(): void {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
    }

    /**
     * 获取待执行的任务数量
     *
     * @returns 任务数量
     */
    pendingCount(): number {
        return this.timers.size;
    }
}
