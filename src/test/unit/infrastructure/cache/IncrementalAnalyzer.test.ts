import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IncrementalAnalyzer } from '../../../../infrastructure/cache/IncrementalAnalyzer';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import {
    Range,
    Position,
    Diagnostic,
    DiagnosticSeverity,
    type TextDocumentContentChangeEvent,
    type TextDocument,
} from 'vscode';

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

function makeChange(
    startLine: number,
    startChar: number,
    endLine: number,
    endChar: number,
    text: string,
    rangeLength: number = 0,
): TextDocumentContentChangeEvent {
    return {
        range: new Range(new Position(startLine, startChar), new Position(endLine, endChar)),
        rangeOffset: 0,
        rangeLength,
        text,
    };
}

const mockDocument = {} as TextDocument;

describe('IncrementalAnalyzer', () => {
    let analyzer: IncrementalAnalyzer;
    let logger: ILogger;

    beforeEach(() => {
        logger = createMockLogger();
        analyzer = new IncrementalAnalyzer(logger);
    });
    describe('analyzeChangeImpact', () => {
        it('should detect insert change type', () => {
            const changes = [makeChange(5, 0, 5, 0, 'new text')];
            const scope = analyzer.analyzeChangeImpact(mockDocument, changes);

            expect(scope.changeType).toBe('insert');
            expect(scope.affectedLines.has(5)).toBe(true);
        });

        it('should detect delete change type', () => {
            const changes = [makeChange(5, 0, 5, 10, '', 10)];
            const scope = analyzer.analyzeChangeImpact(mockDocument, changes);

            expect(scope.changeType).toBe('delete');
            expect(scope.affectedLines.has(5)).toBe(true);
        });

        it('should detect replace change type', () => {
            const changes = [makeChange(5, 0, 5, 5, 'replaced', 5)];
            const scope = analyzer.analyzeChangeImpact(mockDocument, changes);

            expect(scope.changeType).toBe('replace');
        });

        it('should detect mixed change type', () => {
            const changes = [makeChange(5, 0, 5, 0, 'inserted'), makeChange(10, 0, 10, 5, '', 5)];
            const scope = analyzer.analyzeChangeImpact(mockDocument, changes);

            expect(scope.changeType).toBe('mixed');
        });

        it('should collect affected lines across multi-line range', () => {
            const changes = [makeChange(3, 0, 7, 0, 'text', 5)];
            const scope = analyzer.analyzeChangeImpact(mockDocument, changes);

            for (let i = 3; i <= 7; i++) {
                expect(scope.affectedLines.has(i)).toBe(true);
            }
        });

        it('should add new lines from inserted text', () => {
            const changes = [makeChange(5, 0, 5, 0, 'line1\nline2\nline3')];
            const scope = analyzer.analyzeChangeImpact(mockDocument, changes);

            expect(scope.affectedLines.has(5)).toBe(true);
            expect(scope.affectedLines.has(6)).toBe(true);
            expect(scope.affectedLines.has(7)).toBe(true);
        });

        it('should trigger full analysis when line count changes', () => {
            // 插入新行：原始范围 5-5（0行差），但文本有2个换行（2行差）
            const changes = [makeChange(5, 0, 5, 0, 'a\nb\nc')];
            const scope = analyzer.analyzeChangeImpact(mockDocument, changes);

            expect(scope.fullAnalysis).toBe(true);
        });

        it('should trigger full analysis when affected lines exceed threshold', () => {
            const customAnalyzer = new IncrementalAnalyzer(logger, { fullAnalysisLineThreshold: 3 });
            // 变更跨越 5 行
            const changes = [makeChange(0, 0, 4, 0, 'text', 5)];
            const scope = customAnalyzer.analyzeChangeImpact(mockDocument, changes);

            expect(scope.fullAnalysis).toBe(true);
        });

        it('should trigger full analysis when char count exceeds threshold', () => {
            const customAnalyzer = new IncrementalAnalyzer(logger, { fullAnalysisCharThreshold: 10 });
            const changes = [makeChange(5, 0, 5, 0, 'a'.repeat(20))];
            const scope = customAnalyzer.analyzeChangeImpact(mockDocument, changes);

            expect(scope.fullAnalysis).toBe(true);
        });

        it('should trigger full analysis for structural change (many newlines)', () => {
            const changes = [makeChange(5, 0, 5, 0, 'a\nb\nc\nd\ne\nf\ng')];
            const scope = analyzer.analyzeChangeImpact(mockDocument, changes);

            expect(scope.fullAnalysis).toBe(true);
        });

        it('should trigger full analysis for whitespace-only structural change', () => {
            const changes = [makeChange(5, 0, 5, 0, '    ')];
            const scope = analyzer.analyzeChangeImpact(mockDocument, changes);

            expect(scope.fullAnalysis).toBe(true);
        });

        it('should not trigger full analysis for small changes', () => {
            // 同行替换，不改变行数
            const changes = [makeChange(5, 0, 5, 3, 'abc', 3)];
            const scope = analyzer.analyzeChangeImpact(mockDocument, changes);

            expect(scope.fullAnalysis).toBe(false);
        });
    });
    describe('getAffectedPaths', () => {
        it('should return paths overlapping with changed lines', () => {
            const positionMap = new Map([
                ['root.name', { start: { line: 2, character: 0 }, end: { line: 2, character: 10 } }],
                ['root.value', { start: { line: 5, character: 0 }, end: { line: 7, character: 10 } }],
                ['root.other', { start: { line: 10, character: 0 }, end: { line: 12, character: 10 } }],
            ]);

            const changedLines = new Set([5, 6]);
            const paths = analyzer.getAffectedPaths(positionMap as any, changedLines);

            expect(paths).toContain('root.value');
            expect(paths).not.toContain('root.name');
            expect(paths).not.toContain('root.other');
        });

        it('should return empty array when no paths overlap', () => {
            const positionMap = new Map([
                ['root.name', { start: { line: 2, character: 0 }, end: { line: 3, character: 10 } }],
            ]);

            const changedLines = new Set([10, 11]);
            const paths = analyzer.getAffectedPaths(positionMap as any, changedLines);

            expect(paths).toHaveLength(0);
        });
    });

    describe('mergeDiagnostics', () => {
        it('should replace diagnostics in affected range and add new ones', () => {
            const existing = [
                new Diagnostic(new Range(1, 0, 1, 5), 'old1', DiagnosticSeverity.Error),
                new Diagnostic(new Range(5, 0, 5, 5), 'old2', DiagnosticSeverity.Warning),
                new Diagnostic(new Range(10, 0, 10, 5), 'old3', DiagnosticSeverity.Error),
            ];
            existing[0].source = 'CraftEngine';
            existing[1].source = 'CraftEngine';
            existing[2].source = 'CraftEngine';

            const updated = [new Diagnostic(new Range(5, 0, 5, 8), 'new1', DiagnosticSeverity.Error)];
            updated[0].source = 'CraftEngine';

            const affectedRange = new Range(4, 0, 8, 0);
            const merged = analyzer.mergeDiagnostics(existing, updated, affectedRange);

            expect(merged.some((d) => d.message === 'old1')).toBe(true);
            expect(merged.some((d) => d.message === 'old2')).toBe(false); // 在受影响范围内，被移除
            expect(merged.some((d) => d.message === 'old3')).toBe(true);
            expect(merged.some((d) => d.message === 'new1')).toBe(true);
        });

        it('should deduplicate diagnostics', () => {
            const d1 = new Diagnostic(new Range(1, 0, 1, 5), 'error', DiagnosticSeverity.Error);
            d1.source = 'CraftEngine';
            const d2 = new Diagnostic(new Range(1, 0, 1, 5), 'error', DiagnosticSeverity.Error);
            d2.source = 'CraftEngine';

            const merged = analyzer.mergeDiagnostics([], [d1, d2], new Range(0, 0, 0, 0));
            expect(merged).toHaveLength(1);
        });
    });

    describe('adjustDiagnosticPositions', () => {
        it('should not adjust when lineDelta is 0', () => {
            const diagnostics = [new Diagnostic(new Range(5, 0, 5, 10), 'msg', DiagnosticSeverity.Error)];
            const result = analyzer.adjustDiagnosticPositions(diagnostics, 3, 0);
            expect(result).toBe(diagnostics); // 同一引用
        });

        it('should shift diagnostics after change line by positive delta', () => {
            const d = new Diagnostic(new Range(10, 2, 10, 8), 'msg', DiagnosticSeverity.Warning);
            d.source = 'CraftEngine';
            d.code = 'test_code';

            const result = analyzer.adjustDiagnosticPositions([d], 5, 3);
            expect(result[0].range.start.line).toBe(13);
            expect(result[0].range.end.line).toBe(13);
            expect(result[0].range.start.character).toBe(2);
            expect(result[0].source).toBe('CraftEngine');
            expect(result[0].code).toBe('test_code');
        });

        it('should shift diagnostics by negative delta', () => {
            const d = new Diagnostic(new Range(10, 0, 12, 5), 'msg', DiagnosticSeverity.Error);
            const result = analyzer.adjustDiagnosticPositions([d], 5, -2);
            expect(result[0].range.start.line).toBe(8);
            expect(result[0].range.end.line).toBe(10);
        });

        it('should not adjust diagnostics before or at change line', () => {
            const d = new Diagnostic(new Range(3, 0, 3, 5), 'msg', DiagnosticSeverity.Error);
            const result = analyzer.adjustDiagnosticPositions([d], 5, 3);
            expect(result[0].range.start.line).toBe(3);
        });
    });

    describe('calculateLineDelta', () => {
        it('should return 0 for same-line replacement', () => {
            const changes = [makeChange(5, 0, 5, 5, 'hello', 5)];
            expect(analyzer.calculateLineDelta(changes)).toBe(0);
        });

        it('should return positive delta for line insertion', () => {
            const changes = [makeChange(5, 0, 5, 0, 'a\nb\nc')];
            expect(analyzer.calculateLineDelta(changes)).toBe(2);
        });

        it('should return negative delta for line deletion', () => {
            const changes = [makeChange(5, 0, 8, 0, '', 0)];
            expect(analyzer.calculateLineDelta(changes)).toBe(-3);
        });

        it('should accumulate deltas from multiple changes', () => {
            const changes = [
                makeChange(5, 0, 5, 0, 'a\nb'), // +1
                makeChange(10, 0, 12, 0, '', 0), // -2
            ];
            expect(analyzer.calculateLineDelta(changes)).toBe(-1);
        });
    });
});
