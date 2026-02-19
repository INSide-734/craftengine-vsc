import { EditorUri } from '../../../core/types/EditorTypes';
import { ITranslationKey, ITranslationRepository } from '../../../core/interfaces/ITranslation';
import { ITranslationQuery, IQueryResult } from '../../../core/interfaces/IDataStoreService';
import { ILogger } from '../../../core/interfaces/ILogger';
import { IEventBus } from '../../../core/interfaces/IEventBus';
import { EVENT_TYPES } from '../../../core/constants/ServiceTokens';
import { generateEventId, safeRegExp } from '../../../core/utils';

/**
 * 翻译键存储管理
 * 
 * 负责翻译键的存储、索引和查询操作。
 * 使用内存索引提供高性能的数据访问。
 */
export class TranslationStore implements ITranslationRepository {
    /** 翻译键主存储：fullPath -> 翻译键对象 */
    private readonly keys = new Map<string, ITranslationKey>();
    /** 翻译键名索引：键名 -> fullPath 集合 */
    private readonly keyIndex = new Map<string, Set<string>>();
    /** 翻译语言索引：语言代码 -> fullPath 集合 */
    private readonly languageIndex = new Map<string, Set<string>>();
    /** 翻译文件索引：文件路径 -> fullPath 集合 */
    private readonly fileIndex = new Map<string, Set<string>>();
    
    private lastUpdated = new Date();
    
    constructor(
        private readonly logger: ILogger,
        private readonly eventBus?: IEventBus
    ) {}
    
    // ========================================
    // 查询操作
    // ========================================
    
    async getAllKeys(): Promise<ITranslationKey[]> {
        return Array.from(this.keys.values());
    }
    
    async getKeysByName(key: string): Promise<ITranslationKey[]> {
        const fullPaths = this.keyIndex.get(key) || new Set();
        return Array.from(fullPaths)
            .map(fp => this.keys.get(fp))
            .filter((k): k is ITranslationKey => k !== undefined);
    }
    
    async getKeysByLanguage(languageCode: string): Promise<ITranslationKey[]> {
        const fullPaths = this.languageIndex.get(languageCode.toLowerCase()) || new Set();
        return Array.from(fullPaths)
            .map(fp => this.keys.get(fp))
            .filter((k): k is ITranslationKey => k !== undefined);
    }
    
