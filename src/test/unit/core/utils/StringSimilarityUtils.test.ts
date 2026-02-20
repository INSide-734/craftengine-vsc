import { describe, it, expect } from 'vitest';
import {
    levenshteinDistance,
    calculateSimilarity,
    findSimilarStrings,
    findSimilarItems,
    getBestMatch,
    prefixMatchScore,
    isSubsequence,
    calculateMatchScore,
    escapeRegExp,
    safeRegExp,
    filterAndSort,
} from '../../../../core/utils/StringSimilarityUtils';

describe('StringSimilarityUtils', () => {
    describe('levenshteinDistance', () => {
        it('should return 0 for identical strings', () => {
            expect(levenshteinDistance('hello', 'hello')).toBe(0);
        });

        it('should return length of other string when one is empty', () => {
            expect(levenshteinDistance('', 'abc')).toBe(3);
            expect(levenshteinDistance('abc', '')).toBe(3);
        });

        it('should return 0 for two empty strings', () => {
            expect(levenshteinDistance('', '')).toBe(0);
        });

        it('should calculate correct distance', () => {
            expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
            expect(levenshteinDistance('hello', 'hallo')).toBe(1);
        });

        it('should handle single character differences', () => {
            expect(levenshteinDistance('a', 'b')).toBe(1);
            expect(levenshteinDistance('a', 'a')).toBe(0);
        });
    });

    describe('calculateSimilarity', () => {
        it('should return 1.0 for identical strings', () => {
            expect(calculateSimilarity('hello', 'hello')).toBe(1.0);
        });

        it('should return 1.0 for two empty strings', () => {
            expect(calculateSimilarity('', '')).toBe(1.0);
        });

        it('should be case insensitive by default', () => {
            expect(calculateSimilarity('Hello', 'hello')).toBe(1.0);
        });
        it('should be case sensitive when specified', () => {
            const sim = calculateSimilarity('Hello', 'hello', true);
            expect(sim).toBeLessThan(1.0);
        });

        it('should return value between 0 and 1', () => {
            const sim = calculateSimilarity('abc', 'xyz');
            expect(sim).toBeGreaterThanOrEqual(0);
            expect(sim).toBeLessThanOrEqual(1);
        });
    });

    describe('findSimilarStrings', () => {
        const candidates = ['apple', 'banana', 'apricot', 'orange', 'grape'];

        it('should find similar strings above threshold', () => {
            const results = findSimilarStrings('aple', candidates);
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].item).toBe('apple');
        });

        it('should respect maxResults', () => {
            const results = findSimilarStrings('a', candidates, { maxResults: 2, threshold: 0 });
            expect(results.length).toBeLessThanOrEqual(2);
        });

        it('should respect threshold', () => {
            const results = findSimilarStrings('zzz', candidates, { threshold: 0.9 });
            expect(results).toHaveLength(0);
        });

        it('should sort by similarity descending', () => {
            const results = findSimilarStrings('apple', candidates, { threshold: 0 });
            for (let i = 1; i < results.length; i++) {
                expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
            }
        });
    });

    describe('findSimilarItems', () => {
        interface Item {
            id: string;
            name: string;
        }
        const items: Item[] = [
            { id: '1', name: 'apple' },
            { id: '2', name: 'banana' },
            { id: '3', name: 'apricot' },
        ];

        it('should find similar items using value extractor', () => {
            const results = findSimilarItems('aple', items, (i) => i.name);
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].item.name).toBe('apple');
        });

        it('should return empty for no matches', () => {
            const results = findSimilarItems('zzz', items, (i) => i.name, { threshold: 0.9 });
            expect(results).toHaveLength(0);
        });
    });

    describe('getBestMatch', () => {
        it('should return best match', () => {
            const result = getBestMatch('aple', ['apple', 'banana', 'orange']);
            expect(result).not.toBeNull();
            expect(result!.item).toBe('apple');
        });

        it('should return null when no match above threshold', () => {
            const result = getBestMatch('zzz', ['apple', 'banana'], { threshold: 0.9 });
            expect(result).toBeNull();
        });
    });

    describe('prefixMatchScore', () => {
        it('should return 1.0 for exact prefix match', () => {
            expect(prefixMatchScore('app', 'apple')).toBe(1.0);
        });

        it('should return 1.0 for empty input', () => {
            expect(prefixMatchScore('', 'apple')).toBe(1.0);
        });

        it('should return 0 for non-matching non-subsequence', () => {
            expect(prefixMatchScore('xyz', 'apple')).toBe(0);
        });

        it('should return subsequence score for subsequence match', () => {
            const score = prefixMatchScore('ale', 'apple');
            expect(score).toBeGreaterThan(0);
            expect(score).toBeLessThan(1);
        });
    });

    describe('isSubsequence', () => {
        it('should return true for valid subsequence', () => {
            expect(isSubsequence('ace', 'abcde')).toBe(true);
        });

        it('should return false for invalid subsequence', () => {
            expect(isSubsequence('aec', 'abcde')).toBe(false);
        });

        it('should return true for empty needle', () => {
            expect(isSubsequence('', 'abcde')).toBe(true);
        });

        it('should return true for identical strings', () => {
            expect(isSubsequence('abc', 'abc')).toBe(true);
        });
    });

    describe('calculateMatchScore', () => {
        it('should return high score for prefix match', () => {
            const score = calculateMatchScore('app', 'apple');
            expect(score).toBeGreaterThan(0.5);
        });

        it('should combine prefix and similarity scores', () => {
            const score = calculateMatchScore('aple', 'apple', 0.6, 0.4);
            expect(score).toBeGreaterThan(0);
            expect(score).toBeLessThanOrEqual(1);
        });
    });

    describe('escapeRegExp', () => {
        it('should escape special regex characters', () => {
            expect(escapeRegExp('hello.world')).toBe('hello\\.world');
            expect(escapeRegExp('a+b*c')).toBe('a\\+b\\*c');
            expect(escapeRegExp('[test]')).toBe('\\[test\\]');
        });

        it('should not modify strings without special chars', () => {
            expect(escapeRegExp('hello')).toBe('hello');
        });
    });

    describe('safeRegExp', () => {
        it('should create valid regex', () => {
            const regex = safeRegExp('^[a-z]+$');
            expect(regex.test('hello')).toBe(true);
        });

        it('should truncate long patterns', () => {
            const longPattern = 'a'.repeat(300);
            const regex = safeRegExp(longPattern);
            expect(regex).toBeInstanceOf(RegExp);
        });

        it('should fallback to literal match for invalid regex', () => {
            const regex = safeRegExp('[invalid');
            expect(regex).toBeInstanceOf(RegExp);
            expect(regex.test('[invalid')).toBe(true);
        });
    });

    describe('filterAndSort', () => {
        it('should return all candidates for empty input', () => {
            const result = filterAndSort('', ['apple', 'banana']);
            expect(result).toEqual(['apple', 'banana']);
        });

        it('should filter and sort by match score', () => {
            const result = filterAndSort('app', ['apple', 'banana', 'application', 'orange']);
            expect(result[0]).toBe('apple');
            expect(result).toContain('application');
            expect(result).not.toContain('banana');
        });

        it('should respect minScore', () => {
            const result = filterAndSort('zzz', ['apple', 'banana'], 0.9);
            expect(result).toHaveLength(0);
        });
    });
});
