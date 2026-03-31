import { type ILogger } from '../../../../core/interfaces/ILogger';
import { type IEventBus, type IEventSubscription } from '../../../../core/interfaces/IEventBus';
import { EVENT_TYPES } from '../../../../core/constants/ServiceTokens';
import { Debouncer } from '../../../../core/utils';
import { type SchemaDynamicGenerator } from '../SchemaDynamicGenerator';
import { type YamlExtensionIntegrator } from '../YamlExtensionIntegrator';
import { type SchemaFileManager } from './SchemaFileManager';

/**
 * Schema 事件处理器
 *
 * 负责监听和处理 Schema 相关事件。
 * 包括模板变更事件和 Schema 热重载事件。
 *
 * @remarks
 * **监听的事件**：
 * - 模板变更事件（`template.*`）：使动态 Schema 缓存失效并重新注册
 * - Schema 热重载事件（`schema.hotReloaded`）：重新加载 Schema 文件
 *
 * **防抖处理**：
 * - 模板变更事件使用 1 秒防抖，避免频繁更新
 * - Schema 热重载事件已在 SchemaFileWatcherManager 中防抖，此处不再重复
 *
 * @example
 * ```typescript
 * const eventHandler = new SchemaEventHandler(
 *     logger,
 *     eventBus,
 *     fileManager,
 *     generator,
 *     yamlIntegrator,
 *     onSchemaReloaded
 * );
 *
 * // 设置事件监听器
 * eventHandler.setupEventListeners();
 *
 * // 清理资源
 * eventHandler.dispose();
 * ```
 */
export class SchemaEventHandler {
    /** 防抖器，用于优化 Schema 更新频率 */
    private readonly debouncer: Debouncer;
    /** 事件订阅句柄 */
    private readonly subscriptions: IEventSubscription[] = [];

    /**
     * 构造 Schema 事件处理器实例
     *
     * @param logger - 日志记录器
     * @param eventBus - 事件总线
     * @param fileManager - 文件管理器
     * @param generator - 动态 Schema 生成器
     * @param yamlIntegrator - YAML 扩展集成器
     * @param onSchemaReloaded - Schema 重新加载回调（可选）
     */
    constructor(
        private readonly logger: ILogger,
        private readonly eventBus: IEventBus,
        private readonly fileManager: SchemaFileManager,
        private readonly generator: SchemaDynamicGenerator,
        private readonly yamlIntegrator: YamlExtensionIntegrator,
        private readonly onSchemaReloaded?: () => void,
    ) {
        this.debouncer = new Debouncer(logger);
    }

    /**
     * 设置事件监听器
     *
     * 监听模板变更和 Schema 热重载事件。
     */
    setupEventListeners(): void {
        // 监听模板变更，使用防抖避免频繁更新
        const templateSub = this.eventBus.subscribe(EVENT_TYPES.TemplateWildcard, async () => {
            this.debouncer.debounce(
                'schema-update',
                async () => {
                    try {
                        this.logger.debug('Updating schema after template change');
                        // 使动态 Schema 缓存失效，确保下次请求时重新生成
                        this.generator.invalidateCache();
                        await this.yamlIntegrator.registerDynamicSchema(this.generator);
                        this.onSchemaReloaded?.();
                    } catch (error) {
                        this.logger.error('Error updating schema', error as Error);
                    }
                },
                1000, // 1秒防抖
            );
        });
        this.subscriptions.push(templateSub);

        // 监听 Schema 文件热重载事件
        // 注意：SchemaFileWatcherManager 已有 500ms 防抖，此处不再重复防抖
        const hotReloadSub = this.eventBus.subscribe(EVENT_TYPES.SchemaHotReloaded, async () => {
            try {
                this.logger.info('Hot reloading schema files');

                // 清除缓存
                this.fileManager.clearCache();

                // 通知需要重新加载根 Schema
                this.onSchemaReloaded?.();

                this.logger.info('Schema hot reload completed');
            } catch (error) {
                this.logger.error('Error during schema hot reload', error as Error);
            }
        });
        this.subscriptions.push(hotReloadSub);

        this.logger.debug('Schema event listeners setup completed');
    }

    /**
     * 清理资源
     */
    dispose(): void {
        // 取消所有事件订阅
        for (const sub of this.subscriptions) {
            sub.unsubscribe();
        }
        this.subscriptions.length = 0;

        this.debouncer.clear();
    }
}
