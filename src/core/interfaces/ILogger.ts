/**
 * 日志级别枚举
 *
 * 定义日志消息的严重程度等级，数值越大表示越严重。
 *
 * @remarks
 * 日志级别用于：
 * - 过滤日志输出
 * - 控制日志详细程度
 * - 区分消息的重要性
 *
 * @example
 * ```typescript
 * logger.setLevel(LogLevel.INFO); // 只输出 INFO 及以上级别的日志
 * logger.debug('This will not be logged'); // 被过滤
 * logger.info('This will be logged'); // 输出
 * ```
 */
export enum LogLevel {
    /** 调试信息 - 详细的开发调试信息 */
    DEBUG = 0,
    /** 一般信息 - 重要的业务事件 */
    INFO = 1,
    /** 警告信息 - 潜在问题但不影响正常运行 */
    WARN = 2,
    /** 错误信息 - 需要关注的错误但系统可继续运行 */
    ERROR = 3,
    /** 严重错误 - 可能导致系统崩溃的严重问题 */
    FATAL = 4,
}

/**
 * 日志条目接口
 *
 * 表示一条结构化的日志记录，包含所有必要的上下文信息。
 *
 * @remarks
 * 结构化日志便于：
 * - 日志聚合和分析
 * - 错误追踪和调试
 * - 性能监控
 *
 * @example
 * ```typescript
 * const entry: ILogEntry = {
 *     level: LogLevel.ERROR,
 *     message: 'Template parsing failed',
 *     timestamp: new Date(),
 *     category: 'TemplateService',
 *     data: { templateName: 'user-profile', lineNumber: 15 },
 *     error: new Error('Invalid YAML syntax')
 * };
 * ```
 */
export interface ILogEntry {
    /** 日志级别 */
    level: LogLevel;
    /** 日志消息 */
    message: string;
    /** 时间戳 */
    timestamp: Date;
    /** 日志分类（通常是模块或类名） */
    category?: string;
    /** 结构化的附加数据 */
    data?: Record<string, unknown>;
    /** 相关的错误对象（如果有） */
    error?: Error;
}

/**
 * 日志记录器接口
 *
 * 提供统一的日志记录抽象，支持不同级别的日志输出和结构化数据。
 *
 * @remarks
 * 日志记录器遵循以下原则：
 * - 结构化日志：使用键值对附加上下文信息
 * - 层次化分类：通过子记录器组织日志
 * - 级别过滤：根据日志级别控制输出
 * - 多目标输出：支持控制台、文件、远程等多种输出目标
 *
 * @example
 * ```typescript
 * // 获取日志记录器
 * const logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger);
 *
 * // 记录不同级别的日志
 * logger.debug('Processing template', { templateName: 'user-profile' });
 * logger.info('Template loaded successfully', { count: 10 });
 * logger.warn('Cache miss', { key: 'template-cache' });
 * logger.error('Validation failed', error, { templateName: 'invalid-template' });
 *
 * // 创建子记录器
 * const serviceLogger = logger.createChild('TemplateService');
 * serviceLogger.info('Service initialized');
 * ```
 */
export interface ILogger {
    /**
     * 记录调试信息
     *
     * 用于开发和调试阶段的详细信息，生产环境通常不输出。
     *
     * @param message - 日志消息
     * @param data - 附加的结构化数据（可选）
     *
     * @example
     * ```typescript
     * logger.debug('Parsing template', {
     *     templateName: 'user-profile',
     *     lineNumber: 15,
     *     indentLevel: 2
     * });
     * ```
     */
    debug(message: string, data?: Record<string, unknown>): void;

    /**
     * 记录一般信息
     *
     * 用于记录重要的业务事件和状态变化。
     *
     * @param message - 日志消息
     * @param data - 附加的结构化数据（可选）
     *
     * @example
     * ```typescript
     * logger.info('Extension activated', {
     *     version: '1.0.0',
     *     templatesLoaded: 25
     * });
     * ```
     */
    info(message: string, data?: Record<string, unknown>): void;

    /**
     * 记录警告信息
     *
     * 用于记录潜在问题或异常情况，但不影响系统正常运行。
     *
     * @param message - 日志消息
     * @param data - 附加的结构化数据（可选）
     *
     * @example
     * ```typescript
     * logger.warn('Template cache miss', {
     *     templateName: 'user-profile',
     *     cacheSize: 100
     * });
     * ```
     */
    warn(message: string, data?: Record<string, unknown>): void;

