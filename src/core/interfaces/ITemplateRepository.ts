import { type EditorUri } from '../types/EditorTypes';
import { type ITemplate } from './ITemplate';

/**
 * 模板查询条件
 */
export interface ITemplateQuery {
    /** 名称匹配 */
    namePattern?: string;
    /** 参数匹配 */
    hasParameter?: string;
    /** 文件路径匹配 */
    sourceFile?: EditorUri;
    /** 分页 */
    skip?: number;
    limit?: number;
}

/**
 * 模板查询结果
 */
export interface ITemplateQueryResult {
    /** 模板列表 */
    templates: ITemplate[];
    /** 总数 */
    total: number;
    /** 是否有更多数据 */
    hasMore: boolean;
}

/**
 * 模板统计信息
 */
export interface ITemplateStatistics {
    /** 模板总数 */
    totalTemplates: number;
    /** 文件总数 */
    totalFiles: number;
    /** 最后更新时间 */
    lastUpdated: Date;
    /** 缓存命中率（无数据时为 undefined） */
    cacheHitRate?: number;
}

/**
 * 模板仓储接口
 *
 * 提供模板数据的存储、检索和管理功能。
 */
export interface ITemplateRepository {
    /**
     * 获取模板
     */
    getById(id: string): Promise<ITemplate | undefined>;

    /**
     * 根据名称获取模板
     */
    getByName(name: string): Promise<ITemplate | undefined>;

    /**
     * 查询模板
     */
    query(query: ITemplateQuery): Promise<ITemplateQueryResult>;

    /**
     * 获取所有模板
     */
    getAll(): Promise<ITemplate[]>;

    /**
     * 添加模板
     */
    add(template: ITemplate): Promise<void>;

    /**
     * 批量添加模板
     */
    addMany(templates: ITemplate[]): Promise<void>;

    /**
     * 更新模板
     */
    update(template: ITemplate): Promise<void>;

    /**
     * 删除模板
     */
    remove(id: string): Promise<void>;

    /**
     * 根据文件删除模板
     */
    removeByFile(sourceFile: EditorUri): Promise<void>;

    /**
     * 清空所有模板
     */
    clearTemplates(): Promise<void>;

    /**
     * 获取模板统计信息
     */
    getTemplateStatistics(): Promise<ITemplateStatistics>;

    /**
     * 检查模板是否存在
     */
    exists(id: string): Promise<boolean>;

    /**
     * 获取模板数量
     */
    count(): Promise<number>;
}
