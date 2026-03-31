/**
 * JSON Schema 相关类型定义
 *
 * 用于替代 Schema 处理代码中的 any 类型
 */

/**
 * JSON Schema 节点类型
 *
 * 表示一个 JSON Schema 对象节点，用于替代 `any` 类型。
 * 使用索引签名提供动态属性访问能力，同时保持类型安全。
 *
 * 注意：此类型兼容 JSONSchema7 和 IJsonSchema，
 * 可以通过 `as JsonSchemaNode` 安全转换。
 */

export interface IJsonSchemaNode {
    [key: string]: unknown;
}

/**
 * JSON Schema 属性映射
 *
 * 表示 JSON Schema 中 `properties` 字段的类型。
 */
export type JsonSchemaProperties = Record<string, IJsonSchemaNode>;
