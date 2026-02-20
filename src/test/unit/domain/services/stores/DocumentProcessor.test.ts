import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentProcessor } from '../../../../../domain/services/stores/DocumentProcessor';
import { type ILogger } from '../../../../../core/interfaces/ILogger';
import { type TemplateStore } from '../../../../../domain/services/stores/TemplateStore';
import { type TranslationStore } from '../../../../../domain/services/stores/TranslationStore';
import { type TranslationReferenceStore } from '../../../../../domain/services/stores/TranslationReferenceStore';
import { type ItemStore } from '../../../../../domain/services/stores/ItemStore';
import { type CategoryStore } from '../../../../../domain/services/stores/CategoryStore';
import { type TemplateParserService } from '../../../../../domain/services/template/TemplateParserService';
import { type EditorUri } from '../../../../../core/types/EditorTypes';

function createMockLogger(): ILogger {
    return {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        createChild: vi.fn().mockReturnThis(),
        setLevel: vi.fn(),
        getLevel: vi.fn().mockReturnValue('DEBUG'),
        isDebugEnabled: vi.fn().mockReturnValue(true),
    } as unknown as ILogger;
}

const mockUri: EditorUri = { fsPath: '/test/file.yml', path: '/test/file.yml' } as EditorUri;

describe('DocumentProcessor', () => {
    let processor: DocumentProcessor;
    let logger: ILogger;
    let templateStore: TemplateStore;
    let translationStore: TranslationStore;
    let itemStore: ItemStore;
    let categoryStore: CategoryStore;
    let templateParser: TemplateParserService;
    let translationReferenceStore: TranslationReferenceStore;

    beforeEach(() => {
        logger = createMockLogger();
        templateStore = { addWithoutEvent: vi.fn() } as unknown as TemplateStore;
        translationStore = { addWithoutLog: vi.fn() } as unknown as TranslationStore;
        itemStore = { addWithoutLog: vi.fn() } as unknown as ItemStore;
        categoryStore = { addCategory: vi.fn() } as unknown as CategoryStore;
        templateParser = { createTemplate: vi.fn() } as unknown as TemplateParserService;
        translationReferenceStore = { addReference: vi.fn() } as unknown as TranslationReferenceStore;

        processor = new DocumentProcessor(
            logger,
            templateStore,
            translationStore,
            itemStore,
            categoryStore,
            templateParser,
            translationReferenceStore,
        );
    });
    describe('processDocument - templates', () => {
        it('should extract templates with colon in name', async () => {
            const mockTemplate = { name: 'ns:my-template' };
            vi.mocked(templateParser.createTemplate).mockReturnValue(mockTemplate as any);

            const content = `templates:\n  ns:my-template:\n    param1: value1`;
            await processor.processDocument(mockUri, content);

            expect(templateParser.createTemplate).toHaveBeenCalledWith(
                'ns:my-template',
                expect.anything(),
                expect.any(Array),
                mockUri,
            );
            expect(templateStore.addWithoutEvent).toHaveBeenCalledWith(mockTemplate);
        });

        it('should skip template keys without colon', async () => {
            const content = `templates:\n  invalid-key:\n    param1: value1`;
            await processor.processDocument(mockUri, content);

            expect(templateParser.createTemplate).not.toHaveBeenCalled();
        });

        it('should handle template parsing errors gracefully', async () => {
            vi.mocked(templateParser.createTemplate).mockImplementation(() => {
                throw new Error('Parse error');
            });

            const content = `templates:\n  ns:broken:\n    param1: value1`;
            await processor.processDocument(mockUri, content);

            expect(logger.debug).toHaveBeenCalledWith('Error parsing template', expect.anything());
        });
    });

    describe('processDocument - items', () => {
        it('should extract items with namespaced ID', async () => {
            const content = `items:\n  myns:my-item:\n    material: DIAMOND_SWORD`;
            await processor.processDocument(mockUri, content);

            expect(itemStore.addWithoutLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'myns:my-item',
                    namespace: 'myns',
                    name: 'my-item',
                    type: 'item',
                    material: 'DIAMOND_SWORD',
                }),
            );
        });

        it('should extract blocks', async () => {
            const content = `blocks:\n  myns:my-block:\n    material: STONE`;
            await processor.processDocument(mockUri, content);

            expect(itemStore.addWithoutLog).toHaveBeenCalledWith(expect.objectContaining({ type: 'block' }));
        });

        it('should extract furniture', async () => {
            const content = `furniture:\n  myns:my-chair:\n    material: OAK_STAIRS`;
            await processor.processDocument(mockUri, content);

            expect(itemStore.addWithoutLog).toHaveBeenCalledWith(expect.objectContaining({ type: 'furniture' }));
        });

        it('should skip invalid namespaced IDs', async () => {
            const content = `items:\n  InvalidId:\n    material: STONE`;
            await processor.processDocument(mockUri, content);

            expect(itemStore.addWithoutLog).not.toHaveBeenCalled();
        });
    });
    describe('processDocument - translations', () => {
        it('should extract translation keys', async () => {
            const content = `translations:\n  en:\n    greeting: Hello\n    farewell: Goodbye`;
            await processor.processDocument(mockUri, content);

            expect(translationStore.addWithoutLog).toHaveBeenCalledTimes(2);
            expect(translationStore.addWithoutLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    key: 'greeting',
                    languageCode: 'en',
                    value: 'Hello',
                }),
            );
        });

        it('should handle i18n and l10n aliases', async () => {
            const content = `i18n:\n  en:\n    key1: value1`;
            await processor.processDocument(mockUri, content);
            expect(translationStore.addWithoutLog).toHaveBeenCalled();
        });

        it('should skip invalid language codes', async () => {
            const content = `translations:\n  invalid_lang_code_too_long:\n    key1: value1`;
            await processor.processDocument(mockUri, content);
            expect(translationStore.addWithoutLog).not.toHaveBeenCalled();
        });

        it('should skip invalid translation keys', async () => {
            const content = `translations:\n  en:\n    "123invalid": value1`;
            await processor.processDocument(mockUri, content);
            expect(translationStore.addWithoutLog).not.toHaveBeenCalled();
        });
    });

    describe('processDocument - categories', () => {
        it('should extract categories with properties', async () => {
            const content = `categories:\n  myns:weapons:\n    name: Weapons\n    icon: DIAMOND_SWORD\n    hidden: false\n    priority: 10\n    lore:\n      - "Combat items"`;
            await processor.processDocument(mockUri, content);

            expect(categoryStore.addCategory).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: '#myns:weapons',
                    namespace: 'myns',
                    name: 'weapons',
                    displayName: 'Weapons',
                    icon: 'DIAMOND_SWORD',
                    hidden: false,
                    priority: 10,
                }),
            );
        });
    });

    describe('processDocument - translation references', () => {
        it('should extract i18n references from content', async () => {
            const content = `items:\n  myns:item:\n    name: "<i18n:item.name>"`;
            await processor.processDocument(mockUri, content);

            expect(translationReferenceStore.addReference).toHaveBeenCalledWith(
                expect.objectContaining({
                    key: 'item.name',
                    type: 'i18n',
                }),
            );
        });

        it('should extract l10n references from content', async () => {
            const content = `items:\n  myns:item:\n    lore: "<l10n:item.lore>"`;
            await processor.processDocument(mockUri, content);

            expect(translationReferenceStore.addReference).toHaveBeenCalledWith(
                expect.objectContaining({
                    key: 'item.lore',
                    type: 'l10n',
                }),
            );
        });
    });

    describe('processDocument - edge cases', () => {
        it('should handle invalid YAML gracefully', async () => {
            const content = `{{{invalid yaml`;
            await processor.processDocument(mockUri, content);
            expect(logger.warn).toHaveBeenCalledWith('Failed to parse document', expect.anything());
        });

        it('should handle null parsed result', async () => {
            const content = `---\n`;
            await processor.processDocument(mockUri, content);
            // 不应抛出错误
        });

        it('should handle non-object parsed result', async () => {
            const content = `just a string`;
            await processor.processDocument(mockUri, content);
            // 不应抛出错误
        });

        it('should handle array values in top-level keys', async () => {
            const content = `templates:\n  - item1\n  - item2`;
            await processor.processDocument(mockUri, content);
            // 数组值应被跳过
            expect(templateParser.createTemplate).not.toHaveBeenCalled();
        });
    });
});
