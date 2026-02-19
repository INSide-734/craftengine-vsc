import { EditorUri } from '../../../core/types/EditorTypes';
import { IItemId, IItemIdRepository, IBuiltinItemLoader } from '../../../core/interfaces/IItemId';
import { ILogger } from '../../../core/interfaces/ILogger';
import { IEventBus } from '../../../core/interfaces/IEventBus';
import { EVENT_TYPES } from '../../../core/constants/ServiceTokens';
import { generateEventId } from '../../../core/utils';

/**
 * 物品 ID 存储管理
 * 
 * 负责物品 ID 的存储、索引和查询操作。
 * 使用内存索引提供高性能的数据访问。
 */
export class ItemStore implements IItemIdRepository {
    /** 物品主存储：ID -> 物品对象 */
    private readonly items = new Map<string, IItemId>();
    /** 命名空间索引：命名空间 -> 物品 ID 集合 */
    private readonly namespaceIndex = new Map<string, Set<string>>();
    /** 文件索引：文件路径 -> 物品 ID 集合 */
    private readonly fileIndex = new Map<string, Set<string>>();
    /** 小写搜索索引：小写 ID -> 原始 ID（避免搜索时重复 toLowerCase） */
    private readonly lowerCaseIndex = new Map<string, string>();
    
    private lastUpdated = new Date();
    
    /** Minecraft 内置物品加载器 */
    private builtinItemLoader?: IBuiltinItemLoader;
    
    /** 是否已加载内置物品 */
    private builtinItemsLoaded = false;
    
    constructor(
        private readonly logger: ILogger,
        builtinItemLoader?: IBuiltinItemLoader,
        private readonly eventBus?: IEventBus
    ) {
        this.builtinItemLoader = builtinItemLoader;
    }
    
    // ========================================
    // 查询操作
    // ========================================
    
    async getAllItems(): Promise<IItemId[]> {
        return Array.from(this.items.values());
    }
    
    async getItemById(id: string): Promise<IItemId | undefined> {
        return this.items.get(id);
    }
    
    async searchItems(prefix: string): Promise<IItemId[]> {
        const lowerPrefix = prefix.toLowerCase();
        const results: IItemId[] = [];

        for (const [lowerId, originalId] of this.lowerCaseIndex) {
            if (lowerId.includes(lowerPrefix)) {
                const item = this.items.get(originalId);
                if (item) {
                    results.push(item);
                }
            }
        }

        // 按 ID 排序
        results.sort((a, b) => a.id.localeCompare(b.id));
        return results;
    }
    
    async getItemsByNamespace(namespace: string): Promise<IItemId[]> {
        const itemIds = this.namespaceIndex.get(namespace);
        if (!itemIds) {
            return [];
        }
        
        const results: IItemId[] = [];
        for (const id of itemIds) {
            const item = this.items.get(id);
            if (item) {
                results.push(item);
            }
        }
        
        return results.sort((a, b) => a.name.localeCompare(b.name));
    }
    
    async getItemCount(): Promise<number> {
        return this.items.size;
    }
    
    /**
     * 检查物品是否存在
     */
    async exists(id: string): Promise<boolean> {
        return this.items.has(id);
    }
    
    // ========================================
    // 写入操作
    // ========================================
    
    async addItem(item: IItemId): Promise<void> {
        this.addItemInternal(item);
        this.logger.debug('Item added', { id: item.id });
        await this.publishItemCreated(item);
    }
    
    async addItems(items: IItemId[]): Promise<void> {
        for (const item of items) {
            this.addItemInternal(item);
        }
        this.logger.debug('Items added', { count: items.length });
    }
    
    /**
     * 添加物品（不记录日志）
     */
    addWithoutLog(item: IItemId): void {
        this.addItemInternal(item);
    }
    
    private addItemInternal(item: IItemId): void {
        // 添加到主存储
        this.items.set(item.id, item);

        // 更新索引
        this.updateIndexes(item);
        this.lowerCaseIndex.set(item.id.toLowerCase(), item.id);

        this.lastUpdated = new Date();
    }
    
