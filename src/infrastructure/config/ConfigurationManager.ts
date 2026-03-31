import { workspace, type ConfigurationChangeEvent } from 'vscode';
import {
    type IConfiguration,
    type IConfigurationChangeEvent,
    type IConfigurationProvider,
    type ConfigurationValue,
} from '../../core/interfaces/IConfiguration';
import { type ILogger } from '../../core/interfaces/ILogger';
import { ConfigurationError } from '../../core/errors/ExtensionErrors';

/**
 * VSCode 配置提供者
 *
 * 作为配置数据的具体提供者，负责从 VSCode 的配置系统中加载、保存和监听配置变更。
 *
 * @remarks
 * 该提供者实现了 IConfigurationProvider 接口，将 VSCode 的配置 API 封装为统一接口。
 *
 * **配置范围**：
 * - 扩展命名空间：`craftengine.*`
 * - 支持工作区和用户级别配置
 * - 配置修改会自动同步到 VSCode
 *
 * **配置监听**：
 * - 监听 `craftengine` 命名空间的配置变更
 * - 自动触发配置重新加载
 * - 支持多个监听器
 *
 * @example
 * ```typescript
 * const provider = new VSCodeConfigurationProvider();
 *
 * // 加载配置
 * const config = await provider.load();
 * console.log(config['templates.autoCompletion']);
 *
 * // 保存配置
 * await provider.save({ 'templates.autoCompletion': true });
 *
 * // 监听变更
 * const unwatch = provider.watch(() => {
 *     console.log('Configuration changed');
 * });
 * ```
 */
export class VSCodeConfigurationProvider implements IConfigurationProvider {
    /**
     * 加载配置
     *
     * 从 VSCode 配置系统中加载所有 `craftengine` 命名空间的配置项。
     *
     * @returns 配置对象，键值对形式
     *
     * @remarks
     * - 只加载非函数属性
     * - 自动过滤 VSCode API 方法
     * - 返回扁平化的配置对象
     *
     * @example
     * ```typescript
     * const config = await provider.load();
     * // {
     * //   'templates.autoCompletion': true,
     * //   'schema.customCompletion.enabled': true,
     * //   ...
     * // }
     * ```
     */
    async load(): Promise<Record<string, ConfigurationValue>> {
        const config = workspace.getConfiguration('craftengine');
        const result: Record<string, ConfigurationValue> = {};

        // 获取所有配置项
        for (const key of Object.keys(config)) {
            const value = config[key] as ConfigurationValue;
            if (typeof value !== 'function') {
                result[key] = value;
            }
        }

        return result;
    }

    async save(config: Record<string, ConfigurationValue>): Promise<void> {
        const workspaceConfig = workspace.getConfiguration('craftengine');

        for (const [key, value] of Object.entries(config)) {
            await workspaceConfig.update(key, value);
        }
    }

    watch(callback: () => void): () => void {
        const disposable = workspace.onDidChangeConfiguration((event: ConfigurationChangeEvent) => {
            if (event.affectsConfiguration('craftengine')) {
                callback();
            }
        });

        return () => disposable.dispose();
    }
}

/**
 * 配置管理器实现
 *
 * 作为应用程序的配置管理中心，提供配置的加载、访问、修改和变更监听功能。
 * 支持嵌套路径访问、默认值、配置验证和变更通知。
 *
 * @remarks
 * **核心功能**：
 *
 * 1. **配置访问**
 *    - 支持点号路径访问：`get('templates.autoCompletion')`
 *    - 支持默认值：`get('key', defaultValue)`
 *    - 类型安全：泛型参数指定返回类型
 *
 * 2. **配置修改**
 *    - 支持嵌套路径设置：`set('templates.autoCompletion', true)`
 *    - 自动保存到配置提供者
 *    - 触发变更事件通知监听器
 *
 * 3. **变更监听**
 *    - 注册监听器接收变更通知
 *    - 监听器收到旧值和新值
 *    - 支持特定键或全局监听
 *
 * 4. **配置重载**
 *    - 手动重载配置
 *    - 配置文件变更时自动重载
 *    - 重载后触发变更事件
 *
 * 5. **配置验证**
 *    - 验证配置值的合法性
 *    - 支持自定义验证规则
 *    - 验证失败抛出 ConfigurationError
 *
 * **嵌套路径访问**：
 * ```typescript
 * // 配置对象：
 * {
 *   templates: {
 *     autoCompletion: true,
 *     maxResults: 10
 *   }
 * }
 *
 * // 访问：
 * config.get('templates.autoCompletion'); // true
 * config.get('templates.maxResults'); // 10
 * ```
 *
 * **生命周期**：
 * 1. 构造：创建管理器，设置监听器
 * 2. 初始化：加载初始配置
 * 3. 运行时：响应配置变更
 * 4. 清理：释放资源，停止监听
 *
 * @example
 * ```typescript
 * // 创建配置管理器
 * const provider = new VSCodeConfigurationProvider();
 * const logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger);
 * const config = new ConfigurationManager(provider, logger);
 * await config.initialize();
 *
 * // 获取配置
 * const autoComplete = config.get<boolean>('templates.autoCompletion', true);
 * const maxResults = config.get<number>('templates.maxResults', 50);
 *
 * // 修改配置
 * await config.set('templates.autoCompletion', false);
 *
 * // 监听变更
 * config.onChange((event) => {
 *     console.log(`Config changed: ${event.key}`);
 *     console.log(`Old: ${event.oldValue}, New: ${event.newValue}`);
 * });
 *
 * // 验证配置
 * config.validate('templates.maxResults', (value) => {
 *     return typeof value === 'number' && value > 0;
 * }, 'Max results must be a positive number');
 *
 * // 重新加载
 * await config.reload();
 *
 * // 清理
 * config.dispose();
 * ```
 */
