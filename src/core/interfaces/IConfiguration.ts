/**
 * 配置变更事件
 *
 * 当配置项发生变更时触发的事件对象。
 *
 * @remarks
 * 配置变更事件包含完整的变更信息，用于：
 * - 追踪配置历史
 * - 触发依赖配置的组件更新
 * - 审计配置变更
 * - 实现配置回滚
 *
 * @example
 * ```typescript
 * config.onChange((event) => {
 *     console.log(`Config "${event.key}" changed`);
 *     console.log(`From: ${event.oldValue} To: ${event.newValue}`);
 *     console.log(`At: ${event.timestamp}`);
 * });
 * ```
 */
/** 配置值类型 - 支持的配置值类型 */
export type ConfigurationValue =
    | string
    | number
    | boolean
    | null
    | undefined
    | ConfigurationValue[]
    | { [key: string]: ConfigurationValue };

export interface IConfigurationChangeEvent {
    /** 配置键，支持点号分隔的嵌套路径 */
    key: string;
    /** 变更前的值 */
    oldValue: ConfigurationValue;
    /** 变更后的值 */
    newValue: ConfigurationValue;
    /** 变更发生的时间戳 */
    timestamp: Date;
}

/**
 * 配置管理器接口
 *
 * 提供统一的配置访问和管理，支持配置变更监听和验证。
 * 是应用程序配置的中心化管理接口。
 *
 * @remarks
 * **核心功能**：
 *
 * 1. **配置访问**
 *    - 支持嵌套路径访问（点号分隔）
 *    - 类型安全的泛型支持
 *    - 默认值处理
 *
 * 2. **配置修改**
 *    - 异步保存机制
 *    - 自动触发变更事件
 *    - 配置验证
 *
 * 3. **变更监听**
 *    - 实时配置变更通知
 *    - 支持多个监听器
 *    - 可取消的订阅
 *
 * 4. **配置验证**
 *    - 自定义验证规则
 *    - 批量验证
 *    - 错误收集
 *
 * **使用场景**：
 * - VSCode 扩展设置管理
 * - 用户偏好设置
 * - 运行时配置调整
 * - 功能开关控制
 *
 * @example
 * ```typescript
 * // 获取配置
 * const maxResults = config.get<number>('templates.maxResults', 50);
 * const enableCache = config.get<boolean>('templates.cache.enabled', true);
 *
 * // 修改配置
 * await config.set('templates.maxResults', 100);
 *
 * // 监听变更
 * const unsubscribe = config.onChange((event) => {
 *     if (event.key === 'templates.maxResults') {
 *         updateSearchLimit(event.newValue);
 *     }
 * });
 *
 * // 验证配置
 * const errors = await config.validate();
 * if (errors.length > 0) {
 *     console.error('Configuration validation failed:', errors);
 * }
 *
 * // 取消监听
 * unsubscribe();
 * ```
 */
export interface IConfiguration {
    /**
     * 获取配置值
     *
     * @typeParam T - 配置值的类型
     * @param key - 配置键，支持点分隔的嵌套路径（如 'templates.maxResults'）
     * @param defaultValue - 当配置不存在时返回的默认值
     * @returns 配置值或默认值
     *
     * @remarks
     * - 支持类型推断，使用泛型指定返回类型
     * - 路径不存在时返回 defaultValue
     * - 支持深层嵌套路径访问
     *
     * @example
     * ```typescript
     * // 基本用法
     * const logLevel = config.get<string>('logging.level', 'info');
     *
     * // 嵌套路径
     * const cacheSize = config.get<number>('templates.cache.maxSize', 1000);
     *
     * // 复杂类型
     * const thresholds = config.get<Record<string, number>>('performance.thresholds', {
     *     completion: 100,
     *     hover: 50
     * });
     * ```
     */
    get<T = ConfigurationValue>(key: string, defaultValue?: T): T;

