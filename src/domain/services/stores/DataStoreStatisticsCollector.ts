import { IDataStoreStatistics } from '../../../core/interfaces/IDataStoreService';
import { TemplateStore } from './TemplateStore';
import { TranslationStore } from './TranslationStore';
import { ItemStore } from './ItemStore';
import { CategoryStore } from './CategoryStore';

/**
 * 数据存储统计收集器
 *
 * 负责从各个 Store 收集统计信息。
 * 从 DataStoreService 中提取的统计职责。
 */
export class DataStoreStatisticsCollector {
    constructor(
        private readonly templateStore: TemplateStore,
        private readonly translationStore: TranslationStore,
        private readonly itemStore: ItemStore,
        private readonly categoryStore: CategoryStore,
        private readonly isInitializedFn: () => boolean
    ) {}

    /**
     * 获取统计信息
     */
    async getStatistics(): Promise<IDataStoreStatistics> {
        return {
            templateCount: await this.templateStore.count(),
            translationKeyCount: this.translationStore.getCount(),
            itemCount: await this.itemStore.getItemCount(),
            categoryCount: await this.categoryStore.getCategoryCount(),
            indexedFileCount: Math.max(
                this.templateStore.getFileCount(),
                this.translationStore.getFileCount(),
                this.itemStore.getFileCount()
            ),
            languageCount: this.translationStore.getLanguageCount(),
            namespaceCount: this.itemStore.getNamespaceCount(),
            lastUpdated: this.templateStore.getLastUpdated(),
            isInitialized: this.isInitializedFn()
        };
    }

    /**
     * 获取支持的语言列表
     */
    async getSupportedLanguages(): Promise<string[]> {
        return this.translationStore.getSupportedLanguages();
    }
}
