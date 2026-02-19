/**
 * DataStoreService 单元测试
 *
 * 测试统一数据存储服务的所有功能，包括：
 * - 生命周期管理（初始化、重载、清空）
 * - 模板操作
 * - 翻译键操作
 * - 物品 ID 操作
 * - 分类操作
 * - 统计信息
 * - 文件操作
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DataStoreService } from '../../../../domain/services/DataStoreService';
import { ITemplate, ITemplateParameter } from '../../../../core/interfaces/ITemplate';
import { ITranslationKey } from '../../../../core/interfaces/ITranslation';
import { IItemId, ItemType } from '../../../../core/interfaces/IItemId';
import { ICategory } from '../../../../core/interfaces/ICategory';
import { ILogger } from '../../../../core/interfaces/ILogger';
import { IEventBus } from '../../../../core/interfaces/IEventBus';
import { IYamlScanner, IYamlScanResult } from '../../../../core/interfaces/IYamlScanner';
import { IYamlParser } from '../../../../core/interfaces/IYamlParser';
import { IFileReader } from '../../../../core/interfaces/IFileReader';
import { Uri, Position } from 'vscode';
import { Template } from '../../../../domain/entities/Template';

describe('DataStoreService', () => {
    let service: DataStoreService;
    let mockLogger: ILogger;
    let mockEventBus: IEventBus;
    let mockYamlScanner: IYamlScanner;
    let mockYamlParser: IYamlParser;
    let mockFileReader: IFileReader;

    // 辅助函数：创建测试模板
    const createTestTemplate = (overrides: Partial<{
        id: string;
        name: string;
        parameters: ITemplateParameter[];
        sourceFile: Uri;
    }> = {}): ITemplate => {
        return new Template({
            id: overrides.id ?? `tpl-${Date.now()}-${Math.random()}`,
            name: overrides.name ?? 'test:template',
            parameters: overrides.parameters ?? [
                { name: 'param1', required: true },
            ],
            sourceFile: overrides.sourceFile ?? Uri.file('/test/templates.yaml'),
            definitionPosition: new Position(0, 0),
        });
    };

    // 辅助函数：创建测试翻译键
    const createTestTranslationKey = (overrides: Partial<{
        key: string;
        fullPath: string;
        languageCode: string;
        value: string;
        sourceFile: string;
    }> = {}): ITranslationKey => {
        const key = overrides.key ?? 'test.key';
        const languageCode = overrides.languageCode ?? 'en';
        return {
            key,
            fullPath: overrides.fullPath ?? `${languageCode}.${key}`,
            languageCode,
            value: overrides.value ?? 'Test Value',
            sourceFile: overrides.sourceFile ?? '/test/translations.yaml',
        };
    };

    // 辅助函数：创建测试物品 ID
    const createTestItem = (overrides: Partial<{
        id: string;
        namespace: string;
        name: string;
        type: ItemType;
        sourceFile: string;
    }> = {}): IItemId => {
        const namespace = overrides.namespace ?? 'mypack';
        const name = overrides.name ?? 'test_item';
        return {
            id: overrides.id ?? `${namespace}:${name}`,
            namespace,
            name,
            type: overrides.type ?? 'item',
            sourceFile: overrides.sourceFile ?? '/test/items.yaml',
        };
    };

    // 辅助函数：创建测试分类
    const createTestCategory = (overrides: Partial<{
        id: string;
        namespace: string;
        name: string;
        sourceFile: string;
    }> = {}): ICategory => {
        const namespace = overrides.namespace ?? 'mypack';
        const name = overrides.name ?? 'test_category';
        return {
            id: overrides.id ?? `#${namespace}:${name}`,
            namespace,
            name,
            sourceFile: overrides.sourceFile ?? '/test/categories.yaml',
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

        mockEventBus = {
            publish: vi.fn(() => Promise.resolve()),
            subscribe: vi.fn(() => ({
                unsubscribe: vi.fn(),
                isActive: () => true,
            })),
            unsubscribeAll: vi.fn(),
            getSubscriptionCount: vi.fn(() => 0),
            dispose: vi.fn(),
        } as unknown as IEventBus;

        mockYamlScanner = {
            scanWorkspace: vi.fn(() => Promise.resolve({
                files: [],
                documents: [],
                failed: [],
                statistics: { totalFiles: 0, successCount: 0, failureCount: 0, successRate: 1, duration: 0 }
            } as IYamlScanResult)),
        } as unknown as IYamlScanner;

        mockYamlParser = {
            parseText: vi.fn(() => Promise.resolve({
                result: {},
                errors: [],
            })),
            parseDocument: vi.fn(),
        } as unknown as IYamlParser;

        mockFileReader = {
            readFile: vi.fn(() => Promise.resolve(new Uint8Array())),
        } as unknown as IFileReader;

        service = new DataStoreService(mockLogger, mockEventBus, mockYamlScanner, mockYamlParser, mockFileReader);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    // ========================================
    // 生命周期管理测试
    // ========================================

    describe('lifecycle management', () => {
        describe('initialize', () => {
            it('should initialize successfully', async () => {
                await service.initialize();

                expect(service.isInitialized()).toBe(true);
            });

            it('should only initialize once', async () => {
                await service.initialize();
                await service.initialize();

                expect(mockYamlScanner.scanWorkspace).toHaveBeenCalledTimes(1);
            });

            it('should log initialization info', async () => {
                await service.initialize();

                expect(mockLogger.info).toHaveBeenCalledWith(
                    'Initializing data store service...'
                );
                expect(mockLogger.info).toHaveBeenCalledWith(
                    'Data store initialized',
                    expect.any(Object)
                );
            });
        });

        describe('isInitialized', () => {
            it('should return false before initialization', () => {
                expect(service.isInitialized()).toBe(false);
            });

            it('should return true after initialization', async () => {
                await service.initialize();

                expect(service.isInitialized()).toBe(true);
            });
        });

        describe('reload', () => {
            it('should clear and reinitialize', async () => {
                await service.initialize();

                // 添加一些数据
                await service.addTemplate(createTestTemplate({ name: 'test:template' }));

                await service.reload();

                // 数据应该被清空（因为扫描结果为空）
                expect(await service.getTemplateCount()).toBe(0);
                expect(service.isInitialized()).toBe(true);
            });
        });

        describe('clear', () => {
            it('should clear all stores', async () => {
                await service.initialize();

                await service.addTemplate(createTestTemplate({ name: 'test:template' }));
                await service.addTranslationKey(createTestTranslationKey());
                await service.addItem(createTestItem());
                await service.addCategory(createTestCategory());

                await service.clear();

                expect(await service.getTemplateCount()).toBe(0);
                expect(await service.getTranslationKeyCount()).toBe(0);
                expect(await service.getItemCount()).toBe(0);
                expect(await service.getCategoryCount()).toBe(0);
            });
        });

        describe('dispose', () => {
            it('should clear data and reset state', async () => {
                await service.initialize();

                service.dispose();

                expect(service.isInitialized()).toBe(false);
            });
        });
    });

    // ========================================
    // 模板操作测试
    // ========================================

    describe('template operations', () => {
        beforeEach(async () => {
            await service.initialize();
        });

        describe('addTemplate', () => {
            it('should add template to store', async () => {
                const template = createTestTemplate({ name: 'test:template' });

                await service.addTemplate(template);

                const retrieved = await service.getTemplateByName('test:template');
                expect(retrieved).toBeDefined();
            });
        });

        describe('addTemplates', () => {
            it('should add multiple templates', async () => {
                const templates = [
                    createTestTemplate({ id: 'tpl-1', name: 'test:template1' }),
                    createTestTemplate({ id: 'tpl-2', name: 'test:template2' }),
                ];

                await service.addTemplates(templates);

                expect(await service.getTemplateCount()).toBe(2);
            });
        });

        describe('getTemplateById', () => {
            it('should return template by ID', async () => {
                const template = createTestTemplate({ id: 'specific-id' });
                await service.addTemplate(template);

                const retrieved = await service.getTemplateById('specific-id');

                expect(retrieved?.id).toBe('specific-id');
            });

            it('should return undefined for non-existing ID', async () => {
                const retrieved = await service.getTemplateById('nonexistent');

                expect(retrieved).toBeUndefined();
            });
        });

        describe('getTemplateByName', () => {
            it('should return template by name', async () => {
                const template = createTestTemplate({ name: 'unique:name' });
                await service.addTemplate(template);

                const retrieved = await service.getTemplateByName('unique:name');

                expect(retrieved?.name).toBe('unique:name');
            });
        });

        describe('queryTemplates', () => {
            it('should query templates with filters', async () => {
                await service.addTemplate(createTestTemplate({ id: 'tpl-1', name: 'user:profile' }));
                await service.addTemplate(createTestTemplate({ id: 'tpl-2', name: 'user:settings' }));
                await service.addTemplate(createTestTemplate({ id: 'tpl-3', name: 'product:card' }));

                const result = await service.queryTemplates({ namePattern: 'user:.*' });

                expect(result.items.length).toBe(2);
            });
        });

        describe('getAllTemplates', () => {
            it('should return all templates', async () => {
                await service.addTemplate(createTestTemplate({ name: 'test:template1' }));
                await service.addTemplate(createTestTemplate({ name: 'test:template2' }));

                const all = await service.getAllTemplates();

                expect(all.length).toBe(2);
            });
        });

        describe('updateTemplate', () => {
            it('should update existing template', async () => {
                const template = createTestTemplate({ id: 'tpl-1', name: 'test:template' });
                await service.addTemplate(template);

                const updated = new Template({
                    ...template,
                    parameters: [{ name: 'newParam', required: true }],
                });
                await service.updateTemplate(updated);

                const retrieved = await service.getTemplateById('tpl-1');
                expect(retrieved?.parameters[0].name).toBe('newParam');
            });
        });

        describe('removeTemplate', () => {
            it('should remove template by ID', async () => {
                const template = createTestTemplate({ id: 'to-remove', name: 'test:template' });
                await service.addTemplate(template);

                await service.removeTemplate('to-remove');

                expect(await service.getTemplateById('to-remove')).toBeUndefined();
            });
        });

        describe('removeTemplatesByFile', () => {
            it('should remove all templates from file', async () => {
                const file = Uri.file('/test/batch.yaml');
                await service.addTemplate(createTestTemplate({
                    id: 'tpl-1',
                    name: 'test:template1',
                    sourceFile: file
                }));
                await service.addTemplate(createTestTemplate({
                    id: 'tpl-2',
                    name: 'test:template2',
                    sourceFile: file
                }));

                await service.removeTemplatesByFile(file);

                expect(await service.getTemplateCount()).toBe(0);
            });
        });

        describe('templateExists', () => {
            it('should return true for existing template', async () => {
                const template = createTestTemplate({ id: 'existing' });
                await service.addTemplate(template);

                expect(await service.templateExists('existing')).toBe(true);
            });

            it('should return false for non-existing template', async () => {
                expect(await service.templateExists('nonexistent')).toBe(false);
            });
        });
    });

    // ========================================
    // 翻译键操作测试
    // ========================================

    describe('translation key operations', () => {
        beforeEach(async () => {
            await service.initialize();
        });

        describe('addTranslationKey', () => {
            it('should add translation key', async () => {
                const key = createTestTranslationKey({ key: 'item.sword' });

                await service.addTranslationKey(key);

                const keys = await service.getTranslationKeysByName('item.sword');
                expect(keys.length).toBe(1);
            });
        });

        describe('getAllTranslationKeys', () => {
            it('should return all keys', async () => {
                await service.addTranslationKey(createTestTranslationKey({ fullPath: 'en.key1' }));
                await service.addTranslationKey(createTestTranslationKey({ fullPath: 'en.key2' }));

                const all = await service.getAllTranslationKeys();

                expect(all.length).toBe(2);
            });
        });

        describe('getTranslationKeysByLanguage', () => {
            it('should return keys by language', async () => {
                await service.addTranslationKey(createTestTranslationKey({
                    languageCode: 'en',
                    fullPath: 'en.key1'
                }));
                await service.addTranslationKey(createTestTranslationKey({
                    languageCode: 'zh_cn',
                    fullPath: 'zh_cn.key1'
                }));

                const enKeys = await service.getTranslationKeysByLanguage('en');

                expect(enKeys.length).toBe(1);
                expect(enKeys[0].languageCode).toBe('en');
            });
        });

        describe('searchTranslationKeys', () => {
            it('should search by prefix', async () => {
                await service.addTranslationKey(createTestTranslationKey({
                    key: 'item.sword',
                    fullPath: 'en.item.sword'
                }));
                await service.addTranslationKey(createTestTranslationKey({
                    key: 'item.shield',
                    fullPath: 'en.item.shield'
                }));
                await service.addTranslationKey(createTestTranslationKey({
                    key: 'message.welcome',
                    fullPath: 'en.message.welcome'
                }));

                const results = await service.searchTranslationKeys('item.');

                expect(results.length).toBe(2);
            });
        });

        describe('removeTranslationKey', () => {
            it('should remove key by fullPath', async () => {
                await service.addTranslationKey(createTestTranslationKey({
                    fullPath: 'en.item.sword'
                }));

                await service.removeTranslationKey('en.item.sword');

                expect(await service.getTranslationKeyCount()).toBe(0);
            });
        });
    });

    // ========================================
    // 物品 ID 操作测试
    // ========================================

    describe('item ID operations', () => {
        beforeEach(async () => {
            await service.initialize();
        });

        describe('addItem', () => {
            it('should add item', async () => {
                const item = createTestItem({ id: 'mypack:sword' });

                await service.addItem(item);

                const retrieved = await service.getItemById('mypack:sword');
                expect(retrieved).toBeDefined();
            });
        });

        describe('getAllItems', () => {
            it('should return all items', async () => {
                await service.addItem(createTestItem({ id: 'mypack:item1' }));
                await service.addItem(createTestItem({ id: 'mypack:item2' }));

                const all = await service.getAllItems();

                expect(all.length).toBe(2);
            });
        });

        describe('searchItems', () => {
            it('should search by prefix', async () => {
                await service.addItem(createTestItem({ id: 'mypack:sword' }));
                await service.addItem(createTestItem({ id: 'mypack:shield' }));
                await service.addItem(createTestItem({ id: 'other:item' }));

                const results = await service.searchItems('mypack:');

                expect(results.length).toBe(2);
            });
        });

        describe('getItemsByNamespace', () => {
            it('should return items by namespace', async () => {
                await service.addItem(createTestItem({
                    id: 'mypack:sword',
                    namespace: 'mypack'
                }));
                await service.addItem(createTestItem({
                    id: 'other:item',
                    namespace: 'other'
                }));

                const items = await service.getItemsByNamespace('mypack');

                expect(items.length).toBe(1);
            });
        });

        describe('removeItem', () => {
            it('should remove item by ID', async () => {
                await service.addItem(createTestItem({ id: 'mypack:sword' }));

                await service.removeItem('mypack:sword');

                expect(await service.getItemById('mypack:sword')).toBeUndefined();
            });
        });
    });

    // ========================================
    // 分类操作测试
    // ========================================

    describe('category operations', () => {
        beforeEach(async () => {
            await service.initialize();
        });

        describe('addCategory', () => {
            it('should add category', async () => {
                const category = createTestCategory({ id: '#mypack:weapons' });

                await service.addCategory(category);

                const retrieved = await service.getCategoryById('#mypack:weapons');
                expect(retrieved).toBeDefined();
            });
        });

        describe('addCategories', () => {
            it('should add multiple categories', async () => {
                const categories = [
                    createTestCategory({ id: '#mypack:weapons' }),
                    createTestCategory({ id: '#mypack:armor' }),
                ];

                await service.addCategories(categories);

                expect(await service.getCategoryCount()).toBe(2);
            });
        });

        describe('getAllCategories', () => {
            it('should return all categories', async () => {
                await service.addCategory(createTestCategory({ id: '#mypack:cat1' }));
                await service.addCategory(createTestCategory({ id: '#mypack:cat2' }));

                const all = await service.getAllCategories();

                expect(all.length).toBe(2);
            });
        });

        describe('searchCategories', () => {
            it('should search by prefix', async () => {
                await service.addCategory(createTestCategory({ id: '#mypack:weapons' }));
                await service.addCategory(createTestCategory({ id: '#mypack:weapons_melee' }));
                await service.addCategory(createTestCategory({ id: '#mypack:armor' }));

                const results = await service.searchCategories('#mypack:weapons');

                expect(results.length).toBe(2);
            });
        });

        describe('getCategoriesByNamespace', () => {
            it('should return categories by namespace', async () => {
                await service.addCategory(createTestCategory({
                    id: '#mypack:weapons',
                    namespace: 'mypack'
                }));
                await service.addCategory(createTestCategory({
                    id: '#other:tools',
                    namespace: 'other'
                }));

                const categories = await service.getCategoriesByNamespace('mypack');

                expect(categories.length).toBe(1);
            });
        });

        describe('removeCategory', () => {
            it('should remove category by ID', async () => {
                await service.addCategory(createTestCategory({ id: '#mypack:weapons' }));

                await service.removeCategory('#mypack:weapons');

                expect(await service.getCategoryById('#mypack:weapons')).toBeUndefined();
            });
        });
    });

    // ========================================
    // 统计信息测试
    // ========================================

    describe('statistics', () => {
        beforeEach(async () => {
            await service.initialize();
        });

        describe('getStatistics', () => {
            it('should return correct statistics', async () => {
                await service.addTemplate(createTestTemplate({ name: 'test:template' }));
                await service.addTranslationKey(createTestTranslationKey());
                await service.addItem(createTestItem());
                await service.addCategory(createTestCategory());

                const stats = await service.getStatistics();

                expect(stats.templateCount).toBe(1);
                expect(stats.translationKeyCount).toBe(1);
                expect(stats.itemCount).toBe(1);
                expect(stats.categoryCount).toBe(1);
                expect(stats.isInitialized).toBe(true);
            });

            it('should return zero counts for empty stores', async () => {
                const stats = await service.getStatistics();

                expect(stats.templateCount).toBe(0);
                expect(stats.translationKeyCount).toBe(0);
                expect(stats.itemCount).toBe(0);
                expect(stats.categoryCount).toBe(0);
            });
        });

        describe('getSupportedLanguages', () => {
            it('should return list of languages', async () => {
                await service.addTranslationKey(createTestTranslationKey({
                    languageCode: 'en',
                    fullPath: 'en.key1'
                }));
                await service.addTranslationKey(createTestTranslationKey({
                    languageCode: 'zh_cn',
                    fullPath: 'zh_cn.key1'
                }));

                const languages = await service.getSupportedLanguages();

                expect(languages).toContain('en');
                expect(languages).toContain('zh_cn');
            });
        });
    });

    // ========================================
    // ITemplateRepository 接口测试
    // ========================================

    describe('ITemplateRepository interface', () => {
        beforeEach(async () => {
            await service.initialize();
        });

        it('should implement getById', async () => {
            const template = createTestTemplate({ id: 'tpl-001' });
            await service.add(template);

            const retrieved = await service.getById('tpl-001');

            expect(retrieved).toBeDefined();
        });

        it('should implement getByName', async () => {
            const template = createTestTemplate({ name: 'test:template' });
            await service.add(template);

            const retrieved = await service.getByName('test:template');

            expect(retrieved).toBeDefined();
        });

        it('should implement getAll', async () => {
            await service.add(createTestTemplate({ name: 'test:template1' }));
            await service.add(createTestTemplate({ name: 'test:template2' }));

            const all = await service.getAll();

            expect(all.length).toBe(2);
        });

        it('should implement count', async () => {
            await service.add(createTestTemplate({ name: 'test:template' }));

            expect(await service.count()).toBe(1);
        });

        it('should implement exists', async () => {
            const template = createTestTemplate({ id: 'tpl-001' });
            await service.add(template);

            expect(await service.exists('tpl-001')).toBe(true);
            expect(await service.exists('nonexistent')).toBe(false);
        });
    });

    // ========================================
    // ITranslationRepository 接口测试
    // ========================================

    describe('ITranslationRepository interface', () => {
        beforeEach(async () => {
            await service.initialize();
        });

        it('should implement getAllKeys', async () => {
            await service.addKey(createTestTranslationKey({ fullPath: 'en.key1' }));

            const all = await service.getAllKeys();

            expect(all.length).toBe(1);
        });

        it('should implement searchKeys', async () => {
            await service.addKey(createTestTranslationKey({
                key: 'item.sword',
                fullPath: 'en.item.sword'
            }));

            const results = await service.searchKeys('item.');

            expect(results.length).toBe(1);
        });

        it('should implement translationKeyCount', async () => {
            await service.addKey(createTestTranslationKey({ fullPath: 'en.key1' }));
            await service.addKey(createTestTranslationKey({ fullPath: 'en.key2' }));

            expect(await service.translationKeyCount()).toBe(2);
        });
    });
});
