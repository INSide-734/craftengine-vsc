import { ILogger } from '../../../core/interfaces/ILogger';
import { JsonSchemaNode } from '../../../core/types/JsonSchemaTypes';
import { SchemaReferenceResolver } from './SchemaReferenceResolver';
import { SCHEMA_METADATA, SCHEMA_RESOLUTION, VERSION_CONDITION } from './SchemaConstants';

/**
 * Schema 路径导航器
 * 
 * 在 JSON Schema 树中根据路径导航，查找对应路径的 Schema 定义。
 * 支持多种 Schema 匹配策略，包括精确属性、模式属性、附加属性和数组项。
 * 
 * @remarks
 * **导航策略**：
 * 
 * 针对每个路径段（path segment），按以下顺序尝试匹配：
 * 
 * 1. **精确属性匹配** (properties)
 *    - 匹配 `properties` 中定义的属性名
 *    - 最常见的匹配方式
 *    - 例：`properties.items.properties.template`
 * 
 * 2. **模式属性匹配** (patternProperties)
 *    - 使用正则表达式匹配属性名
 *    - 适用于动态属性名
 *    - 例：`patternProperties["^[a-z]+$"]`
 * 
 * 3. **附加属性匹配** (additionalProperties)
 *    - 匹配未在 properties 中定义的任意属性
 *    - 提供宽松的 Schema 验证
 * 
 * 4. **数组项匹配** (items)
 *    - 匹配数组元素的 Schema
 *    - 处理数组索引路径段
 * 
 * **引用解析**：
 * - 在每个路径段导航前解析 `$ref` 引用
 * - 限制解析深度防止循环引用
 * - 支持本地引用和外部引用
 * 
 * **使用场景**：
 * - 补全提供者：根据当前路径获取可用属性
 * - 悬停提示：显示路径对应的 Schema 信息
 * - 验证器：验证路径的合法性
 * 
 * @example
 * ```typescript
 * const navigator = new SchemaPathNavigator(resolver, logger);
 * 
 * // 导航到嵌套属性
 * const schema = await navigator.getSchemaForPath(rootSchema, ['items', 'my-item', 'template']);
 * console.log(schema.type); // 'string'
 * console.log(schema.description); // 'Template name'
 * 
 * // 导航到数组项
 * const itemSchema = await navigator.getSchemaForPath(rootSchema, ['items', 'my-item', 'parameters', '0']);
 * 
 * // 导航到动态属性（通过 patternProperties 匹配）
 * const dynamicSchema = await navigator.getSchemaForPath(rootSchema, ['items', 'dynamic-key-123']);
 * ```
 */
export class SchemaPathNavigator {
    /**
     * 构造 Schema 路径导航器实例
     *
     * @param resolver - Schema 引用解析器，用于解析 $ref 引用
     * @param logger - 日志记录器，用于记录导航过程
     */
    constructor(
        private readonly resolver: SchemaReferenceResolver,
        private readonly logger: ILogger
    ) {}
    
    /**
     * 检查键是否为版本条件键
     *
     * 版本条件键用于表示版本特定的配置覆盖，作为"透传"层级，
     * 其子属性应继承父级的 Schema 定义。
     *
     * @param key - 要检查的键名
     * @returns 如果是版本条件键返回 true
     */
    isVersionConditionKey(key: string): boolean {
        return VERSION_CONDITION.PATTERN.test(key);
    }
    
