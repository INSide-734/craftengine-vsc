import { type EditorUri } from '../types/EditorTypes';

/**
 * 分类信息
 *
 * 表示在 categories: section 中定义的分类
 */
export interface ICategory {
    /** 分类完整 ID（命名空间:分类名），带 # 前缀 */
    id: string;
    /** 命名空间 */
    namespace: string;
    /** 分类名称（不含命名空间和 # 前缀） */
    name: string;
    /** 分类显示名称 */
    displayName?: string;
    /** 分类描述/lore */
    description?: string[];
    /** 分类图标物品 ID */
    icon?: string;
    /** 是否隐藏 */
    hidden?: boolean;
    /** 优先级 */
    priority?: number;
    /** 源文件路径 */
    sourceFile: string;
    /** 定义所在行号 */
    lineNumber?: number;
}

/**
 * 分类查询条件
 */
export interface ICategoryQuery {
    /** 命名空间过滤 */
    namespace?: string;
    /** 名称模式（正则表达式） */
    namePattern?: string;
    /** 源文件匹配 */
    sourceFile?: EditorUri;
    /** 是否包含隐藏分类 */
    includeHidden?: boolean;
    /** 分页：跳过数量 */
    skip?: number;
    /** 分页：限制数量 */
    limit?: number;
}

/**
 * 分类仓储接口
 */
export interface ICategoryRepository {
    /**
     * 获取所有分类
     */
    getAllCategories(): Promise<ICategory[]>;

    /**
     * 根据完整 ID 获取分类（支持带或不带 # 前缀）
     */
    getCategoryById(id: string): Promise<ICategory | undefined>;

    /**
     * 搜索分类（支持前缀匹配）
     */
    searchCategories(prefix: string): Promise<ICategory[]>;

    /**
     * 根据命名空间获取分类
     */
    getCategoriesByNamespace(namespace: string): Promise<ICategory[]>;

    /**
     * 获取分类数量
     */
    getCategoryCount(): Promise<number>;

    /**
     * 添加分类
     */
    addCategory(category: ICategory): Promise<void>;

    /**
     * 批量添加分类
     */
    addCategories(categories: ICategory[]): Promise<void>;

    /**
     * 删除分类
     */
    removeCategory(id: string): Promise<void>;

    /**
     * 根据文件删除分类
     */
    removeCategoriesByFile(sourceFile: EditorUri): Promise<void>;

    /**
     * 清空所有分类
     */
    clearCategories(): Promise<void>;
}
