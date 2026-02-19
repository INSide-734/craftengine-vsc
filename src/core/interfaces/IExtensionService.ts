import { EditorExtensionContext } from '../types/EditorTypes';

/**
 * 扩展状态枚举
 * 
 * 定义扩展在其生命周期中可能处于的各种状态。
 * 
 * @remarks
 * **状态转换流程**：
 * ```
 * Inactive → Initializing → Active → Deactivating → Inactive
 *                ↓
 *              Error
 * ```
 * 
 * **状态说明**：
 * - **Initializing**: 扩展正在初始化，加载配置和依赖
 * - **Active**: 扩展已完全激活，所有功能可用
 * - **Deactivating**: 扩展正在停用，清理资源
 * - **Inactive**: 扩展未激活或已停用
 * - **Error**: 扩展遇到错误，部分或全部功能不可用
 * 
 * @example
 * ```typescript
 * const state = extensionService.getState();
 * 
 * switch (state) {
 *     case ExtensionState.Initializing:
 *         console.log('Extension is starting up...');
 *         break;
 *     case ExtensionState.Active:
 *         console.log('Extension is ready');
 *         break;
 *     case ExtensionState.Error:
 *         console.error('Extension encountered an error');
 *         break;
 * }
 * ```
 */
export enum ExtensionState {
    /** 初始化中 - 扩展正在加载和配置 */
    Initializing = 'initializing',
    
    /** 已激活 - 扩展完全运行，所有功能可用 */
    Active = 'active',
    
    /** 停用中 - 扩展正在清理和关闭 */
    Deactivating = 'deactivating',
    
    /** 未激活 - 扩展未启动或已停止 */
    Inactive = 'inactive',
    
    /** 错误状态 - 扩展遇到致命错误 */
    Error = 'error'
}

/**
 * 扩展统计信息
 * 
 * 收集和展示扩展运行时的各项指标和统计数据。
 * 用于性能监控、调试和用户反馈。
 * 
 * @remarks
 * **统计指标用途**：
 * - **性能监控**: 追踪响应时间和资源使用
 * - **使用分析**: 了解功能使用情况
 * - **问题诊断**: 识别性能瓶颈和异常
 * - **用户反馈**: 向用户展示扩展状态
 * 
 * @example
 * ```typescript
 * const stats = extensionService.getStatistics();
 * 
 * console.log(`Uptime: ${stats.uptime / 1000}s`);
 * console.log(`Memory: ${(stats.memoryUsage / 1024 / 1024).toFixed(2)}MB`);
 * console.log(`Cache hit rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`);
 * console.log(`Completions provided: ${stats.completionsProvided}`);
 * 
 * // 性能警告
 * if (stats.cacheHitRate < 0.7) {
 *     logger.warn('Low cache hit rate', { rate: stats.cacheHitRate });
 * }
 * 
 * // 健康检查
 * if (stats.memoryUsage > 50 * 1024 * 1024) {
 *     logger.warn('High memory usage', { 
 *         usage: stats.memoryUsage,
 *         threshold: 50 * 1024 * 1024 
 *     });
 * }
 * ```
 */
export interface IExtensionStatistics {
    /** 激活时间 - 扩展激活的时间戳 */
    activationTime: Date;
    
    /** 运行时长（毫秒） - 扩展已运行的时间 */
    uptime: number;
    
    /** 内存使用（字节） - 当前内存占用 */
    memoryUsage: number;
    
    /** 处理的文档数量 - 已扫描和处理的文档总数 */
    processedDocuments: number;
    
    /** 提供的补全数量 - 已提供的补全项总数 */
    completionsProvided: number;
    
    /** 缓存命中率 - 缓存命中次数 / 总查询次数，范围 0-1（无数据时为 undefined） */
    cacheHitRate?: number;
}

