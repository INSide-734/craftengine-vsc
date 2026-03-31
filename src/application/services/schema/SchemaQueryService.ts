import { type ILogger } from '../../../core/interfaces/ILogger';
import { type IPerformanceMonitor } from '../../../core/interfaces/IPerformanceMonitor';
import { type IJsonSchemaNode } from '../../../core/types/JsonSchemaTypes';
import { LRUCache, safeCompileRegex } from '../../../core/utils';
import {
    type SchemaPathNavigator,
    type SchemaPropertyExtractor,
    type SchemaProperty,
    type SchemaPropertyDetails,
    extractFieldNameFromPattern,
    getFallbackTopLevelFields,
    SCHEMA_METADATA,
    SCHEMA_CACHE,
    VERSION_CONDITION,
} from './index';

/**
 * Schema 查询服务
 *
 * 负责：
 * - Schema 路径导航和查询
 * - 属性缓存管理
 * - Schema 可用性快速检查
 * - 顶级字段提取
 */
export class SchemaQueryService {
    // 属性缓存 - LRU 策略
    private readonly propertiesCache: LRUCache<string, SchemaProperty[]>;

    // Schema 可用性缓存
    private readonly schemaAvailabilityCache: LRUCache<string, boolean>;

    // Schema 路径查询缓存
    private readonly pathCache: LRUCache<string, IJsonSchemaNode | undefined>;

    // 进行中的路径查询（用于 Promise 去重，防止并发缓存穿透）
    private readonly pendingPathQueries = new Map<string, Promise<IJsonSchemaNode | undefined>>();

    // 顶级字段缓存
    private topLevelFieldsCache: string[] | null = null;

    // 查询超时时间（毫秒）
    private static readonly QUERY_TIMEOUT = 5000;

    // pendingPathQueries 最大容量
    private static readonly MAX_PENDING_QUERIES = 1000;

    // 容量溢出时淘汰比例
    private static readonly EVICTION_RATIO = 0.2;

    constructor(
        private readonly navigator: SchemaPathNavigator,
        private readonly extractor: SchemaPropertyExtractor,
        private readonly logger: ILogger,
        private readonly performanceMonitor?: IPerformanceMonitor,
    ) {
        // 初始化缓存
        this.propertiesCache = new LRUCache<string, SchemaProperty[]>(SCHEMA_CACHE.PROPERTIES_CACHE_SIZE);
        this.schemaAvailabilityCache = new LRUCache<string, boolean>(SCHEMA_CACHE.AVAILABILITY_CACHE_SIZE);
        this.pathCache = new LRUCache<string, IJsonSchemaNode | undefined>(SCHEMA_CACHE.PATH_CACHE_SIZE);
    }

    /**
     * 根据路径获取 Schema（带缓存、并发去重和超时）
     */
    async getSchemaForPath(rootSchema: IJsonSchemaNode, path: string[]): Promise<IJsonSchemaNode | undefined> {
        if (!rootSchema) {
            return undefined;
        }

        const schemaId = this.getSchemaId(rootSchema);
        const cacheKey = `${schemaId}::${path.join('.')}`;

        // 1. 检查已完成的缓存
        if (this.pathCache.has(cacheKey)) {
            return this.pathCache.get(cacheKey);
        }

        // 2. 检查是否有进行中的相同查询（并发去重）
        const pending = this.pendingPathQueries.get(cacheKey);
        if (pending) {
            return pending;
        }

        // 3. 检查 pendingPathQueries 容量，防止内存泄漏
        if (this.pendingPathQueries.size >= SchemaQueryService.MAX_PENDING_QUERIES) {
            const evictCount = Math.ceil(SchemaQueryService.MAX_PENDING_QUERIES * SchemaQueryService.EVICTION_RATIO);
            this.logger.warn('pendingPathQueries capacity exceeded, evicting oldest entries', {
                size: this.pendingPathQueries.size,
                evictCount,
            });
            // 淘汰最早的条目（Map 保持插入顺序）
            let removed = 0;
            for (const key of this.pendingPathQueries.keys()) {
                if (removed >= evictCount) {
                    break;
                }
                this.pendingPathQueries.delete(key);
                removed++;
            }
        }

        // 4. 发起新查询并注册到 pending map（带超时）
        const query = this.executeQueryWithTimeout(rootSchema, path, cacheKey);

        this.pendingPathQueries.set(cacheKey, query);
        return query;
    }

