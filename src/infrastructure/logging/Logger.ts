import {
    ILogger,
    ILogEntry,
    ILogTarget,
    LogLevel
} from '../../core/interfaces/ILogger';
import { FileLogTarget, FileLogTargetOptions } from './FileLogTarget';
import { ConsoleLogTarget } from './ConsoleLogTarget';

// 重新导出日志目标类，保持向后兼容
export { FileLogTarget, FileLogTargetOptions } from './FileLogTarget';
export { ConsoleLogTarget } from './ConsoleLogTarget';
export { OutputChannelLogTarget } from './OutputChannelLogTarget';

/**
 * 日志记录器实现
 */
export class Logger implements ILogger {
    private targets: ILogTarget[] = [];

    constructor(
        private level: LogLevel = LogLevel.INFO, // 默认 INFO 级别
        private readonly category?: string
    ) {}

    addTarget(target: ILogTarget): void {
        this.targets.push(target);
    }

    removeTarget(target: ILogTarget): void {
        const index = this.targets.indexOf(target);
        if (index !== -1) {
            this.targets.splice(index, 1);
        }
    }

    debug(message: string, data?: Record<string, unknown>): void {
        this.log(LogLevel.DEBUG, message, data);
    }

    info(message: string, data?: Record<string, unknown>): void {
        this.log(LogLevel.INFO, message, data);
    }

    warn(message: string, data?: Record<string, unknown>): void {
        this.log(LogLevel.WARN, message, data);
    }

    error(message: string, error?: Error, data?: Record<string, unknown>): void {
        this.log(LogLevel.ERROR, message, data, error);
    }

    fatal(message: string, error?: Error, data?: Record<string, unknown>): void {
        this.log(LogLevel.FATAL, message, data, error);
    }

    createChild(category: string): ILogger {
        const childCategory = this.category ? `${this.category}.${category}` : category;
        const childLogger = new Logger(this.level, childCategory);
        childLogger.targets = [...this.targets];
        return childLogger;
    }

    setLevel(level: LogLevel): void {
        this.level = level;
    }

    getLevel(): LogLevel {
        return this.level;
    }

    private log(level: LogLevel, message: string, data?: Record<string, unknown>, error?: Error): void {
        if (level < this.level) {
            return;
        }

        // 仅在需要时才创建 entry 对象
        const targets = this.targets;
        if (targets.length === 0) {
            return;
        }

        const entry: ILogEntry = {
            level,
            message,
            timestamp: new Date(),
            category: this.category,
            data,
            error
        };

        for (let i = 0; i < targets.length; i++) {
            try {
                targets[i].write(entry).catch(err => {
                    console.error('Logger write error:', err);
                });
            } catch (err) {
                console.error('Logger write error:', err);
            }
        }
    }
}

/**
 * 日志管理器（单例）
 */
export class LoggerManager {
    private static instance: LoggerManager;
    private readonly loggers = new Map<string, ILogger>();
    private readonly globalTargets: ILogTarget[] = [];
    private globalLevel: LogLevel = LogLevel.INFO; // 默认 INFO 级别
    private configChangeListener?: { dispose(): void };

    static getInstance(): LoggerManager {
        if (!LoggerManager.instance) {
            LoggerManager.instance = new LoggerManager();
        }
        return LoggerManager.instance;
    }

    private fileLogTarget: FileLogTarget | null = null;
    private fileLogPath: string | null = null;
    // 标记文件日志是否由 VSCode 配置管理（而非环境变量或直接 API 调用）
    private fileLoggingManagedByConfig = false;

    /**
     * 初始化日志管理器
     *
     * 支持的环境变量：
     * - CRAFTENGINE_LOG_LEVEL: 日志级别 (DEBUG, INFO, WARN, ERROR, FATAL)
     * - CRAFTENGINE_DEBUG_MODE: 启用调试模式 (true/false)，启用后强制使用 DEBUG 级别
     * - CRAFTENGINE_DEBUG_OUTPUT: 调试输出目标 (console, file, all)，默认 console
     * - CRAFTENGINE_LOG_FILE: 日志文件路径
     *
     * @param options.level - 日志级别（默认 INFO）
     * @param options.enableHotReload - 启用配置热重载（默认 true）
     * @param options.logFilePath - 日志文件路径（可选）
     */
    initialize(options?: {
        level?: LogLevel;
        enableHotReload?: boolean;
        logFilePath?: string;
    }): void {
        // 从环境变量读取调试模式
        const debugMode = process.env.CRAFTENGINE_DEBUG_MODE === 'true';

        // 从环境变量读取日志级别
        const envLogLevel = process.env.CRAFTENGINE_LOG_LEVEL?.toUpperCase();

        // 调试模式优先级最高，强制使用 DEBUG 级别
        if (debugMode) {
            this.globalLevel = LogLevel.DEBUG;
            console.log('[LoggerManager] Debug mode enabled via environment variable');
        } else if (envLogLevel && envLogLevel in LogLevel) {
            this.globalLevel = LogLevel[envLogLevel as keyof typeof LogLevel] as LogLevel;
        } else if (options?.level !== undefined) {
            this.globalLevel = options.level;
        }

        // 从环境变量读取调试输出目标
        const debugOutput = process.env.CRAFTENGINE_DEBUG_OUTPUT?.toLowerCase() || 'console';

        // 根据调试输出目标配置日志目标
        if (this.globalTargets.length === 0) {
            this.setupLogTargets(debugOutput, options?.logFilePath);
        }

        // 启用热重载（默认启用）
        if (options?.enableHotReload !== false) {
            this.setupConfigWatcher();
        }
    }