/**
 * 扩展服务接口
 * 
 * 管理扩展的完整生命周期、状态监控和核心功能协调。
 * 作为应用层的核心服务，协调各子模块的初始化和运行。
 * 
 * @remarks
 * **核心职责**：
 * 
 * 1. **生命周期管理**
 *    - 初始化：加载配置、注册服务
 *    - 激活：启动功能模块
 *    - 停用：清理资源、保存状态
 *    - 重启：完整的停用-启动流程
 * 
 * 2. **状态管理**
 *    - 追踪扩展当前状态
 *    - 状态转换通知
 *    - 错误状态处理
 * 
 * 3. **健康监控**
 *    - 定期健康检查
 *    - 性能指标收集
 *    - 异常检测和报告
 * 
 * 4. **模块协调**
 *    - 服务容器管理
 *    - Provider 注册
 *    - 事件总线初始化
 *    - 文件监控启动
 * 
 * **使用场景**：
 * - VSCode 扩展激活/停用
 * - 配置变更响应
 * - 错误恢复处理
 * - 性能监控和调试
 * 
 * @example
 * ```typescript
 * // 在 extension.ts 中使用
 * export async function activate(context: ExtensionContext) {
 *     try {
 *         // 初始化服务容器
 *         await ServiceContainer.initialize();
 *         
 *         // 获取扩展服务
 *         const extensionService = ServiceContainer.getService<IExtensionService>(
 *             SERVICE_TOKENS.ExtensionService
 *         );
 *         
 *         // 初始化扩展
 *         await extensionService.initialize(context);
 *         
 *         // 激活扩展
 *         await extensionService.activate();
 *         
 *         // 等待初始扫描完成
 *         await extensionService.initialScanCompleted;
 *         
 *         // 显示状态
 *         const state = extensionService.getState();
 *         console.log(`Extension state: ${state}`);
 *         
 *         // 显示统计
 *         const stats = extensionService.getStatistics();
 *         console.log(`Activation completed in ${stats.uptime}ms`);
 *         
 *     } catch (error) {
 *         console.error('Failed to activate extension', error);
 *         throw error;
 *     }
 * }
 * 
 * export async function deactivate() {
 *     const extensionService = ServiceContainer.tryGetService<IExtensionService>(
 *         SERVICE_TOKENS.ExtensionService
 *     );
 *     
 *     if (extensionService) {
 *         await extensionService.deactivate();
 *     }
 *     
 *     await ServiceContainer.dispose();
 * }
 * 
 * // 健康检查示例
 * setInterval(async () => {
 *     const healthy = await extensionService.checkHealth();
 *     if (!healthy) {
 *         logger.warn('Extension health check failed');
 *         // 可能需要重启
 *         await extensionService.restart();
 *     }
 * }, 60000); // 每分钟检查
 * ```
 */
export interface IExtensionService {
    /**
     * 初始化扩展
     * 
     * 执行扩展的初始化流程，包括服务注册、配置加载和依赖准备。
     * 
     * @param context - VSCode 扩展上下文，包含扩展路径、订阅管理等
     * @returns Promise，在初始化完成后 resolve
     * 
     * @remarks
     * **初始化步骤**：
     * 1. 加载配置
     * 2. 初始化服务容器
     * 3. 注册所有服务
     * 4. 创建子日志记录器
     * 5. 初始化事件总线
     * 6. 准备文件监控
     * 
     * **注意事项**：
     * - 只应调用一次
     * - 必须在 activate() 之前调用
     * - 失败会抛出 InitializationError
     * 
     * @throws {InitializationError} 当初始化失败时
     * 
     * @example
     * ```typescript
     * export async function activate(context: ExtensionContext) {
     *     const extensionService = new ExtensionService();
     *     
     *     try {
     *         await extensionService.initialize(context);
     *         console.log('Extension initialized successfully');
     *     } catch (error) {
     *         console.error('Initialization failed', error);
     *         throw error;
     *     }
     * }
     * ```
     */
    initialize(context: EditorExtensionContext): Promise<void>;
    
