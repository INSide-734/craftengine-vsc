import { EditorUri } from '../../core/types/EditorTypes';
import {
    IDataStoreService,
    ITemplateQuery,
    ITranslationQuery,
    IQueryResult,
    IDataStoreStatistics
} from '../../core/interfaces/IDataStoreService';
import { IDataStoreLifecycle } from '../../core/interfaces/IDataStoreLifecycle';
import { ITemplate } from '../../core/interfaces/ITemplate';
import { ITranslationKey, ITranslationRepository, ITranslationReference } from '../../core/interfaces/ITranslation';
import { IItemId, IItemIdRepository, IBuiltinItemLoader } from '../../core/interfaces/IItemId';
import { ICategory, ICategoryRepository } from '../../core/interfaces/ICategory';
import { ITemplateRepository, ITemplateQueryResult, ITemplateStatistics } from '../../core/interfaces/ITemplateRepository';
import { ILogger } from '../../core/interfaces/ILogger';
import { IEventBus } from '../../core/interfaces/IEventBus';
import { IFileReader } from '../../core/interfaces/IFileReader';
import { IYamlScanner, IYamlScanResult } from '../../core/interfaces/IYamlScanner';
import { IYamlParser } from '../../core/interfaces/IYamlParser';
import { IYamlScanOptions } from '../../core/interfaces/IYamlScanner';
import { FileIndexingOrchestrator } from './stores/FileIndexingOrchestrator';
import { DataStoreStatisticsCollector } from './stores/DataStoreStatisticsCollector';

/**
 * 统一数据存储服务（门面）
 *
 * 将生命周期管理委托给 FileIndexingOrchestrator，
 * 将统计收集委托给 DataStoreStatisticsCollector，
 * 自身作为门面提供统一的查询和变更 API。
 */
export class DataStoreService implements IDataStoreService, IDataStoreLifecycle, ITemplateRepository, ITranslationRepository, IItemIdRepository, ICategoryRepository {
    private readonly orchestrator: FileIndexingOrchestrator;
    private readonly statistics: DataStoreStatisticsCollector;

    constructor(
        logger: ILogger,
        eventBus: IEventBus,
        yamlScanner: IYamlScanner,
        yamlParser: IYamlParser,
        fileReader: IFileReader,
        scanResultProvider?: { getScanResult(options: IYamlScanOptions): Promise<IYamlScanResult> },
        builtinItemLoader?: IBuiltinItemLoader
    ) {
        const childLogger = logger.createChild('DataStoreService');
        this.orchestrator = new FileIndexingOrchestrator(
            childLogger, yamlScanner, yamlParser, fileReader,
            scanResultProvider, builtinItemLoader, eventBus
        );
        this.statistics = new DataStoreStatisticsCollector(
            this.orchestrator.templateStore,
            this.orchestrator.translationStore,
            this.orchestrator.itemStore,
            this.orchestrator.categoryStore,
            () => this.orchestrator.isInitialized()
        );
    }

    // ========================================
    // 生命周期管理（委托给 FileIndexingOrchestrator）
    // ========================================

    async initialize(): Promise<void> {
        return this.orchestrator.initialize();
    }

    isInitialized(): boolean {
        return this.orchestrator.isInitialized();
    }

    async reload(): Promise<void> {
        return this.orchestrator.reload();
    }

    async clear(): Promise<void> {
        return this.orchestrator.clear();
    }

    dispose(): void {
        this.orchestrator.dispose();
    }

    async handleFileChange(fileUri: EditorUri): Promise<void> {
        return this.orchestrator.handleFileChange(fileUri);
    }

    async handleFileDelete(fileUri: EditorUri): Promise<void> {
        return this.orchestrator.handleFileDelete(fileUri);
    }

    // ========================================
    // 统计（委托给 DataStoreStatisticsCollector）
    // ========================================

    async getStatistics(): Promise<IDataStoreStatistics> {
        await this.ensureInitialized();
        return this.statistics.getStatistics();
    }

    async getSupportedLanguages(): Promise<string[]> {
        await this.ensureInitialized();
        return this.statistics.getSupportedLanguages();
    }

    // ========================================
    // 模板操作
    // ========================================

    async getTemplateById(id: string): Promise<ITemplate | undefined> {
        await this.ensureInitialized();
        return this.orchestrator.templateStore.getById(id);
    }

    async getTemplateByName(name: string): Promise<ITemplate | undefined> {
        await this.ensureInitialized();
        return this.orchestrator.templateStore.getByName(name);
    }

    async queryTemplates(query: ITemplateQuery): Promise<IQueryResult<ITemplate>> {
        await this.ensureInitialized();
        return this.orchestrator.templateStore.queryTemplates(query);
    }

    async getAllTemplates(): Promise<ITemplate[]> {
        await this.ensureInitialized();
        return this.orchestrator.templateStore.getAll();
    }

