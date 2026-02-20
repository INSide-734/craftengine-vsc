import { describe, it, expect } from 'vitest';
import { YamlDocument, buildNodeTree } from '../../../../infrastructure/yaml/YamlDocument';
import { Uri, Position, Range } from 'vscode';
import { type IYamlParseResult } from '../../../../core/interfaces/IYamlDocument';

describe('YamlDocument', () => {
    const createDoc = (obj: unknown, success = true): YamlDocument => {
        const root = buildNodeTree(obj);
        const parseResult: IYamlParseResult = {
            root: root!,
            success,
            errors: success ? [] : [{ message: 'Parse error', line: 0, column: 0 }],
        };
        return new YamlDocument(Uri.file('/test/doc.yaml'), 'content', parseResult);
    };

    describe('getNode', () => {
        it('should return root for empty path', () => {
            const doc = createDoc({ key: 'value' });
            const node = doc.getNode([]);
            expect(node).toBeDefined();
            expect(node!.type).toBe('object');
        });

        it('should navigate to nested node', () => {
            const doc = createDoc({ a: { b: { c: 'deep' } } });
            const node = doc.getNode(['a', 'b', 'c']);
            expect(node).toBeDefined();
            expect(node!.value).toBe('deep');
        });

        it('should return null for non-existent path', () => {
            const doc = createDoc({ a: 1 });
            expect(doc.getNode(['nonexistent'])).toBeNull();
        });

        it('should handle array indices', () => {
            const doc = createDoc({ items: ['first', 'second'] });
            const node = doc.getNode(['items', 1]);
            expect(node).toBeDefined();
            expect(node!.value).toBe('second');
        });
    });

    describe('getValue', () => {
        it('should return value at path', () => {
            const doc = createDoc({ name: 'test' });
            expect(doc.getValue(['name'])).toBe('test');
        });

        it('should return undefined for missing path', () => {
            const doc = createDoc({ name: 'test' });
            expect(doc.getValue(['missing'])).toBeUndefined();
        });
    });

    describe('hasPath', () => {
        it('should return true for existing path', () => {
            const doc = createDoc({ a: { b: 1 } });
            expect(doc.hasPath(['a', 'b'])).toBe(true);
        });

        it('should return false for missing path', () => {
            const doc = createDoc({ a: 1 });
            expect(doc.hasPath(['b'])).toBe(false);
        });
    });

    describe('getTopLevelKeys', () => {
        it('should return all top-level keys', () => {
            const doc = createDoc({ templates: {}, items: {}, config: {} });
            const keys = doc.getTopLevelKeys();
            expect(keys).toEqual(['templates', 'items', 'config']);
        });

        it('should return empty array for empty document', () => {
            const doc = createDoc(null);
            const keys = doc.getTopLevelKeys();
            expect(keys).toEqual([]);
        });
    });

    describe('isValid', () => {
        it('should return true for valid document', () => {
            const doc = createDoc({ key: 'value' }, true);
            expect(doc.isValid()).toBe(true);
        });

        it('should return false for invalid document', () => {
            const doc = createDoc({}, false);
            expect(doc.isValid()).toBe(false);
        });
    });

    describe('getErrors', () => {
        it('should return empty array for valid document', () => {
            const doc = createDoc({ key: 'value' }, true);
            expect(doc.getErrors()).toEqual([]);
        });

        it('should return errors for invalid document', () => {
            const doc = createDoc({}, false);
            expect(doc.getErrors()).toHaveLength(1);
        });
    });
});

describe('buildNodeTree', () => {
    it('should build tree from simple object', () => {
        const node = buildNodeTree({ key: 'value' });
        expect(node).toBeDefined();
        expect(node!.type).toBe('object');
        expect(node!.children?.get('key')).toBeDefined();
    });

    it('should build tree from array', () => {
        const node = buildNodeTree([1, 2, 3]);
        expect(node).toBeDefined();
        expect(node!.type).toBe('array');
        expect(node!.children?.size).toBe(3);
    });

    it('should handle null input', () => {
        const node = buildNodeTree(null);
        expect(node).toBeDefined();
        expect(node!.type).toBe('null');
    });

    it('should handle scalar values', () => {
        const strNode = buildNodeTree('hello');
        expect(strNode!.type).toBe('string');

        const numNode = buildNodeTree(42);
        expect(numNode!.type).toBe('number');

        const boolNode = buildNodeTree(true);
        expect(boolNode!.type).toBe('boolean');
    });

    it('should build correct paths', () => {
        const node = buildNodeTree({ a: { b: 'c' } });
        const bNode = node!.children?.get('a')?.children?.get('b');
        expect(bNode!.path).toEqual(['a', 'b']);
    });

    it('should handle deeply nested structures', () => {
        const obj = { l1: { l2: { l3: { l4: 'deep' } } } };
        const node = buildNodeTree(obj);
        const deep = node!.children?.get('l1')?.children?.get('l2')?.children?.get('l3')?.children?.get('l4');
        expect(deep).toBeDefined();
        expect(deep!.value).toBe('deep');
    });
});
