/**
 * ItemStore 单元测试
 *
 * 测试物品存储服务的功能，重点测试：
 * - Minecraft 内置物品加载
 * - 物品的 CRUD 操作
 * - 索引管理
 * - 查询功能
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ItemStore } from '../../../../domain/services/stores/ItemStore';
import { type IItemId, type IBuiltinItemLoader } from '../../../../core/interfaces/IItemId';
import { type ILogger } from '../../../../core/interfaces/ILogger';

describe('ItemStore', () => {
    let store: ItemStore;
    let mockLogger: ILogger;
    let mockBuiltinItemLoader: IBuiltinItemLoader;
    let testItemCounter = 0;

    // 测试数据
    const createTestItem = (overrides: Partial<IItemId> = {}): IItemId => {
        testItemCounter++;
        return {
            id: overrides.id ?? `test:item_${testItemCounter}`,
            namespace: overrides.namespace ?? 'test',
            name: overrides.name ?? `item_${testItemCounter}`,
            type: overrides.type ?? 'item',
            sourceFile: overrides.sourceFile ?? '/test/items.yml',
            lineNumber: overrides.lineNumber ?? 1,
            material: overrides.material,
        };
    };

    const createBuiltinItem = (name: string): IItemId => ({
        id: `minecraft:${name}`,
        namespace: 'minecraft',
        name: name,
        type: 'item',
        sourceFile: '<minecraft:builtin>@1.21.11',
        lineNumber: 0,
    });

    beforeEach(() => {
        vi.clearAllMocks();
        testItemCounter = 0; // 重置计数器

        // Mock Logger
        mockLogger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            createChild: vi.fn().mockReturnThis(),
        } as any;

        // Mock BuiltinItemLoader
        mockBuiltinItemLoader = {
            loadBuiltinItems: vi.fn().mockResolvedValue([]),
        };

        // 创建 ItemStore 实例（注入 mock loader）
        store = new ItemStore(mockLogger, mockBuiltinItemLoader);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Basic CRUD Operations', () => {
        it('should add and retrieve item', async () => {
            const item = createTestItem({ name: 'diamond_sword' });

            await store.addItem(item);

            const retrieved = await store.getItemById(item.id);
            expect(retrieved).toEqual(item);
        });

        it('should check if item exists', async () => {
            const item = createTestItem();

            await store.addItem(item);

            expect(await store.exists(item.id)).toBe(true);
            expect(await store.exists('non:existent')).toBe(false);
        });

        it('should get all items', async () => {
            const item1 = createTestItem({ name: 'item1' });
            const item2 = createTestItem({ name: 'item2' });

            await store.addItem(item1);
            await store.addItem(item2);

            const allItems = await store.getAllItems();
            expect(allItems).toHaveLength(2);
        });

        it('should search items by prefix', async () => {
            await store.addItem(createTestItem({ id: 'test:diamond_sword', name: 'diamond_sword' }));
            await store.addItem(createTestItem({ id: 'test:diamond_pickaxe', name: 'diamond_pickaxe' }));
            await store.addItem(createTestItem({ id: 'test:iron_sword', name: 'iron_sword' }));

            const results = await store.searchItems('diamond');

            expect(results).toHaveLength(2);
            expect(results[0].name).toContain('diamond');
            expect(results[1].name).toContain('diamond');
        });

        it('should get items by namespace', async () => {
            await store.addItem(createTestItem({ namespace: 'minecraft', id: 'minecraft:diamond' }));
            await store.addItem(createTestItem({ namespace: 'minecraft', id: 'minecraft:iron' }));
            await store.addItem(createTestItem({ namespace: 'custom', id: 'custom:special' }));

            const minecraftItems = await store.getItemsByNamespace('minecraft');

            expect(minecraftItems).toHaveLength(2);
            expect(minecraftItems.every((item) => item.namespace === 'minecraft')).toBe(true);
        });

        it('should remove item', async () => {
            const item = createTestItem();

            await store.addItem(item);
            expect(await store.exists(item.id)).toBe(true);

            await store.removeItem(item.id);
            expect(await store.exists(item.id)).toBe(false);
        });

        it('should clear all items', async () => {
            await store.addItem(createTestItem());
            await store.addItem(createTestItem());

            await store.clearItems();

            const count = await store.getItemCount();
            expect(count).toBe(0);
        });
    });

    describe('Minecraft Builtin Items', () => {
        it('should load builtin items successfully', async () => {
            const mockBuiltinItems = [
                createBuiltinItem('diamond'),
                createBuiltinItem('diamond_sword'),
                createBuiltinItem('iron_ingot'),
                createBuiltinItem('gold_block'),
            ];

            vi.mocked(mockBuiltinItemLoader.loadBuiltinItems).mockResolvedValue(mockBuiltinItems);

            const result = await store.loadMinecraftBuiltinItems();

            // 验证成功加载
            expect(result).toBe(true);

            // 验证物品已添加到存储
            const itemCount = await store.getItemCount();
            expect(itemCount).toBe(4);

            // 验证可以检索到物品
            const diamond = await store.getItemById('minecraft:diamond');
            expect(diamond).toBeDefined();
            expect(diamond?.name).toBe('diamond');
            expect(diamond?.namespace).toBe('minecraft');

            // 验证标志已设置
            expect(store.isBuiltinItemsLoaded()).toBe(true);

            // 验证日志
            expect(mockLogger.info).toHaveBeenCalledWith('Minecraft builtin items loaded successfully', { count: 4 });
        });

        it('should not load builtin items twice', async () => {
            const mockBuiltinItems = [createBuiltinItem('diamond')];
            vi.mocked(mockBuiltinItemLoader.loadBuiltinItems).mockResolvedValue(mockBuiltinItems);

            // 第一次加载
            const result1 = await store.loadMinecraftBuiltinItems();
            expect(result1).toBe(true);

            // 第二次加载应该跳过
            const result2 = await store.loadMinecraftBuiltinItems();
            expect(result2).toBe(false);

            // 验证只加载了一次
            expect(mockBuiltinItemLoader.loadBuiltinItems).toHaveBeenCalledTimes(1);

            // 验证日志记录了跳过
            expect(mockLogger.debug).toHaveBeenCalledWith('Minecraft builtin items already loaded, skipping');
        });

        it('should return false when loader returns empty array', async () => {
            vi.mocked(mockBuiltinItemLoader.loadBuiltinItems).mockResolvedValue([]);

            const result = await store.loadMinecraftBuiltinItems();

            expect(result).toBe(false);
            expect(mockLogger.warn).toHaveBeenCalledWith('No builtin items loaded');
            expect(store.isBuiltinItemsLoaded()).toBe(false);
        });

        it('should handle loader error gracefully', async () => {
            vi.mocked(mockBuiltinItemLoader.loadBuiltinItems).mockRejectedValue(new Error('Network error'));

            const result = await store.loadMinecraftBuiltinItems();

            expect(result).toBe(false);
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to load Minecraft builtin items', expect.any(Error));
            expect(store.isBuiltinItemsLoaded()).toBe(false);
        });

        it('should reload builtin items correctly', async () => {
            // 第一次加载
            const mockBuiltinItems1 = [createBuiltinItem('diamond'), createBuiltinItem('iron_ingot')];
            vi.mocked(mockBuiltinItemLoader.loadBuiltinItems).mockResolvedValue(mockBuiltinItems1);

            await store.loadMinecraftBuiltinItems();
            expect(await store.getItemCount()).toBe(2);

            // 重新加载（模拟版本更新，物品列表变化）
            const mockBuiltinItems2 = [
                createBuiltinItem('diamond'),
                createBuiltinItem('iron_ingot'),
                createBuiltinItem('gold_ingot'), // 新物品
            ];
            vi.mocked(mockBuiltinItemLoader.loadBuiltinItems).mockResolvedValue(mockBuiltinItems2);

            const reloadResult = await store.reloadMinecraftBuiltinItems();

            expect(reloadResult).toBe(true);
            expect(await store.getItemCount()).toBe(3);

            // 验证旧物品已被移除，新物品已添加
            expect(await store.exists('minecraft:gold_ingot')).toBe(true);

            // 验证日志
            expect(mockLogger.info).toHaveBeenCalledWith('Reloading Minecraft builtin items');
            expect(mockLogger.debug).toHaveBeenCalledWith('Removed existing builtin items', { count: 2 });
        });

        it('should distinguish builtin items from custom items', async () => {
            // 添加自定义物品
            const customItem = createTestItem({
                id: 'custom:diamond',
                namespace: 'custom',
                name: 'diamond',
                sourceFile: '/custom/items.yml',
            });
            await store.addItem(customItem);

            // 加载内置物品
            vi.mocked(mockBuiltinItemLoader.loadBuiltinItems).mockResolvedValue([createBuiltinItem('diamond')]);

            await store.loadMinecraftBuiltinItems();

            // 验证两个物品都存在
            expect(await store.getItemCount()).toBe(2);
            expect(await store.exists('custom:diamond')).toBe(true);
            expect(await store.exists('minecraft:diamond')).toBe(true);

            // 验证可以通过命名空间区分
            const minecraftItems = await store.getItemsByNamespace('minecraft');
            const customItems = await store.getItemsByNamespace('custom');

            expect(minecraftItems).toHaveLength(1);
            expect(customItems).toHaveLength(1);
        });

        it('should only remove builtin items when reloading', async () => {
            // 添加自定义物品
            const customItem = createTestItem({
                id: 'custom:special',
                sourceFile: '/custom/items.yml',
            });
            await store.addItem(customItem);

            // 加载内置物品
            vi.mocked(mockBuiltinItemLoader.loadBuiltinItems).mockResolvedValue([createBuiltinItem('diamond')]);

            await store.loadMinecraftBuiltinItems();
            expect(await store.getItemCount()).toBe(2);

            // 重新加载内置物品
            await store.reloadMinecraftBuiltinItems();

            // 验证自定义物品仍然存在
            expect(await store.exists('custom:special')).toBe(true);
            expect(await store.exists('minecraft:diamond')).toBe(true);
        });

        it('should handle large builtin item list efficiently', async () => {
            // 模拟大量内置物品（如 Minecraft 实际的 1400+ 物品）
            const mockBuiltinItems = Array.from({ length: 1500 }, (_, i) => createBuiltinItem(`item_${i}`));
            vi.mocked(mockBuiltinItemLoader.loadBuiltinItems).mockResolvedValue(mockBuiltinItems);

            const startTime = Date.now();
            await store.loadMinecraftBuiltinItems();
            const duration = Date.now() - startTime;

            // 验证加载成功
            expect(await store.getItemCount()).toBe(1500);

            // 验证性能（应在 1 秒内完成）
            expect(duration).toBeLessThan(1000);

            // 验证搜索性能
            const searchStart = Date.now();
            await store.searchItems('item_100');
            const searchDuration = Date.now() - searchStart;

            expect(searchDuration).toBeLessThan(100);
        });
    });

    describe('Namespace Management', () => {
        it('should return all namespaces', async () => {
            await store.addItem(createTestItem({ namespace: 'minecraft' }));
            await store.addItem(createTestItem({ namespace: 'custom' }));
            await store.addItem(createTestItem({ namespace: 'custom' }));

            const namespaces = store.getNamespaces();

            expect(namespaces).toContain('minecraft');
            expect(namespaces).toContain('custom');
            expect(namespaces).toHaveLength(2);
        });

        it('should return namespace count', async () => {
            await store.addItem(createTestItem({ namespace: 'ns1' }));
            await store.addItem(createTestItem({ namespace: 'ns2' }));
            await store.addItem(createTestItem({ namespace: 'ns3' }));

            expect(store.getNamespaceCount()).toBe(3);
        });
    });

    describe('Statistics', () => {
        it('should track last updated time', async () => {
            const beforeTime = store.getLastUpdated();

            // 等待一小段时间确保时间戳不同
            await new Promise((resolve) => setTimeout(resolve, 10));

            await store.addItem(createTestItem());

            const afterTime = store.getLastUpdated();
            expect(afterTime.getTime()).toBeGreaterThan(beforeTime.getTime());
        });

        it('should return correct item count', async () => {
            expect(await store.getItemCount()).toBe(0);

            await store.addItem(createTestItem());
            expect(await store.getItemCount()).toBe(1);

            await store.addItem(createTestItem());
            expect(await store.getItemCount()).toBe(2);
        });
    });

    describe('Edge Cases', () => {
        it('should handle duplicate item IDs by replacing', async () => {
            const item1 = createTestItem({ id: 'test:duplicate', name: 'first' });
            const item2 = createTestItem({ id: 'test:duplicate', name: 'second' });

            await store.addItem(item1);
            await store.addItem(item2);

            const retrieved = await store.getItemById('test:duplicate');
            expect(retrieved?.name).toBe('second');
            expect(await store.getItemCount()).toBe(1);
        });

        it('should handle item names with special characters', async () => {
            const item = createTestItem({
                id: 'test:item_with-special.chars',
                name: 'item_with-special.chars',
            });

            await store.addItem(item);

            const retrieved = await store.getItemById('test:item_with-special.chars');
            expect(retrieved).toBeDefined();
        });

        it('should handle empty namespace gracefully', async () => {
            const items = await store.getItemsByNamespace('nonexistent');
            expect(items).toEqual([]);
        });

        it('should handle search with no results', async () => {
            await store.addItem(createTestItem({ name: 'diamond' }));

            const results = await store.searchItems('emerald');
            expect(results).toEqual([]);
        });
    });
});
