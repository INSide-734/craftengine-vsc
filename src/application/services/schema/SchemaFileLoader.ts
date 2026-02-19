import * as path from 'path';
import * as fs from 'fs/promises';
import { ILogger } from '../../../core/interfaces/ILogger';
import { JsonSchemaNode } from '../../../core/types/JsonSchemaTypes';
import { LRUCache } from '../../../core/utils';
import { SchemaCacheEntry } from './SchemaCache';
import { SCHEMA_METADATA } from './SchemaConstants';
import { SchemaNotFoundError } from '../../../core/errors/ExtensionErrors';

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
 * 
 * **缓存策略**：
 * - 首次加载：从文件系统读取并缓存
 * - 缓存命中：直接返回缓存对象，更新访问统计
 * - 缓存淘汰：当达到容量上限时，自动淘汰最少使用的项
 * 
 * **性能优化**：
 * - LRU 缓存避免重复文件 I/O
 * - 访问计数跟踪热门 Schema
 * - 可选的缓存绕过机制
 * 
 * @example
 * ```typescript
 * const loader = new SchemaFileLoader(
 *     path.join(extensionPath, 'schemas'),
 *     logger,
 *     50 // 缓存大小
 * );
 * 
 * // 加载 Schema（启用缓存）
 * const schema = await loader.loadSchema('template.schema.json');
 * console.log(schema.title);
 * 
 * // 强制重新加载（绕过缓存）
 * const freshSchema = await loader.reloadSchema('template.schema.json');
 * 
 * // 清空缓存
 * loader.clearCache();
 * ```
 */
export class SchemaFileLoader {
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
     * 
     * @remarks
     * 缓存大小建议：
     * - 小型项目：20-50 个 Schema
     * - 中型项目：50-100 个 Schema
     * - 大型项目：100-200 个 Schema
     * 
     * @example
     * ```typescript
     * const loader = new SchemaFileLoader(
     *     path.join(__dirname, '../schemas'),
     *     logger,
     *     100,
     *     path.join(workspaceRoot, '.craftengine/schemas')
     * );
     * ```
     */
    constructor(
        schemasDir: string,
        private readonly logger: ILogger,
        cacheSize: number = 50,
        workspaceSchemaDir?: string
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
     * 从文件系统加载指定的 JSON Schema 文件，支持缓存机制。
     * 
     * @param filename - Schema 文件名（相对于 schemas 目录）
     * @param useCache - 是否使用缓存，默认 true
     * @returns Schema 对象，包含元数据
     * @throws {Error} 如果文件不存在或解析失败
     * 
     * @remarks
     * 加载流程：
     * 1. 如果启用缓存且缓存命中，返回缓存对象
     * 2. 构建完整文件路径
     * 3. 检查文件是否存在
     * 4. 读取文件内容
     * 5. 解析 JSON
     * 6. 添加元数据（文件名、加载时间）
     * 7. 更新缓存
     * 8. 返回 Schema 对象
     * 
     * 元数据：
     * - `__schemaFile__`: 文件名
     * - `__loadedAt__`: 加载时间戳
     * 
     * @example
     * ```typescript
     * // 加载主 Schema（使用缓存）
     * const mainSchema = await loader.loadSchema('craftengine.schema.json');
     * 
     * // 加载子 Schema（绕过缓存）
     * const subSchema = await loader.loadSchema('sub/detail.schema.json', false);
     * 
     * // 错误处理
     * try {
     *     const schema = await loader.loadSchema('nonexistent.json');
     * } catch (error) {
     *     console.error('Schema not found:', error.message);
     * }
     * ```
     */
    async loadSchema(filename: string, useCache: boolean = true): Promise<JsonSchemaNode> {
        try {
            // 检查缓存
            if (useCache) {
                const cached = this.cache.get(filename);
                if (cached) {
                    cached.accessCount++;
                    cached.lastAccess = Date.now();
                    // 缓存命中是高频操作，不记录日志
                    return cached.schema;
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
            // 计算并保存目录路径，用于相对引用解析
            // 使用 path.posix.dirname 确保跨平台一致性（Schema 引用使用 POSIX 风格路径）
            schema[SCHEMA_METADATA.SCHEMA_DIR] = path.posix.dirname(filename.replace(/\\/g, '/'));
            schema[SCHEMA_METADATA.LOADED_AT] = Date.now();
            schema[SCHEMA_METADATA.SCHEMA_SOURCE] = source;
            
            // 缓存
            this.cache.set(filename, {
                schema,
                timestamp: Date.now(),
                accessCount: 1,
                lastAccess: Date.now()
            });
            
            this.logger.debug('Schema file loaded', {
                filename,
                source,
                size: content.length,
                cacheSize: this.cache.size()
            });
            
            return schema;
            
        } catch (error) {
            this.logger.error('Failed to load schema file', error as Error, { filename });
            throw error;
        }
    }
    
    /**
     * 解析 Schema 文件路径
     * 
     * 优先检查工作区目录，如果不存在则回退到扩展目录。
     * 
     * @param filename - Schema 文件名
     * @returns 包含文件路径和来源的对象
     */
    private async resolveSchemaPath(filename: string): Promise<{ filePath: string; source: 'workspace' | 'extension' }> {
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
            source: 'extension'
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

