import { EditorUri } from '../../../core/types/EditorTypes';
import { ILogger } from '../../../core/interfaces/ILogger';
import { ICategory, ICategoryRepository } from '../../../core/interfaces/ICategory';
import { IEventBus } from '../../../core/interfaces/IEventBus';
import { EVENT_TYPES } from '../../../core/constants/ServiceTokens';
import { generateEventId } from '../../../core/utils';

/**
 * 分类存储
 * 
 * 管理用户在 categories: section 中定义的分类
 */
export class CategoryStore implements ICategoryRepository {
    /** 分类索引：分类 ID -> 分类信息 */
    private readonly categories = new Map<string, ICategory>();
    /** 命名空间索引：命名空间 -> 分类 ID 集合 */
    private readonly namespaceIndex = new Map<string, Set<string>>();
    /** 文件索引：文件路径 -> 分类 ID 集合 */
    private readonly fileIndex = new Map<string, Set<string>>();
    
    constructor(
        private readonly logger: ILogger,
        private readonly eventBus?: IEventBus
    ) {
        this.logger = logger.createChild('CategoryStore');
    }
    
    // ========================================
    // 查询接口
    // ========================================
    
    /**
     * 获取所有分类
     */
    async getAllCategories(): Promise<ICategory[]> {
        return Array.from(this.categories.values());
    }
    
    /**
     * 根据完整 ID 获取分类（支持带或不带 # 前缀）
     */
    async getCategoryById(id: string): Promise<ICategory | undefined> {
        // 标准化 ID（确保带 # 前缀）
        const normalizedId = id.startsWith('#') ? id : `#${id}`;
        return this.categories.get(normalizedId);
    }
    
    /**
     * 搜索分类（支持前缀匹配）
     */
    async searchCategories(prefix: string): Promise<ICategory[]> {
        const normalizedPrefix = prefix.startsWith('#') ? prefix.toLowerCase() : `#${prefix.toLowerCase()}`;
        
        return Array.from(this.categories.values())
            .filter(category => category.id.toLowerCase().startsWith(normalizedPrefix));
    }
    
    /**
     * 根据命名空间获取分类
     */
    async getCategoriesByNamespace(namespace: string): Promise<ICategory[]> {
        const ids = this.namespaceIndex.get(namespace);
        if (!ids) {
            return [];
        }
        
        const result: ICategory[] = [];
        for (const id of ids) {
            const category = this.categories.get(id);
            if (category) {
                result.push(category);
            }
        }
        return result;
    }
    
    /**
     * 获取分类数量
     */
    async getCategoryCount(): Promise<number> {
        return this.categories.size;
    }
    
    /**
     * 检查分类是否存在
     */
    async hasCategory(id: string): Promise<boolean> {
        const normalizedId = id.startsWith('#') ? id : `#${id}`;
        return this.categories.has(normalizedId);
    }
    
    // ========================================
    // 修改接口
    // ========================================
    
    /**
     * 添加分类
     */
    async addCategory(category: ICategory): Promise<void> {
        this.addCategoryInternal(category);
        await this.publishCategoryCreated(this.categories.get(
            category.id.startsWith('#') ? category.id : `#${category.id}`
        )!);
    }

    /**
     * 批量添加分类
     */
    async addCategories(categories: ICategory[]): Promise<void> {
        const added: ICategory[] = [];
        for (const category of categories) {
            added.push(this.addCategoryInternal(category));
        }

        // 批量发布事件
        for (const normalizedCategory of added) {
            await this.publishCategoryCreated(normalizedCategory);
        }

        this.logger.debug('Categories batch added', {
            count: categories.length
        });
    }

