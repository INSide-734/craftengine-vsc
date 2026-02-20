import { type JSONSchema7 } from 'json-schema';

/**
 * Schema 解析结果
 */
export interface ISchemaParseResult {
    /** 原始 schema */
    schema: JSONSchema7;
    /** 解析后的 schema（已解析 $ref） */
    resolved: JSONSchema7;
    /** 依赖的 schema ID 列表 */
    dependencies: string[];
}

/**
 * Schema 查询结果
 */
export interface ISchemaMatch {
    /** 匹配的 schema */
    schema: JSONSchema7;
    /** Schema 路径 */
    path: string[];
    /** Schema ID */
    id?: string;
    /** 匹配得分（0-1） */
    score: number;
}

/**
 * Schema 上下文信息
 */
export interface ISchemaContext {
    /** YAML 路径（例如：['items', 'default:my_item', 'data']） */
    yamlPath: string[];
    /** 当前键名 */
    currentKey?: string;
    /** 父级 schema */
    parentSchema?: JSONSchema7;
    /** 是否在对象内 */
    inObject: boolean;
    /** 是否在数组内 */
    inArray: boolean;
}

/**
 * Schema 解析器接口
 */
export interface ISchemaParser {
    /**
     * 加载 schema 文件
     * @param schemaId Schema ID 或文件路径
     * @returns Schema 解析结果
     */
    loadSchema(schemaId: string): Promise<ISchemaParseResult>;

    /**
     * 解析 $ref 引用
     * @param ref 引用字符串（例如：'#/$defs/itemConfig'）
     * @param baseSchema 基础 schema
     * @returns 解析后的 schema
     */
    resolveRef(ref: string, baseSchema: JSONSchema7): Promise<JSONSchema7 | undefined>;

    /**
     * 根据上下文查找匹配的 schema
     * @param context Schema 上下文
     * @returns 匹配的 schema 列表
     */
    findSchemaForContext(context: ISchemaContext): Promise<ISchemaMatch[]>;

    /**
     * 从 schema 中提取属性
     * @param schema JSON Schema
     * @returns 属性列表
     */
    extractProperties(schema: JSONSchema7): Map<string, JSONSchema7>;

    /**
     * 从 schema 中提取枚举值
     * @param schema JSON Schema
     * @returns 枚举值列表
     */
    extractEnumValues(schema: JSONSchema7): string[];

    /**
     * 清除缓存
     */
    clearCache(): void;
}
