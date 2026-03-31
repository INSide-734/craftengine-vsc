/**
 * TranslationReferenceStore 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TranslationReferenceStore } from '../../../../domain/services/stores/TranslationReferenceStore';
import { type ITranslationReference } from '../../../../core/interfaces/ITranslation';

describe('TranslationReferenceStore', () => {
    let store: TranslationReferenceStore;

    const createRef = (overrides: Partial<ITranslationReference> = {}): ITranslationReference => ({
        key: overrides.key ?? 'test.key',
        type: overrides.type ?? 'i18n',
        sourceFile: overrides.sourceFile ?? '/test/items.yaml',
        lineNumber: overrides.lineNumber ?? 0,
        column: overrides.column ?? 0,
        endColumn: overrides.endColumn ?? 20,
    });

    beforeEach(() => {
        store = new TranslationReferenceStore();
    });

    describe('addReference / getReferences', () => {
        it('should store and retrieve references by key', () => {
            const ref = createRef({ key: 'item.sword' });
            store.addReference(ref);

            const results = store.getReferences('item.sword');
            expect(results).toHaveLength(1);
            expect(results[0]).toEqual(ref);
        });

        it('should return empty array for unknown key', () => {
            expect(store.getReferences('nonexistent')).toHaveLength(0);
        });

        it('should accumulate multiple references for the same key', () => {
            store.addReference(createRef({ key: 'msg.hello', sourceFile: '/a.yaml', lineNumber: 5 }));
            store.addReference(createRef({ key: 'msg.hello', sourceFile: '/b.yaml', lineNumber: 10 }));

            expect(store.getReferences('msg.hello')).toHaveLength(2);
        });

        it('should keep references for different keys separate', () => {
            store.addReference(createRef({ key: 'key.a' }));
            store.addReference(createRef({ key: 'key.b' }));

            expect(store.getReferences('key.a')).toHaveLength(1);
            expect(store.getReferences('key.b')).toHaveLength(1);
        });
    });

    describe('removeByFile', () => {
        it('should remove all references from a specific file', () => {
            store.addReference(createRef({ key: 'k1', sourceFile: '/file1.yaml' }));
            store.addReference(createRef({ key: 'k1', sourceFile: '/file2.yaml' }));
            store.addReference(createRef({ key: 'k2', sourceFile: '/file1.yaml' }));

            store.removeByFile('/file1.yaml');

            expect(store.getReferences('k1')).toHaveLength(1);
            expect(store.getReferences('k1')[0].sourceFile).toBe('/file2.yaml');
            expect(store.getReferences('k2')).toHaveLength(0);
        });

        it('should be a no-op for unknown file', () => {
            store.addReference(createRef());
            store.removeByFile('/unknown.yaml');
            expect(store.getCount()).toBe(1);
        });
    });

    describe('clear', () => {
        it('should remove all data', () => {
            store.addReference(createRef({ key: 'a' }));
            store.addReference(createRef({ key: 'b' }));
            store.clear();

            expect(store.getCount()).toBe(0);
            expect(store.getFileCount()).toBe(0);
            expect(store.getKeyCount()).toBe(0);
        });
    });

    describe('statistics', () => {
        it('should report correct counts', () => {
            store.addReference(createRef({ key: 'k1', sourceFile: '/f1.yaml' }));
            store.addReference(createRef({ key: 'k1', sourceFile: '/f2.yaml' }));
            store.addReference(createRef({ key: 'k2', sourceFile: '/f1.yaml' }));

            expect(store.getCount()).toBe(3);
            expect(store.getFileCount()).toBe(2);
            expect(store.getKeyCount()).toBe(2);
        });
    });
});