export class ConfigurationManager implements IConfiguration {
    /** 配置数据缓存 */
    private config: Record<string, ConfigurationValue> = {};
    /** 配置变更监听器列表 */
    private listeners: ((event: IConfigurationChangeEvent) => void)[] = [];
    /** 配置监视器清理函数列表 */
    private watchers: (() => void)[] = [];
    /** 配置管理器是否已释放 */
    private disposed = false;

    /**
     * 构造配置管理器实例
     *
     * @param provider - 配置提供者，负责实际的配置加载和保存
     * @param logger - 日志记录器，用于记录配置管理相关的日志
     *
     * @remarks
     * 构造函数会自动设置配置监视器，监听配置提供者的变更。
     */
    constructor(
        private readonly provider: IConfigurationProvider,
        private readonly logger: ILogger,
    ) {
        this.setupWatcher();
    }

    /**
     * 初始化配置管理器
     *
     * 从配置提供者加载初始配置数据。
     *
     * @returns Promise，表示初始化完成
     *
     * @remarks
     * 该方法应该在扩展激活时调用，确保配置在使用前已加载。
     *
     * @example
     * ```typescript
     * const provider = new VSCodeConfigurationProvider();
     * const logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger);
     * const config = new ConfigurationManager(provider, logger);
     * await config.initialize();
     * ```
     */
    async initialize(): Promise<void> {
        await this.reload();
    }

    /**
     * 获取配置值
     *
     * 通过键路径获取配置值，支持点号分隔的嵌套路径。
     *
     * @typeParam T - 配置值的类型
     * @param key - 配置键路径，支持点号分隔（如 `'templates.autoCompletion'`）
     * @param defaultValue - 默认值，当配置不存在时返回
     * @returns 配置值或默认值
     *
     * @remarks
     * - 支持深度嵌套路径访问
     * - 如果路径不存在且未提供默认值，返回 undefined
     * - 类型参数 T 用于类型推断，但不会验证实际类型
     *
     * @example
     * ```typescript
     * // 获取布尔配置
     * const autoComplete = config.get<boolean>('templates.autoCompletion', true);
     *
     * // 获取数字配置
     * const maxResults = config.get<number>('templates.maxResults', 50);
     *
     * // 获取对象配置
     * const templates = config.get<TemplateConfig>('templates');
     *
     * // 嵌套访问
     * const value = config.get('level1.level2.level3', 'default');
     * ```
     */
    get<T = ConfigurationValue>(key: string, defaultValue?: T): T {
        this.ensureNotDisposed();

        const value = this.getNestedValue(this.config, key);
        return (value !== undefined ? value : defaultValue) as T;
    }

    async set(key: string, value: ConfigurationValue): Promise<void> {
        this.ensureNotDisposed();

        const oldValue = this.get(key);

        // 更新本地配置
        this.setNestedValue(this.config, key, value);

        try {
            // 保存到提供者
            await this.provider.save({ [key]: value });

            // 触发变更事件
            this.notifyChange(key, oldValue, value);
        } catch (error) {
            // 回滚本地更改
            this.setNestedValue(this.config, key, oldValue);
            throw new ConfigurationError(
                `Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`,
                { key, value, error },
            );
        }
    }

    has(key: string): boolean {
        this.ensureNotDisposed();
        return this.getNestedValue(this.config, key) !== undefined;
    }

    async delete(key: string): Promise<void> {
        this.ensureNotDisposed();

        const oldValue = this.get(key);

        // 从本地配置删除
        this.deleteNestedValue(this.config, key);

        try {
            // 从提供者删除（设置为 undefined）
            await this.provider.save({ [key]: undefined });

            // 触发变更事件
            this.notifyChange(key, oldValue, undefined);
        } catch (error) {
            // 回滚本地更改
            this.setNestedValue(this.config, key, oldValue);
            throw new ConfigurationError(
                `Failed to delete configuration: ${error instanceof Error ? error.message : String(error)}`,
                { key, error },
            );
        }
    }

    getAll(): Record<string, ConfigurationValue> {
        this.ensureNotDisposed();
        return { ...this.config };
    }

    onChange(callback: (event: IConfigurationChangeEvent) => void): () => void {
        this.ensureNotDisposed();

        this.listeners.push(callback);

        return () => {
            const index = this.listeners.indexOf(callback);
            if (index !== -1) {
                this.listeners.splice(index, 1);
            }
        };
    }

