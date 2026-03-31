/**
 * CategoryStore 单元测试
 *
 * 测试分类存储服务的所有功能，包括：
 * - 分类的添加和删除
 * - 命名空间索引管理
 * - 查询功能
 * - 文件索引管理
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CategoryStore } from '../../../../domain/services/stores/CategoryStore';
import { type ICategory } from '../../../../core/interfaces/ICategory';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import { Uri } from 'vscode';

describe('CategoryStore', () => {
    let store: CategoryStore;
    let mockLogger: ILogger;

    // 辅助函数：创建测试分类
    const createTestCategory = (
        overrides: Partial<{
            id: string;
            namespace: string;
            name: string;
            displayName: string;
            description: string[];
            icon: string;
            hidden: boolean;
            priority: number;
            sourceFile: string;
            lineNumber: number;
        }> = {},
    ): ICategory => {
        const namespace = overrides.namespace ?? 'mypack';
        const name = overrides.name ?? 'test_category';
        return {
            id: overrides.id ?? `#${namespace}:${name}`,
            namespace,
            name,
            displayName: overrides.displayName ?? 'Test Category',
            description: overrides.description ?? ['A test category'],
            icon: overrides.icon ?? 'minecraft:diamond',
            hidden: overrides.hidden ?? false,
            priority: overrides.priority ?? 0,
            sourceFile: overrides.sourceFile ?? '/test/categories.yaml',
            lineNumber: overrides.lineNumber ?? 0,
        };
    };

    beforeEach(() => {
        mockLogger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            fatal: vi.fn(),
            createChild: vi.fn(() => mockLogger),
            setLevel: vi.fn(),
            getLevel: vi.fn(() => 0),
        } as unknown as ILogger;

        store = new CategoryStore(mockLogger);
    });

    // ========================================
    // 添加操作测试
    // ========================================

    describe('addCategory', () => {
        it('should add category to store', async () => {
            const category = createTestCategory({ id: '#mypack:weapons' });

            await store.addCategory(category);

            const retrieved = await store.getCategoryById('#mypack:weapons');
            expect(retrieved).toBeDefined();
            expect(retrieved?.id).toBe('#mypack:weapons');
        });

        it('should normalize ID with # prefix', async () => {
            const category = createTestCategory({ id: 'mypack:weapons' }); // 没有 # 前缀

            await store.addCategory(category);

            const retrieved = await store.getCategoryById('mypack:weapons');
            expect(retrieved).toBeDefined();
            expect(retrieved?.id).toBe('#mypack:weapons'); // 应该被规范化
        });

        it('should update namespace index', async () => {
            const category = createTestCategory({
                id: '#mypack:weapons',
                namespace: 'mypack',
            });

            await store.addCategory(category);

            const categories = await store.getCategoriesByNamespace('mypack');
            expect(categories).toHaveLength(1);
        });

        it('should update file index', async () => {
            const category = createTestCategory({
                id: '#mypack:weapons',
                sourceFile: '/test/categories.yaml',
            });

            await store.addCategory(category);

            const stats = store.getStats();
            expect(stats.files).toBe(1);
        });

        it('should log category addition', async () => {
            const category = createTestCategory({
                id: '#mypack:weapons',
                namespace: 'mypack',
            });

            await store.addCategory(category);

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Category added',
                expect.objectContaining({
                    id: '#mypack:weapons',
                    namespace: 'mypack',
                }),
            );
        });

        it('should overwrite category with same ID', async () => {
            const category1 = createTestCategory({
                id: '#mypack:weapons',
                displayName: 'Old Name',
            });
            const category2 = createTestCategory({
                id: '#mypack:weapons',
                displayName: 'New Name',
            });

            await store.addCategory(category1);
            await store.addCategory(category2);

            const retrieved = await store.getCategoryById('#mypack:weapons');
            expect(retrieved?.displayName).toBe('New Name');
            expect(await store.getCategoryCount()).toBe(1);
        });
    });

    describe('addCategories', () => {
        it('should add multiple categories', async () => {
            const categories = [
                createTestCategory({ id: '#mypack:weapons' }),
                createTestCategory({ id: '#mypack:armor' }),
                createTestCategory({ id: '#mypack:tools' }),
            ];

            await store.addCategories(categories);

            expect(await store.getCategoryCount()).toBe(3);
        });

        it('should log batch addition', async () => {
            const categories = [
                createTestCategory({ id: '#mypack:weapons' }),
                createTestCategory({ id: '#mypack:armor' }),
            ];

            await store.addCategories(categories);

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Categories batch added',
                expect.objectContaining({
                    count: 2,
                }),
            );
        });
    });

    // ========================================
    // 查询操作测试
    // ========================================

    describe('getAllCategories', () => {
        it('should return all categories', async () => {
            await store.addCategory(createTestCategory({ id: '#mypack:cat1' }));
            await store.addCategory(createTestCategory({ id: '#mypack:cat2' }));
            await store.addCategory(createTestCategory({ id: '#mypack:cat3' }));

            const all = await store.getAllCategories();

            expect(all).toHaveLength(3);
        });

        it('should return empty array for empty store', async () => {
            const all = await store.getAllCategories();

            expect(all).toEqual([]);
        });
    });

    describe('getCategoryById', () => {
        it('should return category by ID with # prefix', async () => {
            await store.addCategory(createTestCategory({ id: '#mypack:weapons' }));

            const category = await store.getCategoryById('#mypack:weapons');

            expect(category).toBeDefined();
            expect(category?.id).toBe('#mypack:weapons');
        });

        it('should return category by ID without # prefix', async () => {
            await store.addCategory(createTestCategory({ id: '#mypack:weapons' }));

            const category = await store.getCategoryById('mypack:weapons');

            expect(category).toBeDefined();
            expect(category?.id).toBe('#mypack:weapons');
        });

        it('should return undefined for non-existing ID', async () => {
            const category = await store.getCategoryById('#nonexistent:category');

            expect(category).toBeUndefined();
        });
    });

    describe('searchCategories', () => {
        beforeEach(async () => {
            await store.addCategory(createTestCategory({ id: '#mypack:weapons' }));
            await store.addCategory(createTestCategory({ id: '#mypack:weapons_melee' }));
            await store.addCategory(createTestCategory({ id: '#mypack:armor' }));
            await store.addCategory(createTestCategory({ id: '#other:tools' }));
        });

        it('should search by prefix with # prefix', async () => {
            const categories = await store.searchCategories('#mypack:weapons');

            expect(categories).toHaveLength(2);
            expect(categories.every((c) => c.id.startsWith('#mypack:weapons'))).toBe(true);
        });

        it('should search by prefix without # prefix', async () => {
            const categories = await store.searchCategories('mypack:weapons');

            expect(categories).toHaveLength(2);
        });

        it('should be case insensitive', async () => {
            const categories = await store.searchCategories('#MYPACK:WEAPONS');

            expect(categories).toHaveLength(2);
        });

        it('should return empty array for no matches', async () => {
            const categories = await store.searchCategories('#nonexistent');

            expect(categories).toEqual([]);
        });
    });

    describe('getCategoriesByNamespace', () => {
        beforeEach(async () => {
            await store.addCategory(
                createTestCategory({
                    id: '#mypack:weapons',
                    namespace: 'mypack',
                }),
            );
            await store.addCategory(
                createTestCategory({
                    id: '#mypack:armor',
                    namespace: 'mypack',
                }),
            );
            await store.addCategory(
                createTestCategory({
                    id: '#other:tools',
                    namespace: 'other',
                }),
            );
        });

        it('should return categories by namespace', async () => {
            const categories = await store.getCategoriesByNamespace('mypack');

            expect(categories).toHaveLength(2);
            expect(categories.every((c) => c.namespace === 'mypack')).toBe(true);
        });

        it('should return empty array for non-existing namespace', async () => {
            const categories = await store.getCategoriesByNamespace('nonexistent');

            expect(categories).toEqual([]);
        });
    });

    describe('getCategoryCount', () => {
        it('should return 0 for empty store', async () => {
            expect(await store.getCategoryCount()).toBe(0);
        });

        it('should return correct count', async () => {
            await store.addCategory(createTestCategory({ id: '#mypack:cat1' }));
            await store.addCategory(createTestCategory({ id: '#mypack:cat2' }));

            expect(await store.getCategoryCount()).toBe(2);
        });
    });

    describe('hasCategory', () => {
        it('should return true for existing category', async () => {
            await store.addCategory(createTestCategory({ id: '#mypack:weapons' }));

            expect(await store.hasCategory('#mypack:weapons')).toBe(true);
        });

        it('should return true for existing category without # prefix', async () => {
            await store.addCategory(createTestCategory({ id: '#mypack:weapons' }));

            expect(await store.hasCategory('mypack:weapons')).toBe(true);
        });

        it('should return false for non-existing category', async () => {
            expect(await store.hasCategory('#nonexistent:category')).toBe(false);
        });
    });

    // ========================================
    // 删除操作测试
    // ========================================

    describe('removeCategory', () => {
        it('should remove category by ID', async () => {
            await store.addCategory(createTestCategory({ id: '#mypack:weapons' }));

            await store.removeCategory('#mypack:weapons');

            expect(await store.getCategoryById('#mypack:weapons')).toBeUndefined();
        });

        it('should remove category by ID without # prefix', async () => {
            await store.addCategory(createTestCategory({ id: '#mypack:weapons' }));

            await store.removeCategory('mypack:weapons');

            expect(await store.getCategoryById('#mypack:weapons')).toBeUndefined();
        });

        it('should update namespace index after removal', async () => {
            await store.addCategory(
                createTestCategory({
                    id: '#mypack:weapons',
                    namespace: 'mypack',
                }),
            );

            await store.removeCategory('#mypack:weapons');

            const categories = await store.getCategoriesByNamespace('mypack');
            expect(categories).toHaveLength(0);
        });

        it('should update file index after removal', async () => {
            await store.addCategory(
                createTestCategory({
                    id: '#mypack:weapons',
                    sourceFile: '/test/categories.yaml',
                }),
            );

            await store.removeCategory('#mypack:weapons');

            expect(store.getStats().files).toBe(0);
        });

        it('should log category removal', async () => {
            await store.addCategory(createTestCategory({ id: '#mypack:weapons' }));

            await store.removeCategory('#mypack:weapons');

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Category removed',
                expect.objectContaining({
                    id: '#mypack:weapons',
                }),
            );
        });

        it('should do nothing for non-existing category', async () => {
            await expect(store.removeCategory('#nonexistent:category')).resolves.not.toThrow();
        });

        it('should not affect other categories', async () => {
            await store.addCategory(createTestCategory({ id: '#mypack:weapons' }));
            await store.addCategory(createTestCategory({ id: '#mypack:armor' }));

            await store.removeCategory('#mypack:weapons');

            expect(await store.getCategoryCount()).toBe(1);
            expect(await store.getCategoryById('#mypack:armor')).toBeDefined();
        });
    });

    describe('removeCategoriesByFile', () => {
        it('should remove all categories from file', async () => {
            const file1 = '/test/pack1.yaml';
            const file2 = '/test/pack2.yaml';

            await store.addCategory(
                createTestCategory({
                    id: '#mypack:cat1',
                    sourceFile: file1,
                }),
            );
            await store.addCategory(
                createTestCategory({
                    id: '#mypack:cat2',
                    sourceFile: file1,
                }),
            );
            await store.addCategory(
                createTestCategory({
                    id: '#other:cat1',
                    sourceFile: file2,
                }),
            );

            await store.removeCategoriesByFile(Uri.file(file1));

            expect(await store.getCategoryCount()).toBe(1);
            const remaining = await store.getAllCategories();
            expect(remaining[0].sourceFile).toBe(file2);
        });

        it('should log removal', async () => {
            const file = '/test/categories.yaml';
            await store.addCategory(
                createTestCategory({
                    id: '#mypack:cat1',
                    sourceFile: file,
                }),
            );
            await store.addCategory(
                createTestCategory({
                    id: '#mypack:cat2',
                    sourceFile: file,
                }),
            );

            await store.removeCategoriesByFile(Uri.file(file));

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Categories removed by file',
                expect.objectContaining({
                    file,
                    count: 2,
                }),
            );
        });

        it('should do nothing for file with no categories', async () => {
            await store.addCategory(
                createTestCategory({
                    sourceFile: '/other/file.yaml',
                }),
            );

            await store.removeCategoriesByFile(Uri.file('/nonexistent/file.yaml'));

            expect(await store.getCategoryCount()).toBe(1);
        });
    });

    describe('clearCategories', () => {
        it('should remove all categories', async () => {
            await store.addCategory(createTestCategory({ id: '#mypack:cat1' }));
            await store.addCategory(createTestCategory({ id: '#mypack:cat2' }));
            await store.addCategory(createTestCategory({ id: '#mypack:cat3' }));

            await store.clearCategories();

            expect(await store.getCategoryCount()).toBe(0);
        });

        it('should clear all indexes', async () => {
            await store.addCategory(
                createTestCategory({
                    id: '#mypack:weapons',
                    namespace: 'mypack',
                    sourceFile: '/test/categories.yaml',
                }),
            );

            await store.clearCategories();

            const stats = store.getStats();
            expect(stats.total).toBe(0);
            expect(stats.namespaces).toBe(0);
            expect(stats.files).toBe(0);
        });

        it('should log clearing', async () => {
            await store.addCategory(createTestCategory({ id: '#mypack:cat1' }));
            await store.addCategory(createTestCategory({ id: '#mypack:cat2' }));

            await store.clearCategories();

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'All categories cleared',
                expect.objectContaining({
                    count: 2,
                }),
            );
        });
    });

    // ========================================
    // 统计方法测试
    // ========================================

    describe('getStats', () => {
        it('should return correct statistics', async () => {
            await store.addCategory(
                createTestCategory({
                    id: '#pack1:cat1',
                    namespace: 'pack1',
                    sourceFile: '/test/pack1.yaml',
                }),
            );
            await store.addCategory(
                createTestCategory({
                    id: '#pack1:cat2',
                    namespace: 'pack1',
                    sourceFile: '/test/pack1.yaml',
                }),
            );
            await store.addCategory(
                createTestCategory({
                    id: '#pack2:cat1',
                    namespace: 'pack2',
                    sourceFile: '/test/pack2.yaml',
                }),
            );

            const stats = store.getStats();

            expect(stats.total).toBe(3);
            expect(stats.namespaces).toBe(2);
            expect(stats.files).toBe(2);
        });

        it('should return zero counts for empty store', () => {
            const stats = store.getStats();

            expect(stats.total).toBe(0);
            expect(stats.namespaces).toBe(0);
            expect(stats.files).toBe(0);
        });
    });
});
