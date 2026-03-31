import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataStoreStatisticsCollector } from '../../../../../domain/services/stores/DataStoreStatisticsCollector';
import { type TemplateStore } from '../../../../../domain/services/stores/TemplateStore';
import { type TranslationStore } from '../../../../../domain/services/stores/TranslationStore';
import { type ItemStore } from '../../../../../domain/services/stores/ItemStore';
import { type CategoryStore } from '../../../../../domain/services/stores/CategoryStore';

describe('DataStoreStatisticsCollector', () => {
    let collector: DataStoreStatisticsCollector;
    let mockTemplateStore: TemplateStore;
    let mockTranslationStore: TranslationStore;
    let mockItemStore: ItemStore;
    let mockCategoryStore: CategoryStore;
    let isInitialized: boolean;

    beforeEach(() => {
        isInitialized = true;

        mockTemplateStore = {
            count: vi.fn().mockResolvedValue(10),
            getFileCount: vi.fn().mockReturnValue(5),
            getLastUpdated: vi.fn().mockReturnValue(new Date('2024-01-01')),
        } as unknown as TemplateStore;

        mockTranslationStore = {
            getCount: vi.fn().mockReturnValue(50),
            getFileCount: vi.fn().mockReturnValue(3),
            getLanguageCount: vi.fn().mockReturnValue(2),
            getSupportedLanguages: vi.fn().mockReturnValue(['en', 'zh']),
        } as unknown as TranslationStore;

        mockItemStore = {
            getItemCount: vi.fn().mockResolvedValue(20),
            getFileCount: vi.fn().mockReturnValue(4),
            getNamespaceCount: vi.fn().mockReturnValue(3),
        } as unknown as ItemStore;

        mockCategoryStore = {
            getCategoryCount: vi.fn().mockResolvedValue(8),
        } as unknown as CategoryStore;

        collector = new DataStoreStatisticsCollector(
            mockTemplateStore,
            mockTranslationStore,
            mockItemStore,
            mockCategoryStore,
            () => isInitialized,
        );
    });

    describe('getStatistics', () => {
        it('should aggregate statistics from all stores', async () => {
            const stats = await collector.getStatistics();

            expect(stats.templateCount).toBe(10);
            expect(stats.translationKeyCount).toBe(50);
            expect(stats.itemCount).toBe(20);
            expect(stats.categoryCount).toBe(8);
            expect(stats.languageCount).toBe(2);
            expect(stats.namespaceCount).toBe(3);
            expect(stats.isInitialized).toBe(true);
        });

        it('should use max file count across stores', async () => {
            const stats = await collector.getStatistics();
            // max(5, 3, 4) = 5
            expect(stats.indexedFileCount).toBe(5);
        });

        it('should reflect isInitialized state', async () => {
            isInitialized = false;
            const stats = await collector.getStatistics();
            expect(stats.isInitialized).toBe(false);
        });

        it('should include lastUpdated from template store', async () => {
            const stats = await collector.getStatistics();
            expect(stats.lastUpdated).toEqual(new Date('2024-01-01'));
        });
    });

    describe('getSupportedLanguages', () => {
        it('should return languages from translation store', async () => {
            const languages = await collector.getSupportedLanguages();
            expect(languages).toEqual(['en', 'zh']);
        });
    });
});