    async removeItem(id: string): Promise<void> {
        const item = this.items.get(id);
        if (!item) {
            return;
        }

        this.removeFromIndexes(item);
        this.items.delete(id);
        this.lowerCaseIndex.delete(id.toLowerCase());
        this.lastUpdated = new Date();

        this.logger.debug('Item removed', { id });
        await this.publishItemDeleted(id);
    }
    
    async removeItemsByFile(sourceFile: EditorUri): Promise<void> {
        const filePath = sourceFile.fsPath;
        const itemIds = this.fileIndex.get(filePath);
        
        if (!itemIds || itemIds.size === 0) {
            return;
        }
        
        const removedCount = itemIds.size;
        
        for (const id of itemIds) {
            const item = this.items.get(id);
            if (item) {
                this.removeFromIndexes(item);
                this.items.delete(id);
                this.lowerCaseIndex.delete(id.toLowerCase());
            }
        }

        this.lastUpdated = new Date();

        this.logger.debug('Items removed by file', {
            filePath,
            count: removedCount
        });
    }

    /**
     * 根据文件路径删除物品（字符串参数版本）
     */
    removeByFilePath(filePath: string): void {
        const itemIds = this.fileIndex.get(filePath);

        if (!itemIds || itemIds.size === 0) {
            return;
        }

        for (const id of Array.from(itemIds)) {
            const item = this.items.get(id);
            if (item) {
                this.removeFromIndexes(item);
                this.items.delete(id);
                this.lowerCaseIndex.delete(id.toLowerCase());
            }
        }
        
        this.lastUpdated = new Date();
    }
    
    async clearItems(): Promise<void> {
        const count = this.items.size;
        this.items.clear();
        this.namespaceIndex.clear();
        this.fileIndex.clear();
        this.lowerCaseIndex.clear();
        this.lastUpdated = new Date();
        await this.publishItemCleared(count);
    }
    
    /**
     * 清空所有数据（同步版本）
     */
    clear(): void {
        this.items.clear();
        this.namespaceIndex.clear();
        this.fileIndex.clear();
        this.lowerCaseIndex.clear();
        this.lastUpdated = new Date();
    }
    
    // ========================================
    // 统计
    // ========================================
    
    getLastUpdated(): Date {
        return this.lastUpdated;
    }
    
    getFileCount(): number {
        return this.fileIndex.size;
    }
    
    getNamespaceCount(): number {
        return this.namespaceIndex.size;
    }
    
    /**
     * 获取所有命名空间
     */
    getNamespaces(): string[] {
        return Array.from(this.namespaceIndex.keys()).sort();
    }
    
    // ========================================
    // Minecraft 内置物品管理
    // ========================================
    
    /**
     * 加载 Minecraft 内置物品列表
     * 
     * 从 GitHub (InventivetalentDev/minecraft-assets) 获取最新版本的 
     * Minecraft 原版物品列表，并添加到存储中。
     * 
     * 支持多源 fallback：主站失败时自动尝试镜像站。
     * 此方法只会执行一次，重复调用会直接返回。
     * 
     * @returns 成功加载返回 true，失败或已加载返回 false
     */
    async loadMinecraftBuiltinItems(): Promise<boolean> {
        // 如果已经加载过，直接返回
        if (this.builtinItemsLoaded) {
            this.logger.debug('Minecraft builtin items already loaded, skipping');
            return false;
        }
        
        try {
            if (!this.builtinItemLoader) {
                this.logger.warn('No builtin item loader configured, skipping');
                return false;
            }
            
            this.logger.info('Loading Minecraft builtin items');
            
            // 加载内置物品
            const builtinItems = await this.builtinItemLoader.loadBuiltinItems();
            
            if (builtinItems.length === 0) {
                this.logger.warn('No builtin items loaded');
                return false;
            }
            
            // 批量添加到存储（不记录日志）
            for (const item of builtinItems) {
                this.addItemInternal(item);
            }
            
            this.builtinItemsLoaded = true;
            
            this.logger.info('Minecraft builtin items loaded successfully', {
                count: builtinItems.length
            });
            
            return true;
            
        } catch (error) {
            this.logger.error('Failed to load Minecraft builtin items', error as Error);
            return false;
        }
    }
    