    async searchKeys(prefix: string): Promise<ITranslationKey[]> {
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
    
    async queryKeys(query: ITranslationQuery): Promise<IQueryResult<ITranslationKey>> {
        let results = Array.from(this.keys.values());
        
        // 应用过滤器
        if (query.namePattern) {
            const pattern = safeRegExp(query.namePattern, 'i');
            results = results.filter(k => pattern.test(k.key));
        }
        
        if (query.languageCode) {
            const langCode = query.languageCode.toLowerCase();
            results = results.filter(k => k.languageCode === langCode);
        }
        
        if (query.sourceFile) {
            const filePath = query.sourceFile.fsPath;
            results = results.filter(k => k.sourceFile === filePath);
        }
        
        // 排序
        results.sort((a, b) => a.key.localeCompare(b.key));
        
        const total = results.length;
        
        // 分页
        if (query.skip) {
            results = results.slice(query.skip);
        }
        if (query.limit) {
            results = results.slice(0, query.limit);
        }
        
        return {
            items: results,
            total,
            hasMore: query.limit ? (query.skip || 0) + results.length < total : false
        };
    }
    
    async translationKeyCount(): Promise<number> {
        return this.keys.size;
    }
    
    // ========================================
    // 写入操作
    // ========================================
    
    async addKey(key: ITranslationKey): Promise<void> {
        await this.addInternal(key, true);
        await this.publishTranslationCreated(key);
    }
    
    /**
     * 内部添加翻译键（不记录日志）
     */
    async addWithoutLog(key: ITranslationKey): Promise<void> {
        await this.addInternal(key, false);
    }
    
    private async addInternal(key: ITranslationKey, log: boolean): Promise<void> {
        // 添加到主存储
        this.keys.set(key.fullPath, key);
        
        // 更新索引
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
        
        this.lastUpdated = new Date();
        
        if (log) {
            this.logger.debug('Translation key added', {
                key: key.key,
                languageCode: key.languageCode
            });
        }
    }
    
    async removeKey(fullPath: string): Promise<void> {
        const key = this.keys.get(fullPath);
        if (!key) {
            return;
        }

        this.removeFromIndexes(key);
        this.keys.delete(fullPath);

        this.lastUpdated = new Date();

        this.logger.debug('Translation key removed', {
            key: key.key,
            languageCode: key.languageCode
        });
        await this.publishTranslationDeleted(fullPath);
    }
    
    async removeByFile(sourceFile: EditorUri): Promise<void> {
        const filePath = sourceFile.fsPath;
        const fullPaths = this.fileIndex.get(filePath);
        
        if (!fullPaths || fullPaths.size === 0) {
            return;
        }
        
        let count = 0;
        for (const fp of Array.from(fullPaths)) {
            const key = this.keys.get(fp);
            if (key) {
                this.removeFromIndexes(key);
                this.keys.delete(fp);
                count++;
            }
        }
        
        this.lastUpdated = new Date();
        
        this.logger.debug('Translation keys removed by file', {
            filePath,
            count
        });
    }
    
    async clearTranslationKeys(): Promise<void> {
        const count = this.keys.size;
        this.clear();
        if (count > 0) {
            await this.publishTranslationCleared(count);
        }
    }
    
    /**
     * 清空所有数据
     */
    clear(): void {
        this.keys.clear();
        this.keyIndex.clear();
        this.languageIndex.clear();
        this.fileIndex.clear();
        this.lastUpdated = new Date();
    }
    
    // ========================================
    // 统计
    // ========================================
    
    getCount(): number {
        return this.keys.size;
    }
    
    getLanguageCount(): number {
        return this.languageIndex.size;
    }
    
    getSupportedLanguages(): string[] {
        return Array.from(this.languageIndex.keys()).sort();
    }
    
    getLastUpdated(): Date {
        return this.lastUpdated;
    }
    
    getFileCount(): number {
        return this.fileIndex.size;
    }
    
    // ========================================
    // 索引管理
    // ========================================
    
    private removeFromIndexes(key: ITranslationKey): void {
        // 键名索引
        const keyPaths = this.keyIndex.get(key.key);
        if (keyPaths) {
            keyPaths.delete(key.fullPath);
            if (keyPaths.size === 0) {
                this.keyIndex.delete(key.key);
            }
        }

        // 语言索引
        const langPaths = this.languageIndex.get(key.languageCode);
        if (langPaths) {
            langPaths.delete(key.fullPath);
            if (langPaths.size === 0) {
                this.languageIndex.delete(key.languageCode);
            }
        }

        // 文件索引
        const filePaths = this.fileIndex.get(key.sourceFile);
        if (filePaths) {
            filePaths.delete(key.fullPath);
            if (filePaths.size === 0) {
                this.fileIndex.delete(key.sourceFile);
            }
        }
    }

    // ========================================
    // 事件发布
    // ========================================

    private async publishTranslationCreated(translationKey: ITranslationKey): Promise<void> {
        if (!this.eventBus) { return; }
        await this.eventBus.publish(EVENT_TYPES.TranslationCreated, {
            id: generateEventId('trans'),
            type: EVENT_TYPES.TranslationCreated,
            timestamp: new Date(),
            source: 'TranslationStore',
            aggregateId: translationKey.fullPath,
            translationKey
        });
    }

    private async publishTranslationDeleted(fullPath: string): Promise<void> {
        if (!this.eventBus) { return; }
        await this.eventBus.publish(EVENT_TYPES.TranslationDeleted, {
            id: generateEventId('trans'),
            type: EVENT_TYPES.TranslationDeleted,
            timestamp: new Date(),
            source: 'TranslationStore',
            aggregateId: fullPath,
            fullPath
        });
    }

    private async publishTranslationCleared(count: number): Promise<void> {
        if (!this.eventBus) { return; }
        await this.eventBus.publish(EVENT_TYPES.TranslationCleared, {
            id: generateEventId('trans'),
            type: EVENT_TYPES.TranslationCleared,
            timestamp: new Date(),
            source: 'TranslationStore',
            count
        });
    }
}