    /**
     * 执行带超时的查询
     */
    private async executeQueryWithTimeout(
        rootSchema: IJsonSchemaNode,
        path: string[],
        cacheKey: string,
    ): Promise<IJsonSchemaNode | undefined> {
        // 保存 timer 引用，确保查询完成后清理
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        // 创建超时 Promise
        const timeoutPromise = new Promise<IJsonSchemaNode | undefined>((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error(`Schema query timeout after ${SchemaQueryService.QUERY_TIMEOUT}ms`));
            }, SchemaQueryService.QUERY_TIMEOUT);
        });

        // 创建查询 Promise
        const queryPromise = this.navigator.getSchemaForPath(rootSchema, path);

        try {
            // 竞争：查询 vs 超时
            const result = await Promise.race([queryPromise, timeoutPromise]);
            this.pathCache.set(cacheKey, result);
            return result;
        } catch (error) {
            this.logger.error('Failed to get schema for path', error as Error, {
                path: path.join('.'),
            });
            return undefined;
        } finally {
            // 清理超时 timer，防止资源泄漏
            if (timeoutId !== undefined) {
                clearTimeout(timeoutId);
            }
            // 确保清理 pending 查询
            this.pendingPathQueries.delete(cacheKey);
        }
    }

    /**
     * 获取 Schema 的唯一标识符
     *
     * 用于生成缓存键，确保不同 Schema 的缓存不会混淆。
     */
    private getSchemaId(schema: IJsonSchemaNode): string {
        if (!schema) {
            return 'undefined';
        }
        // 优先使用 $id，其次使用 SCHEMA_FILE
        return (schema.$id as string) || (schema[SCHEMA_METADATA.SCHEMA_FILE] as string) || 'default';
    }

    /**
     * 快速检查路径是否有可用 Schema
     */
    hasSchemaForPath(rootSchema: IJsonSchemaNode, path: string[]): boolean {
        // 缓存键包含 Schema 标识符和路径
        const schemaId = this.getSchemaId(rootSchema);
        const cacheKey = `${schemaId}::${path.join('.')}`;

        // 检查缓存
        const cached = this.schemaAvailabilityCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        // 快速检查
        try {
            if (!rootSchema) {
                this.schemaAvailabilityCache.set(cacheKey, false);
                return false;
            }

            const hasSchema = this.quickSchemaCheck(rootSchema, path);
            this.schemaAvailabilityCache.set(cacheKey, hasSchema);

            return hasSchema;
        } catch (error) {
            this.logger.debug('Schema availability check failed', {
                path: path.join('.'),
                error: (error as Error).message,
            });
            this.schemaAvailabilityCache.set(cacheKey, false);
            return false;
        }
    }

    /**
     * 获取可用属性（带缓存）
     */
    async getAvailableProperties(rootSchema: IJsonSchemaNode, path: string[]): Promise<SchemaProperty[]> {
        const timer = this.performanceMonitor?.startTimer('schema.getAvailableProperties');
        // 缓存键包含 Schema 标识符和路径
        const schemaId = this.getSchemaId(rootSchema);
        const cacheKey = `${schemaId}::${path.join('.')}`;

        try {
            // 检查缓存
            const cached = this.propertiesCache.get(cacheKey);
            if (cached) {
                this.logger.debug('Properties loaded from cache', { path: path.join('.') });
                timer?.stop({ success: true, fromCache: true, propertiesCount: cached.length });
                return cached;
            }

            // 获取 Schema
            const schema = await this.getSchemaForPath(rootSchema, path);
            if (!schema) {
                timer?.stop({ success: false, reason: 'schema_not_found' });
                return [];
            }

            // 提取属性，优先使用 schema 的上下文（来自外部引用解析），否则使用 rootSchema
            // 这确保嵌套的相对路径引用（如 ./base.schema.json）能相对于正确的目录解析
            const contextSchema = (schema[SCHEMA_METADATA.CONTEXT_SCHEMA] as IJsonSchemaNode | undefined) || rootSchema;
            const properties = await this.extractor.extractProperties(schema, contextSchema);

            // 缓存结果
            this.propertiesCache.set(cacheKey, properties);

            this.logger.debug('Extracted available properties', {
                path: path.join('.'),
                propertiesCount: properties.length,
                keys: properties.map((p) => p.key),
            });

            timer?.stop({ success: true, fromCache: false, propertiesCount: properties.length });
            return properties;
        } catch (error) {
            this.logger.error('Failed to get available properties', error as Error, {
                path: path.join('.'),
            });
            timer?.stop({ success: false, error: (error as Error).message });
            return [];
        }
    }

    /**
     * 获取属性详情
     */
    async getPropertyDetails(rootSchema: IJsonSchemaNode, path: string[]): Promise<SchemaPropertyDetails | undefined> {
        const timer = this.performanceMonitor?.startTimer('schema.getPropertyDetails');

        try {
            if (path.length === 0) {
                timer?.stop({ success: false, reason: 'empty_path' });
                return undefined;
            }

            // 获取父路径和属性名
            const parentPath = path.slice(0, -1);
            const propertyName = path[path.length - 1];

            const parentSchema =
                parentPath.length > 0 ? await this.getSchemaForPath(rootSchema, parentPath) : rootSchema;

            if (!parentSchema) {
                timer?.stop({ success: false, reason: 'parent_schema_not_found' });
                return undefined;
            }

            // 查找属性 Schema，优先使用 parentSchema 的上下文（来自外部引用解析），否则使用 rootSchema
            // 这确保嵌套的相对路径引用（如 ./base.schema.json）能相对于正确的目录解析
            const contextSchema =
                (parentSchema[SCHEMA_METADATA.CONTEXT_SCHEMA] as IJsonSchemaNode | undefined) || rootSchema;
            const propertySchema = await this.extractor.findPropertySchema(parentSchema, propertyName, contextSchema);

            if (!propertySchema) {
                timer?.stop({ success: false, reason: 'property_schema_not_found' });
                return undefined;
            }

            // 提取详细信息
            const details = this.extractor.extractPropertyDetails(propertySchema, parentSchema, propertyName);

            this.logger.debug('Extracted property details', {
                path: path.join('.'),
                hasDescription: !!details.description,
                type: details.type,
                required: details.required,
            });

            timer?.stop({ success: true });
            return details;
        } catch (error) {
            this.logger.error('Failed to get property details', error as Error, {
                path: path.join('.'),
            });
            timer?.stop({ success: false, error: (error as Error).message });
            return undefined;
        }
    }

    /**
     * 获取顶级字段
     */
    async getTopLevelFields(rootSchema: IJsonSchemaNode): Promise<string[]> {
        // 使用缓存
        if (this.topLevelFieldsCache) {
            return this.topLevelFieldsCache;
        }

        try {
            if (!rootSchema) {
                this.logger.warn('Root schema not available, using fallback');
                return getFallbackTopLevelFields();
            }

            const topLevelFields = new Set<string>();

            // 从 patternProperties 提取
            if (rootSchema.patternProperties) {
                for (const pattern in rootSchema.patternProperties) {
                    const fieldName = extractFieldNameFromPattern(pattern);
                    if (fieldName) {
                        topLevelFields.add(fieldName);
                    }
                }
            }

            // 从 properties 提取
            if (rootSchema.properties) {
                for (const property in rootSchema.properties) {
                    topLevelFields.add(property);
                }
            }

            const result = Array.from(topLevelFields).sort();
            this.topLevelFieldsCache = result;

            this.logger.debug('Extracted top-level fields', {
                fieldsCount: result.length,
                fields: result,
            });

            return result;
        } catch (error) {
            this.logger.error('Failed to extract top-level fields', error as Error);
            return getFallbackTopLevelFields();
        }
    }

    /**
     * 清除所有缓存
     */
    clearCaches(): void {
        this.topLevelFieldsCache = null;
        this.propertiesCache.clear();
        this.schemaAvailabilityCache.clear();
        this.pathCache.clear();
        this.pendingPathQueries.clear();

        this.logger.debug('All schema caches cleared');
    }

    // ==================== 私有方法 ====================

    /**
     * 检查键是否为版本条件键
     */
    private isVersionConditionKey(key: string): boolean {
        return VERSION_CONDITION.PATTERN.test(key);
    }

    /**
     * 快速检查 Schema 是否存在
     *
     * 这个方法用于快速判断路径是否有可能有对应的 Schema。
     * 当遇到 $ref 引用时，假设引用是有效的并继续检查。
     *
     * @remarks
     * 此方法用于 shouldActivate 的快速检查，允许一定程度的"乐观"判断。
     * 实际的 Schema 验证会在 getSchemaForPath 中进行完整的引用解析。
     */
    private quickSchemaCheck(schema: IJsonSchemaNode, path: string[]): boolean {
        if (!schema || path.length === 0) {
            return true;
        }

        let current: IJsonSchemaNode = schema;

        for (const segment of path) {
            // 跳过版本条件键（作为透传层级，不推进 Schema 导航）
            if (this.isVersionConditionKey(segment)) {
                continue;
            }

            // 如果当前 Schema 包含 $ref，假设引用有效
            // （实际验证会在 getSchemaForPath 中进行完整解析）
            if (current.$ref) {
                return true;
            }

            // 检查 properties
            const props = current.properties as Record<string, IJsonSchemaNode> | undefined;
            if (props && props[segment]) {
                current = props[segment];
                continue;
            }

            // 检查 patternProperties - 尝试匹配具体的模式
            const patternProps = current.patternProperties as Record<string, IJsonSchemaNode> | undefined;
            if (patternProps) {
                let matched = false;
                for (const pattern of Object.keys(patternProps)) {
                    const regex = safeCompileRegex(pattern);
                    if (regex && regex.test(segment)) {
                        // 找到匹配的模式，继续导航到该模式对应的 Schema
                        current = patternProps[pattern];
                        matched = true;
                        break;
                    }
                }
                if (matched) {
                    continue;
                }
            }

            // 检查 additionalProperties
            if (
                current.additionalProperties === true ||
                (typeof current.additionalProperties === 'object' && current.additionalProperties !== null)
            ) {
                if (typeof current.additionalProperties === 'object') {
                    current = current.additionalProperties as IJsonSchemaNode;
                    continue;
                }
                return true;
            }

            // 检查数组项
            if (current.type === 'array' && current.items) {
                current = current.items as IJsonSchemaNode;
                continue;
            }

            // 检查 allOf、oneOf、anyOf - 如果存在这些组合，假设可能有效
            if (current.allOf || current.oneOf || current.anyOf) {
                return true;
            }

            return false;
        }

        return true;
    }
}
