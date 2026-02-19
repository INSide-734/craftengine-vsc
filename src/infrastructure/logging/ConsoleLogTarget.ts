import { ILogEntry, ILogTarget, LogLevel } from '../../core/interfaces/ILogger';

// 预计算级别字符串，避免每次日志都做字符串转换
const LEVEL_STRINGS: Record<number, string> = {
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.INFO]: 'INFO ',
    [LogLevel.WARN]: 'WARN ',
    [LogLevel.ERROR]: 'ERROR',
    [LogLevel.FATAL]: 'FATAL',
};

/**
 * 快速格式化时间戳为 HH:MM:SS 格式
 * 避免使用 toLocaleTimeString（V8 中每次调用 1-5ms）
 */
function formatTime(date: Date): string {
    const h = date.getHours();
    const m = date.getMinutes();
    const s = date.getSeconds();
    return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * 控制台日志目标
 * 支持彩色输出和详细的调试信息
 */
export class ConsoleLogTarget implements ILogTarget {
    async write(entry: ILogEntry): Promise<void> {
        const time = formatTime(entry.timestamp);
        const level = LEVEL_STRINGS[entry.level] ?? 'UNKNO';
        const category = entry.category ? `[${entry.category}]` : '';
        const message = `${time} ${level} ${category} ${entry.message}`;

        switch (entry.level) {
            case LogLevel.DEBUG:
                if (entry.data) {
                    console.debug(message, entry.data);
                } else {
                    console.debug(message);
                }
                break;
            case LogLevel.INFO:
                if (entry.data) {
                    console.info(message, entry.data);
                } else {
                    console.info(message);
                }
                break;
            case LogLevel.WARN:
                if (entry.data && entry.error) {
                    console.warn(message, entry.data, entry.error);
                } else if (entry.data) {
                    console.warn(message, entry.data);
                } else if (entry.error) {
                    console.warn(message, entry.error);
                } else {
                    console.warn(message);
                }
                break;
            case LogLevel.ERROR:
            case LogLevel.FATAL:
                if (entry.data && entry.error) {
                    console.error(message, entry.data, entry.error);
                } else if (entry.data) {
                    console.error(message, entry.data);
                } else if (entry.error) {
                    console.error(message, entry.error);
                } else {
                    console.error(message);
                }
                break;
        }
    }

    async dispose(): Promise<void> {
        // 无需清理
    }
}