    /**
     * 设置配置值
     *
     * @param key - 配置键，支持点分隔的嵌套路径
     * @param value - 要设置的配置值
     * @returns Promise，在配置保存完成后resolve
     *
     * @remarks
     * - 异步操作，确保配置持久化
     * - 自动触发 onChange 事件
     * - 支持创建嵌套路径
     *
     * @example
     * ```typescript
     * // 设置简单值
     * await config.set('templates.autoCompletion', true);
     *
     * // 设置嵌套值
     * await config.set('templates.cache.ttl', 300000);
     *
     * // 设置复杂对象
     * await config.set('templates.searchOptions', {
     *     fuzzy: true,
     *     caseSensitive: false,
     *     maxResults: 50
     * });
     * ```
     */
    set(key: string, value: ConfigurationValue): Promise<void>;

    /**
     * 检查配置键是否存在
     *
     * @param key - 配置键
     * @returns 如果配置存在返回 true，否则返回 false
     *
     * @remarks
     * 用于区分配置不存在和配置值为 undefined 的情况
     *
     * @example
     * ```typescript
     * if (config.has('templates.customPath')) {
     *     const path = config.get<string>('templates.customPath');
     *     // 使用自定义路径
     * } else {
     *     // 使用默认路径
     * }
     * ```
     */
    has(key: string): boolean;

    /**
     * 删除配置项
     *
     * @param key - 要删除的配置键
     * @returns Promise，在配置删除完成后resolve
     *
     * @remarks
     * - 删除后触发 onChange 事件（newValue 为 undefined）
     * - 删除不存在的键不会抛出错误
     *
     * @example
     * ```typescript
     * // 删除配置项
     * await config.delete('templates.customPath');
     *
     * // 验证删除
     * console.log(config.has('templates.customPath')); // false
     * ```
     */
    delete(key: string): Promise<void>;

    /**
     * 获取所有配置
     *
     * @returns 包含所有配置的对象
     *
     * @remarks
     * - 返回配置的深拷贝，避免直接修改
     * - 包含所有嵌套配置
     * - 用于配置导出和备份
     *
     * @example
     * ```typescript
     * // 获取所有配置
     * const allConfig = config.getAll();
     * console.log(allConfig);
     *
     * // 配置导出
     * const configBackup = JSON.stringify(config.getAll(), null, 2);
     * fs.writeFileSync('config-backup.json', configBackup);
     * ```
     */
    getAll(): Record<string, ConfigurationValue>;

    /**
     * 监听配置变更
     *
     * @param callback - 配置变更时调用的回调函数
     * @returns 取消监听的函数
     *
     * @remarks
     * - 回调函数接收 IConfigurationChangeEvent 参数
     * - 支持注册多个监听器
     * - 返回的函数用于取消监听
     * - 组件销毁时应该取消监听避免内存泄漏
     *
     * @example
     * ```typescript
     * // 注册监听器
     * const unsubscribe = config.onChange((event) => {
     *     console.log(`Config changed: ${event.key}`);
     *
     *     // 处理特定配置的变更
     *     if (event.key.startsWith('templates.')) {
     *         handleTemplateConfigChange(event);
     *     }
     * });
     *
     * // 在组件销毁时取消监听
     * dispose() {
     *     unsubscribe();
     * }
     * ```
     */
    onChange(callback: (event: IConfigurationChangeEvent) => void): () => void;

    /**
     * 验证配置
     *
     * @returns Promise，resolve 为验证错误列表（空数组表示验证通过）
     *
     * @remarks
     * - 执行所有注册的验证规则
     * - 返回所有验证错误
     * - 不会修改配置
     *
     * @example
     * ```typescript
     * // 验证当前配置
     * const errors = await config.validate();
     *
     * if (errors.length > 0) {
     *     console.error('配置验证失败：');
     *     errors.forEach(error => console.error(`  - ${error}`));
     *
     *     // 显示错误提示
     *     vscode.window.showErrorMessage(
     *         `配置验证失败: ${errors.join(', ')}`
     *     );
     * } else {
     *     console.log('配置验证通过');
     * }
     * ```
     */
    validate(): Promise<string[]>;

