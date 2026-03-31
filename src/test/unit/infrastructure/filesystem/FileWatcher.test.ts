import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock VSCode before any imports that use it
vi.mock('vscode', () => {
    class MockRelativePattern {
        constructor(
            public base: string,
            public pattern: string,
        ) {}
    }

    return {
        workspace: {
            createFileSystemWatcher: vi.fn(),
        },
        Uri: {
            file: vi.fn((path: string) => ({
                fsPath: path,
                scheme: 'file',
                authority: '',
                path,
                query: '',
                fragment: '',
                with: vi.fn(),
                toString: () => path,
            })),
        },
        RelativePattern: MockRelativePattern,
        FileSystemWatcher: class {},
    };
});

import { VSCodeFileWatcher } from '../../../../infrastructure/filesystem/FileWatcher';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import { type IEventBus } from '../../../../core/interfaces/IEventBus';
import { Uri, workspace } from 'vscode';

describe('VSCodeFileWatcher', () => {
    let fileWatcher: VSCodeFileWatcher;
    let mockLogger: ILogger;
    let mockEventBus: IEventBus;
    let mockWatcher: any;

    beforeEach(() => {
        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            createChild: vi.fn().mockReturnThis(),
        } as unknown as ILogger;

        mockEventBus = {
            publish: vi.fn(),
            subscribe: vi.fn(),
            unsubscribe: vi.fn(),
        } as unknown as IEventBus;

        mockWatcher = {
            onDidCreate: vi.fn(),
            onDidChange: vi.fn(),
            onDidDelete: vi.fn(),
            dispose: vi.fn(),
        };

        vi.mocked(workspace.createFileSystemWatcher).mockReturnValue(mockWatcher);

        fileWatcher = new VSCodeFileWatcher(mockLogger, mockEventBus);
    });

    afterEach(() => {
        fileWatcher.dispose();
        vi.clearAllMocks();
    });

    describe('watch', () => {
        it('should start watching a path', () => {
            const testPath = '/test/path';
            // Use absolute path pattern to avoid RelativePattern construction
            const options = { include: '/test/path/**/*.ts' };
            fileWatcher.watch(testPath, options);

            expect(workspace.createFileSystemWatcher).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Started watching path',
                expect.objectContaining({ path: testPath }),
            );
        });

        it('should watch with custom options', () => {
            const testPath = '/test/path';
            const options = {
                include: '/test/path/**/*.ts',
                exclude: ['**/node_modules/**'],
                debounceDelay: 500,
            };

            fileWatcher.watch(testPath, options);

            expect(workspace.createFileSystemWatcher).toHaveBeenCalled();
            expect(fileWatcher.isWatching(testPath)).toBe(true);
        });

        it('should replace existing watcher for the same path', () => {
            const testPath = '/test/path';
            const options = { include: '/test/path/**/*' };

            fileWatcher.watch(testPath, options);
            fileWatcher.watch(testPath, options);

            expect(mockWatcher.dispose).toHaveBeenCalledTimes(1);
        });

        it('should accept Uri as path', () => {
            const testUri = Uri.file('/test/path');
            const options = { include: '/test/path/**/*' };
            fileWatcher.watch(testUri, options);

            expect(fileWatcher.isWatching(testUri)).toBe(true);
        });
    });

    describe('unwatch', () => {
        it('should stop watching a path', () => {
            const testPath = '/test/path';
            const options = { include: '/test/path/**/*' };

            fileWatcher.watch(testPath, options);
            fileWatcher.unwatch(testPath);

            expect(mockWatcher.dispose).toHaveBeenCalled();
            expect(fileWatcher.isWatching(testPath)).toBe(false);
        });

        it('should not error when unwatching non-existent path', () => {
            expect(() => fileWatcher.unwatch('/non/existent')).not.toThrow();
        });
    });

    describe('unwatchAll', () => {
        it('should stop watching all paths', () => {
            const options1 = { include: '/path1/**/*' };
            const options2 = { include: '/path2/**/*' };
            fileWatcher.watch('/path1', options1);
            fileWatcher.watch('/path2', options2);

            fileWatcher.unwatchAll();

            expect(fileWatcher.getWatchedPaths()).toHaveLength(0);
            expect(mockWatcher.dispose).toHaveBeenCalledTimes(2);
        });
    });

    describe('onFileChange', () => {
        it('should register change handler', () => {
            const handler = vi.fn();
            const unsubscribe = fileWatcher.onFileChange(handler);

            expect(typeof unsubscribe).toBe('function');
        });

        it('should allow unsubscribing', () => {
            const handler = vi.fn();
            const unsubscribe = fileWatcher.onFileChange(handler);

            unsubscribe();

            // Handler should be removed from internal list
            expect(() => unsubscribe()).not.toThrow();
        });
    });

    describe('getWatchedPaths', () => {
        it('should return list of watched paths', () => {
            const options1 = { include: '/path1/**/*' };
            const options2 = { include: '/path2/**/*' };
            fileWatcher.watch('/path1', options1);
            fileWatcher.watch('/path2', options2);

            const paths = fileWatcher.getWatchedPaths();

            expect(paths).toHaveLength(2);
            expect(paths).toContain('/path1');
            expect(paths).toContain('/path2');
        });

        it('should return empty array when nothing is watched', () => {
            const paths = fileWatcher.getWatchedPaths();

            expect(paths).toHaveLength(0);
        });
    });

    describe('isWatching', () => {
        it('should return true for watched path', () => {
            const testPath = '/test/path';
            const options = { include: '/test/path/**/*' };
            fileWatcher.watch(testPath, options);

            expect(fileWatcher.isWatching(testPath)).toBe(true);
        });

        it('should return false for unwatched path', () => {
            expect(fileWatcher.isWatching('/unwatched')).toBe(false);
        });
    });

    describe('dispose', () => {
        it('should dispose all watchers', () => {
            const options1 = { include: '/path1/**/*' };
            const options2 = { include: '/path2/**/*' };
            fileWatcher.watch('/path1', options1);
            fileWatcher.watch('/path2', options2);

            fileWatcher.dispose();

            expect(mockWatcher.dispose).toHaveBeenCalledTimes(2);
            expect(fileWatcher.getWatchedPaths()).toHaveLength(0);
        });

        it('should be idempotent', () => {
            const options = { include: '/test/**/*' };
            fileWatcher.watch('/test', options);

            fileWatcher.dispose();
            fileWatcher.dispose();

            expect(mockWatcher.dispose).toHaveBeenCalledTimes(1);
        });

        it('should throw on operations after dispose', () => {
            fileWatcher.dispose();

            expect(() => fileWatcher.watch('/test')).toThrow('FileWatcher has been disposed');
        });
    });
});
