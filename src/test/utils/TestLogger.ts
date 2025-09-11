/**
 * 测试日志管理工具类
 * 
 * 提供测试期间的日志控制功能，可以隐藏不必要的输出，美化错误信息。
 */
export class TestLogger {
    private static originalConsole: {
        log: typeof console.log;
        error: typeof console.error;
        warn: typeof console.warn;
        info: typeof console.info;
    } = {
        log: console.log,
        error: console.error,
        warn: console.warn,
        info: console.info
    };

    // 环境变量控制标志（保留用于未来扩展）
    // private static isVerbose = process.env.TEST_VERBOSE === 'true';
    // private static isSilent = process.env.TEST_SILENT === 'true';

    /**
     * 静默模式 - 隐藏所有 console 输出
     */
    static enableSilentMode(): void {
        console.log = () => {};
        console.error = () => {};
        console.warn = () => {};
        console.info = () => {};
    }

    /**
     * 详细模式 - 显示所有输出
     */
    static enableVerboseMode(): void {
        console.log = TestLogger.originalConsole.log;
        console.error = TestLogger.originalConsole.error;
        console.warn = TestLogger.originalConsole.warn;
        console.info = TestLogger.originalConsole.info;
    }

    /**
     * 测试模式 - 只显示测试相关的关键信息
     */
    static enableTestMode(): void {
        // 过滤所有输出，只保留我们的测试日志
        console.log = (...args: any[]) => {
            const message = args.join(' ');
            if (TestLogger.shouldShowLog(message)) {
                TestLogger.originalConsole.log(...args);
            }
        };
        
        console.info = (...args: any[]) => {
            const message = args.join(' ');
            if (TestLogger.shouldShowInfo(message)) {
                TestLogger.originalConsole.info(...args);
            }
        };
        
        console.error = (...args: any[]) => {
            const message = args.join(' ');
            if (TestLogger.shouldShowError(message)) {
                TestLogger.originalConsole.error(...args);
            }
        };
        
        console.warn = (...args: any[]) => {
            const message = args.join(' ');
            if (TestLogger.shouldShowWarning(message)) {
                TestLogger.originalConsole.warn(...args);
            }
        };
    }

    /**
     * 智能模式 - 只显示重要信息
     */
    static enableSmartMode(): void {
        // 隐藏常规日志，但保留错误和警告
        console.log = (...args: any[]) => {
            const message = args.join(' ');
            if (TestLogger.shouldShowLog(message)) {
                TestLogger.originalConsole.log(...args);
            }
        };
        
        console.info = (...args: any[]) => {
            const message = args.join(' ');
            if (TestLogger.shouldShowInfo(message)) {
                TestLogger.originalConsole.info(...args);
            }
        };
        
        // 美化错误输出
        console.error = (...args: any[]) => {
            const message = args.join(' ');
            if (TestLogger.shouldShowError(message)) {
                TestLogger.originalConsole.error('❌', TestLogger.formatError(message));
            }
        };

        // 美化警告输出
        console.warn = (...args: any[]) => {
            const message = args.join(' ');
            if (TestLogger.shouldShowWarning(message)) {
                TestLogger.originalConsole.warn('⚠️', TestLogger.formatWarning(message));
            }
        };
    }

    /**
     * 恢复原始 console 方法
     */
    static restore(): void {
        console.log = TestLogger.originalConsole.log;
        console.error = TestLogger.originalConsole.error;
        console.warn = TestLogger.originalConsole.warn;
        console.info = TestLogger.originalConsole.info;
    }

    /**
     * 测试专用的格式化日志
     */
    static testLog(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info'): void {
        // 测试日志总是显示，不受静默模式影响

        const icons = {
            info: 'ℹ️',
            success: '✅',
            error: '❌',
            warn: '⚠️'
        };

        const colors = {
            info: '\x1b[36m',    // cyan
            success: '\x1b[32m', // green
            error: '\x1b[31m',   // red
            warn: '\x1b[33m'     // yellow
        };

        const reset = '\x1b[0m';
        const formatted = `${colors[type]}${icons[type]} ${message}${reset}`;
        
        TestLogger.originalConsole.log(formatted);
    }