    /**
     * 重载配置
     *
     * @returns Promise，在配置重载完成后resolve
     *
     * @remarks
     * - 从配置提供者重新加载配置
     * - 触发所有已变更配置的 onChange 事件
     * - 用于同步外部配置变更
     *
     * @example
     * ```typescript
     * // 手动重载配置
     * await config.reload();
     *
     * // 在配置文件变更时重载
     * fileWatcher.onChange(async () => {
     *     console.log('配置文件已变更，重新加载...');
     *     await config.reload();
     *     console.log('配置已重载');
     * });
     * ```
     */
    reload(): Promise<void>;
}

/**
 * 配置提供者接口
 *
 * 定义配置的加载、保存和监听机制的抽象接口。
 * 不同的配置源（如文件、数据库、远程服务）可实现此接口。
 *
 * @remarks
 * **实现场景**：
 *
 * 1. **VSCodeConfigurationProvider**
 *    - 从 VSCode 设置中加载配置
 *    - 使用 VSCode API 保存配置
 *    - 监听 VSCode 设置变更
 *
 * 2. **FileConfigurationProvider**
 *    - 从 JSON/YAML 文件加载
 *    - 保存到配置文件
 *    - 使用文件监控器监听变更
 *
 * 3. **RemoteConfigurationProvider**
 *    - 从远程服务加载配置
 *    - 同步到远程服务
 *    - 使用轮询或 WebSocket 监听变更
 *
 * @example
 * ```typescript
 * // VSCode 配置提供者实现
 * export class VSCodeConfigurationProvider implements IConfigurationProvider {
 *     async load(): Promise<Record<string, any>> {
 *         const config = vscode.workspace.getConfiguration('craftengine');
 *         return {
 *             templates: config.get('templates'),
 *             logging: config.get('logging'),
 *             performance: config.get('performance')
 *         };
 *     }
 *
 *     async save(config: Record<string, any>): Promise<void> {
 *         const vscodeConfig = vscode.workspace.getConfiguration('craftengine');
 *         for (const [key, value] of Object.entries(config)) {
 *             await vscodeConfig.update(key, value, true);
 *         }
 *     }
 *
 *     watch(callback: () => void): () => void {
 *         const disposable = vscode.workspace.onDidChangeConfiguration((e) => {
 *             if (e.affectsConfiguration('craftengine')) {
 *                 callback();
 *             }
 *         });
 *         return () => disposable.dispose();
 *     }
 * }
 *
 * // 使用配置提供者
 * const provider = new VSCodeConfigurationProvider();
 * const logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger);
 * const config = new ConfigurationManager(provider, logger);
 * await config.initialize();
 * ```
 */
export interface IConfigurationProvider {
    /**
     * 加载配置
     *
     * @returns Promise，resolve 为配置对象
     *
     * @remarks
     * - 从配置源读取所有配置
     * - 返回的对象应该包含完整的配置结构
     * - 加载失败应该抛出异常
     */
    load(): Promise<Record<string, ConfigurationValue>>;

    /**
     * 保存配置
     *
     * @param config - 要保存的配置对象
     * @returns Promise，在保存完成后resolve
     *
     * @remarks
     * - 将配置持久化到配置源
     * - 应该是原子操作或使用事务
     * - 保存失败应该抛出异常并回滚
     */
    save(config: Record<string, ConfigurationValue>): Promise<void>;

    /**
     * 监听配置文件变更
     *
     * @param callback - 配置变更时调用的回调函数
     * @returns 取消监听的函数
     *
     * @remarks
     * - 监听外部对配置的修改
     * - 回调函数应该在配置变更时立即调用
     * - 返回的函数用于停止监听
     */
    watch(callback: () => void): () => void;
}
