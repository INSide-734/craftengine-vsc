/**
 * 翻译存储性能测试
 * 
 * 测试 TranslationStore 在不同场景下的性能表现，包括：
 * - 翻译键添加操作
 * - 翻译键查询操作（按名称、按语言、搜索）
 * - 索引操作性能
 * - 批量操作性能
 * - 典型使用模式
 * 
 * 性能基准目标:
 * | 操作 | 目标时间 |
 * |------|----------|
 * | 单个翻译键添加 | < 0.1ms |
 * | 批量添加 1000 个键 | < 100ms |
 * | 按名称查询（精确匹配） | < 0.5ms |
 * | 按语言查询（1000 键） | < 5ms |
 * | 前缀搜索（1000 键） | < 10ms |
 * | 翻译键补全建议 | < 5ms |
 */
import { describe, bench } from 'vitest';
import { ITranslationKey } from '../../core/interfaces/ITranslation';
import { defaultBenchOptions, fastBenchOptions, slowBenchOptions } from './bench-options';

// ========================================
// 模拟数据生成
// ========================================

/**
 * 生成翻译键
 * 
 * CraftEngine 翻译键格式示例：
 * - item.jade_sword
 * - item.phoenix_staff.name
 * - item.phoenix_staff.lore.0
 * - category.weapons
 * - message.welcome
 * - gui.menu.title
 * - sound.attack.hit
 */
function generateTranslationKey(
    index: number, 
    languageCode: string = 'en',
    fileIndex: number = 0
): ITranslationKey {
    const categories = [
        'item', 'message', 'gui', 'category', 'sound', 'lore', 'tooltip', 'error'
    ];
    const subKeys = [
        'name', 'description', 'lore', 'title', 'button', 'placeholder', 'warning', 'success'
    ];
    
    const category = categories[index % categories.length];
    const subKey = subKeys[Math.floor(index / categories.length) % subKeys.length];
    const itemId = `item_${index}`;
    
    const key = `${category}.${itemId}.${subKey}`;
    const fullPath = `${languageCode}.${key}`;
    
    return {
        key,
        fullPath,
        languageCode,
        value: `Translation value for ${key}`,
        sourceFile: `/test/translations/lang_${fileIndex}.yml`,
        lineNumber: index * 2 + 10,
    };
}

/**
 * 生成多语言翻译键（一个键在多个语言中）
 */
function generateMultiLanguageKeys(keyCount: number): ITranslationKey[] {
    const languages = ['en', 'zh_cn', 'ja', 'ko', 'de', 'fr', 'es', 'pt_br'];
    const keys: ITranslationKey[] = [];
    
    for (let i = 0; i < keyCount; i++) {
        for (let langIdx = 0; langIdx < languages.length; langIdx++) {
            keys.push(generateTranslationKey(i, languages[langIdx], langIdx));
        }
    }
    
    return keys;
}

/**
 * 生成 CraftEngine 风格的真实翻译键
 */
function generateCraftEngineTranslationKeys(itemCount: number): ITranslationKey[] {
    const languages = ['en', 'zh_cn'];
    const items = [
        'jade_sword', 'phoenix_staff', 'dragon_blade', 'ruby', 'sapphire',
        'emerald_pickaxe', 'obsidian_armor', 'crystal_shield', 'mithril_bow', 'thunder_axe'
    ];
    const keys: ITranslationKey[] = [];
    
    for (let i = 0; i < itemCount; i++) {
        const itemName = items[i % items.length];
        const suffix = i >= items.length ? `_${Math.floor(i / items.length)}` : '';
        const itemId = `${itemName}${suffix}`;
        
        for (const lang of languages) {
            // 物品名称
            keys.push({
                key: `item.${itemId}.name`,
                fullPath: `${lang}.item.${itemId}.name`,
                languageCode: lang,
                value: lang === 'en' ? `${itemId} Name` : `${itemId} 名称`,
                sourceFile: `/test/translations/${lang}.yml`,
                lineNumber: keys.length + 1,
            });
            
            // 物品描述
            keys.push({
                key: `item.${itemId}.lore`,
                fullPath: `${lang}.item.${itemId}.lore`,
                languageCode: lang,
                value: lang === 'en' ? `${itemId} description` : `${itemId} 描述`,
                sourceFile: `/test/translations/${lang}.yml`,
                lineNumber: keys.length + 1,
            });
            
            // 物品分类
            if (i % 5 === 0) {
                keys.push({
                    key: `category.${itemId}`,
                    fullPath: `${lang}.category.${itemId}`,
                    languageCode: lang,
                    value: lang === 'en' ? `${itemId} Category` : `${itemId} 分类`,
                    sourceFile: `/test/translations/${lang}.yml`,
                    lineNumber: keys.length + 1,
                });
            }
        }
    }
    
    return keys;
}

