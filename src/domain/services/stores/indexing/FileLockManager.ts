import { type EditorUri } from '../../../../core/types/EditorTypes';
import { type ILogger } from '../../../../core/interfaces/ILogger';

/**
 * 文件锁管理器
 *
 * 负责管理文件操作锁，防止同一文件的并发变更互相干扰。
 * 使用 Promise 链实现按文件 URI 的串行化操作。
 *
 * @remarks
 * **锁机制**：
 * - 按文件 URI 串行化操作，不同文件可并行
 * - 使用 Promise 链确保同一文件的操作顺序执行
 * - 定期清理过期的锁，防止内存泄漏
 *
 * **清理策略**：
 * - 定期检查锁的创建时间
 * - 清理超过过期时间的锁
 * - 默认过期时间：1分钟
 * - 默认清理间隔：5分钟
 *
 * @example
 * ```typescript
 * const lockManager = new FileLockManager(logger);
 *
 * // 使用文件锁执行操作
 * await lockManager.withFileLock(fileUri, async () => {
 *     // 对文件的操作
 *     await processFile(fileUri);
 * });
 *
 * // 清理资源
 * lockManager.dispose();
 * ```
 */
export class FileLockManager {
    /** 按文件 URI 的操作锁，防止同一文件的并发变更互相干扰 */
    private readonly fileLocks = new Map<string, Promise<void>>();
    /** 文件锁创建时间，用于定期清理 */
    private readonly fileLockTimes = new Map<string, number>();
    /** 文件锁清理定时器 */
    private fileLockCleanupInterval: ReturnType<typeof setInterval> | null = null;

    /** 默认文件锁清理间隔（毫秒） */
    private static readonly DEFAULT_LOCK_CLEANUP_INTERVAL_MS = 300000; // 5 分钟
    /** 默认文件锁过期时间（毫秒） */
    private static readonly DEFAULT_LOCK_EXPIRY_MS = 60000; // 1 分钟

    /** 文件锁清理间隔（毫秒） */
    private readonly lockCleanupIntervalMs: number;
    /** 文件锁过期时间（毫秒） */
    private readonly lockExpiryMs: number;

    /**
     * 构造文件锁管理器实例
     *
     * @param logger - 日志记录器
     * @param config - 配置选项
     */
    constructor(
        private readonly logger: ILogger,
        config?: {
            lockCleanupIntervalMs?: number;
            lockExpiryMs?: number;
        },
    ) {
        this.lockCleanupIntervalMs =
            config?.lockCleanupIntervalMs ?? FileLockManager.DEFAULT_LOCK_CLEANUP_INTERVAL_MS;
        this.lockExpiryMs = config?.lockExpiryMs ?? FileLockManager.DEFAULT_LOCK_EXPIRY_MS;

        // 启动文件锁定期清理
        this.startFileLockCleanup();
    }

    /**
     * 使用文件锁执行操作
     *
     * 按文件 URI 串行化操作，不同文件可并行。
     *
     * @param fileUri - 文件 URI
     * @param fn - 要执行的操作
     * @returns Promise，表示操作完成
     */
    async withFileLock(fileUri: EditorUri, fn: () => Promise<void>): Promise<void> {
        const key = fileUri.toString();
        const prev = this.fileLocks.get(key) ?? Promise.resolve();

        // 记录锁创建时间
        this.fileLockTimes.set(key, Date.now());

        const next = prev.then(fn, fn).finally(() => {
            // 操作完成后，如果当前 Promise 仍是最新的，则清理
            if (this.fileLocks.get(key) === next) {
                this.fileLocks.delete(key);
                this.fileLockTimes.delete(key);
            }
        });

        this.fileLocks.set(key, next);

        return next;
    }

    /**
     * 启动文件锁定期清理
     */
    private startFileLockCleanup(): void {
        if (this.fileLockCleanupInterval) {
            return;
        }

        this.fileLockCleanupInterval = setInterval(() => {
            this.cleanupExpiredFileLocks();
        }, this.lockCleanupIntervalMs);
    }

    /**
     * 清理过期的文件锁
     */
    private cleanupExpiredFileLocks(): void {
        const now = Date.now();
        const expiredKeys: string[] = [];

        for (const [key, createTime] of this.fileLockTimes) {
            if (now - createTime > this.lockExpiryMs) {
                expiredKeys.push(key);
            }
        }

        for (const key of expiredKeys) {
            this.fileLocks.delete(key);
            this.fileLockTimes.delete(key);
        }

        if (expiredKeys.length > 0) {
            this.logger.debug('Cleaned up expired file locks', { count: expiredKeys.length });
        }
    }

    /**
     * 清理资源
     */
    dispose(): void {
        // 停止文件锁清理定时器
        if (this.fileLockCleanupInterval) {
            clearInterval(this.fileLockCleanupInterval);
            this.fileLockCleanupInterval = null;
        }

        // 清理文件锁
        this.fileLocks.clear();
        this.fileLockTimes.clear();
    }
}
