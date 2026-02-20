import { type JsonSchemaNode } from '../types/JsonSchemaTypes';

/**
 * Schema 文件加载器接口
 *
 * 抽象 Schema 文件的加载操作，使 SchemaReferenceResolver 等组件
 * 不直接依赖具体的文件加载实现。
 */
export interface ISchemaFileLoader {
    /**
     * 加载 Schema 文件
     *
     * @param filename - Schema 文件名（相对于 schemas 目录）
     * @param useCache - 是否使用缓存，默认 true
     * @returns Schema 对象
     */
    loadSchema(filename: string, useCache?: boolean): Promise<JsonSchemaNode>;

    /**
     * 清除缓存
     */
    clearCache(): void;

    /**
     * 设置工作区 Schema 目录（可选，仅文件系统实现支持）
     *
     * @param dir - 工作区 Schema 目录路径
     */
    setWorkspaceSchemaDir?(dir: string | undefined): void;

    /**
     * 重新加载指定 Schema 文件（可选）
     *
     * @param filename - Schema 文件名
     * @returns Schema 对象
     */
    reloadSchema?(filename: string): Promise<JsonSchemaNode>;
}
