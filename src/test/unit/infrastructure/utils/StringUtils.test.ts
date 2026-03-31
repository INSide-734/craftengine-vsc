import { describe, it, expect } from 'vitest';
import {
    escapeRegExp,
    getIndentLevel,
    getIndentString,
    startsWithIgnoreCase,
    includesIgnoreCase,
    safeTrim,
    truncate,
    toKebabCase,
    toCamelCase,
    toPascalCase,
    isBlank,
    isNotBlank,
    repeat,
    createIndent,
    removeQuotes,
    countOccurrences,
} from '../../../../infrastructure/utils/StringUtils';

describe('StringUtils', () => {
    describe('escapeRegExp', () => {
        it('should escape special regex characters', () => {
            expect(escapeRegExp('hello.world')).toBe('hello\\.world');
            expect(escapeRegExp('[test]')).toBe('\\[test\\]');
            expect(escapeRegExp('a+b*c?')).toBe('a\\+b\\*c\\?');
            expect(escapeRegExp('$100')).toBe('\\$100');
            expect(escapeRegExp('a^b')).toBe('a\\^b');
            expect(escapeRegExp('a{1,2}')).toBe('a\\{1,2\\}');
            expect(escapeRegExp('a|b')).toBe('a\\|b');
            expect(escapeRegExp('(group)')).toBe('\\(group\\)');
            expect(escapeRegExp('path\\to')).toBe('path\\\\to');
        });

        it('should return unchanged string without special chars', () => {
            expect(escapeRegExp('hello')).toBe('hello');
            expect(escapeRegExp('')).toBe('');
        });
    });

    describe('getIndentLevel', () => {
        it('should count spaces', () => {
            expect(getIndentLevel('  hello')).toBe(2);
            expect(getIndentLevel('    hello')).toBe(4);
            expect(getIndentLevel('hello')).toBe(0);
        });

        it('should count tabs with custom tab size', () => {
            expect(getIndentLevel('\thello', 4)).toBe(4);
            expect(getIndentLevel('\t\thello', 4)).toBe(8);
            expect(getIndentLevel('\thello', 2)).toBe(2);
        });

        it('should handle mixed spaces and tabs', () => {
            expect(getIndentLevel('  \thello', 2)).toBe(4);
        });

        it('should handle empty string', () => {
            expect(getIndentLevel('')).toBe(0);
        });
    });

    describe('getIndentString', () => {
        it('should extract leading whitespace', () => {
            expect(getIndentString('  hello')).toBe('  ');
            expect(getIndentString('\t\thello')).toBe('\t\t');
            expect(getIndentString('hello')).toBe('');
        });

        it('should handle empty string', () => {
            expect(getIndentString('')).toBe('');
        });
    });

    describe('startsWithIgnoreCase', () => {
        it('should match case-insensitively', () => {
            expect(startsWithIgnoreCase('Hello World', 'hello')).toBe(true);
            expect(startsWithIgnoreCase('Hello World', 'HELLO')).toBe(true);
            expect(startsWithIgnoreCase('Hello World', 'Hello')).toBe(true);
        });

        it('should return false for non-matching prefix', () => {
            expect(startsWithIgnoreCase('Hello World', 'world')).toBe(false);
        });
    });

    describe('includesIgnoreCase', () => {
        it('should find substring case-insensitively', () => {
            expect(includesIgnoreCase('Hello World', 'WORLD')).toBe(true);
            expect(includesIgnoreCase('Hello World', 'hello')).toBe(true);
        });

        it('should return false when not found', () => {
            expect(includesIgnoreCase('Hello World', 'test')).toBe(false);
        });
    });

    describe('safeTrim', () => {
        it('should trim whitespace', () => {
            expect(safeTrim('  hello  ')).toBe('hello');
        });

        it('should handle null and undefined', () => {
            expect(safeTrim(null)).toBe('');
            expect(safeTrim(undefined)).toBe('');
        });

        it('should use default value for null/undefined', () => {
            expect(safeTrim(null, 'default')).toBe('default');
            expect(safeTrim(undefined, 'fallback')).toBe('fallback');
        });
    });

    describe('truncate', () => {
        it('should truncate long strings', () => {
            expect(truncate('Hello World', 8)).toBe('Hello...');
        });

        it('should not truncate short strings', () => {
            expect(truncate('Hi', 10)).toBe('Hi');
        });

        it('should support custom suffix', () => {
            expect(truncate('Hello World', 8, '…')).toBe('Hello W…');
        });

        it('should handle exact length', () => {
            expect(truncate('Hello', 5)).toBe('Hello');
        });
    });

    describe('toKebabCase', () => {
        it('should convert camelCase', () => {
            expect(toKebabCase('helloWorld')).toBe('hello-world');
        });

        it('should convert PascalCase', () => {
            expect(toKebabCase('HelloWorld')).toBe('hello-world');
        });

        it('should convert snake_case', () => {
            expect(toKebabCase('hello_world')).toBe('hello-world');
        });

        it('should convert spaces', () => {
            expect(toKebabCase('hello world')).toBe('hello-world');
        });
    });

    describe('toCamelCase', () => {
        it('should convert kebab-case', () => {
            expect(toCamelCase('hello-world')).toBe('helloWorld');
        });

        it('should convert snake_case', () => {
            expect(toCamelCase('hello_world')).toBe('helloWorld');
        });

        it('should convert spaces', () => {
            expect(toCamelCase('Hello World')).toBe('helloWorld');
        });
    });

    describe('toPascalCase', () => {
        it('should convert kebab-case', () => {
            expect(toPascalCase('hello-world')).toBe('HelloWorld');
        });

        it('should convert snake_case', () => {
            expect(toPascalCase('hello_world')).toBe('HelloWorld');
        });
    });

    describe('isBlank', () => {
        it('should return true for empty/whitespace strings', () => {
            expect(isBlank('')).toBe(true);
            expect(isBlank('   ')).toBe(true);
            expect(isBlank('\t\n')).toBe(true);
        });

        it('should return true for null/undefined', () => {
            expect(isBlank(null)).toBe(true);
            expect(isBlank(undefined)).toBe(true);
        });

        it('should return false for non-blank strings', () => {
            expect(isBlank('hello')).toBe(false);
            expect(isBlank(' a ')).toBe(false);
        });
    });

    describe('isNotBlank', () => {
        it('should return true for non-blank strings', () => {
            expect(isNotBlank('hello')).toBe(true);
        });

        it('should return false for blank values', () => {
            expect(isNotBlank('')).toBe(false);
            expect(isNotBlank(null)).toBe(false);
            expect(isNotBlank(undefined)).toBe(false);
        });
    });

    describe('repeat', () => {
        it('should repeat string', () => {
            expect(repeat('ab', 3)).toBe('ababab');
            expect(repeat(' ', 4)).toBe('    ');
        });

        it('should return empty for negative count', () => {
            expect(repeat('a', -1)).toBe('');
        });

        it('should return empty for zero count', () => {
            expect(repeat('a', 0)).toBe('');
        });
    });

    describe('createIndent', () => {
        it('should create indentation with default char', () => {
            expect(createIndent(2)).toBe('    ');
            expect(createIndent(0)).toBe('');
        });

        it('should create indentation with custom char', () => {
            expect(createIndent(1, '\t')).toBe('\t');
            expect(createIndent(3, '\t')).toBe('\t\t\t');
        });
    });

    describe('removeQuotes', () => {
        it('should remove double quotes', () => {
            expect(removeQuotes('"hello"')).toBe('hello');
        });

        it('should remove single quotes', () => {
            expect(removeQuotes("'world'")).toBe('world');
        });

        it('should not remove mismatched quotes', () => {
            expect(removeQuotes('"hello\'')).toBe('"hello\'');
        });

        it('should return trimmed string without quotes', () => {
            expect(removeQuotes('hello')).toBe('hello');
        });

        it('should handle whitespace around quotes', () => {
            expect(removeQuotes('  "hello"  ')).toBe('hello');
        });
    });

    describe('countOccurrences', () => {
        it('should count non-overlapping occurrences', () => {
            expect(countOccurrences('hello world', 'l')).toBe(3);
        });

        it('should count overlapping occurrences', () => {
            expect(countOccurrences('aaa', 'aa')).toBe(2);
        });

        it('should return 0 for empty search', () => {
            expect(countOccurrences('hello', '')).toBe(0);
        });

        it('should return 0 when not found', () => {
            expect(countOccurrences('hello', 'xyz')).toBe(0);
        });
    });
});
