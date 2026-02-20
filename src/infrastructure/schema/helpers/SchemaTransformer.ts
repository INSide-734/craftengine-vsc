import { type JSONSchema7 } from 'json-schema';
import { type JsonSchemaNode } from '../../../core/types/JsonSchemaTypes';

/**
 * 版本条件键的正则模式
 */
const VERSION_CONDITION_PATTERN = '^\\$\\$(>=|<=|>|<|=)?\\d+\\.\\d+(\\.\\d+)?(~\\d+\\.\\d+(\\.\\d+)?)?$';

/**
 * Schema 运行时变换器
 *
 * 负责在验证前对 Schema 进行运行时变换，包括：
 * - 版本条件支持展开（x-supports-version-condition）
 * - 验证级别调整（strict/loose 的 additionalProperties 控制）
 */
export class SchemaTransformer {
    /**
     * 准备 schema（根据验证级别调整）
     */
    prepareSchema(schema: JSONSchema7, level: 'strict' | 'loose' | 'off'): JSONSchema7 {
        // 深拷贝避免变异原始 schema，后续操作均在克隆上进行
        const prepared = JSON.parse(JSON.stringify(schema)) as JSONSchema7;

        // 处理 x-supports-version-condition 标记
        this.expandVersionConditionSupport(prepared as unknown as JsonSchemaNode);

        if (level === 'loose') {
            this.setAdditionalPropertiesRecursive(prepared as unknown as JsonSchemaNode, true);
        } else if (level === 'strict') {
            this.setAdditionalPropertiesRecursive(prepared as unknown as JsonSchemaNode, false);
        }

        return prepared;
    }

    /**
     * 展开版本条件支持
     *
     * 遍历 Schema，当对象有 x-supports-version-condition: true 时，
     * 将其属性的类型定义扩展为支持版本条件对象
     */
    expandVersionConditionSupport(schema: JsonSchemaNode): void {
        if (!schema || typeof schema !== 'object') {
            return;
        }

        // 检查当前对象是否支持版本条件
        if (schema['x-supports-version-condition'] === true && schema.properties) {
            const props = schema.properties as Record<string, unknown>;
            for (const [key, propSchema] of Object.entries(props)) {
                if (propSchema && typeof propSchema === 'object') {
                    props[key] = this.expandPropertyForVersionCondition(propSchema as JsonSchemaNode);
                }
            }
        }

        // 递归处理子 Schema
        if (schema.properties) {
            for (const prop of Object.values(schema.properties as Record<string, unknown>)) {
                if (prop && typeof prop === 'object') {
                    this.expandVersionConditionSupport(prop as JsonSchemaNode);
                }
            }
        }

        if (schema.patternProperties) {
            for (const prop of Object.values(schema.patternProperties as Record<string, unknown>)) {
                if (prop && typeof prop === 'object') {
                    this.expandVersionConditionSupport(prop as JsonSchemaNode);
                }
            }
        }

        if (schema.$defs) {
            for (const def of Object.values(schema.$defs as Record<string, unknown>)) {
                if (def && typeof def === 'object') {
                    this.expandVersionConditionSupport(def as JsonSchemaNode);
                }
            }
        }

        if (schema.definitions) {
            for (const def of Object.values(schema.definitions as Record<string, unknown>)) {
                if (def && typeof def === 'object') {
                    this.expandVersionConditionSupport(def as JsonSchemaNode);
                }
            }
        }

        // 处理 allOf, anyOf, oneOf
        for (const key of ['allOf', 'anyOf', 'oneOf']) {
            if (Array.isArray(schema[key])) {
                for (const item of schema[key] as JsonSchemaNode[]) {
                    this.expandVersionConditionSupport(item);
                }
            }
        }

        // 处理 items（数组项）
        if (schema.items) {
            if (Array.isArray(schema.items)) {
                for (const item of schema.items as JsonSchemaNode[]) {
                    this.expandVersionConditionSupport(item);
                }
            } else if (typeof schema.items === 'object') {
                this.expandVersionConditionSupport(schema.items as JsonSchemaNode);
            }
        }

        // 处理 additionalProperties（如果是 schema）
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            this.expandVersionConditionSupport(schema.additionalProperties as JsonSchemaNode);
        }
    }

    /**
     * 扩展单个属性以支持版本条件对象
     *
     * 将 { type: "string" } 转换为 oneOf: [{ type: "string" }, { 版本条件对象 }]
     * 返回新对象，不变异传入的 propSchema。
     */
    private expandPropertyForVersionCondition(propSchema: JsonSchemaNode): JsonSchemaNode {
        // 如果已经是 oneOf/anyOf，假设已经正确配置
        if (propSchema.oneOf || propSchema.anyOf) {
            return propSchema;
        }

        if (!propSchema.type) {
            return propSchema;
        }

        // 提取元数据属性（保留在外层）和类型相关属性（放入 oneOf 第一项）
        const { description, title, ...typeRelatedProps } = propSchema;

        // 构建版本条件对象 Schema
        const versionConditionSchema: JsonSchemaNode = {
            type: 'object',
            patternProperties: {
                [VERSION_CONDITION_PATTERN]: {},
                '^default$': {},
            },
            additionalProperties: false,
        };

        // 返回新对象
        return {
            ...(description !== undefined ? { description } : {}),
            ...(title !== undefined ? { title } : {}),
            oneOf: [typeRelatedProps, versionConditionSchema],
        };
    }

    /**
     * 递归设置 additionalProperties
     */
    private setAdditionalPropertiesRecursive(schema: JsonSchemaNode, value: boolean): void {
        if (!schema || typeof schema !== 'object') {
            return;
        }

        if (schema.type === 'object' && schema.additionalProperties === undefined) {
            schema.additionalProperties = value;
        }

        ['properties', 'patternProperties', 'definitions', '$defs', 'allOf', 'anyOf', 'oneOf'].forEach((key) => {
            if (schema[key]) {
                if (Array.isArray(schema[key])) {
                    (schema[key] as JsonSchemaNode[]).forEach((s: JsonSchemaNode) =>
                        this.setAdditionalPropertiesRecursive(s, value),
                    );
                } else if (typeof schema[key] === 'object') {
                    Object.values(schema[key] as Record<string, JsonSchemaNode>).forEach((s: JsonSchemaNode) =>
                        this.setAdditionalPropertiesRecursive(s, value),
                    );
                }
            }
        });
    }
}