    /**
     * 根据调试输出目标配置日志目标
     *
     * @param debugOutput - 调试输出目标 (console, file, all)
     * @param logFilePath - 日志文件路径（可选）
     */
    private setupLogTargets(debugOutput: string, logFilePath?: string): void {
        // 从环境变量读取日志文件路径
        const envLogFilePath = process.env.CRAFTENGINE_LOG_FILE || logFilePath;

        switch (debugOutput) {
            case 'file':
                // 仅文件输出
                if (envLogFilePath) {
                    this.enableFileLogging(envLogFilePath);
                } else {
                    // 如果没有指定文件路径，回退到控制台
                    console.warn('[LoggerManager] CRAFTENGINE_DEBUG_OUTPUT=file but no log file path specified, falling back to console');
                    this.addGlobalTarget(new ConsoleLogTarget());
                }
                break;

            case 'all':
                // 同时输出到控制台和文件
                this.addGlobalTarget(new ConsoleLogTarget());
                if (envLogFilePath) {
                    this.enableFileLogging(envLogFilePath);
                }
                break;

            case 'console':
            default:
                // 默认仅控制台输出
                this.addGlobalTarget(new ConsoleLogTarget());
                // 如果指定了日志文件路径，也启用文件日志
                if (envLogFilePath) {
                    this.enableFileLogging(envLogFilePath);
                }
                break;
        }
    }

    /**
     * 启用文件日志
     * @param logFilePath 日志文件路径
     * @param options 文件日志选项
     */
    enableFileLogging(logFilePath: string, options?: FileLogTargetOptions): void {
        // 如果已经有文件日志目标，先移除
        if (this.fileLogTarget) {
            this.removeGlobalTarget(this.fileLogTarget);
            this.fileLogTarget.dispose();
        }

        this.fileLogTarget = new FileLogTarget(logFilePath, options);
        this.fileLogPath = logFilePath;
        this.addGlobalTarget(this.fileLogTarget);

        console.log(`[LoggerManager] File logging enabled: ${logFilePath}`);
    }

    /**
     * 通过 VSCode 配置启用文件日志（标记为配置管理）
     * 仅由 InfrastructureRegistrar 和热重载调用
     */
    enableFileLoggingFromConfig(logFilePath: string, options?: FileLogTargetOptions): void {
        this.enableFileLogging(logFilePath, options);
        this.fileLoggingManagedByConfig = true;
    }

    /**
     * 禁用文件日志
     */
    disableFileLogging(): void {
        if (this.fileLogTarget) {
            this.removeGlobalTarget(this.fileLogTarget);
            this.fileLogTarget.dispose();
            this.fileLogTarget = null;
            this.fileLogPath = null;
            this.fileLoggingManagedByConfig = false;
        }
    }

    /**
     * 获取当前日志文件路径
     */
    getLogFilePath(): string | null {
        return this.fileLogTarget?.getLogFilePath() ?? null;
    }

    /**
     * 移除全局日志目标
     */
    removeGlobalTarget(target: ILogTarget): void {
        const index = this.globalTargets.indexOf(target);
        if (index !== -1) {
            this.globalTargets.splice(index, 1);
        }

        for (const logger of this.loggers.values()) {
            if (logger instanceof Logger) {
                logger.removeTarget(target);
            }
        }
    }

    /**
     * 设置配置监听器，实现热重载
     */
    private setupConfigWatcher(): void {
        try {
            // 动态导入 vscode 模块（避免在非 VSCode 环境出错）
            const vscode = require('vscode');

            // 监听配置变更
            this.configChangeListener = vscode.workspace.onDidChangeConfiguration((e: { affectsConfiguration(section: string): boolean }) => {
                if (e.affectsConfiguration('craftengine.logging')) {
                    this.reloadConfiguration();
                }
            });

            // 初始加载配置
            this.reloadConfiguration();
        } catch (error) {
            // 非 VSCode 环境，忽略
            console.warn('Failed to setup config watcher (not in VSCode environment?)');
        }
    }

