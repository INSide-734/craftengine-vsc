import { EditorUri } from '../types/EditorTypes';

/**
 * 物品类型
 * 
 * - item: 普通物品（items 节点）
 * - block: 方块（blocks 节点）
 * - furniture: 家具（furniture 节点）
 */
export type ItemType = 'item' | 'block' | 'furniture';

/**
 * 物品 ID 信息
 * 
 * 表示在 items/blocks/furniture section 中定义的物品
 */
export interface IItemId {
    /** 物品完整 ID（命名空间:物品名） */
    id: string;
    /** 命名空间 */
    namespace: string;
    /** 物品名称（不含命名空间） */
    name: string;
    /** 物品类型：item（物品）、block（方块）、furniture（家具） */
    type: ItemType;
    /** 基础材质（如 DIAMOND_SWORD） */
    material?: string;
    /** 源文件路径 */
    sourceFile: string;
    /** 定义所在行号 */
    lineNumber?: number;
}

/**
 * 物品 ID 查询条件
 */
export interface IItemIdQuery {
    /** 命名空间过滤 */
    namespace?: string;
    /** 名称模式（正则表达式） */
    namePattern?: string;
    /** 源文件匹配 */
    sourceFile?: EditorUri;
    /** 分页：跳过数量 */
    skip?: number;
    /** 分页：限制数量 */
    limit?: number;
}

/**
 * 物品 ID 仓储接口
 */
export interface IItemIdRepository {
    /**
     * 获取所有物品 ID
     */
    getAllItems(): Promise<IItemId[]>;
    
    /**
     * 根据完整 ID 获取物品
     */
    getItemById(id: string): Promise<IItemId | undefined>;
    
    /**
     * 搜索物品（支持前缀匹配）
     */
    searchItems(prefix: string): Promise<IItemId[]>;
    
    /**
     * 根据命名空间获取物品
     */
    getItemsByNamespace(namespace: string): Promise<IItemId[]>;
    
    /**
     * 获取物品数量
     */
    getItemCount(): Promise<number>;
    
    /**
     * 添加物品
     */
    addItem(item: IItemId): Promise<void>;
    
    /**
     * 批量添加物品
     */
    addItems(items: IItemId[]): Promise<void>;
    
    /**
     * 删除物品
     */
    removeItem(id: string): Promise<void>;
    
    /**
     * 根据文件删除物品
     */
    removeItemsByFile(sourceFile: EditorUri): Promise<void>;
    
    /**
     * 清空所有物品
     */
    clearItems(): Promise<void>;
}

/**
 * 内置物品加载器接口
 *
 * 负责从外部数据源加载 Minecraft 内置物品列表
 */
export interface IBuiltinItemLoader {
    /**
     * 加载内置物品列表
     *
     * @returns 物品 ID 列表，失败时返回空数组
     */
    loadBuiltinItems(): Promise<IItemId[]>;
}



