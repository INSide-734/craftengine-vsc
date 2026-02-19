/**
 * 异步工具函数
 *
 * 提供防抖、节流、延迟执行等异步操作工具。
 *
 * AsyncInitializer 和 createAsyncInitializer 已迁移至 Core 层，
 * 此处重导出以保持现有导入兼容。
 *
 * Debouncer、Throttler、ConcurrencyLimiter 已拆分为独立文件，
 * 此处重导出以保持现有导入兼容。
 */

// 从 Core 层重导出异步初始化器
export { AsyncInitializer, createAsyncInitializer } from '../../core/utils';

// 从独立文件重导出类
export { Debouncer } from './Debouncer';
export { Throttler } from './Throttler';
export { ConcurrencyLimiter } from './ConcurrencyLimiter';

/**
 * 延迟执行
 *
 * 返回一个 Promise，在指定毫秒后解析。
 *
 * @param ms - 延迟毫秒数
 * @returns Promise
 *
 * @example
 * ```typescript
 * await delay(1000); // 等待 1 秒
 * console.log('1 second later');
 * ```
 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带超时的 Promise
 *
 * 包装一个 Promise，如果在指定时间内未完成则拒绝。
 *
 * @param promise - 要包装的 Promise
 * @param ms - 超时毫秒数
 * @param errorMessage - 超时错误消息
 * @returns Promise
 */
export function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    errorMessage: string = 'Operation timed out'
): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(errorMessage));
        }, ms);

        promise
            .then(result => {
                clearTimeout(timer);
                resolve(result);
            })
            .catch(error => {
                clearTimeout(timer);
                reject(error);
            });
    });
}

/**
 * 重试选项
 */
export interface RetryOptions {
    /** 最大重试次数，默认为 3 */
    maxRetries?: number;
    /** 重试间隔（毫秒），默认为 1000 */
    retryDelay?: number;
    /** 是否使用指数退避，默认为 false */
    exponentialBackoff?: boolean;
    /** 重试条件，返回 true 时重试 */
    shouldRetry?: (error: Error, attempt: number) => boolean;
    /** 重试前的回调 */
    onRetry?: (error: Error, attempt: number) => void;
}

/**
 * 带重试的异步操作
 *
 * 执行异步操作，失败时自动重试。
 *
 * @param fn - 要执行的异步函数
 * @param options - 重试选项
 * @returns Promise
 */
export async function retry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxRetries = 3,
        retryDelay = 1000,
        exponentialBackoff = false,
        shouldRetry = () => true,
        onRetry
    } = options;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt > maxRetries || !shouldRetry(lastError, attempt)) {
                throw lastError;
            }

            if (onRetry) {
                onRetry(lastError, attempt);
            }

            // 计算延迟时间
            const delayTime = exponentialBackoff
                ? retryDelay * Math.pow(2, attempt - 1)
                : retryDelay;

            await delay(delayTime);
        }
    }

    throw lastError;
}

/**
 * 批量执行异步操作
 *
 * 将数组分批处理，控制每批的并发数。
 *
 * @param items - 要处理的项数组
 * @param fn - 处理函数
 * @param batchSize - 每批大小
 * @returns Promise<结果数组>
 */
export async function batchAsync<T, R>(
    items: T[],
    fn: (item: T, index: number) => Promise<R>,
    batchSize: number
): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map((item, batchIndex) => fn(item, i + batchIndex))
        );
        results.push(...batchResults);
    }

    return results;
}

/**
 * 创建防抖函数
 *
 * 创建一个防抖版本的函数。
 *
 * @param fn - 要防抖的函数
 * @param wait - 等待时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
    fn: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timer: NodeJS.Timeout | null = null;

    return function (this: unknown, ...args: Parameters<T>): void {
        if (timer) {
            clearTimeout(timer);
        }

        timer = setTimeout(() => {
            timer = null;
            fn.apply(this, args);
        }, wait);
    };
}

/**
 * 创建节流函数
 *
 * 创建一个节流版本的函数。
 *
 * @param fn - 要节流的函数
 * @param limit - 节流间隔（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
    fn: T,
    limit: number
): (...args: Parameters<T>) => void {
    let lastTime = 0;
    let timer: NodeJS.Timeout | null = null;

    return function (this: unknown, ...args: Parameters<T>): void {
        const now = Date.now();

        if (now - lastTime >= limit) {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            lastTime = now;
            fn.apply(this, args);
        } else if (!timer) {
            timer = setTimeout(() => {
                timer = null;
                lastTime = Date.now();
                fn.apply(this, args);
            }, limit - (now - lastTime));
        }
    };
}