// ========================================
// 预生成测试数据
// ========================================

const keys100 = Array.from({ length: 100 }, (_, i) => generateTranslationKey(i, 'en'));
const keys500 = Array.from({ length: 500 }, (_, i) => generateTranslationKey(i, 'en'));
const keys1000 = Array.from({ length: 1000 }, (_, i) => generateTranslationKey(i, 'en'));
const keys5000 = Array.from({ length: 5000 }, (_, i) => generateTranslationKey(i, 'en'));

const multiLangKeys100 = generateMultiLanguageKeys(100); // 100 * 8 = 800 keys
const multiLangKeys500 = generateMultiLanguageKeys(500); // 500 * 8 = 4000 keys

const craftEngineKeys50 = generateCraftEngineTranslationKeys(50);
const craftEngineKeys200 = generateCraftEngineTranslationKeys(200);

// ========================================
// 存储模拟（简化版，用于测试数据结构性能）
// ========================================

class MockTranslationStore {
    private readonly keys = new Map<string, ITranslationKey>();
    private readonly keyIndex = new Map<string, Set<string>>();
    private readonly languageIndex = new Map<string, Set<string>>();
    private readonly fileIndex = new Map<string, Set<string>>();
    
    add(key: ITranslationKey): void {
        this.keys.set(key.fullPath, key);
        
        if (!this.keyIndex.has(key.key)) {
            this.keyIndex.set(key.key, new Set());
        }
        this.keyIndex.get(key.key)!.add(key.fullPath);
        
        if (!this.languageIndex.has(key.languageCode)) {
            this.languageIndex.set(key.languageCode, new Set());
        }
        this.languageIndex.get(key.languageCode)!.add(key.fullPath);
        
        if (!this.fileIndex.has(key.sourceFile)) {
            this.fileIndex.set(key.sourceFile, new Set());
        }
        this.fileIndex.get(key.sourceFile)!.add(key.fullPath);
    }
    
    getByName(keyName: string): ITranslationKey[] {
        const fullPaths = this.keyIndex.get(keyName) || new Set();
        return Array.from(fullPaths)
            .map(fp => this.keys.get(fp))
            .filter((k): k is ITranslationKey => k !== undefined);
    }
    
    getByLanguage(languageCode: string): ITranslationKey[] {
        const fullPaths = this.languageIndex.get(languageCode) || new Set();
        return Array.from(fullPaths)
            .map(fp => this.keys.get(fp))
            .filter((k): k is ITranslationKey => k !== undefined);
    }
    
    searchKeys(prefix: string): ITranslationKey[] {
        const lowerPrefix = prefix.toLowerCase();
        const results: ITranslationKey[] = [];
        const seenKeys = new Set<string>();
        
        for (const key of this.keys.values()) {
            if (key.key.toLowerCase().startsWith(lowerPrefix) && !seenKeys.has(key.key)) {
                results.push(key);
                seenKeys.add(key.key);
            }
        }
        
        return results.sort((a, b) => a.key.localeCompare(b.key));
    }
    
    fuzzySearch(query: string): ITranslationKey[] {
        const lowerQuery = query.toLowerCase();
        const results: ITranslationKey[] = [];
        const seenKeys = new Set<string>();
        
        for (const key of this.keys.values()) {
            if (key.key.toLowerCase().includes(lowerQuery) && !seenKeys.has(key.key)) {
                results.push(key);
                seenKeys.add(key.key);
            }
        }
        
        return results.sort((a, b) => a.key.localeCompare(b.key));
    }
    
    remove(fullPath: string): void {
        const key = this.keys.get(fullPath);
        if (!key) {return;}
        
        this.keys.delete(fullPath);
        
        const keyPaths = this.keyIndex.get(key.key);
        if (keyPaths) {
            keyPaths.delete(fullPath);
            if (keyPaths.size === 0) {
                this.keyIndex.delete(key.key);
            }
        }
        
        const langPaths = this.languageIndex.get(key.languageCode);
        if (langPaths) {
            langPaths.delete(fullPath);
            if (langPaths.size === 0) {
                this.languageIndex.delete(key.languageCode);
            }
        }
        
        const filePaths = this.fileIndex.get(key.sourceFile);
        if (filePaths) {
            filePaths.delete(fullPath);
            if (filePaths.size === 0) {
                this.fileIndex.delete(key.sourceFile);
            }
        }
    }
    