    /**
     * 记录错误信息
     *
     * 用于记录需要关注的错误，但系统可以继续运行。
     *
     * @param message - 日志消息
     * @param error - 错误对象（可选）
     * @param data - 附加的结构化数据（可选）
     *
     * @example
     * ```typescript
     * try {
     *     await parseTemplate(content);
     * } catch (error) {
     *     logger.error('Template parsing failed', error, {
     *         templateName: 'user-profile',
     *         fileUri: document.uri.toString()
     *     });
     * }
     * ```
     */
    error(message: string, error?: Error, data?: Record<string, unknown>): void;

    /**
     * 记录严重错误
     *
     * 用于记录可能导致系统崩溃或严重功能故障的错误。
     *
     * @param message - 日志消息
     * @param error - 错误对象（可选）
     * @param data - 附加的结构化数据（可选）
     *
     * @example
     * ```typescript
     * logger.fatal('Service container initialization failed', error, {
     *     services: failedServices,
     *     canRecover: false
     * });
     * ```
     */
    fatal(message: string, error?: Error, data?: Record<string, unknown>): void;

    /**
     * 创建子日志记录器
     *
     * 创建带有特定分类的子记录器，用于组织和过滤日志。
     * 子记录器继承父记录器的配置和输出目标。
     *
     * @param category - 日志分类名称（通常是模块或类名）
     * @returns 新的日志记录器实例
     *
     * @example
     * ```typescript
     * const serviceLogger = logger.createChild('TemplateService');
     * serviceLogger.info('Service started'); // 输出: [TemplateService] Service started
     *
     * const parserLogger = serviceLogger.createChild('Parser');
     * parserLogger.debug('Parsing...'); // 输出: [TemplateService.Parser] Parsing...
     * ```
     */
    createChild(category: string): ILogger;

    /**
     * 设置日志级别
     *
     * 设置最小输出级别，低于此级别的日志将被过滤。
     *
     * @param level - 新的日志级别
     *
     * @example
     * ```typescript
     * // 开发环境：输出所有日志
     * logger.setLevel(LogLevel.DEBUG);
     *
     * // 生产环境：只输出重要日志
     * logger.setLevel(LogLevel.INFO);
     * ```
     */
    setLevel(level: LogLevel): void;

    /**
     * 获取当前日志级别
     *
     * @returns 当前的日志级别
     *
     * @example
     * ```typescript
     * const currentLevel = logger.getLevel();
     * if (currentLevel === LogLevel.DEBUG) {
     *     console.log('Debug logging is enabled');
     * }
     * ```
     */
    getLevel(): LogLevel;
}

/**
 * 日志输出目标接口
 *
 * 定义日志输出目标的标准接口，支持多种输出方式。
 *
 * @remarks
 * 常见的输出目标包括：
 * - 控制台输出（ConsoleLogTarget）
 * - 文件输出（FileLogTarget）
 * - VSCode 输出通道（OutputChannelLogTarget）
 * - 远程日志服务（RemoteLogTarget）
 *
 * @example
 * ```typescript
 * class CustomLogTarget implements ILogTarget {
 *     async write(entry: ILogEntry): Promise<void> {
 *         // 自定义日志处理逻辑
 *         console.log(`[${entry.level}] ${entry.message}`);
 *     }
 *
 *     async dispose(): Promise<void> {
 *         // 清理资源
 *     }
 * }
 *
 * // 添加到日志记录器
 * logger.addTarget(new CustomLogTarget());
 * ```
 */
export interface ILogTarget {
    /**
     * 写入日志条目
     *
     * 将日志条目写入到输出目标，实现类负责格式化和实际的输出操作。
     *
     * @param entry - 日志条目
     * @returns Promise，表示写入操作完成
     *
     * @remarks
     * - 此方法应该是异步的以避免阻塞
     * - 实现应该处理写入失败的情况
     * - 建议实现批量写入以提高性能
     */
    write(entry: ILogEntry): Promise<void>;

    /**
     * 清理资源
     *
     * 关闭文件句柄、网络连接等资源。
     * 在应用关闭或移除输出目标时调用。
     *
     * @returns Promise，表示清理操作完成
     *
     * @example
     * ```typescript
     * // 应用关闭时清理所有日志目标
     * for (const target of logTargets) {
     *     await target.dispose();
     * }
     * ```
     */
    dispose(): Promise<void>;
}