    /**
     * 根据路径获取 Schema
     * 
     * 从根 Schema 开始，按照路径数组逐层导航，找到最终的 Schema 定义。
     * 
     * @param rootSchema - 根 Schema 对象
     * @param path - 路径数组，每个元素代表一个层级
     * @returns 对应路径的 Schema 对象，如果路径无效返回 undefined
     * 
     * @remarks
     * 导航过程：
     * 1. 从根 Schema 开始
     * 2. 对于路径中的每个段：
     *    a. 解析当前 Schema 的引用
     *    b. 尝试四种匹配策略（按优先级）
     *    c. 如果匹配成功，移动到下一个 Schema
     *    d. 如果匹配失败，返回 undefined
     * 3. 所有路径段处理完后，再次解析引用
     * 4. 返回最终的 Schema
     * 
     * 匹配优先级：
     * 1. properties（精确匹配）
     * 2. patternProperties（正则匹配）
     * 3. additionalProperties（通配符）
     * 4. items（数组项）
     * 
     * @example
     * ```typescript
     * // 示例 Schema：
     * const rootSchema = {
     *     type: 'object',
     *     properties: {
     *         items: {
     *             type: 'object',
     *             patternProperties: {
     *                 '^[a-z-]+$': {
     *                     type: 'object',
     *                     properties: {
     *                         template: { type: 'string', enum: ['user-profile', 'admin-profile'] }
     *                     }
     *                 }
     *             }
     *         }
     *     }
     * };
     * 
     * // 导航示例
     * const schema = await navigator.getSchemaForPath(rootSchema, ['items', 'my-item', 'template']);
     * // 返回: { type: 'string', enum: ['user-profile', 'admin-profile'] }
     * ```
     */
    async getSchemaForPath(rootSchema: JsonSchemaNode, path: string[]): Promise<JsonSchemaNode | undefined> {
        if (!rootSchema) {
            return undefined;
        }
        
        let currentSchema: JsonSchemaNode = rootSchema;
        // 当前有效的上下文 Schema，用于解析内部引用
        // 当进入外部 Schema 时，上下文会更新为该外部 Schema
        let currentContextSchema: JsonSchemaNode = rootSchema;

        for (let i = 0; i < path.length; i++) {
            const segment = path[i];

            // 版本条件键（如 $$>=1.21.2）作为"虚拟层级"，跳过并透传父级 Schema
            if (this.isVersionConditionKey(segment)) {
                continue;
            }

            // 解析引用，使用当前上下文 Schema
            const resolvedSchema = await this.resolver.resolveReferences(currentSchema, SCHEMA_RESOLUTION.DEFAULT_MAX_DEPTH, currentContextSchema);

            // 如果解析后的 Schema 是一个完整的 Schema 对象（不仅仅是引用），更新上下文
            // 这确保后续的内部引用（如 #/$defs/xxx）能在正确的 Schema 中查找
            if (resolvedSchema && typeof resolvedSchema === 'object') {
                // 如果解析后的 Schema 携带了新的上下文（来自外部引用），使用它
                if (resolvedSchema[SCHEMA_METADATA.CONTEXT_SCHEMA]) {
                    currentContextSchema = resolvedSchema[SCHEMA_METADATA.CONTEXT_SCHEMA] as JsonSchemaNode;
                } else if (resolvedSchema.$id || resolvedSchema.$schema || resolvedSchema.$defs) {
                    // 如果解析后的 Schema 看起来像一个独立的 Schema 文件，将其作为新的上下文
                    currentContextSchema = resolvedSchema;
                }
            }
            
            currentSchema = resolvedSchema;
            
            // 尝试各种匹配方式
            let nextSchema: JsonSchemaNode | undefined =
                this.matchProperty(currentSchema, segment) ||
                this.matchPatternProperty(currentSchema, segment) ||
                this.matchAdditionalProperties(currentSchema) ||
                this.matchItems(currentSchema);
            
            if (!nextSchema) {
                this.logger.debug('Schema path segment not found', {
                    path: path.slice(0, i + 1).join('.'),
                    segment
                });
                return undefined;
            }
            
            // 如果下一个 Schema 没有上下文标记，继承当前上下文
            // 这样嵌套的内部引用能正确解析
            if (!nextSchema[SCHEMA_METADATA.CONTEXT_SCHEMA] && currentContextSchema) {
                // 优先使用 resolvedSchema 的 SCHEMA_DIR（来自外部引用解析），
                // 然后是 currentContextSchema 的 SCHEMA_DIR
                const effectiveSchemaDir = resolvedSchema?.[SCHEMA_METADATA.SCHEMA_DIR] ||
                    currentContextSchema[SCHEMA_METADATA.SCHEMA_DIR];
                const effectiveSchemaFile = resolvedSchema?.[SCHEMA_METADATA.SCHEMA_FILE] ||
                    currentContextSchema[SCHEMA_METADATA.SCHEMA_FILE];

                nextSchema = {
                    ...nextSchema,
                    [SCHEMA_METADATA.CONTEXT_SCHEMA]: currentContextSchema,
                    // 同时继承 SCHEMA_FILE 和 SCHEMA_DIR，确保相对路径解析正确
                    [SCHEMA_METADATA.SCHEMA_FILE]: nextSchema[SCHEMA_METADATA.SCHEMA_FILE] || effectiveSchemaFile,
                    [SCHEMA_METADATA.SCHEMA_DIR]: nextSchema[SCHEMA_METADATA.SCHEMA_DIR] || effectiveSchemaDir
                };
            }
            
            currentSchema = nextSchema;
        }
        
        // 最后再解析一次引用，使用当前上下文
        return await this.resolver.resolveReferences(currentSchema, SCHEMA_RESOLUTION.DEFAULT_MAX_DEPTH, currentContextSchema);
    }
    
    /**
     * 匹配 properties
     */
    private matchProperty(schema: JsonSchemaNode, segment: string): JsonSchemaNode | undefined {
        const properties = schema.properties as Record<string, JsonSchemaNode> | undefined;
        return properties?.[segment];
    }

    /**
     * 匹配 patternProperties
     */
    private matchPatternProperty(schema: JsonSchemaNode, segment: string): JsonSchemaNode | undefined {
        const patternProperties = schema.patternProperties as Record<string, JsonSchemaNode> | undefined;
        if (!patternProperties) {
            return undefined;
        }

        for (const [pattern, propSchema] of Object.entries(patternProperties)) {
            try {
                const regex = new RegExp(pattern);
                if (regex.test(segment)) {
                    return propSchema;
                }
            } catch {
                // 忽略无效的正则表达式
            }
        }
        
        return undefined;
    }
    
    /**
     * 匹配 additionalProperties
     */
    private matchAdditionalProperties(schema: JsonSchemaNode): JsonSchemaNode | undefined {
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            return schema.additionalProperties as JsonSchemaNode;
        }
        return undefined;
    }

    /**
     * 匹配 items
     */
    private matchItems(schema: JsonSchemaNode): JsonSchemaNode | undefined {
        return schema.items as JsonSchemaNode | undefined;
    }
}

