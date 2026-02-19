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
    filterAndSort
} from '../../../../infrastructure/utils/StringSimilarityUtils';

describe('StringSimilarityUtils', () => {
    describe('levenshteinDistance', () => {
        it('should return 0 for identical strings', () => {
            expect(levenshteinDistance('hello', 'hello')).toBe(0);
        });

        it('should return length for empty string comparison', () => {
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

        it('should handle single character difference', () => {
            expect(levenshteinDistance('cat', 'bat')).toBe(1);
        });
    });

    describe('calculateSimilarity', () => {
        it('should return 1.0 for identical strings', () => {
            expect(calculateSimilarity('hello', 'hello')).toBe(1.0);
        });

        it('should return 1.0 for two empty strings', () => {
            expect(calculateSimilarity('', '')).toBe(1.0);
        });

        it('should be case-insensitive by default', () => {
            expect(calculateSimilarity('Hello', 'hello')).toBe(1.0);
        });

        it('should be case-sensitive when specified', () => {
            expect(calculateSimilarity('Hello', 'hello', true)).toBeLessThan(1.0);
        });

        it('should return value between 0 and 1', () => {
            const sim = calculateSimilarity('hello', 'hallo');
            expect(sim).toBeGreaterThan(0);
            expect(sim).toBeLessThanOrEqual(1);
        });

        it('should return 0 for completely different strings', () => {
            expect(calculateSimilarity('abc', 'xyz')).toBe(0);
        });
    });

    describe('findSimilarStrings', () => {
        const candidates = ['apple', 'banana', 'apricot', 'orange', 'grape'];

        it('should find similar strings', () => {
            const results = findSimilarStrings('aple', candidates);
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].item).toBe('apple');
        });

        it('should respect threshold', () => {
            const results = findSimilarStrings('xyz', candidates, { threshold: 0.9 });
            expect(results.length).toBe(0);
        });

        it('should respect maxResults', () => {
            const results = findSimilarStrings('a', candidates, { maxResults: 2, threshold: 0.1 });
            expect(results.length).toBeLessThanOrEqual(2);
        });

        it('should sort by similarity descending', () => {
            const results = findSimilarStrings('apple', candidates, { threshold: 0.3 });
            for (let i = 1; i < results.length; i++) {
                expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
            }
        });
    });

    describe('findSimilarItems', () => {
        interface Item { id: string; name: string }
        const items: Item[] = [
            { id: '1', name: 'apple' },
            { id: '2', name: 'banana' },
            { id: '3', name: 'apricot' }
        ];

        it('should find similar items using extractor', () => {
            const results = findSimilarItems('aple', items, item => item.name);
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].item.name).toBe('apple');
        });

        it('should respect options', () => {
            const results = findSimilarItems('xyz', items, item => item.name, { threshold: 0.9 });
            expect(results.length).toBe(0);
        });
    });

    describe('getBestMatch', () => {
        const candidates = ['apple', 'banana', 'orange'];

        it('should return best match', () => {
            const result = getBestMatch('aple', candidates);
            expect(result).not.toBeNull();
            expect(result!.item).toBe('apple');
        });

        it('should return null when no match above threshold', () => {
            const result = getBestMatch('xyz', candidates, { threshold: 0.9 });
            expect(result).toBeNull();
        });
    });

    describe('prefixMatchScore', () => {
        it('should return 1.0 for prefix match', () => {
            expect(prefixMatchScore('app', 'apple')).toBe(1.0);
        });

        it('should return 1.0 for empty input', () => {
            expect(prefixMatchScore('', 'apple')).toBe(1.0);
        });

        it('should return 0 for non-matching non-subsequence', () => {
            expect(prefixMatchScore('xyz', 'apple')).toBe(0);
        });

        it('should be case-insensitive by default', () => {
            expect(prefixMatchScore('APP', 'apple')).toBe(1.0);
        });

        it('should return subsequence score for subsequence match', () => {
            const score = prefixMatchScore('ace', 'abcde');
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

        it('should return false when needle is longer', () => {
            expect(isSubsequence('abcdef', 'abc')).toBe(false);
        });
    });

    describe('calculateMatchScore', () => {
        it('should return high score for prefix match', () => {
            const score = calculateMatchScore('app', 'apple');
            expect(score).toBeGreaterThan(0.5);
        });

        it('should return lower score for similarity-only match', () => {
            const prefixScore = calculateMatchScore('app', 'apple');
            const similarScore = calculateMatchScore('aple', 'apple');
            expect(prefixScore).toBeGreaterThan(similarScore);
        });

        it('should support custom weights', () => {
            const score1 = calculateMatchScore('app', 'apple', 0.9, 0.1);
            const score2 = calculateMatchScore('app', 'apple', 0.1, 0.9);
            expect(score1).not.toBe(score2);
        });
    });

    describe('filterAndSort', () => {
        const candidates = ['apple', 'banana', 'application', 'orange'];

        it('should filter and sort by match score', () => {
            const results = filterAndSort('app', candidates);
            expect(results.length).toBeGreaterThan(0);
            expect(results[0]).toBe('apple');
        });

        it('should return all candidates for empty input', () => {
            const results = filterAndSort('', candidates);
            expect(results.length).toBe(candidates.length);
        });

        it('should respect minScore', () => {
            const results = filterAndSort('xyz', candidates, 0.9);
            expect(results.length).toBe(0);
        });

        it('should include application for app prefix', () => {
            const results = filterAndSort('app', candidates);
            expect(results).toContain('application');
        });
    });
});