    /**
     * 重新加载配置
     */
    private reloadConfiguration(): void {
        try {
            const vscode = require('vscode');
            const config = vscode.workspace.getConfiguration('craftengine.logging');

            // 读取日志级别配置
            const levelStr = config.get('level', 'INFO') as string;
            const newLevel = LogLevel[levelStr as keyof typeof LogLevel];

            if (newLevel !== undefined && newLevel !== this.globalLevel) {
                const oldLevel = LogLevel[this.globalLevel];
                this.globalLevel = newLevel;

                // 更新所有现有 Logger 的级别
                this.loggers.forEach(logger => {
                    logger.setLevel(newLevel);
                });

                // 记录级别变更
                const logger = this.getLogger('LoggerManager');
                logger.info('Log level updated', {
                    oldLevel,
                    newLevel: levelStr,
                    loggersUpdated: this.loggers.size
                });
            }

            // 读取 debugMode 配置
            const debugMode = config.get('debugMode', false) as boolean;
            if (debugMode && this.globalLevel > LogLevel.DEBUG) {
                this.globalLevel = LogLevel.DEBUG;
                this.loggers.forEach(logger => {
                    logger.setLevel(LogLevel.DEBUG);
                });

                const logger = this.getLogger('LoggerManager');
                logger.info('Debug mode enabled, log level switched to DEBUG');
            }

            // 热重载文件日志配置
            this.reloadFileLoggingConfig(config);

        } catch (error) {
            console.error('Failed to reload configuration:', error);
        }
    }

    /**
     * 热重载文件日志配置
     * 仅管理通过 VSCode 配置启用的文件日志，不影响环境变量或直接 API 启用的文件日志
     */
    private reloadFileLoggingConfig(config: { get<T>(key: string, defaultValue: T): T }): void {
        const fileEnabled = config.get('fileEnabled', false) as boolean;
        const maxFileSize = config.get('maxFileSize', 10 * 1024 * 1024) as number;
        const maxBackupCount = config.get('maxBackupCount', 5) as number;

        if (fileEnabled) {
            if (this.fileLogTarget) {
                // 已启用，更新配置参数
                this.fileLogTarget.updateOptions({ maxFileSize, maxBackupCount });
            } else if (this.fileLogPath) {
                // 需要重新启用（之前被禁用过）
                this.enableFileLoggingFromConfig(this.fileLogPath, { maxFileSize, maxBackupCount });
            }
            // 如果 fileLogPath 为 null 且没有 fileLogTarget，说明从未通过 registerLoggingServices 设置过路径
            // 此时不做任何操作，等待 InfrastructureRegistrar 初始化
        } else {
            // 仅禁用由配置管理的文件日志，不影响环境变量或 API 直接启用的
            if (this.fileLogTarget && this.fileLoggingManagedByConfig) {
                this.disableFileLogging();
            }
        }
    }

    /**
     * 获取日志记录器
     */
    getLogger(category?: string): ILogger {
        const key = category || 'default';

        if (!this.loggers.has(key)) {
            const logger = new Logger(this.globalLevel, category);

            for (const target of this.globalTargets) {
                logger.addTarget(target);
            }

            this.loggers.set(key, logger);
        }

        return this.loggers.get(key)!;
    }

    /**
     * 添加全局日志目标
     */
    addGlobalTarget(target: ILogTarget): void {
        this.globalTargets.push(target);

        for (const logger of this.loggers.values()) {
            if (logger instanceof Logger) {
                logger.addTarget(target);
            }
        }
    }

    /**
     * 设置全局日志级别（立即生效）
     */
    setGlobalLevel(level: LogLevel): void {
        const oldLevel = LogLevel[this.globalLevel];
        this.globalLevel = level;

        // 更新所有现有 Logger 的级别
        for (const logger of this.loggers.values()) {
            logger.setLevel(level);
        }

        const logger = this.getLogger('LoggerManager');
        logger.info('Log level manually updated', {
            oldLevel,
            newLevel: LogLevel[level],
            loggersUpdated: this.loggers.size
        });
    }

    /**
     * 获取当前全局日志级别
     */
    getGlobalLevel(): LogLevel {
        return this.globalLevel;
    }

    /**
     * 手动重新加载配置
     */
    reloadConfig(): void {
        this.reloadConfiguration();
    }

    /**
     * 清理所有资源
     */
    async dispose(): Promise<void> {
        // 清理配置监听器
        if (this.configChangeListener) {
            this.configChangeListener.dispose();
            this.configChangeListener = undefined;
        }

        await Promise.all(this.globalTargets.map(target => target.dispose()));
        this.globalTargets.length = 0;
        this.loggers.clear();
    }
}

// 导出类型
export { LogLevel, ILogger, ILogEntry, ILogTarget } from '../../core/interfaces/ILogger';