    /**
     * 检查是否已加载内置物品
     */
    isBuiltinItemsLoaded(): boolean {
        return this.builtinItemsLoaded;
    }
    
    /**
     * 重新加载 Minecraft 内置物品
     * 
     * 清除现有的内置物品并重新加载
     */
    async reloadMinecraftBuiltinItems(): Promise<boolean> {
        this.logger.info('Reloading Minecraft builtin items');
        
        // 清除内置物品标志
        this.builtinItemsLoaded = false;
        
        // 移除所有内置物品（来自 <minecraft:builtin> 源）
        const builtinSourcePattern = /^<minecraft:builtin>@/;
        const itemsToRemove: string[] = [];
        
        for (const [id, item] of this.items.entries()) {
            if (builtinSourcePattern.test(item.sourceFile)) {
                itemsToRemove.push(id);
            }
        }
        
        for (const id of itemsToRemove) {
            const item = this.items.get(id);
            if (item) {
                this.removeFromIndexes(item);
                this.items.delete(id);
            }
        }
        
        this.logger.debug('Removed existing builtin items', {
            count: itemsToRemove.length
        });
        
        // 重新加载
        return await this.loadMinecraftBuiltinItems();
    }
    
    // ========================================
    // 索引管理
    // ========================================
    
    private updateIndexes(item: IItemId): void {
        // 命名空间索引
        if (!this.namespaceIndex.has(item.namespace)) {
            this.namespaceIndex.set(item.namespace, new Set());
        }
        this.namespaceIndex.get(item.namespace)!.add(item.id);
        
        // 文件索引
        if (!this.fileIndex.has(item.sourceFile)) {
            this.fileIndex.set(item.sourceFile, new Set());
        }
        this.fileIndex.get(item.sourceFile)!.add(item.id);
    }
    
    private removeFromIndexes(item: IItemId): void {
        // 命名空间索引
        const namespaceItems = this.namespaceIndex.get(item.namespace);
        if (namespaceItems) {
            namespaceItems.delete(item.id);
            if (namespaceItems.size === 0) {
                this.namespaceIndex.delete(item.namespace);
            }
        }

        // 文件索引
        const fileItems = this.fileIndex.get(item.sourceFile);
        if (fileItems) {
            fileItems.delete(item.id);
            if (fileItems.size === 0) {
                this.fileIndex.delete(item.sourceFile);
            }
        }
    }

    // ========================================
    // 事件发布
    // ========================================

    private async publishItemCreated(item: IItemId): Promise<void> {
        if (!this.eventBus) { return; }
        await this.eventBus.publish(EVENT_TYPES.ItemCreated, {
            id: generateEventId('item'),
            type: EVENT_TYPES.ItemCreated,
            timestamp: new Date(),
            source: 'ItemStore',
            aggregateId: item.id,
            item
        });
    }

    private async publishItemDeleted(itemId: string): Promise<void> {
        if (!this.eventBus) { return; }
        await this.eventBus.publish(EVENT_TYPES.ItemDeleted, {
            id: generateEventId('item'),
            type: EVENT_TYPES.ItemDeleted,
            timestamp: new Date(),
            source: 'ItemStore',
            aggregateId: itemId,
            itemId
        });
    }

    private async publishItemCleared(count: number): Promise<void> {
        if (!this.eventBus) { return; }
        await this.eventBus.publish(EVENT_TYPES.ItemCleared, {
            id: generateEventId('item'),
            type: EVENT_TYPES.ItemCleared,
            timestamp: new Date(),
            source: 'ItemStore',
            count
        });
    }
}



