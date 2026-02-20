import { type ILogger } from '../../../core/interfaces/ILogger';
import { type JsonSchemaNode } from '../../../core/types/JsonSchemaTypes';
import { type SchemaReferenceResolver, type SchemaProperty, type SchemaPropertyDetails, isCircularRef } from './index';
import { safeCompileRegex } from '../../../core/utils';

/**
 * Schema 属性提取器
 *
 * 负责从 Schema 中提取属性信息：
 * - 从 properties 提取
 * - 从 patternProperties 提取
 * - 从 allOf/oneOf/anyOf 提取
 * - 提取属性详细信息
 */
export class SchemaPropertyExtractor {
    constructor(
        private readonly resolver: SchemaReferenceResolver,
        _logger: ILogger,
    ) {}

    /**
     * 提取所有可用属性
     * @param schema 当前 Schema
     * @param contextSchema 上下文 Schema（用于解析内部引用，如 #/$defs/xxx）
     */
    async extractProperties(schema: JsonSchemaNode, contextSchema?: JsonSchemaNode): Promise<SchemaProperty[]> {
        const properties: SchemaProperty[] = [];
        const context = contextSchema || schema;

        // 从 properties 提取
        this.extractFromProperties(schema, properties);

        // 从 patternProperties 提取
        this.extractFromPatternProperties(schema, properties);

        // 从 allOf 提取
        await this.extractFromAllOf(schema, properties, context);

        // 从 oneOf 提取
        await this.extractFromOneOf(schema, properties, context);

        // 从 anyOf 提取
        await this.extractFromAnyOf(schema, properties, context);

        return properties;
    }

    /**
     * 查找特定属性的 Schema
     * @param parentSchema 父 Schema
     * @param propertyName 属性名
     * @param contextSchema 上下文 Schema（用于解析内部引用，如 #/$defs/xxx）
     */
    async findPropertySchema(
        parentSchema: JsonSchemaNode,
        propertyName: string,
        contextSchema?: JsonSchemaNode,
    ): Promise<JsonSchemaNode | undefined> {
        const context = contextSchema || parentSchema;

        let result: JsonSchemaNode | undefined = undefined;

        // 从 properties 查找
        const properties = parentSchema.properties as Record<string, JsonSchemaNode> | undefined;
        if (properties?.[propertyName]) {
            result = properties[propertyName];
        }

        // 从 patternProperties 查找
        const patternProperties = parentSchema.patternProperties as Record<string, JsonSchemaNode> | undefined;
        if (!result && patternProperties) {
            for (const [pattern, schema] of Object.entries(patternProperties)) {
                const regex = safeCompileRegex(pattern);
                if (regex && regex.test(propertyName)) {
                    result = schema;
                    break;
                }
            }
        }

        // 从 allOf 查找
        if (!result && parentSchema.allOf && Array.isArray(parentSchema.allOf)) {
            for (const subSchema of parentSchema.allOf as JsonSchemaNode[]) {
                let resolvedSubSchema = subSchema;
                if (subSchema?.$ref) {
                    resolvedSubSchema = (await this.resolver.resolveReferences(subSchema, 5, context)) || subSchema;
                }

                const subProperties = resolvedSubSchema.properties as Record<string, JsonSchemaNode> | undefined;
                if (subProperties?.[propertyName]) {
                    result = subProperties[propertyName];
                    break;
                }
            }
        }

        // 如果找到的 Schema 包含 $ref，解析它以获取完整定义
        if (result && result.$ref) {
            const resolved = await this.resolver.resolveReferences(result, 5, context);
            // 检查循环引用
            if (resolved && !isCircularRef(resolved)) {
                result = resolved;
            }
        }

        return result;
    }

    /**
     * 提取属性详细信息
     */
    extractPropertyDetails(
        propertySchema: JsonSchemaNode,
        parentSchema: JsonSchemaNode,
        propertyName: string,
    ): SchemaPropertyDetails {
        const details: SchemaPropertyDetails = {};

        if (propertySchema.description) {
            details.description = propertySchema.description as string;
        }

        if (propertySchema.type) {
            details.type = propertySchema.type as string | string[];
        }

        if (propertySchema.examples) {
            details.examples = propertySchema.examples as unknown[];
        }

        if (propertySchema.enum) {
            details.enum = propertySchema.enum as unknown[];
        }

        if (propertySchema.default !== undefined) {
            details.default = propertySchema.default;
        }

        if (propertySchema.pattern) {
            details.pattern = propertySchema.pattern as string;
        }

        // 检查是否为必需属性
        const required = parentSchema.required as string[] | undefined;
        if (required && Array.isArray(required)) {
            details.required = required.includes(propertyName);
        }

        // 检查是否已弃用
        if (propertySchema.deprecated) {
            details.deprecated = propertySchema.deprecated as boolean;
        }

        return details;
    }

    // ==================== 私有方法 ====================

    /**
     * 从 properties 提取
     */
    private extractFromProperties(schema: JsonSchemaNode, properties: SchemaProperty[]): void {
        if (!schema.properties) {
            return;
        }

        for (const [key, propSchema] of Object.entries(schema.properties as Record<string, unknown>)) {
            if (typeof propSchema === 'object' && propSchema !== null) {
                properties.push({ key, schema: propSchema as JsonSchemaNode });
            }
        }
    }

