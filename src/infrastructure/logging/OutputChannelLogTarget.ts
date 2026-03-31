import { type ILogEntry, type ILogTarget, LogLevel } from '../../core/interfaces/ILogger';

// 预计算级别字符串
const LEVEL_STRINGS: Record<number, string> = {
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.INFO]: 'INFO ',
    [LogLevel.WARN]: 'WARN ',
    [LogLevel.ERROR]: 'ERROR',
    [LogLevel.FATAL]: 'FATAL',
};

/**
 * 快速格式化时间戳为 HH:MM:SS 格式
 */
function formatTime(date: Date): string {
    const h = date.getHours();
    const m = date.getMinutes();
    const s = date.getSeconds();
    return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * VSCode 输出通道日志目标
 */
export class OutputChannelLogTarget implements ILogTarget {
    private disposed = false;

    constructor(private readonly outputChannel: { appendLine(value: string): void }) {}

    async write(entry: ILogEntry): Promise<void> {
        if (this.disposed) {
            return;
        }

        try {
            const time = formatTime(entry.timestamp);
            const level = LEVEL_STRINGS[entry.level] ?? 'UNKNO';
            const category = entry.category ? `[${entry.category}]` : '';
            let message = `${time} ${level} ${category} ${entry.message}`;

            if (entry.data) {
                message += ` | Data: ${JSON.stringify(entry.data)}`;
            }

            if (entry.error) {
                message += ` | Error: ${entry.error.message}`;
                if (entry.error.stack && entry.level >= LogLevel.ERROR) {
                    message += `\n  Stack: ${entry.error.stack}`;
                }
            }

            this.outputChannel.appendLine(message);
        } catch {
            this.disposed = true;
        }
    }

    async dispose(): Promise<void> {
        this.disposed = true;
    }
}