    async validate(): Promise<string[]> {
        this.ensureNotDisposed();

        const errors: string[] = [];

        // 验证配置值类型（只验证已存在的配置项）
        const typeValidations: Record<string, string> = {
            'files.exclude': 'string',
            'templates.autoCompletion': 'boolean',
            'diagnostics.enabled': 'boolean',
            'performance.monitoring': 'boolean',
            'logging.level': 'string',
        };

        for (const [key, expectedType] of Object.entries(typeValidations)) {
            if (this.has(key)) {
                const value = this.get(key);
                const actualType = typeof value;
                if (actualType !== expectedType) {
                    errors.push(`Invalid type for ${key}: expected ${expectedType}, got ${actualType}`);
                }
            }
        }

        // 验证枚举值
        const enumValidations: Record<string, string[]> = {
            'logging.level': ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
            'validation.level': ['strict', 'loose', 'off'],
        };

        for (const [key, allowedValues] of Object.entries(enumValidations)) {
            if (this.has(key)) {
                const value = this.get<string>(key);
                if (!allowedValues.includes(value)) {
                    errors.push(`Invalid value for ${key}: ${value}. Allowed values: ${allowedValues.join(', ')}`);
                }
            }
        }

        return errors;
    }

    async reload(): Promise<void> {
        this.ensureNotDisposed();

        try {
            const newConfig = await this.provider.load();
            const oldConfig = this.config;
            this.config = newConfig;

            // 检查变更并通知
            this.detectAndNotifyChanges(oldConfig, newConfig);
        } catch (error) {
            throw new ConfigurationError(
                `Failed to reload configuration: ${error instanceof Error ? error.message : String(error)}`,
                { error },
            );
        }
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }

        // 清理监听器
        this.listeners.length = 0;

        // 清理文件监听器
        this.watchers.forEach((unwatch) => unwatch());
        this.watchers.length = 0;

        this.disposed = true;
    }

    /**
     * 设置文件监听器
     */
    private setupWatcher(): void {
        const unwatch = this.provider.watch(() => {
            this.reload().catch((error) => {
                // 使用 Logger 记录配置重载失败
                this.logger.error('Failed to reload configuration after file change', error, {
                    errorMessage: error instanceof Error ? error.message : String(error),
                });
            });
        });

        this.watchers.push(unwatch);
    }

    /**
     * 获取嵌套值
     */
    private getNestedValue(obj: Record<string, ConfigurationValue>, path: string): ConfigurationValue {
        const keys = path.split('.');
        let current: ConfigurationValue = obj;

        for (const key of keys) {
            if (current === null || current === undefined || typeof current !== 'object' || Array.isArray(current)) {
                return undefined;
            }
            current = (current as Record<string, ConfigurationValue>)[key];
        }

        return current;
    }

    /**
     * 设置嵌套值
     */
    private setNestedValue(obj: Record<string, ConfigurationValue>, path: string, value: ConfigurationValue): void {
        const keys = path.split('.');
        const lastKey = keys.pop();
        if (!lastKey) {
            return;
        }
        let current: Record<string, ConfigurationValue> = obj;

        for (const key of keys) {
            if (
                !(key in current) ||
                typeof current[key] !== 'object' ||
                current[key] === null ||
                Array.isArray(current[key])
            ) {
                current[key] = {};
            }
            current = current[key] as Record<string, ConfigurationValue>;
        }

        current[lastKey] = value;
    }

    /**
     * 删除嵌套值
     */
    private deleteNestedValue(obj: Record<string, ConfigurationValue>, path: string): void {
        const keys = path.split('.');
        const lastKey = keys.pop();
        if (!lastKey) {
            return;
        }
        let current: Record<string, ConfigurationValue> = obj;

        for (const key of keys) {
            if (
                !(key in current) ||
                typeof current[key] !== 'object' ||
                current[key] === null ||
                Array.isArray(current[key])
            ) {
                return; // 路径不存在
            }
            current = current[key] as Record<string, ConfigurationValue>;
        }

        delete current[lastKey];
    }

    /**
     * 检测并通知变更
     */
    private detectAndNotifyChanges(
        oldConfig: Record<string, ConfigurationValue>,
        newConfig: Record<string, ConfigurationValue>,
    ): void {
        const allKeys = new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)]);

        for (const key of allKeys) {
            const oldValue = this.getNestedValue(oldConfig, key);
            const newValue = this.getNestedValue(newConfig, key);

            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                this.notifyChange(key, oldValue, newValue);
            }
        }
    }

    /**
     * 通知配置变更
     */
    private notifyChange(key: string, oldValue: ConfigurationValue, newValue: ConfigurationValue): void {
        const event: IConfigurationChangeEvent = {
            key,
            oldValue,
            newValue,
            timestamp: new Date(),
        };

        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (error) {
                // 使用 Logger 记录监听器错误
                this.logger.error('Error in configuration change listener', error as Error, {
                    key,
                    errorMessage: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }

    /**
     * 确保未被释放
     */
    private ensureNotDisposed(): void {
        if (this.disposed) {
            throw new ConfigurationError('Configuration manager has been disposed');
        }
    }
}
