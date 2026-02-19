import * as fs from 'fs';
import * as path from 'path';
import { ILogEntry, ILogTarget, LogLevel } from '../../core/interfaces/ILogger';

/**
 * 文件日志配置选项
 */
export interface FileLogTargetOptions {
    /** 最大文件大小（字节），默认 10MB */
    maxFileSize?: number;
    /** 最大备份文件数量，默认 5 */
    maxBackupCount?: number;
    /** 写入缓冲 flush 间隔（毫秒），默认 200ms */
    flushIntervalMs?: number;
    /** 写入缓冲大小阈值（字节），默认 4KB */
    bufferSizeThreshold?: number;
}

/**
 * 文件日志目标
 * 将日志写入文件，支持日志轮转、旧备份清理和写入缓冲
 */
export class FileLogTarget implements ILogTarget {
    private writeStream: fs.WriteStream | null = null;
    private disposed = false;
    private maxFileSize: number;
    private maxBackupCount: number;
    private readonly flushIntervalMs: number;
    private readonly bufferSizeThreshold: number;
    private currentFileSize = 0;
    private rotating = false;

    // 写入缓冲
    private buffer: string[] = [];
    private bufferSize = 0;
    private flushTimer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly logFilePath: string,
        options?: FileLogTargetOptions
    ) {
        this.maxFileSize = options?.maxFileSize ?? 10 * 1024 * 1024;
        this.maxBackupCount = options?.maxBackupCount ?? 5;
        this.flushIntervalMs = options?.flushIntervalMs ?? 200;
        this.bufferSizeThreshold = options?.bufferSizeThreshold ?? 4 * 1024;
        // 启动时轮转：将上一次会话的日志文件重命名为备份（Minecraft 风格）
        this.rotateOnStartup();
        this.initializeStream();
        this.startFlushTimer();
    }
    /**
     * 启动时轮转：如果上一次会话的日志文件存在且非空，将其重命名为带时间戳的备份
     * 类似 Minecraft 服务端的日志行为：每次启动都从新文件开始写入
     * 使用同步 API，因为必须在构造函数中完成（流初始化之前）
     */
    private rotateOnStartup(): void {
        try {
            if (!fs.existsSync(this.logFilePath)) {
                return;
            }

            const stat = fs.statSync(this.logFilePath);
            if (stat.size === 0) {
                return;
            }

            // 生成备份文件名
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const ext = path.extname(this.logFilePath);
            const base = this.logFilePath.slice(0, -ext.length || undefined);
            const backupPath = `${base}_${timestamp}${ext}`;

            fs.renameSync(this.logFilePath, backupPath);

            // 异步清理旧备份（不阻塞启动）
            this.cleanupOldBackups().catch((err) => {
                console.error('FileLogTarget startup cleanup error:', err);
            });
        } catch (error) {
            console.error('FileLogTarget startup rotation error:', error);
        }
    }

    /**
     * 启动定时 flush 计时器
     */
    private startFlushTimer(): void {
        this.flushTimer = setInterval(() => {
            this.flushBuffer();
        }, this.flushIntervalMs);
        // 避免计时器阻止进程退出
        if (this.flushTimer && typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
            this.flushTimer.unref();
        }
    }

    private initializeStream(): void {
        try {
            // 确保目录存在
            const dir = path.dirname(this.logFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // 同步创建空文件，确保文件立即可见
            fs.writeFileSync(this.logFilePath, '', { encoding: 'utf8' });

            this.writeStream = fs.createWriteStream(this.logFilePath, {
                flags: 'a',
                encoding: 'utf8'
            });

            this.writeStream.on('error', (error) => {
                console.error('FileLogTarget write error:', error);
                this.disposed = true;
            });
        } catch (error) {
            console.error('FileLogTarget initialization error:', error);
            this.disposed = true;
        }
    }
    /**
     * 异步轮转日志文件
     * 将当前日志文件重命名为带时间戳的备份，然后清理超出数量的旧备份
     */
    private async rotateLogAsync(): Promise<void> {
        if (this.rotating) {
            return;
        }
        this.rotating = true;

        try {
            // 先 flush 缓冲区
            this.flushBuffer();

            // 关闭当前流
            if (this.writeStream) {
                await new Promise<void>((resolve) => {
                    this.writeStream!.end(() => resolve());
                });
                this.writeStream = null;
            }

            // 生成备份文件名
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const ext = path.extname(this.logFilePath);
            const base = this.logFilePath.slice(0, -ext.length || undefined);
            const backupPath = `${base}_${timestamp}${ext}`;

            // 异步重命名当前文件
            try {
                await fs.promises.rename(this.logFilePath, backupPath);
            } catch {
                // 文件可能不存在，忽略
            }

            // 重新初始化流
            this.currentFileSize = 0;
            this.initializeStream();

            // 异步清理旧备份（不阻塞写入）
            this.cleanupOldBackups().catch((err) => {
                console.error('FileLogTarget cleanup error:', err);
            });
        } catch (error) {
            console.error('FileLogTarget rotation error:', error);
        } finally {
            this.rotating = false;
        }
    }
    /**
     * 清理超出 maxBackupCount 的旧备份文件
     * 按修改时间排序，删除最旧的超出部分
     */
    private async cleanupOldBackups(): Promise<void> {
        const dir = path.dirname(this.logFilePath);
        const ext = path.extname(this.logFilePath);
        const baseName = path.basename(this.logFilePath, ext);
        // 匹配模式: {baseName}_{timestamp}{ext}
        const backupPattern = new RegExp(
            `^${this.escapeRegExp(baseName)}_\\d{4}-\\d{2}-\\d{2}T[\\w-]+${this.escapeRegExp(ext)}$`
        );

        try {
            const files = await fs.promises.readdir(dir);
            const backups: Array<{ name: string; mtimeMs: number }> = [];

            for (const file of files) {
                if (backupPattern.test(file)) {
                    try {
                        const stat = await fs.promises.stat(path.join(dir, file));
                        backups.push({ name: file, mtimeMs: stat.mtimeMs });
                    } catch {
                        // 文件可能已被删除，跳过
                    }
                }
            }

            // 按修改时间降序排序（最新的在前）
            backups.sort((a, b) => b.mtimeMs - a.mtimeMs);

            // 删除超出数量的旧备份
            const toDelete = backups.slice(this.maxBackupCount);
            for (const backup of toDelete) {
                try {
                    await fs.promises.unlink(path.join(dir, backup.name));
                } catch {
                    // 删除失败不影响主流程
                }
            }
        } catch {
            // 目录读取失败不影响主流程
        }
    }

    private escapeRegExp(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 将缓冲区内容写入文件流
     */
    private flushBuffer(): void {
        if (this.buffer.length === 0 || this.disposed || !this.writeStream || this.rotating) {
            return;
        }

        const content = this.buffer.join('');
        this.buffer = [];
        this.bufferSize = 0;

        this.writeStream.write(content);
        this.currentFileSize += Buffer.byteLength(content, 'utf8');
    }

    // 预计算级别字符串
    private static readonly LEVEL_STRINGS: Record<number, string> = {
        [LogLevel.DEBUG]: 'DEBUG',
        [LogLevel.INFO]: 'INFO ',
        [LogLevel.WARN]: 'WARN ',
        [LogLevel.ERROR]: 'ERROR',
        [LogLevel.FATAL]: 'FATAL',
    };

    async write(entry: ILogEntry): Promise<void> {
        if (this.disposed || !this.writeStream) {
            return;
        }

        try {
            const time = entry.timestamp.toISOString();
            const level = FileLogTarget.LEVEL_STRINGS[entry.level] ?? 'UNKNO';
            const category = entry.category ? `[${entry.category}]` : '';
            let message = `${time} ${level} ${category} ${entry.message}`;

            if (entry.data) {
                message += ` | Data: ${JSON.stringify(entry.data)}`;
            }

            if (entry.error) {
                message += ` | Error: ${entry.error.message}`;
                if (entry.error.stack) {
                    // 堆栈保留换行以便阅读，但只在 ERROR/FATAL 级别输出
                    if (entry.level >= LogLevel.ERROR) {
                        message += `\n  Stack: ${entry.error.stack}`;
                    }
                }
            }

            message += '\n';

            const messageSize = Buffer.byteLength(message, 'utf8');

            // 检查是否需要轮转（异步执行，不阻塞当前写入）
            if (this.currentFileSize + this.bufferSize + messageSize >= this.maxFileSize && !this.rotating) {
                this.rotateLogAsync().catch((err) => {
                    console.error('FileLogTarget rotation error:', err);
                });
            }

            // 添加到缓冲区
            this.buffer.push(message);
            this.bufferSize += messageSize;

            // 缓冲区超过阈值时立即 flush
            if (this.bufferSize >= this.bufferSizeThreshold) {
                this.flushBuffer();
            }
        } catch (error) {
            console.error('FileLogTarget write error:', error);
        }
    }

    async dispose(): Promise<void> {
        // 停止 flush 计时器
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }

        // 先 flush 剩余缓冲，再标记 disposed（flushBuffer 会检查 disposed 标记）
        this.flushBuffer();
        this.disposed = true;

        // 关闭写入流
        if (this.writeStream) {
            await new Promise<void>((resolve) => {
                this.writeStream!.end(() => {
                    this.writeStream = null;
                    resolve();
                });
            });
        }
    }

    /**
     * 获取日志文件路径
     */
    getLogFilePath(): string {
        return this.logFilePath;
    }

    /**
     * 更新配置选项（运行时动态调整）
     */
    updateOptions(options: { maxFileSize?: number; maxBackupCount?: number }): void {
        if (options.maxFileSize !== undefined) {
            this.maxFileSize = options.maxFileSize;
        }
        if (options.maxBackupCount !== undefined) {
            this.maxBackupCount = options.maxBackupCount;
        }
    }
}
