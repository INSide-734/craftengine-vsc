import { EditorUri } from '../types/EditorTypes';
import { ITemplate } from './ITemplate';
import { ITranslationKey, ITranslationReference } from './ITranslation';
import { ITemplateQuery } from './ITemplateRepository';
import { IItemId, IItemIdQuery } from './IItemId';
import { ICategory, ICategoryQuery } from './ICategory';
import { IDataStoreLifecycle } from './IDataStoreLifecycle';

// 重导出查询类型以便使用者可以从此模块导入
export { ITemplateQuery, IItemIdQuery, ICategoryQuery };

/**
 * 翻译键查询条件
 */
export interface ITranslationQuery {
    /** 名称匹配（正则表达式） */
    namePattern?: string;
    /** 源文件匹配 */
    sourceFile?: EditorUri;
    /** 语言代码 */
    languageCode?: string;
    /** 分页：跳过数量 */
    skip?: number;
    /** 分页：限制数量 */
    limit?: number;
}

/**
 * 查询结果
 */
export interface IQueryResult<T> {
    /** 数据列表 */
    items: T[];
    /** 总数 */
    total: number;
    /** 是否有更多数据 */
    hasMore: boolean;
}

/**
 * 数据存储统计信息
 */
export interface IDataStoreStatistics {
    /** 模板总数 */
    templateCount: number;
    /** 翻译键总数 */
    translationKeyCount: number;
    /** 物品 ID 总数 */
    itemCount: number;
    /** 分类总数 */
    categoryCount: number;
    /** 已索引文件数 */
    indexedFileCount: number;
    /** 语言数量 */
    languageCount: number;
    /** 命名空间数量 */
    namespaceCount: number;
    /** 最后更新时间 */
    lastUpdated: Date;
    /** 是否已初始化 */
    isInitialized: boolean;
}

/**
 * 统一数据存储服务接口
 *
 * 继承 IDataStoreLifecycle 获得生命周期管理能力，
 * 同时提供模板、翻译键、物品 ID、分类的统一查询和变更方法。
 *
 * 消费者应优先依赖细粒度接口（ITemplateRepository、ITranslationRepository、
 * IItemIdRepository、ICategoryRepository、IDataStoreLifecycle），
 * 仅在确实需要跨领域操作时才依赖此聚合接口。
 */
export interface IDataStoreService extends IDataStoreLifecycle {
    // ========================================
    // 模板操作
    // ========================================

    /** 根据 ID 获取模板 */
    getTemplateById(id: string): Promise<ITemplate | undefined>;
    /** 根据名称获取模板 */
    getTemplateByName(name: string): Promise<ITemplate | undefined>;
    /** 查询模板 */
    queryTemplates(query: ITemplateQuery): Promise<IQueryResult<ITemplate>>;
    /** 获取所有模板 */
    getAllTemplates(): Promise<ITemplate[]>;
    /** 获取模板数量 */
    getTemplateCount(): Promise<number>;
    /** 添加模板 */
    addTemplate(template: ITemplate): Promise<void>;
    /** 批量添加模板 */
    addTemplates(templates: ITemplate[]): Promise<void>;
    /** 更新模板 */
    updateTemplate(template: ITemplate): Promise<void>;
    /** 删除模板 */
    removeTemplate(id: string): Promise<void>;
    /** 根据文件删除模板 */
    removeTemplatesByFile(sourceFile: EditorUri): Promise<void>;
    /** 检查模板是否存在 */
    templateExists(id: string): Promise<boolean>;

    // ========================================
    // 翻译键操作
    // ========================================

    /** 获取所有翻译键 */
    getAllTranslationKeys(): Promise<ITranslationKey[]>;
    /** 根据键名获取翻译键（可能存在多个语言版本） */
    getTranslationKeysByName(key: string): Promise<ITranslationKey[]>;
    /** 根据语言代码获取翻译键 */
    getTranslationKeysByLanguage(languageCode: string): Promise<ITranslationKey[]>;
    /** 搜索翻译键（支持前缀匹配） */
    searchTranslationKeys(prefix: string): Promise<ITranslationKey[]>;
    /** 查询翻译键 */
    queryTranslationKeys(query: ITranslationQuery): Promise<IQueryResult<ITranslationKey>>;
    /** 获取翻译键数量 */
    getTranslationKeyCount(): Promise<number>;
    /** 添加翻译键 */
    addTranslationKey(key: ITranslationKey): Promise<void>;
    /** 删除翻译键 */
    removeTranslationKey(fullPath: string): Promise<void>;
    /** 根据文件删除翻译键 */
    removeTranslationKeysByFile(sourceFile: EditorUri): Promise<void>;
    /** 按键名获取所有翻译引用位置 */
    getTranslationReferences(keyName: string): readonly ITranslationReference[];

    // ========================================
    // 物品 ID 操作
    // ========================================

    /** 获取所有物品 ID */
    getAllItems(): Promise<IItemId[]>;
    /** 根据完整 ID 获取物品 */
    getItemById(id: string): Promise<IItemId | undefined>;
    /** 搜索物品（支持前缀匹配） */
    searchItems(prefix: string): Promise<IItemId[]>;
    /** 根据命名空间获取物品 */
    getItemsByNamespace(namespace: string): Promise<IItemId[]>;
    /** 获取物品数量 */
    getItemCount(): Promise<number>;
    /** 添加物品 */
    addItem(item: IItemId): Promise<void>;
    /** 删除物品 */
    removeItem(id: string): Promise<void>;
    /** 根据文件删除物品 */
    removeItemsByFile(sourceFile: EditorUri): Promise<void>;
    /** 加载 Minecraft 内置物品列表 */
    loadMinecraftBuiltinItems(): Promise<boolean>;
    /** 检查是否已加载 Minecraft 内置物品 */
    isBuiltinItemsLoaded(): boolean;
    /** 重新加载 Minecraft 内置物品 */
    reloadMinecraftBuiltinItems(): Promise<boolean>;

    // ========================================
    // 分类操作
    // ========================================

    /** 获取所有分类 */
    getAllCategories(): Promise<ICategory[]>;
    /** 根据完整 ID 获取分类（支持带或不带 # 前缀） */
    getCategoryById(id: string): Promise<ICategory | undefined>;
    /** 搜索分类（支持前缀匹配） */
    searchCategories(prefix: string): Promise<ICategory[]>;
    /** 根据命名空间获取分类 */
    getCategoriesByNamespace(namespace: string): Promise<ICategory[]>;
    /** 获取分类数量 */
    getCategoryCount(): Promise<number>;
    /** 添加分类 */
    addCategory(category: ICategory): Promise<void>;
    /** 删除分类 */
    removeCategory(id: string): Promise<void>;
    /** 根据文件删除分类 */
    removeCategoriesByFile(sourceFile: EditorUri): Promise<void>;
}
