import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DocumentChangeTracker } from '../../../../../application/services/extension/DocumentChangeTracker';
import type * as vscode from 'vscode';

describe('DocumentChangeTracker', () => {
    let tracker: DocumentChangeTracker;

    beforeEach(() => {
        tracker = new DocumentChangeTracker();
    });

    const createChangeEvent = (
        uri: string,
        version: number,
        changes: Array<{ startLine: number; endLine: number; text: string }>,
    ): vscode.TextDocumentChangeEvent => ({
        document: {
            uri: { toString: () => uri },
            version,
        } as unknown as vscode.TextDocument,
        contentChanges: changes.map((c) => ({
            range: {
                start: { line: c.startLine, character: 0 },
                end: { line: c.endLine, character: 0 },
            },
            text: c.text,
            rangeOffset: 0,
            rangeLength: 0,
        })) as unknown as readonly vscode.TextDocumentContentChangeEvent[],
        reason: undefined,
    });

    describe('trackChanges', () => {
        it('should track changed lines from event', () => {
            const event = createChangeEvent('file:///test.yaml', 1, [
                { startLine: 5, endLine: 7, text: 'new content' },
            ]);

            tracker.trackChanges(event);

            const info = tracker.getChangeInfo('file:///test.yaml');
            expect(info).toBeDefined();
            expect(info!.changedLines.has(5)).toBe(true);
            expect(info!.changedLines.has(6)).toBe(true);
            expect(info!.changedLines.has(7)).toBe(true);
            expect(info!.version).toBe(1);
        });

        it('should track new lines from multi-line text insertion', () => {
            const event = createChangeEvent('file:///test.yaml', 1, [
                { startLine: 3, endLine: 3, text: 'line1\nline2\nline3' },
            ]);

            tracker.trackChanges(event);

            const info = tracker.getChangeInfo('file:///test.yaml');
            expect(info!.changedLines.has(3)).toBe(true);
            expect(info!.changedLines.has(4)).toBe(true);
            expect(info!.changedLines.has(5)).toBe(true);
        });

        it('should accumulate changes for consecutive versions', () => {
            const event1 = createChangeEvent('file:///test.yaml', 1, [{ startLine: 1, endLine: 1, text: 'a' }]);
            const event2 = createChangeEvent('file:///test.yaml', 2, [{ startLine: 5, endLine: 5, text: 'b' }]);

            tracker.trackChanges(event1);
            tracker.trackChanges(event2);

            const info = tracker.getChangeInfo('file:///test.yaml');
            expect(info!.changedLines.has(1)).toBe(true);
            expect(info!.changedLines.has(5)).toBe(true);
        });

        it('should reset changes for non-consecutive versions', () => {
            const event1 = createChangeEvent('file:///test.yaml', 1, [{ startLine: 1, endLine: 1, text: 'a' }]);
            const event2 = createChangeEvent('file:///test.yaml', 5, [{ startLine: 10, endLine: 10, text: 'b' }]);

            tracker.trackChanges(event1);
            tracker.trackChanges(event2);

            const info = tracker.getChangeInfo('file:///test.yaml');
            // 版本不连续，应该重置
            expect(info!.changedLines.has(1)).toBe(false);
            expect(info!.changedLines.has(10)).toBe(true);
        });
    });

    describe('clearChanges', () => {
        it('should remove change info for uri', () => {
            const event = createChangeEvent('file:///test.yaml', 1, [{ startLine: 1, endLine: 1, text: 'a' }]);
            tracker.trackChanges(event);

            tracker.clearChanges('file:///test.yaml');

            expect(tracker.getChangeInfo('file:///test.yaml')).toBeUndefined();
        });
    });

    describe('execution versions', () => {
        it('should increment version', () => {
            const v1 = tracker.incrementVersion('file:///test.yaml');
            const v2 = tracker.incrementVersion('file:///test.yaml');

            expect(v1).toBe(1);
            expect(v2).toBe(2);
        });

        it('should check version currency', () => {
            const v = tracker.incrementVersion('file:///test.yaml');

            expect(tracker.isVersionCurrent('file:///test.yaml', v)).toBe(true);
            expect(tracker.isVersionCurrent('file:///test.yaml', v - 1)).toBe(false);
        });

        it('should clear version', () => {
            tracker.incrementVersion('file:///test.yaml');
            tracker.clearVersion('file:///test.yaml');

            expect(tracker.isVersionCurrent('file:///test.yaml', 1)).toBe(false);
        });
    });

    describe('dispose', () => {
        it('should clear all data', () => {
            const event = createChangeEvent('file:///test.yaml', 1, [{ startLine: 1, endLine: 1, text: 'a' }]);
            tracker.trackChanges(event);
            tracker.incrementVersion('file:///test.yaml');

            tracker.dispose();

            expect(tracker.getChangeInfo('file:///test.yaml')).toBeUndefined();
            expect(tracker.isVersionCurrent('file:///test.yaml', 1)).toBe(false);
        });
    });
});
