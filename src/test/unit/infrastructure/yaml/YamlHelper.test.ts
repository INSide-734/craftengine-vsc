import { describe, it, expect } from 'vitest';
import { YamlHelper } from '../../../../infrastructure/yaml/YamlHelper';

describe('YamlHelper', () => {
    describe('isInComment', () => {
        it('should return true when position is after #', () => {
            expect(YamlHelper.isInComment('key: value # comment', 15)).toBe(true);
        });

        it('should return false when position is before #', () => {
            expect(YamlHelper.isInComment('key: value # comment', 5)).toBe(false);
        });

        it('should return false when no comment exists', () => {
            expect(YamlHelper.isInComment('key: value', 5)).toBe(false);
        });

        it('should not treat # inside single quotes as comment', () => {
            expect(YamlHelper.isInComment("key: 'value # not comment'", 15)).toBe(false);
        });

        it('should not treat # inside double quotes as comment', () => {
            expect(YamlHelper.isInComment('key: "value # not comment"', 15)).toBe(false);
        });

        it('should handle escaped characters', () => {
            expect(YamlHelper.isInComment('key: value\\# not comment', 15)).toBe(false);
        });

        it('should return true at exact comment position', () => {
            expect(YamlHelper.isInComment('key: value # comment', 11)).toBe(true);
        });
    });

    describe('getLineWithoutComment', () => {
        it('should strip comment from line', () => {
            expect(YamlHelper.getLineWithoutComment('key: value # comment')).toBe('key: value ');
        });

        it('should return full line when no comment', () => {
            expect(YamlHelper.getLineWithoutComment('key: value')).toBe('key: value');
        });

        it('should not strip # inside quotes', () => {
            expect(YamlHelper.getLineWithoutComment('key: "value # here"')).toBe('key: "value # here"');
        });
    });

    describe('isPureCommentLine', () => {
        it('should return true for comment lines', () => {
            expect(YamlHelper.isPureCommentLine('# this is a comment')).toBe(true);
            expect(YamlHelper.isPureCommentLine('  # indented comment')).toBe(true);
        });

        it('should return true for empty lines', () => {
            expect(YamlHelper.isPureCommentLine('')).toBe(true);
            expect(YamlHelper.isPureCommentLine('   ')).toBe(true);
        });

        it('should return false for content lines', () => {
            expect(YamlHelper.isPureCommentLine('key: value')).toBe(false);
            expect(YamlHelper.isPureCommentLine('key: value # comment')).toBe(false);
        });
    });

    describe('extractNonCommentText', () => {
        it('should extract text before comment', () => {
            expect(YamlHelper.extractNonCommentText('key: value # comment', 0, 20)).toBe('key: value ');
        });

        it('should return empty when range is in comment', () => {
            expect(YamlHelper.extractNonCommentText('key: value # comment', 12, 20)).toBe('');
        });

        it('should return full range when no comment', () => {
            expect(YamlHelper.extractNonCommentText('key: value', 0, 10)).toBe('key: value');
        });

        it('should truncate range at comment boundary', () => {
            expect(YamlHelper.extractNonCommentText('key: value # comment', 5, 20)).toBe('value ');
        });
    });

    describe('isMatchInComment', () => {
        it('should return true when match is in comment', () => {
            const line = 'key: value # template:name';
            const match = /template:(\w+)/.exec(line)!;
            expect(YamlHelper.isMatchInComment(line, match)).toBe(true);
        });

        it('should return false when match is not in comment', () => {
            const line = 'template: my:template # comment';
            const match = /template:\s*(\S+)/.exec(line)!;
            expect(YamlHelper.isMatchInComment(line, match)).toBe(false);
        });

        it('should return false for null match', () => {
            expect(YamlHelper.isMatchInComment('line', null as unknown as RegExpExecArray)).toBe(false);
        });
    });
});