    /**
     * 删除分类
     */
    async removeCategory(id: string): Promise<void> {
        const normalizedId = id.startsWith('#') ? id : `#${id}`;
        const category = this.categories.get(normalizedId);
        
        if (!category) {
            return;
        }
        
        // 从主索引删除
        this.categories.delete(normalizedId);
        
        // 从命名空间索引删除
        const namespaceSet = this.namespaceIndex.get(category.namespace);
        if (namespaceSet) {
            namespaceSet.delete(normalizedId);
            if (namespaceSet.size === 0) {
                this.namespaceIndex.delete(category.namespace);
            }
        }
        
        // 从文件索引删除
        const fileSet = this.fileIndex.get(category.sourceFile);
        if (fileSet) {
            fileSet.delete(normalizedId);
            if (fileSet.size === 0) {
                this.fileIndex.delete(category.sourceFile);
            }
        }
        
        this.logger.debug('Category removed', { id: normalizedId });
        await this.publishCategoryDeleted(normalizedId);
    }
    
    /**
     * 根据文件删除分类
     */
    async removeCategoriesByFile(sourceFile: EditorUri): Promise<void> {
        const fileSet = this.fileIndex.get(sourceFile.fsPath);
        
        if (!fileSet) {
            return;
        }
        
        const idsToRemove = Array.from(fileSet);
        for (const id of idsToRemove) {
            await this.removeCategory(id);
        }
        
        this.logger.debug('Categories removed by file', {
            file: sourceFile.fsPath,
            count: idsToRemove.length
        });
    }
    
    /**
     * 清空所有分类
     */
    async clearCategories(): Promise<void> {
        const count = this.categories.size;

        this.categories.clear();
        this.namespaceIndex.clear();
        this.fileIndex.clear();

        this.logger.debug('All categories cleared', { count });
        await this.publishCategoryCleared(count);
    }
    
    // ========================================
    // 统计方法
    // ========================================
    
    /**
     * 获取统计信息
     */
    getStats(): { total: number; namespaces: number; files: number } {
        return {
            total: this.categories.size,
            namespaces: this.namespaceIndex.size,
            files: this.fileIndex.size
        };
    }

    // ========================================
    // 内部方法
    // ========================================

    /**
     * 添加分类到存储（不发布事件）
     */
    private addCategoryInternal(category: ICategory): ICategory {
        // 确保 ID 带 # 前缀
        const normalizedCategory = {
            ...category,
            id: category.id.startsWith('#') ? category.id : `#${category.id}`
        };

        this.categories.set(normalizedCategory.id, normalizedCategory);

        // 更新命名空间索引
        let namespaceSet = this.namespaceIndex.get(normalizedCategory.namespace);
        if (!namespaceSet) {
            namespaceSet = new Set();
            this.namespaceIndex.set(normalizedCategory.namespace, namespaceSet);
        }
        namespaceSet.add(normalizedCategory.id);

        // 更新文件索引
        let fileSet = this.fileIndex.get(normalizedCategory.sourceFile);
        if (!fileSet) {
            fileSet = new Set();
            this.fileIndex.set(normalizedCategory.sourceFile, fileSet);
        }
        fileSet.add(normalizedCategory.id);

        this.logger.debug('Category added', {
            id: normalizedCategory.id,
            namespace: normalizedCategory.namespace
        });

        return normalizedCategory;
    }

    // ========================================
    // 事件发布
    // ========================================

    private async publishCategoryCreated(category: ICategory): Promise<void> {
        if (!this.eventBus) { return; }
        await this.eventBus.publish(EVENT_TYPES.CategoryCreated, {
            id: generateEventId('cat'),
            type: EVENT_TYPES.CategoryCreated,
            timestamp: new Date(),
            source: 'CategoryStore',
            aggregateId: category.id,
            category
        });
    }

    private async publishCategoryDeleted(categoryId: string): Promise<void> {
        if (!this.eventBus) { return; }
        await this.eventBus.publish(EVENT_TYPES.CategoryDeleted, {
            id: generateEventId('cat'),
            type: EVENT_TYPES.CategoryDeleted,
            timestamp: new Date(),
            source: 'CategoryStore',
            aggregateId: categoryId,
            categoryId
        });
    }

    private async publishCategoryCleared(count: number): Promise<void> {
        if (!this.eventBus) { return; }
        await this.eventBus.publish(EVENT_TYPES.CategoryCleared, {
            id: generateEventId('cat'),
            type: EVENT_TYPES.CategoryCleared,
            timestamp: new Date(),
            source: 'CategoryStore',
            count
        });
    }
}