    /**
     * 激活扩展
     * 
     * 启动扩展的所有功能模块，使扩展进入完全可用状态。
     * 
     * @returns Promise，在激活完成后 resolve
     * 
     * @remarks
     * **激活步骤**：
     * 1. 扫描工作区 YAML 文件
     * 2. 加载和解析模板
     * 3. 注册 VSCode Providers
     * 4. 启动文件监控
     * 5. 发布激活事件
     * 
     * **状态转换**：
     * - Initializing → Active（成功）
     * - Initializing → Error（失败）
     * 
     * @throws {Error} 当激活失败时
     * 
     * @example
     * ```typescript
     * await extensionService.initialize(context);
     * await extensionService.activate();
     * 
     * if (extensionService.getState() === ExtensionState.Active) {
     *     console.log('Extension is now active');
     * }
     * ```
     */
    activate(): Promise<void>;
    
    /**
     * 停用扩展
     * 
     * 清理资源并停止扩展的所有功能。
     * 
     * @returns Promise，在停用完成后 resolve
     * 
     * @remarks
     * **停用步骤**：
     * 1. 停止文件监控
     * 2. 取消所有事件订阅
     * 3. 清理缓存
     * 4. 释放所有服务
     * 5. 保存统计信息
     * 
     * **状态转换**：
     * - Active → Deactivating → Inactive
     * 
     * @example
     * ```typescript
     * export async function deactivate() {
     *     const extensionService = ServiceContainer.getService<IExtensionService>(
     *         SERVICE_TOKENS.ExtensionService
     *     );
     *     
     *     await extensionService.deactivate();
     *     console.log('Extension deactivated');
     * }
     * ```
     */
    deactivate(): Promise<void>;
    
    /**
     * 获取扩展状态
     * 
     * 返回扩展当前的运行状态。
     * 
     * @returns 当前扩展状态枚举值
     * 
     * @remarks
     * 用于检查扩展是否可用或诊断问题
     * 
     * @example
     * ```typescript
     * const state = extensionService.getState();
     * 
     * if (state === ExtensionState.Active) {
     *     // 扩展可用，执行操作
     *     await performOperation();
     * } else if (state === ExtensionState.Error) {
     *     // 扩展异常，尝试恢复
     *     await extensionService.restart();
     * }
     * ```
     */
    getState(): ExtensionState;
    
    /**
     * 获取统计信息
     * 
     * 返回扩展运行时的统计数据。
     * 
     * @returns 扩展统计信息对象
     * 
     * @remarks
     * - 统计数据实时计算
     * - 用于性能监控和调试
     * - 可用于生成诊断报告
     * 
     * @example
     * ```typescript
     * const stats = extensionService.getStatistics();
     * 
     * // 生成状态报告
     * const report = {
     *     state: extensionService.getState(),
     *     uptime: `${(stats.uptime / 1000).toFixed(2)}s`,
     *     memory: `${(stats.memoryUsage / 1024 / 1024).toFixed(2)}MB`,
     *     documents: stats.processedDocuments,
     *     completions: stats.completionsProvided,
     *     cacheHitRate: `${(stats.cacheHitRate * 100).toFixed(1)}%`
     * };
     * 
     * console.table(report);
     * 
     * // 性能监控
     * if (stats.memoryUsage > 50 * 1024 * 1024) {
     *     logger.warn('High memory usage detected');
     * }
     * ```
     */
    getStatistics(): IExtensionStatistics;
    
    /**
     * 重启扩展
     * 
     * 执行完整的停用-激活循环，用于错误恢复或配置重载。
     * 
     * @returns Promise，在重启完成后 resolve
     * 
     * @remarks
     * **重启流程**：
     * 1. 调用 deactivate()
     * 2. 清理所有资源
     * 3. 重新初始化服务
     * 4. 调用 activate()
     * 
     * **使用场景**：
     * - 配置重大变更后
     * - 从错误状态恢复
     * - 用户手动触发
     * 
     * @example
     * ```typescript
     * // 配置变更后重启
     * config.onChange(async (event) => {
     *     if (event.key === 'templates.paths') {
     *         logger.info('Template paths changed, restarting extension');
     *         await extensionService.restart();
     *     }
     * });
     * 
     * // 错误恢复
     * if (extensionService.getState() === ExtensionState.Error) {
     *     try {
     *         await extensionService.restart();
     *         logger.info('Extension recovered successfully');
     *     } catch (error) {
     *         logger.error('Failed to recover extension', error);
     *     }
     * }
     * 
     * // 命令触发
     * commands.registerCommand('craftengine.restart', async () => {
     *     await vscode.window.withProgress({
     *         location: vscode.ProgressLocation.Notification,
     *         title: 'Restarting CraftEngine...'
     *     }, async () => {
     *         await extensionService.restart();
     *     });
     * });
     * ```
     */
    restart(): Promise<void>;
    