    async getTemplateCount(): Promise<number> {
        await this.ensureInitialized();
        return this.orchestrator.templateStore.count();
    }

    async addTemplate(template: ITemplate): Promise<void> {
        await this.ensureInitialized();
        return this.orchestrator.templateStore.add(template);
    }

    async addTemplates(templates: ITemplate[]): Promise<void> {
        await this.ensureInitialized();
        return this.orchestrator.templateStore.addMany(templates);
    }

    async updateTemplate(template: ITemplate): Promise<void> {
        await this.ensureInitialized();
        return this.orchestrator.templateStore.update(template);
    }

    async removeTemplate(id: string): Promise<void> {
        await this.ensureInitialized();
        return this.orchestrator.templateStore.remove(id);
    }

    async removeTemplatesByFile(sourceFile: EditorUri): Promise<void> {
        await this.ensureInitialized();
        return this.orchestrator.templateStore.removeByFile(sourceFile);
    }

    async templateExists(id: string): Promise<boolean> {
        await this.ensureInitialized();
        return this.orchestrator.templateStore.exists(id);
    }

    // ========================================
    // 翻译键操作
    // ========================================

    async getAllTranslationKeys(): Promise<ITranslationKey[]> {
        await this.ensureInitialized();
        return this.orchestrator.translationStore.getAllKeys();
    }

    async getTranslationKeysByName(key: string): Promise<ITranslationKey[]> {
        await this.ensureInitialized();
        return this.orchestrator.translationStore.getKeysByName(key);
    }

    async getTranslationKeysByLanguage(languageCode: string): Promise<ITranslationKey[]> {
        await this.ensureInitialized();
        return this.orchestrator.translationStore.getKeysByLanguage(languageCode);
    }

    async searchTranslationKeys(prefix: string): Promise<ITranslationKey[]> {
        await this.ensureInitialized();
        return this.orchestrator.translationStore.searchKeys(prefix);
    }

    async queryTranslationKeys(query: ITranslationQuery): Promise<IQueryResult<ITranslationKey>> {
        await this.ensureInitialized();
        return this.orchestrator.translationStore.queryKeys(query);
    }

    async getTranslationKeyCount(): Promise<number> {
        await this.ensureInitialized();
        return this.orchestrator.translationStore.translationKeyCount();
    }

    async addTranslationKey(key: ITranslationKey): Promise<void> {
        await this.ensureInitialized();
        return this.orchestrator.translationStore.addKey(key);
    }

    async removeTranslationKey(fullPath: string): Promise<void> {
        await this.ensureInitialized();
        return this.orchestrator.translationStore.removeKey(fullPath);
    }

    async removeTranslationKeysByFile(sourceFile: EditorUri): Promise<void> {
        await this.ensureInitialized();
        return this.orchestrator.translationStore.removeByFile(sourceFile);
    }

    // ========================================
    // 翻译引用索引操作
    // ========================================

    /**
     * 按键名获取所有翻译引用位置
     */
    getTranslationReferences(keyName: string): readonly ITranslationReference[] {
        return this.orchestrator.translationReferenceStore.getReferences(keyName);
    }

    // ========================================
    // 物品 ID 操作
    // ========================================

    async getAllItems(): Promise<IItemId[]> {
        await this.ensureInitialized();
        return this.orchestrator.itemStore.getAllItems();
    }

    async getItemById(id: string): Promise<IItemId | undefined> {
        await this.ensureInitialized();
        return this.orchestrator.itemStore.getItemById(id);
    }

    async searchItems(prefix: string): Promise<IItemId[]> {
        await this.ensureInitialized();
        return this.orchestrator.itemStore.searchItems(prefix);
    }

    async getItemsByNamespace(namespace: string): Promise<IItemId[]> {
        await this.ensureInitialized();
        return this.orchestrator.itemStore.getItemsByNamespace(namespace);
    }

    async getItemCount(): Promise<number> {
        await this.ensureInitialized();
        return this.orchestrator.itemStore.getItemCount();
    }

    async addItem(item: IItemId): Promise<void> {
        await this.ensureInitialized();
        return this.orchestrator.itemStore.addItem(item);
    }

    async removeItem(id: string): Promise<void> {
        await this.ensureInitialized();
        return this.orchestrator.itemStore.removeItem(id);
    }

    async removeItemsByFile(sourceFile: EditorUri): Promise<void> {
        await this.ensureInitialized();
        return this.orchestrator.itemStore.removeItemsByFile(sourceFile);
    }

    // ========================================
    // ITemplateRepository 接口
    // ========================================

    async getById(id: string): Promise<ITemplate | undefined> {
        return this.getTemplateById(id);
    }

    async getByName(name: string): Promise<ITemplate | undefined> {
        return this.getTemplateByName(name);
    }

    async query(query: ITemplateQuery): Promise<ITemplateQueryResult> {
        await this.ensureInitialized();
        return this.orchestrator.templateStore.query(query);
    }

