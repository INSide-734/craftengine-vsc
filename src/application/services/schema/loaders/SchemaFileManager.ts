import * as path from 'path';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import { type IWorkspaceService } from '../../../../core/interfaces/IWorkspaceService';
import { type ISchemaFileLoader } from '../../../../core/interfaces/ISchemaFileLoader';
import { type IJsonSchemaNode } from '../../../../core/types/JsonSchemaTypes';

/**
 * Schema 文件管理器
 *
 * 负责 Schema 文件的加载、缓存和文件监控管理。
 *
 * @remarks
 * **核心职责**：
 * - 加载 Schema 文件（内置和工作区）
 * - 管理 Schema 缓存
 * - 设置工作区 Schema 目录
 *
 * **工作区 Schema**：
 * - 支持从工作区 `.craftengine/schemas` 目录加载自定义 Schema
 * - 工作区 Schema 优先于内置 Schema
 *
 * @example
 * ```typescript
 * const fileManager = new SchemaFileManager(
 *     logger,
 *     schemaFileLoader,
 *     workspaceService
 * );
 *
 * // 设置工作区目录
 * fileManager.setWorkspaceSchemaDir();
 *
 * // 加载 Schema
 * const schema = await fileManager.loadSchema('index.schema.json');
 *
 * // 清除缓存
 * fileManager.clearCache();
 * ```
 */
export class SchemaFileManager {
    /**
     * 构造 Schema 文件管理器实例
     *
     * @param logger - 日志记录器
     * @param schemaFileLoader - Schema 文件加载器
     * @param workspaceService - 工作区服务
     */
    constructor(
        private readonly logger: ILogger,
        private readonly schemaFileLoader: ISchemaFileLoader,
        private readonly workspaceService: IWorkspaceService,
    ) {}

    /**
     * 设置工作区 Schema 目录
     *
     * 如果工作区存在，设置 `.craftengine/schemas` 为 Schema 搜索路径。
     */
    setWorkspaceSchemaDir(): void {
        const workspaceSchemaDir = this.getWorkspaceSchemaDir();
        if (workspaceSchemaDir) {
            this.schemaFileLoader.setWorkspaceSchemaDir?.(workspaceSchemaDir);
            this.logger.debug('Workspace schema directory set', { dir: workspaceSchemaDir });
        }
    }

    /**
     * 加载 Schema 文件
     *
     * @param filename - Schema 文件名
     * @returns Schema 对象
     * @throws {Error} 如果加载失败
     */
    async loadSchema(filename: string): Promise<IJsonSchemaNode> {
        return this.schemaFileLoader.loadSchema(filename);
    }

    /**
     * 清除 Schema 缓存
     */
    clearCache(): void {
        this.schemaFileLoader.clearCache();
        this.logger.debug('Schema cache cleared');
    }

    /**
     * 获取工作区 Schema 目录路径
     *
     * @returns 工作区 Schema 目录路径，如果工作区不存在则返回 undefined
     */
    private getWorkspaceSchemaDir(): string | undefined {
        const rootPath = this.workspaceService.getWorkspaceRootPath();
        if (!rootPath) {
            return undefined;
        }
        return path.join(rootPath, '.craftengine', 'schemas');
    }
}