    /**
     * 检查扩展健康状态
     * 
     * 执行健康检查，验证扩展的关键组件是否正常工作。
     * 
     * @returns Promise<boolean>，健康返回 true，否则返回 false
     * 
     * @remarks
     * **检查项目**：
     * - 服务容器状态
     * - 关键服务可用性
     * - 文件监控运行状态
     * - 内存使用情况
     * - 缓存健康状态
     * 
     * **建议**：
     * - 定期执行（如每分钟）
     * - 失败时记录详细日志
     * - 考虑自动恢复机制
     * 
     * @example
     * ```typescript
     * // 定期健康检查
     * setInterval(async () => {
     *     const healthy = await extensionService.checkHealth();
     *     
     *     if (!healthy) {
     *         logger.warn('Health check failed, attempting recovery');
     *         
     *         try {
     *             await extensionService.restart();
     *             logger.info('Recovery successful');
     *         } catch (error) {
     *             logger.error('Recovery failed', error);
     *             vscode.window.showErrorMessage(
     *                 'CraftEngine encountered an error. Please reload the window.'
     *             );
     *         }
     *     }
     * }, 60000);
     * 
     * // 手动健康检查命令
     * commands.registerCommand('craftengine.checkHealth', async () => {
     *     const healthy = await extensionService.checkHealth();
     *     const stats = extensionService.getStatistics();
     *     
     *     const message = healthy
     *         ? `✓ Extension is healthy\nUptime: ${stats.uptime}ms`
     *         : '✗ Extension is unhealthy';
     *     
     *     vscode.window.showInformationMessage(message);
     * });
     * ```
     */
    checkHealth(): Promise<boolean>;

    /**
     * 初始扫描完成 Promise
     * 
     * 一个在扩展完成初始模板扫描时解析的 Promise。
     * 用于等待扩展完全就绪后再执行依赖扫描结果的操作。
     * 
     * @remarks
     * **使用场景**：
     * - 等待模板加载完成后提供补全
     * - 确保诊断在数据就绪后运行
     * - 延迟执行依赖模板数据的操作
     * 
     * **注意事项**：
     * - 只在首次激活时解析
     * - 扫描失败不会 reject（会记录错误）
     * - 可以安全地多次 await
     * 
     * @example
     * ```typescript
     * export async function activate(context: ExtensionContext) {
     *     const extensionService = ServiceContainer.getService<IExtensionService>(
     *         SERVICE_TOKENS.ExtensionService
     *     );
     *     
     *     // 立即初始化和激活
     *     await extensionService.initialize(context);
     *     await extensionService.activate();
     *     
     *     // 在后台等待扫描完成
     *     extensionService.initialScanCompleted.then(() => {
     *         const stats = extensionService.getStatistics();
     *         logger.info('Initial scan completed', {
     *             documentsProcessed: stats.processedDocuments,
     *             duration: stats.uptime
     *         });
     *         
     *         // 发送准备就绪通知
     *         vscode.window.showInformationMessage(
     *             `CraftEngine loaded ${stats.processedDocuments} templates`
     *         );
     *     });
     *     
     *     // 或者 await 等待
     *     console.log('Waiting for initial scan...');
     *     await extensionService.initialScanCompleted;
     *     console.log('Scan complete, all features ready');
     * }
     * ```
     */
    initialScanCompleted: Promise<void>;
}