    /**
     * 判断是否应该显示常规日志信息
     */
    private static shouldShowLog(message: string): boolean {
        // 隐藏 VS Code 调试器信息
        if (message.includes('Debugger attached') || message.includes('Waiting for the debugger')) {
            return false;
        }
        
        // 隐藏扩展激活信息
        if (message.includes('Congratulations, your extension') || message.includes('is now active')) {
            return false;
        }
        
        // 隐藏模板解析的详细调试信息
        if (message.includes('Processing template:') || 
            message.includes('Template definition:') || 
            message.includes('Parameter result for') ||
            message.includes('Parsing template definition:') ||
            message.includes('Found parameter match:') ||
            message.includes('Parsed parameters:') ||
            message.includes('JSON.stringify failed, trying string processing:')) {
            return false;
        }
        
        // 隐藏完成提供者的调试信息
        if (message.includes('Completion triggered:') || 
            message.includes('All templates in cache:') ||
            (message.includes('Found') && message.includes('matching templates')) ||
            message.includes('No templates found in cache')) {
            return false;
        }
        
        // 隐藏模板缓存重建信息
        if (message.includes('Starting template cache rebuild') || 
            message.includes('Template cache rebuild completed') ||
            message.includes('No YAML files found in workspace') ||
            message.includes('Found') && message.includes('YAML files to scan') ||
            message.includes('YAML files:') ||
            message.includes('CraftEngine cache rebuilt') ||
            message.includes('Parsed') && message.includes('templates from') ||
            message.includes('Templates:') ||
            message.includes('No templates found in')) {
            return false;
        }
        
        // 隐藏扩展相关的信息
        if (message.includes('Loading development extension') ||
            message.includes('Started local extension host')) {
            return false;
        }

        return true;
    }

    /**
     * 判断是否应该显示信息日志
     */
    private static shouldShowInfo(message: string): boolean {
        // 隐藏 VS Code 内部信息
        if (message.includes('update#setState disabled') || 
            message.includes('update#ctor - updates are disabled') ||
            message.includes('extensionEnabledApiProposals') ||
            message.includes('ChatSessionStore: Migrating') ||
            message.includes('Settings Sync: Account status')) {
            return false;
        }
        
        // 隐藏扩展相关的信息
        if (message.includes('Loading development extension') ||
            message.includes('Started local extension host')) {
            return false;
        }

        return true;
    }

    /**
     * 判断是否应该显示错误信息
     */
    private static shouldShowError(message: string): boolean {
        // 隐藏 YAML 解析的详细堆栈信息
        if (message.includes('YAMLParseError') && message.includes('node_modules')) {
            return false;
        }
        
        // 隐藏扩展主机相关的详细错误
        if (message.includes('Extension host') && message.includes('pid')) {
            return false;
        }

        // 隐藏 Red Hat YAML 扩展相关警告
        if (message.includes('Red Hat YAML extension not found')) {
            return false;
        }
        
        // 隐藏 Electron 相关的错误
        if (message.includes('NODE_OPTIONs are not supported in packaged apps')) {
            return false;
        }

        return true;
    }

    /**
     * 判断是否应该显示警告信息
     */
    private static shouldShowWarning(message: string): boolean {
        // 隐藏 VS Code 内部警告
        if (message.includes('extensionEnabledApiProposals')) {
            return false;
        }

        // 隐藏更新相关警告
        if (message.includes('update#setState disabled')) {
            return false;
        }
        
        // 隐藏扩展相关的警告
        if (message.includes('Via \'product.json#extensionEnabledApiProposals\'')) {
            return false;
        }

        return true;
    }

    /**
     * 格式化错误信息
     */
    private static formatError(message: string): string {
        // 提取关键错误信息
        if (message.includes('YAMLParseError')) {
            const match = message.match(/YAMLParseError:\s*(.+?)(?:\s+at\s|$)/);
            if (match) {
                return `YAML Parse Error: ${match[1].trim()}`;
            }
        }

        // 提取断言错误的关键信息
        if (message.includes('AssertionError')) {
            const lines = message.split('\n');
            const errorLine = lines.find(line => line.includes('AssertionError'));
            if (errorLine) {
                return errorLine.trim();
            }
        }

        return message;
    }

    /**
     * 格式化警告信息
     */
    private static formatWarning(message: string): string {
        // 简化长警告信息
        if (message.length > 100) {
            return message.substring(0, 97) + '...';
        }
        return message;
    }

    /**
     * 临时抑制特定函数的输出
     */
    static suppressOutput<T>(fn: () => T): T {
        const originalError = console.error;
        const originalWarn = console.warn;
        const originalLog = console.log;

        console.error = () => {};
        console.warn = () => {};
        console.log = () => {};

        try {
            return fn();
        } finally {
            console.error = originalError;
            console.warn = originalWarn;
            console.log = originalLog;
        }
    }

    /**
     * 异步版本的输出抑制
     */
    static async suppressOutputAsync<T>(fn: () => Promise<T>): Promise<T> {
        const originalError = console.error;
        const originalWarn = console.warn;
        const originalLog = console.log;

        console.error = () => {};
        console.warn = () => {};
        console.log = () => {};

        try {
            return await fn();
        } finally {
            console.error = originalError;
            console.warn = originalWarn;
            console.log = originalLog;
        }
    }
}
