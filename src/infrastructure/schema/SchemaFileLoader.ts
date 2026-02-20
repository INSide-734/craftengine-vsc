import * as path from 'path';
import * as fs from 'fs/promises';
import { type ILogger } from '../../core/interfaces/ILogger';
import { type ISchemaFileLoader } from '../../core/interfaces/ISchemaFileLoader';
import { type JsonSchemaNode } from '../../core/types/JsonSchemaTypes';
import { LRUCache } from '../../core/utils';
import { SCHEMA_METADATA } from '../../core/constants/SchemaConstants';
import { SchemaNotFoundError } from '../../core/errors/ExtensionErrors';

/**
 * Schema 缓存项
 */
export interface SchemaCacheEntry {
    schema: JsonSchemaNode;
    timestamp: number;
    accessCount: number;
    lastAccess: number;
}

/**
 * Schema 文件加载器
 *
 * 负责从文件系统加载 JSON Schema 文件，并提供高效的缓存管理。
 * 使用 LRU 缓存策略优化频繁访问的 Schema 文件加载性能。
 *
 * @remarks
 * **核心功能**：
 *
 * 1. **文件加载**
 *    - 从指定目录读取 JSON Schema 文件
 *    - 解析 JSON 内容为 Schema 对象
 *    - 添加元数据（文件名、加载时间）
 *
 * 2. **缓存管理**
 *    - 使用 LRU（最近最少使用）缓存策略
 *    - 可配置的缓存大小
 *    - 记录缓存访问统计
 *
 * 3. **错误处理**
 *    - 文件不存在检测
 *    - JSON 解析错误处理
 *    - 详细的错误日志
 * **缓存策略**：
 * - 首次加载：从文件系统读取并缓存
 * - 缓存命中：返回深拷贝对象，更新访问统计
 * - 缓存淘汰：当达到容量上限时，自动淘汰最少使用的项
 *
 * **性能优化**：
 * - LRU 缓存避免重复文件 I/O
 * - 访问计数跟踪热门 Schema
 * - 可选的缓存绕过机制
 */
export class SchemaFileLoader implements ISchemaFileLoader {
    /** LRU 缓存实例 */
    private readonly cache: LRUCache<string, SchemaCacheEntry>;
    /** 扩展 Schema 文件存储目录 */
    private readonly schemasDir: string;
    /** 工作区 Schema 文件存储目录 */
    private workspaceSchemaDir: string | undefined;

    /**
     * 构造 Schema 文件加载器实例
     *
     * @param schemasDir - Schema 文件目录的绝对路径（扩展内置）
     * @param logger - 日志记录器，用于记录加载过程
     * @param cacheSize - 缓存容量，默认 50
     * @param workspaceSchemaDir - 工作区 Schema 目录（可选，优先加载）
     */
    constructor(
        schemasDir: string,
        private readonly logger: ILogger,
        cacheSize: number = 50,
        workspaceSchemaDir?: string,
    ) {
        this.schemasDir = schemasDir;
        this.workspaceSchemaDir = workspaceSchemaDir;
        this.cache = new LRUCache(cacheSize);
    }

    /**
     * 设置工作区 Schema 目录
     *
     * @param dir - 工作区 Schema 目录路径
     */
    setWorkspaceSchemaDir(dir: string | undefined): void {
        if (this.workspaceSchemaDir !== dir) {
            this.workspaceSchemaDir = dir;
            // 清除缓存以便重新从正确的位置加载
            this.clearCache();
            this.logger.info('Workspace schema directory updated', { dir });
        }
    }

    /**
     * 获取工作区 Schema 目录
     */
    getWorkspaceSchemaDir(): string | undefined {
        return this.workspaceSchemaDir;
    }

    /**
     * 加载 Schema 文件
     *
     * @param filename - Schema 文件名（相对于 schemas 目录）
     * @param useCache - 是否使用缓存，默认 true
     * @returns Schema 对象，包含元数据
     * @throws {Error} 如果文件不存在或解析失败
     */
    async loadSchema(filename: string, useCache: boolean = true): Promise<JsonSchemaNode> {
        try {
            // 检查缓存
            if (useCache) {
                const cached = this.cache.get(filename);
                if (cached) {
                    cached.accessCount++;
                    cached.lastAccess = Date.now();
                    // 返回深拷贝，防止调用方修改污染缓存
                    return structuredClone(cached.schema);
                }
            }

            // 获取文件路径（优先工作区）
            const { filePath, source } = await this.resolveSchemaPath(filename);

            // 直接读取文件，避免 access + readFile 的竞态条件
            let content: string;
            try {
                content = await fs.readFile(filePath, 'utf-8');
            } catch {
                throw new SchemaNotFoundError(filename);
            }
            const schema: JsonSchemaNode = JSON.parse(content);

            // 添加元数据
            schema[SCHEMA_METADATA.SCHEMA_FILE] = filename;
            schema[SCHEMA_METADATA.SCHEMA_DIR] = path.posix.dirname(filename.replace(/\\/g, '/'));
            schema[SCHEMA_METADATA.LOADED_AT] = Date.now();
            schema[SCHEMA_METADATA.SCHEMA_SOURCE] = source;

            // 缓存
            this.cache.set(filename, {
                schema,
                timestamp: Date.now(),
                accessCount: 1,
                lastAccess: Date.now(),
            });

            this.logger.debug('Schema file loaded', {
                filename,
                source,
                size: content.length,
                cacheSize: this.cache.size(),
            });

            // 返回深拷贝，防止调用方修改污染缓存
            return structuredClone(schema);
        } catch (error) {
            this.logger.error('Failed to load schema file', error as Error, { filename });
            throw error;
        }
    }

    /**
     * 解析 Schema 文件路径
     *
     * 优先检查工作区目录，如果不存在则回退到扩展目录。
     */
    private async resolveSchemaPath(
        filename: string,
    ): Promise<{ filePath: string; source: 'workspace' | 'extension' }> {
        // 优先检查工作区目录
        if (this.workspaceSchemaDir) {
            const workspacePath = path.join(this.workspaceSchemaDir, filename);
            try {
                await fs.access(workspacePath);
                return { filePath: workspacePath, source: 'workspace' };
            } catch {
                // 工作区文件不存在，回退到扩展目录
            }
        }

        // 回退到扩展目录
        return {
            filePath: path.join(this.schemasDir, filename),
            source: 'extension',
        };
    }

    /**
     * 清除缓存
     */
    clearCache(): void {
        this.cache.clear();
        this.logger.debug('Schema cache cleared');
    }

    /**
     * 重新加载指定的 Schema 文件
     *
     * @param filename Schema 文件名
     * @returns Schema 对象
     */
    async reloadSchema(filename: string): Promise<JsonSchemaNode> {
        this.logger.info('Reloading schema file', { filename });
        return this.loadSchema(filename, false);
    }
}
