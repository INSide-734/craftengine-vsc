import { EditorExtensionContext } from '../types/EditorTypes';

/**
 * JSON Schema 基础类型定义
 * 
 * 表示 JSON Schema 对象的类型，支持嵌套结构
 */
export interface IJsonSchema {
    /** Schema 类型 */
    type?: string | string[];
    /** 属性定义 */
    properties?: Record<string, IJsonSchema>;
    /** 必需属性 */
    required?: string[];
    /** 数组项定义 */
    items?: IJsonSchema | IJsonSchema[];
    /** 引用 */
    $ref?: string;
    /** 描述 */
    description?: string;
    /** 标题 */
    title?: string;
    /** 默认值 */
    default?: unknown;
    /** 枚举值 */
    enum?: unknown[];
    /** 示例值 */
    examples?: unknown[];
    /** 模式 */
    pattern?: string;
    /** 是否已弃用 */
    deprecated?: boolean;
    /** allOf 组合 */
    allOf?: IJsonSchema[];
    /** anyOf 组合 */
    anyOf?: IJsonSchema[];
    /** oneOf 组合 */
    oneOf?: IJsonSchema[];
    /** 额外属性 */
    additionalProperties?: boolean | IJsonSchema;
    /** 模式属性 */
    patternProperties?: Record<string, IJsonSchema>;
    /** 自定义属性 (x- 开头) */
    [key: `x-${string}`]: unknown;
}

/**
 * Schema 服务接口
 * 
 * 提供 JSON Schema 查询、加载和自定义属性获取功能
 */
export interface ISchemaService {
    /**
     * 注册 Schema 提供者
     */
    registerSchemaProvider(context: EditorExtensionContext): Promise<void>;
    
    /**
     * 根据 YAML 路径获取对应的 Schema 定义
     * 
     * @param path YAML 路径数组，例如 ["items", "my-item", "template"]
     * @returns Schema 定义对象，如果未找到则返回 undefined
     */
    getSchemaForPath(path: string[]): Promise<IJsonSchema | undefined>;
    
    /**
     * 快速检查指定路径是否有可用的 Schema
     * 
     * 使用缓存提供快速响应，适合在 shouldActivate 等性能敏感场景使用
     * 
     * @param path YAML 路径数组
     * @returns 如果路径有可用 Schema 返回 true
     */
    hasSchemaForPath(path: string[]): boolean;
    
    /**
     * 加载指定的 Schema 文件
     * 
     * @param filename Schema 文件名（相对于 schemas 目录）
     * @returns Schema 对象
     */
    loadSchemaFile(filename: string): Promise<IJsonSchema>;
    
    /**
     * 解析 Schema 中的 $ref 引用
     * 
     * @param schema Schema 对象
     * @param maxDepth 最大递归深度，防止循环引用
     * @returns 解析后的 Schema 对象
     */
    resolveReferences(schema: IJsonSchema, maxDepth?: number): Promise<IJsonSchema>;
    
    /**
     * 获取 Schema 中的自定义属性（x- 开头）
     * 
     * @param schema Schema 对象
     * @param property 自定义属性名（不含 x- 前缀）
     * @returns 属性值，如果不存在则返回 undefined
     */
    getCustomProperty(schema: IJsonSchema, property: string): unknown;
    
    /**
     * 获取根 Schema 中定义的顶级字段名称
     * 
     * 从 index.schema.json 的 patternProperties 中提取字段名称
     * 
     * @returns 顶级字段名称数组，例如 ['items', 'templates', 'categories']
     */
    getTopLevelFields(): Promise<string[]>;
    
    /**
     * 获取指定路径下可用的属性键名
     * 
     * @param path YAML 路径数组
     * @returns 属性键名数组及其 schema 信息
     */
    getAvailableProperties(path: string[]): Promise<Array<{ key: string; schema: IJsonSchema }>>;
    
    /**
     * 获取指定路径的属性详情
     * 
     * @param path YAML 路径数组
     * @returns 属性的详细信息（类型、描述、枚举值等）
     */
    getPropertyDetails(path: string[]): Promise<{
        description?: string;
        type?: string | string[];
        examples?: unknown[];
        enum?: unknown[];
        default?: unknown;
        required?: boolean;
        deprecated?: boolean;
        pattern?: string;
    } | undefined>;

    /**
     * 获取 Schema 加载服务实例
     *
     * 返回内部的 SchemaLoaderService，用于高级操作（如部署、重置）。
     * 调用方需要将返回值转换为具体类型。
     *
     * @returns Schema 加载服务实例，如果未初始化则返回 undefined
     */
    getLoaderService(): unknown;
}

