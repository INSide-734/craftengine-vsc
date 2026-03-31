import { type ILogger } from '../../../../core/interfaces/ILogger';
import { type IPerformanceMonitor } from '../../../../core/interfaces/IPerformanceMonitor';
import { type IJsonSchemaNode } from '../../../../core/types/JsonSchemaTypes';
import { type SchemaDynamicGenerator } from '../SchemaDynamicGenerator';
import { type YamlExtensionIntegrator } from '../YamlExtensionIntegrator';
import { type SchemaFileManager } from './SchemaFileManager';

/**
 * Schema 更新协调器
 *
 * 负责协调 Schema 的加载、注册和更新流程。
 *
 * @remarks
 * **核心职责**：
 * - 加载根 Schema
 * - 注册动态 Schema 到 YAML 扩展
 * - 协调 Schema 重新加载流程
 *
 * **更新流程**：
 * 1. 清除文件管理器缓存
 * 2. 重新加载根 Schema
 * 3. 重新注册动态 Schema
 * 4. 触发回调通知
 *
 * @example
 * ```typescript
 * const coordinator = new SchemaUpdateCoordinator(
 *     logger,
 *     fileManager,
 *     generator,
 *     yamlIntegrator,
 *     performanceMonitor,
 *     onSchemaReloaded
 * );
 *
 * // 加载根 Schema
 * const rootSchema = await coordinator.loadRootSchema();
 *
 * // 重新加载 Schema
 * await coordinator.reloadSchema();
 * ```
 */
export class SchemaUpdateCoordinator {
    /** 根 Schema 对象 */
    private rootSchema: IJsonSchemaNode | null = null;

    /**
     * 构造 Schema 更新协调器实例
     *
     * @param logger - 日志记录器
     * @param fileManager - 文件管理器
     * @param generator - 动态 Schema 生成器
     * @param yamlIntegrator - YAML 扩展集成器
     * @param performanceMonitor - 性能监控器（可选）
     * @param onSchemaReloaded - Schema 重新加载回调（可选）
     */
    constructor(
        private readonly logger: ILogger,
        private readonly fileManager: SchemaFileManager,
        private readonly generator: SchemaDynamicGenerator,
        private readonly yamlIntegrator: YamlExtensionIntegrator,
        private readonly performanceMonitor?: IPerformanceMonitor,
        private readonly onSchemaReloaded?: () => void,
    ) {}

    /**
     * 加载根 Schema
     *
     * @returns Promise，表示加载完成
     * @throws {Error} 如果加载失败
     */
    async loadRootSchema(): Promise<IJsonSchemaNode> {
        try {
            this.rootSchema = await this.fileManager.loadSchema('index.schema.json');

            this.logger.info('Root schema loaded successfully', {
                schemaKeys: Object.keys(this.rootSchema || {}).slice(0, 5),
            });

            return this.rootSchema;
        } catch (error) {
            this.logger.error('Failed to load root schema', error as Error);
            this.rootSchema = null;
            throw error;
        }
    }

    /**
     * 获取根 Schema
     *
     * @returns 根 Schema 对象，如果未加载则返回 null
     */
    getRootSchema(): IJsonSchemaNode | null {
        return this.rootSchema;
    }

    /**
     * 重新加载 Schema
     *
     * 清除缓存，重新加载根 Schema，并重新注册动态 Schema。
     *
     * @returns Promise，表示重新加载完成
     */
    async reloadSchema(): Promise<void> {
        const timer = this.performanceMonitor?.startTimer('schema.reload');

        try {
            // 清除缓存
            this.fileManager.clearCache();

            // 重新加载根 Schema
            await this.loadRootSchema();

            // 重新注册动态 Schema
            if (this.yamlIntegrator.isAvailable()) {
                await this.yamlIntegrator.registerDynamicSchema(this.generator);
            }

            // 通知 Schema 已重新加载
            this.onSchemaReloaded?.();

            timer?.stop({ success: true });
        } catch (error) {
            this.logger.error('Failed to reload schema', error as Error);
            timer?.stop({ success: false, error: (error as Error).message });
            throw error;
        }
    }

    /**
     * 注册动态 Schema
     *
     * 将动态生成的 Schema 注册到 YAML 扩展。
     *
     * @returns Promise，表示注册完成
     */
    async registerDynamicSchema(): Promise<void> {
        if (this.yamlIntegrator.isAvailable()) {
            await this.yamlIntegrator.registerDynamicSchema(this.generator);
        }
    }
}