    removeByFile(filePath: string): number {
        const fullPaths = this.fileIndex.get(filePath);
        if (!fullPaths) {return 0;}
        
        let count = 0;
        for (const fp of Array.from(fullPaths)) {
            this.remove(fp);
            count++;
        }
        return count;
    }
    
    getAll(): ITranslationKey[] {
        return Array.from(this.keys.values());
    }
    
    count(): number {
        return this.keys.size;
    }
    
    clear(): void {
        this.keys.clear();
        this.keyIndex.clear();
        this.languageIndex.clear();
        this.fileIndex.clear();
    }
    
    getLanguageCount(): number {
        return this.languageIndex.size;
    }
    
    getFileCount(): number {
        return this.fileIndex.size;
    }
}

describe('TranslationStore Performance', () => {
    // ========================================
    // 添加操作测试
    // ========================================

    describe('Add Operations', () => {
        bench('add single translation key', () => {
            const store = new MockTranslationStore();
            store.add(keys100[0]);
        }, defaultBenchOptions);

        bench('add 10 translation keys', () => {
            const store = new MockTranslationStore();
            for (let i = 0; i < 10; i++) {
                store.add(keys100[i]);
            }
        }, defaultBenchOptions);

        bench('add 100 translation keys', () => {
            const store = new MockTranslationStore();
            for (const key of keys100) {
                store.add(key);
            }
        }, fastBenchOptions);

        bench('add 500 translation keys', () => {
            const store = new MockTranslationStore();
            for (const key of keys500) {
                store.add(key);
            }
        }, fastBenchOptions);

        bench('add 1000 translation keys', () => {
            const store = new MockTranslationStore();
            for (const key of keys1000) {
                store.add(key);
            }
        }, slowBenchOptions);

        bench('add multi-language keys (100 keys × 8 languages)', () => {
            const store = new MockTranslationStore();
            for (const key of multiLangKeys100) {
                store.add(key);
            }
        }, fastBenchOptions);

        bench('add CraftEngine style keys (50 items)', () => {
            const store = new MockTranslationStore();
            for (const key of craftEngineKeys50) {
                store.add(key);
            }
        }, fastBenchOptions);
    });

    // ========================================
    // 按名称查询测试（精确匹配）
    // ========================================

    describe('Query by Name (Exact Match)', () => {
        const store100 = new MockTranslationStore();
        keys100.forEach(k => store100.add(k));
        
        const store1000 = new MockTranslationStore();
        keys1000.forEach(k => store1000.add(k));
        
        const multiLangStore = new MockTranslationStore();
        multiLangKeys100.forEach(k => multiLangStore.add(k));

        bench('get by name (100 keys) - exists', () => {
            store100.getByName('item.item_50.name');
        }, defaultBenchOptions);

        bench('get by name (100 keys) - not exists', () => {
            store100.getByName('nonexistent.key');
        }, defaultBenchOptions);

        bench('get by name (1000 keys) - exists', () => {
            store1000.getByName('item.item_500.name');
        }, defaultBenchOptions);

        bench('get by name (1000 keys) - not exists', () => {
            store1000.getByName('nonexistent.key');
        }, defaultBenchOptions);

        bench('get by name (multi-language, same key in 8 languages)', () => {
            multiLangStore.getByName('item.item_50.name');
        }, defaultBenchOptions);
    });

    // ========================================
    // 按语言查询测试
    // ========================================

    describe('Query by Language', () => {
        const multiLangStore100 = new MockTranslationStore();
        multiLangKeys100.forEach(k => multiLangStore100.add(k));
        
        const multiLangStore500 = new MockTranslationStore();
        multiLangKeys500.forEach(k => multiLangStore500.add(k));

        bench('get by language (100 keys per lang)', () => {
            multiLangStore100.getByLanguage('en');
        }, defaultBenchOptions);

        bench('get by language (500 keys per lang)', () => {
            multiLangStore500.getByLanguage('zh_cn');
        }, fastBenchOptions);

        bench('get by language (not exists)', () => {
            multiLangStore100.getByLanguage('xx');
        }, defaultBenchOptions);

        bench('iterate all languages', () => {
            const languages = ['en', 'zh_cn', 'ja', 'ko', 'de', 'fr', 'es', 'pt_br'];
            for (const lang of languages) {
                multiLangStore100.getByLanguage(lang);
            }
        }, fastBenchOptions);
    });

    // ========================================
    // 前缀搜索测试
    // ========================================

    describe('Prefix Search', () => {
        const store500 = new MockTranslationStore();
        keys500.forEach(k => store500.add(k));
        
        const store1000 = new MockTranslationStore();
        keys1000.forEach(k => store1000.add(k));
        
        const craftEngineStore = new MockTranslationStore();
        craftEngineKeys200.forEach(k => craftEngineStore.add(k));

        bench('search prefix "item" (500 keys)', () => {
            store500.searchKeys('item');
        }, defaultBenchOptions);

        bench('search prefix "item.item_5" (500 keys)', () => {
            store500.searchKeys('item.item_5');
        }, defaultBenchOptions);

        bench('search prefix (1000 keys) - broad', () => {
            store1000.searchKeys('item');
        }, fastBenchOptions);

        bench('search prefix (1000 keys) - narrow', () => {
            store1000.searchKeys('item.item_500');
        }, defaultBenchOptions);

        bench('search prefix (1000 keys) - no match', () => {
            store1000.searchKeys('nonexistent');
        }, defaultBenchOptions);

        bench('search CraftEngine keys - "item.jade"', () => {
            craftEngineStore.searchKeys('item.jade');
        }, defaultBenchOptions);

        bench('search CraftEngine keys - "item.phoenix"', () => {
            craftEngineStore.searchKeys('item.phoenix');
        }, defaultBenchOptions);

        bench('search CraftEngine keys - "category"', () => {
            craftEngineStore.searchKeys('category');
        }, defaultBenchOptions);
    });

    // ========================================
    // 模糊搜索测试
    // ========================================

    describe('Fuzzy Search', () => {
        const store1000 = new MockTranslationStore();
        keys1000.forEach(k => store1000.add(k));
        
        const craftEngineStore = new MockTranslationStore();
        craftEngineKeys200.forEach(k => craftEngineStore.add(k));

        bench('fuzzy search (1000 keys) - single word', () => {
            store1000.fuzzySearch('name');
        }, fastBenchOptions);

        bench('fuzzy search (1000 keys) - partial match', () => {
            store1000.fuzzySearch('item_50');
        }, fastBenchOptions);

        bench('fuzzy search CraftEngine keys - "sword"', () => {
            craftEngineStore.fuzzySearch('sword');
        }, defaultBenchOptions);

        bench('fuzzy search CraftEngine keys - "lore"', () => {
            craftEngineStore.fuzzySearch('lore');
        }, defaultBenchOptions);
    });

    // ========================================
    // 删除操作测试
    // ========================================

    describe('Remove Operations', () => {
        bench('remove single key', () => {
            const store = new MockTranslationStore();
            keys100.forEach(k => store.add(k));
            store.remove('en.item.item_50.name');
        }, defaultBenchOptions);

        bench('remove 10 keys', () => {
            const store = new MockTranslationStore();
            keys100.forEach(k => store.add(k));
            for (let i = 0; i < 10; i++) {
                store.remove(keys100[i].fullPath);
            }
        }, defaultBenchOptions);

        bench('remove by file (10 keys per file)', () => {
            const store = new MockTranslationStore();
            // 添加 100 个键，分布在 10 个文件中
            for (let i = 0; i < 100; i++) {
                store.add(generateTranslationKey(i, 'en', Math.floor(i / 10)));
            }
            store.removeByFile('/test/translations/lang_5.yml');
        }, defaultBenchOptions);

        bench('remove by file (50 keys per file)', () => {
            const store = new MockTranslationStore();
            // 添加 500 个键，分布在 10 个文件中
            for (let i = 0; i < 500; i++) {
                store.add(generateTranslationKey(i, 'en', Math.floor(i / 50)));
            }
            store.removeByFile('/test/translations/lang_5.yml');
        }, fastBenchOptions);
    });

    // ========================================
    // 统计操作测试
    // ========================================

    describe('Statistics Operations', () => {
        const store1000 = new MockTranslationStore();
        keys1000.forEach(k => store1000.add(k));
        
        const multiLangStore = new MockTranslationStore();
        multiLangKeys100.forEach(k => multiLangStore.add(k));

        bench('count (1000 keys)', () => {
            store1000.count();
        }, defaultBenchOptions);

        bench('get all (1000 keys)', () => {
            store1000.getAll();
        }, fastBenchOptions);

        bench('get language count', () => {
            multiLangStore.getLanguageCount();
        }, defaultBenchOptions);

        bench('get file count', () => {
            multiLangStore.getFileCount();
        }, defaultBenchOptions);
    });

    // ========================================
    // 典型使用场景测试
    // ========================================

    describe('Typical Usage Patterns', () => {
        bench('autocomplete scenario - search then sort', () => {
            const store = new MockTranslationStore();
            keys500.forEach(k => store.add(k));
            
            const results = store.searchKeys('item.item_5');
            results.sort((a, b) => a.key.localeCompare(b.key));
            results.slice(0, 20);
        }, fastBenchOptions);

        bench('diagnostic scenario - check key exists in all languages', () => {
            const store = new MockTranslationStore();
            multiLangKeys100.forEach(k => store.add(k));
            
            const keyName = 'item.item_50.name';
            const translations = store.getByName(keyName);
            const languages = new Set(translations.map(t => t.languageCode));
            const allLanguages = ['en', 'zh_cn', 'ja', 'ko', 'de', 'fr', 'es', 'pt_br'];
            void allLanguages.filter(l => !languages.has(l));
        }, defaultBenchOptions);

        bench('hover scenario - get translation value', () => {
            const store = new MockTranslationStore();
            multiLangKeys100.forEach(k => store.add(k));
            
            const keyName = 'item.item_50.name';
            const translations = store.getByName(keyName);
            const enTranslation = translations.find(t => t.languageCode === 'en');
            enTranslation?.value;
        }, defaultBenchOptions);

        bench('file reload scenario - remove and re-add', () => {
            const store = new MockTranslationStore();
            // 初始添加
            for (let i = 0; i < 100; i++) {
                store.add(generateTranslationKey(i, 'en', 0));
            }
            // 移除该文件的所有键
            store.removeByFile('/test/translations/lang_0.yml');
            // 重新添加（模拟文件修改后重新解析）
            for (let i = 0; i < 100; i++) {
                store.add(generateTranslationKey(i, 'en', 0));
            }
        }, fastBenchOptions);

        bench('CraftEngine i18n completion - search item translations', () => {
            const store = new MockTranslationStore();
            craftEngineKeys200.forEach(k => store.add(k));
            
            // 模拟用户输入 <i18n:item.jade 后的补全
            const results = store.searchKeys('item.jade');
            results.slice(0, 10);
        }, defaultBenchOptions);

        bench('CraftEngine l10n validation - check translation exists', () => {
            const store = new MockTranslationStore();
            craftEngineKeys200.forEach(k => store.add(k));
            
            // 验证多个翻译键是否存在
            const keysToCheck = [
                'item.jade_sword.name',
                'item.phoenix_staff.lore',
                'item.dragon_blade.name',
                'item.nonexistent.name',
                'category.jade_sword',
            ];
            
            for (const keyName of keysToCheck) {
                const translations = store.getByName(keyName);
                translations.length > 0;
            }
        }, defaultBenchOptions);
    });

    // ========================================
    // 边界情况测试
    // ========================================

    describe('Edge Cases', () => {
        bench('empty store - search', () => {
            const store = new MockTranslationStore();
            store.searchKeys('item');
        }, defaultBenchOptions);

        bench('empty store - get by name', () => {
            const store = new MockTranslationStore();
            store.getByName('item.test');
        }, defaultBenchOptions);

        bench('empty store - get by language', () => {
            const store = new MockTranslationStore();
            store.getByLanguage('en');
        }, defaultBenchOptions);

        bench('single character prefix search', () => {
            const store = new MockTranslationStore();
            keys500.forEach(k => store.add(k));
            store.searchKeys('i');
        }, fastBenchOptions);

        bench('very long key name', () => {
            const store = new MockTranslationStore();
            keys100.forEach(k => store.add(k));
            store.searchKeys('item.very_long_item_name_with_many_segments.name.subkey.another');
        }, defaultBenchOptions);

        bench('special characters in search', () => {
            const store = new MockTranslationStore();
            keys500.forEach(k => store.add(k));
            store.searchKeys('item.item_');
        }, defaultBenchOptions);

        bench('case sensitivity', () => {
            const store = new MockTranslationStore();
            keys500.forEach(k => store.add(k));
            store.searchKeys('ITEM');
        }, defaultBenchOptions);
    });

    // ========================================
    // 大规模操作测试
    // ========================================

    describe('Large Scale Operations', () => {
        bench('add 5000 translation keys', () => {
            const store = new MockTranslationStore();
            for (const key of keys5000) {
                store.add(key);
            }
        }, slowBenchOptions);

        bench('search in 5000 keys', () => {
            const store = new MockTranslationStore();
            keys5000.forEach(k => store.add(k));
            store.searchKeys('item.item_2500');
        }, fastBenchOptions);

        bench('get by language in 4000 keys (500 per lang × 8 langs)', () => {
            const store = new MockTranslationStore();
            multiLangKeys500.forEach(k => store.add(k));
            store.getByLanguage('en');
        }, fastBenchOptions);

        bench('clear 1000 keys', () => {
            const store = new MockTranslationStore();
            keys1000.forEach(k => store.add(k));
            store.clear();
        }, fastBenchOptions);
    });
});

