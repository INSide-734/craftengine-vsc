/**
 * TranslationStore 单元测试
 *
 * 测试翻译键存储服务的所有功能，包括：
 * - 翻译键的添加和删除
 * - 多语言索引管理
 * - 查询功能
 * - 文件索引管理
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TranslationStore } from '../../../../domain/services/stores/TranslationStore';
import { type ITranslationKey } from '../../../../core/interfaces/ITranslation';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import { Uri } from 'vscode';

describe('TranslationStore', () => {
    let store: TranslationStore;
    let mockLogger: ILogger;

    // 辅助函数：创建测试翻译键
    const createTestKey = (
        overrides: Partial<{
            key: string;
            fullPath: string;
            languageCode: string;
            value: string;
            sourceFile: string;
            lineNumber: number;
        }> = {},
    ): ITranslationKey => {
        const key = overrides.key ?? 'test.key';
        const languageCode = overrides.languageCode ?? 'en';
        return {
            key,
            fullPath: overrides.fullPath ?? `${languageCode}.${key}`,
            languageCode,
            value: overrides.value ?? 'Test Value',
            sourceFile: overrides.sourceFile ?? '/test/translations.yaml',
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

        store = new TranslationStore(mockLogger);
    });

    // ========================================
    // 添加操作测试
    // ========================================

    describe('addKey', () => {
        it('should add translation key to store', async () => {
            const key = createTestKey({ key: 'item.sword' });

            await store.addKey(key);

            const retrieved = await store.getAllKeys();
            expect(retrieved).toHaveLength(1);
            expect(retrieved[0].key).toBe('item.sword');
        });

        it('should update indexes correctly', async () => {
            const key = createTestKey({
                key: 'item.sword',
                languageCode: 'en',
                sourceFile: '/test/en.yaml',
            });

            await store.addKey(key);

            expect(store.getLanguageCount()).toBe(1);
            expect(store.getFileCount()).toBe(1);
        });

        it('should log key addition', async () => {
            const key = createTestKey({ key: 'new.key' });

            await store.addKey(key);

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Translation key added',
                expect.objectContaining({
                    key: 'new.key',
                    languageCode: 'en',
                }),
            );
        });

        it('should handle multiple languages for same key', async () => {
            const keyEn = createTestKey({
                key: 'item.sword',
                languageCode: 'en',
                fullPath: 'en.item.sword',
                value: 'Sword',
            });
            const keyZh = createTestKey({
                key: 'item.sword',
                languageCode: 'zh_cn',
                fullPath: 'zh_cn.item.sword',
                value: '剑',
            });

            await store.addKey(keyEn);
            await store.addKey(keyZh);

            const keys = await store.getKeysByName('item.sword');
            expect(keys).toHaveLength(2);
            expect(store.getLanguageCount()).toBe(2);
        });

        it('should overwrite key with same fullPath', async () => {
            const key1 = createTestKey({
                key: 'item.sword',
                fullPath: 'en.item.sword',
                value: 'Old Sword',
            });
            const key2 = createTestKey({
                key: 'item.sword',
                fullPath: 'en.item.sword',
                value: 'New Sword',
            });

            await store.addKey(key1);
            await store.addKey(key2);

            const retrieved = await store.getAllKeys();
            expect(retrieved).toHaveLength(1);
            expect(retrieved[0].value).toBe('New Sword');
        });
    });

    describe('addWithoutLog', () => {
        it('should add key without logging', async () => {
            const key = createTestKey({ key: 'silent.key' });

            await store.addWithoutLog(key);

            expect(mockLogger.debug).not.toHaveBeenCalledWith('Translation key added', expect.anything());
            expect(store.getCount()).toBe(1);
        });
    });

    // ========================================
    // 查询操作测试
    // ========================================

    describe('getAllKeys', () => {
        it('should return all keys', async () => {
            await store.addKey(createTestKey({ key: 'key1', fullPath: 'en.key1' }));
            await store.addKey(createTestKey({ key: 'key2', fullPath: 'en.key2' }));
            await store.addKey(createTestKey({ key: 'key3', fullPath: 'en.key3' }));

            const all = await store.getAllKeys();

            expect(all).toHaveLength(3);
        });

        it('should return empty array for empty store', async () => {
            const all = await store.getAllKeys();

            expect(all).toEqual([]);
        });
    });

    describe('getKeysByName', () => {
        it('should return keys by name across languages', async () => {
            await store.addKey(
                createTestKey({
                    key: 'item.sword',
                    languageCode: 'en',
                    fullPath: 'en.item.sword',
                }),
            );
            await store.addKey(
                createTestKey({
                    key: 'item.sword',
                    languageCode: 'zh_cn',
                    fullPath: 'zh_cn.item.sword',
                }),
            );
            await store.addKey(
                createTestKey({
                    key: 'item.shield',
                    languageCode: 'en',
                    fullPath: 'en.item.shield',
                }),
            );

            const keys = await store.getKeysByName('item.sword');

            expect(keys).toHaveLength(2);
            expect(keys.every((k) => k.key === 'item.sword')).toBe(true);
        });

        it('should return empty array for non-existing key', async () => {
            const keys = await store.getKeysByName('nonexistent.key');

            expect(keys).toEqual([]);
        });
    });

    describe('getKeysByLanguage', () => {
        it('should return all keys for a language', async () => {
            await store.addKey(
                createTestKey({
                    key: 'item.sword',
                    languageCode: 'en',
                    fullPath: 'en.item.sword',
                }),
            );
            await store.addKey(
                createTestKey({
                    key: 'item.shield',
                    languageCode: 'en',
                    fullPath: 'en.item.shield',
                }),
            );
            await store.addKey(
                createTestKey({
                    key: 'item.sword',
                    languageCode: 'zh_cn',
                    fullPath: 'zh_cn.item.sword',
                }),
            );

            const keys = await store.getKeysByLanguage('en');

            expect(keys).toHaveLength(2);
            expect(keys.every((k) => k.languageCode === 'en')).toBe(true);
        });

        it('should be case insensitive', async () => {
            await store.addKey(
                createTestKey({
                    key: 'item.sword',
                    languageCode: 'en',
                    fullPath: 'en.item.sword',
                }),
            );

            const keys = await store.getKeysByLanguage('EN');

            expect(keys).toHaveLength(1);
        });

        it('should return empty array for non-existing language', async () => {
            const keys = await store.getKeysByLanguage('fr');

            expect(keys).toEqual([]);
        });
    });

    describe('searchKeys', () => {
        beforeEach(async () => {
            await store.addKey(createTestKey({ key: 'item.sword', fullPath: 'en.item.sword' }));
            await store.addKey(createTestKey({ key: 'item.shield', fullPath: 'en.item.shield' }));
            await store.addKey(createTestKey({ key: 'item.armor', fullPath: 'en.item.armor' }));
            await store.addKey(createTestKey({ key: 'message.welcome', fullPath: 'en.message.welcome' }));
        });

        it('should search by prefix', async () => {
            const keys = await store.searchKeys('item.');

            expect(keys).toHaveLength(3);
            expect(keys.every((k) => k.key.startsWith('item.'))).toBe(true);
        });

        it('should be case insensitive', async () => {
            const keys = await store.searchKeys('ITEM.');

            expect(keys).toHaveLength(3);
        });

        it('should return sorted results', async () => {
            const keys = await store.searchKeys('item.');

            const names = keys.map((k) => k.key);
            expect(names).toEqual([...names].sort());
        });

        it('should return unique keys (deduplicated)', async () => {
            // 添加同一个 key 的多语言版本
            await store.addKey(
                createTestKey({
                    key: 'item.sword',
                    languageCode: 'zh_cn',
                    fullPath: 'zh_cn.item.sword',
                }),
            );

            const keys = await store.searchKeys('item.sword');

            // 应该只返回 1 个唯一的 key
            expect(keys).toHaveLength(1);
        });

        it('should return empty array for no matches', async () => {
            const keys = await store.searchKeys('nonexistent.');

            expect(keys).toEqual([]);
        });
    });

    describe('queryKeys', () => {
        beforeEach(async () => {
            await store.addKey(
                createTestKey({
                    key: 'item.sword',
                    languageCode: 'en',
                    fullPath: 'en.item.sword',
                    sourceFile: '/test/en.yaml',
                }),
            );
            await store.addKey(
                createTestKey({
                    key: 'item.shield',
                    languageCode: 'en',
                    fullPath: 'en.item.shield',
                    sourceFile: '/test/en.yaml',
                }),
            );
            await store.addKey(
                createTestKey({
                    key: 'item.sword',
                    languageCode: 'zh_cn',
                    fullPath: 'zh_cn.item.sword',
                    sourceFile: '/test/zh_cn.yaml',
                }),
            );
        });

        it('should filter by name pattern', async () => {
            const result = await store.queryKeys({ namePattern: 'item\\.sword' });

            expect(result.items).toHaveLength(2);
            expect(result.total).toBe(2);
        });

        it('should filter by language code', async () => {
            const result = await store.queryKeys({ languageCode: 'en' });

            expect(result.items).toHaveLength(2);
            expect(result.items.every((k) => k.languageCode === 'en')).toBe(true);
        });

        it('should filter by source file', async () => {
            const result = await store.queryKeys({
                sourceFile: Uri.file('/test/en.yaml'),
            });

            expect(result.items).toHaveLength(2);
        });

        it('should support pagination with skip', async () => {
            const result = await store.queryKeys({ skip: 1 });

            expect(result.items).toHaveLength(2);
            expect(result.total).toBe(3);
        });

        it('should support pagination with limit', async () => {
            const result = await store.queryKeys({ limit: 2 });

            expect(result.items).toHaveLength(2);
            expect(result.total).toBe(3);
            expect(result.hasMore).toBe(true);
        });

        it('should combine skip and limit', async () => {
            const result = await store.queryKeys({ skip: 1, limit: 1 });

            expect(result.items).toHaveLength(1);
            expect(result.total).toBe(3);
            expect(result.hasMore).toBe(true);
        });

        it('should return sorted results', async () => {
            const result = await store.queryKeys({});

            const names = result.items.map((k) => k.key);
            expect(names).toEqual([...names].sort());
        });
    });

    describe('translationKeyCount', () => {
        it('should return 0 for empty store', async () => {
            expect(await store.translationKeyCount()).toBe(0);
        });

        it('should return correct count', async () => {
            await store.addKey(createTestKey({ fullPath: 'en.key1' }));
            await store.addKey(createTestKey({ fullPath: 'en.key2' }));

            expect(await store.translationKeyCount()).toBe(2);
        });
    });

    // ========================================
    // 删除操作测试
    // ========================================

    describe('removeKey', () => {
        it('should remove key by fullPath', async () => {
            const key = createTestKey({ fullPath: 'en.item.sword' });
            await store.addKey(key);

            await store.removeKey('en.item.sword');

            expect(store.getCount()).toBe(0);
        });

        it('should update indexes after removal', async () => {
            const key = createTestKey({
                key: 'item.sword',
                languageCode: 'en',
                fullPath: 'en.item.sword',
                sourceFile: '/test/en.yaml',
            });
            await store.addKey(key);

            await store.removeKey('en.item.sword');

            expect(store.getLanguageCount()).toBe(0);
            expect(store.getFileCount()).toBe(0);
        });

        it('should log key removal', async () => {
            const key = createTestKey({ key: 'to.remove', fullPath: 'en.to.remove' });
            await store.addKey(key);

            await store.removeKey('en.to.remove');

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Translation key removed',
                expect.objectContaining({
                    key: 'to.remove',
                }),
            );
        });

        it('should do nothing for non-existing key', async () => {
            await expect(store.removeKey('nonexistent')).resolves.not.toThrow();
        });

        it('should not affect other keys', async () => {
            await store.addKey(createTestKey({ key: 'key1', fullPath: 'en.key1' }));
            await store.addKey(createTestKey({ key: 'key2', fullPath: 'en.key2' }));

            await store.removeKey('en.key1');

            expect(store.getCount()).toBe(1);
            const keys = await store.getAllKeys();
            expect(keys[0].key).toBe('key2');
        });
    });

    describe('removeByFile', () => {
        it('should remove all keys from file', async () => {
            const file1 = '/test/en.yaml';
            const file2 = '/test/zh_cn.yaml';

            await store.addKey(createTestKey({ fullPath: 'en.key1', sourceFile: file1 }));
            await store.addKey(createTestKey({ fullPath: 'en.key2', sourceFile: file1 }));
            await store.addKey(createTestKey({ fullPath: 'zh.key1', sourceFile: file2 }));

            await store.removeByFile(Uri.file(file1));

            expect(store.getCount()).toBe(1);
            const keys = await store.getAllKeys();
            expect(keys[0].sourceFile).toBe(file2);
        });

        it('should log removal', async () => {
            const file = '/test/en.yaml';
            await store.addKey(createTestKey({ fullPath: 'en.key1', sourceFile: file }));
            await store.addKey(createTestKey({ fullPath: 'en.key2', sourceFile: file }));

            await store.removeByFile(Uri.file(file));

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Translation keys removed by file',
                expect.objectContaining({
                    filePath: file,
                    count: 2,
                }),
            );
        });

        it('should do nothing for file with no keys', async () => {
            await store.addKey(createTestKey({ sourceFile: '/other/file.yaml' }));

            await store.removeByFile(Uri.file('/nonexistent/file.yaml'));

            expect(store.getCount()).toBe(1);
        });
    });

    describe('clearTranslationKeys', () => {
        it('should remove all keys', async () => {
            await store.addKey(createTestKey({ fullPath: 'en.key1' }));
            await store.addKey(createTestKey({ fullPath: 'en.key2' }));
            await store.addKey(createTestKey({ fullPath: 'en.key3' }));

            await store.clearTranslationKeys();

            expect(store.getCount()).toBe(0);
        });
    });

    describe('clear', () => {
        it('should clear all data and indexes', async () => {
            await store.addKey(
                createTestKey({
                    key: 'key1',
                    languageCode: 'en',
                    fullPath: 'en.key1',
                    sourceFile: '/test/en.yaml',
                }),
            );

            store.clear();

            expect(store.getCount()).toBe(0);
            expect(store.getLanguageCount()).toBe(0);
            expect(store.getFileCount()).toBe(0);
        });
    });

    // ========================================
    // 统计方法测试
    // ========================================

    describe('getCount', () => {
        it('should return current key count', async () => {
            expect(store.getCount()).toBe(0);

            await store.addKey(createTestKey({ fullPath: 'en.key1' }));
            expect(store.getCount()).toBe(1);

            await store.addKey(createTestKey({ fullPath: 'en.key2' }));
            expect(store.getCount()).toBe(2);
        });
    });

    describe('getLanguageCount', () => {
        it('should return number of unique languages', async () => {
            await store.addKey(createTestKey({ languageCode: 'en', fullPath: 'en.key1' }));
            await store.addKey(createTestKey({ languageCode: 'en', fullPath: 'en.key2' }));
            await store.addKey(createTestKey({ languageCode: 'zh_cn', fullPath: 'zh.key1' }));

            expect(store.getLanguageCount()).toBe(2);
        });
    });

    describe('getSupportedLanguages', () => {
        it('should return sorted list of languages', async () => {
            await store.addKey(createTestKey({ languageCode: 'zh_cn', fullPath: 'zh.key1' }));
            await store.addKey(createTestKey({ languageCode: 'en', fullPath: 'en.key1' }));
            await store.addKey(createTestKey({ languageCode: 'ja', fullPath: 'ja.key1' }));

            const languages = store.getSupportedLanguages();

            expect(languages).toEqual(['en', 'ja', 'zh_cn']);
        });
    });

    describe('getLastUpdated', () => {
        it('should return last update time', async () => {
            const before = new Date();
            await store.addKey(createTestKey({ fullPath: 'en.key1' }));
            const after = new Date();

            const lastUpdated = store.getLastUpdated();

            expect(lastUpdated.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(lastUpdated.getTime()).toBeLessThanOrEqual(after.getTime());
        });

        it('should update on add', async () => {
            await store.addKey(createTestKey({ fullPath: 'en.key1' }));
            const afterAdd = store.getLastUpdated();

            await new Promise((resolve) => setTimeout(resolve, 10));
            await store.addKey(createTestKey({ fullPath: 'en.key2' }));

            expect(store.getLastUpdated().getTime()).toBeGreaterThan(afterAdd.getTime());
        });

        it('should update on remove', async () => {
            await store.addKey(createTestKey({ fullPath: 'en.key1' }));
            const afterAdd = store.getLastUpdated();

            await new Promise((resolve) => setTimeout(resolve, 10));
            await store.removeKey('en.key1');

            expect(store.getLastUpdated().getTime()).toBeGreaterThan(afterAdd.getTime());
        });
    });

    describe('getFileCount', () => {
        it('should return number of unique files', async () => {
            await store.addKey(createTestKey({ fullPath: 'en.key1', sourceFile: '/test/en.yaml' }));
            await store.addKey(createTestKey({ fullPath: 'en.key2', sourceFile: '/test/en.yaml' }));
            await store.addKey(createTestKey({ fullPath: 'zh.key1', sourceFile: '/test/zh.yaml' }));

            expect(store.getFileCount()).toBe(2);
        });
    });
});