    /**
     * 从 patternProperties 提取
     */
    private extractFromPatternProperties(schema: JsonSchemaNode, properties: SchemaProperty[]): void {
        if (!schema.patternProperties) {
            return;
        }

        for (const [pattern, propSchema] of Object.entries(schema.patternProperties as Record<string, unknown>)) {
            if (typeof propSchema === 'object' && propSchema !== null) {
                const schemaObj = propSchema as JsonSchemaNode;
                const description = (schemaObj.description as string) || pattern;
                properties.push({
                    key: `[${pattern}]`,
                    schema: { ...schemaObj, 'x-pattern': pattern, description },
                });
            }
        }
    }

    /**
     * 从 allOf 提取
     *
     * 注意：只提取 properties，不提取 patternProperties
     * 因为 patternProperties 用于定义动态键，不应该从 allOf 继承
     * 这样可以避免父级的 patternProperties 错误地出现在子级的补全列表中
     */
    private async extractFromAllOf(
        schema: JsonSchemaNode,
        properties: SchemaProperty[],
        contextSchema?: JsonSchemaNode,
    ): Promise<void> {
        if (!schema.allOf || !Array.isArray(schema.allOf)) {
            return;
        }

        const context = contextSchema || schema;

        for (const subSchema of schema.allOf as JsonSchemaNode[]) {
            if (typeof subSchema !== 'object') {
                continue;
            }

            let resolvedSubSchema: JsonSchemaNode = subSchema;
            if (subSchema?.$ref) {
                const resolved = await this.resolver.resolveReferences(subSchema, 5, context);
                // 检查循环引用
                resolvedSubSchema = resolved && !isCircularRef(resolved) ? resolved : subSchema;
            }

            // 只提取子 schema 的 properties，不提取 patternProperties
            // patternProperties 定义的是当前层级的动态键规则，不应该被继承
            const subProperties = resolvedSubSchema.properties as Record<string, unknown> | undefined;
            if (subProperties) {
                for (const [key, propSchema] of Object.entries(subProperties)) {
                    if (
                        typeof propSchema === 'object' &&
                        propSchema !== null &&
                        !properties.find((p) => p.key === key)
                    ) {
                        properties.push({ key, schema: propSchema as JsonSchemaNode });
                    }
                }
            }

            // 不再从 allOf 的子 Schema 中提取 patternProperties
            // 这避免了 namespace:name 等模式在不应该出现的位置显示
        }
    }

    /**
     * 从 oneOf 提取
     *
     * 注意：只提取 properties，不提取 patternProperties
     */
    private async extractFromOneOf(
        schema: JsonSchemaNode,
        properties: SchemaProperty[],
        contextSchema?: JsonSchemaNode,
    ): Promise<void> {
        if (!schema.oneOf || !Array.isArray(schema.oneOf)) {
            return;
        }

        const context = contextSchema || schema;

        for (const subSchema of schema.oneOf as JsonSchemaNode[]) {
            if (typeof subSchema !== 'object') {
                continue;
            }

            let resolvedSubSchema: JsonSchemaNode = subSchema;
            if (subSchema?.$ref) {
                const resolved = await this.resolver.resolveReferences(subSchema, 5, context);
                // 检查循环引用
                resolvedSubSchema = resolved && !isCircularRef(resolved) ? resolved : subSchema;
            }

            // 只提取子 schema 的 properties（标记为条件属性）
            const subProperties = resolvedSubSchema.properties as Record<string, unknown> | undefined;
            if (subProperties) {
                for (const [key, propSchema] of Object.entries(subProperties)) {
                    if (
                        typeof propSchema === 'object' &&
                        propSchema !== null &&
                        !properties.find((p) => p.key === key)
                    ) {
                        const conditionalSchema: JsonSchemaNode = {
                            ...(propSchema as JsonSchemaNode),
                            _conditional: true,
                            _conditionType: 'oneOf',
                        };
                        properties.push({ key, schema: conditionalSchema });
                    }
                }
            }

            // 不从 oneOf 的子 Schema 中提取 patternProperties
        }
    }

    /**
     * 从 anyOf 提取
     *
     * 注意：只提取 properties，不提取 patternProperties
     */
    private async extractFromAnyOf(
        schema: JsonSchemaNode,
        properties: SchemaProperty[],
        contextSchema?: JsonSchemaNode,
    ): Promise<void> {
        if (!schema.anyOf || !Array.isArray(schema.anyOf)) {
            return;
        }

        const context = contextSchema || schema;

        for (const subSchema of schema.anyOf as JsonSchemaNode[]) {
            if (typeof subSchema !== 'object') {
                continue;
            }

            let resolvedSubSchema: JsonSchemaNode = subSchema;
            if (subSchema?.$ref) {
                const resolved = await this.resolver.resolveReferences(subSchema, 5, context);
                // 检查循环引用
                resolvedSubSchema = resolved && !isCircularRef(resolved) ? resolved : subSchema;
            }

            // 只提取子 schema 的 properties（标记为条件属性）
            const subProperties = resolvedSubSchema.properties as Record<string, unknown> | undefined;
            if (subProperties) {
                for (const [key, propSchema] of Object.entries(subProperties)) {
                    if (
                        typeof propSchema === 'object' &&
                        propSchema !== null &&
                        !properties.find((p) => p.key === key)
                    ) {
                        const conditionalSchema: JsonSchemaNode = {
                            ...(propSchema as JsonSchemaNode),
                            _conditional: true,
                            _conditionType: 'anyOf',
                        };
                        properties.push({ key, schema: conditionalSchema });
                    }
                }
            }

            // 不从 anyOf 的子 Schema 中提取 patternProperties
        }
    }
}