    async getAll(): Promise<ITemplate[]> {
        return this.getAllTemplates();
    }

    async add(template: ITemplate): Promise<void> {
        return this.addTemplate(template);
    }

    async addMany(templates: ITemplate[]): Promise<void> {
        return this.addTemplates(templates);
    }

    async update(template: ITemplate): Promise<void> {
        return this.updateTemplate(template);
    }

    async remove(id: string): Promise<void> {
        return this.removeTemplate(id);
    }

    async removeByFile(sourceFile: EditorUri): Promise<void> {
        return this.removeTemplatesByFile(sourceFile);
    }

    async clearTemplates(): Promise<void> {
        await this.ensureInitialized();
        return this.orchestrator.templateStore.clearTemplates();
    }

    async getTemplateStatistics(): Promise<ITemplateStatistics> {
        await this.ensureInitialized();
        return this.orchestrator.templateStore.getTemplateStatistics();
    }

    async exists(id: string): Promise<boolean> {
        return this.templateExists(id);
    }

    async count(): Promise<number> {
        return this.getTemplateCount();
    }

    // ========================================
    // ITranslationRepository 接口
    // ========================================

    async getAllKeys(): Promise<ITranslationKey[]> {
        return this.getAllTranslationKeys();
    }

    async getKeysByName(key: string): Promise<ITranslationKey[]> {
        return this.getTranslationKeysByName(key);
    }

    async getKeysByLanguage(languageCode: string): Promise<ITranslationKey[]> {
        return this.getTranslationKeysByLanguage(languageCode);
    }

    async searchKeys(prefix: string): Promise<ITranslationKey[]> {
        return this.searchTranslationKeys(prefix);
    }

    async addKey(key: ITranslationKey): Promise<void> {
        return this.addTranslationKey(key);
    }

    async removeKey(fullPath: string): Promise<void> {
        return this.removeTranslationKey(fullPath);
    }

    async clearTranslationKeys(): Promise<void> {
        await this.ensureInitialized();
        return this.orchestrator.translationStore.clearTranslationKeys();
    }

    async translationKeyCount(): Promise<number> {
        return this.getTranslationKeyCount();
    }

    // ========================================
    // IItemIdRepository 接口
    // ========================================

    async addItems(items: IItemId[]): Promise<void> {
        await this.ensureInitialized();
        return this.orchestrator.itemStore.addItems(items);
    }

    async clearItems(): Promise<void> {
        await this.ensureInitialized();
        return this.orchestrator.itemStore.clearItems();
    }

    async loadMinecraftBuiltinItems(): Promise<boolean> {
        await this.ensureInitialized();
        return this.orchestrator.itemStore.loadMinecraftBuiltinItems();
    }

    isBuiltinItemsLoaded(): boolean {
        return this.orchestrator.itemStore.isBuiltinItemsLoaded();
    }

    async reloadMinecraftBuiltinItems(): Promise<boolean> {
        await this.ensureInitialized();
        return this.orchestrator.itemStore.reloadMinecraftBuiltinItems();
    }

    // ========================================
    // 分类操作
    // ========================================

    async getAllCategories(): Promise<ICategory[]> {
        await this.ensureInitialized();
        return this.orchestrator.categoryStore.getAllCategories();
    }

    async getCategoryById(id: string): Promise<ICategory | undefined> {
        await this.ensureInitialized();
        return this.orchestrator.categoryStore.getCategoryById(id);
    }

    async searchCategories(prefix: string): Promise<ICategory[]> {
        await this.ensureInitialized();
        return this.orchestrator.categoryStore.searchCategories(prefix);
    }

    async getCategoriesByNamespace(namespace: string): Promise<ICategory[]> {
        await this.ensureInitialized();
        return this.orchestrator.categoryStore.getCategoriesByNamespace(namespace);
    }

    async getCategoryCount(): Promise<number> {
        await this.ensureInitialized();
        return this.orchestrator.categoryStore.getCategoryCount();
    }

    async addCategory(category: ICategory): Promise<void> {
        await this.ensureInitialized();
        return this.orchestrator.categoryStore.addCategory(category);
    }

    async addCategories(categories: ICategory[]): Promise<void> {
        await this.ensureInitialized();
        return this.orchestrator.categoryStore.addCategories(categories);
    }

    async removeCategory(id: string): Promise<void> {
        await this.ensureInitialized();
        return this.orchestrator.categoryStore.removeCategory(id);
    }

    async removeCategoriesByFile(sourceFile: EditorUri): Promise<void> {
        await this.ensureInitialized();
        return this.orchestrator.categoryStore.removeCategoriesByFile(sourceFile);
    }

    async clearCategories(): Promise<void> {
        await this.ensureInitialized();
        return this.orchestrator.categoryStore.clearCategories();
    }

    // ========================================
    // 辅助方法
    // ========================================

    private async ensureInitialized(): Promise<void> {
        await this.orchestrator.ensureInitialized();
    }
}
