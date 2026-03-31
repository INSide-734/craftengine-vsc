import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';

// Mock fs 模块
const mockStatSync = vi.fn();
const mockReadFileSync = vi.fn();
vi.mock('fs', async (importOriginal) => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    const actual: typeof import('fs') = await importOriginal();
    return {
        ...actual,
        statSync: (...args: any[]) => mockStatSync(...args),
        readFileSync: (...args: any[]) => mockReadFileSync(...args),
    };
});

import { workspace } from 'vscode';
import { DiagnosticIgnoreParser } from '../../../../infrastructure/ignore/DiagnosticIgnoreParser';

describe('DiagnosticIgnoreParser', () => {
    let parser: DiagnosticIgnoreParser;
    const workspaceRoot = '/workspace/project';
    const mockWorkspaceFolder = {
        uri: { fsPath: workspaceRoot },
        name: 'project',
        index: 0,
    };

    beforeEach(() => {
        parser = new DiagnosticIgnoreParser();
        vi.mocked(workspace.getWorkspaceFolder).mockReturnValue(mockWorkspaceFolder as any);
    });

    afterEach(() => {
        vi.clearAllMocks();
        parser.clearCache();
    });

    function makeUri(relativePath: string): any {
        const fullPath = path.join(workspaceRoot, relativePath);
        return { fsPath: fullPath, toString: () => `file://${fullPath}` };
    }

    /**
     * 模拟忽略文件内容
     * @param files 文件名到内容的映射
     */
    function mockIgnoreFiles(files: Record<string, string>): void {
        const filePaths = new Map<string, string>();
        for (const [name, content] of Object.entries(files)) {
            filePaths.set(path.join(workspaceRoot, name), content);
        }
        mockStatSync.mockImplementation((p: string) => {
            if (filePaths.has(p)) {
                return { mtimeMs: 1000 };
            }
            throw new Error('ENOENT');
        });
        mockReadFileSync.mockImplementation((p: string) => {
            const content = filePaths.get(p);
            if (content !== undefined) {
                return content;
            }
            throw new Error('ENOENT');
        });
    }

    function mockCraftignore(content: string): void {
        mockIgnoreFiles({ '.craftignore': content });
    }

    describe('no ignore files', () => {
        it('should not ignore any file', () => {
            mockStatSync.mockImplementation(() => {
                throw new Error('ENOENT');
            });
            expect(parser.isFileIgnored(makeUri('src/test.yml'))).toBe(false);
        });
    });

    describe('file outside workspace', () => {
        it('should not be ignored', () => {
            vi.mocked(workspace.getWorkspaceFolder).mockReturnValue(undefined);
            expect(parser.isFileIgnored(makeUri('outside/test.yml'))).toBe(false);
        });
    });

    describe('simple pattern matching', () => {
        it('should match exact file name in any directory', () => {
            mockCraftignore('test.yml');
            expect(parser.isFileIgnored(makeUri('test.yml'))).toBe(true);
            expect(parser.isFileIgnored(makeUri('src/test.yml'))).toBe(true);
            expect(parser.isFileIgnored(makeUri('other.yml'))).toBe(false);
        });

        it('should match wildcard *', () => {
            mockCraftignore('*.log');
            expect(parser.isFileIgnored(makeUri('debug.log'))).toBe(true);
            expect(parser.isFileIgnored(makeUri('src/error.log'))).toBe(true);
            expect(parser.isFileIgnored(makeUri('test.yml'))).toBe(false);
        });

        it('should match single-char wildcard ?', () => {
            mockCraftignore('test?.yml');
            expect(parser.isFileIgnored(makeUri('test1.yml'))).toBe(true);
            expect(parser.isFileIgnored(makeUri('testA.yml'))).toBe(true);
            expect(parser.isFileIgnored(makeUri('test.yml'))).toBe(false);
            expect(parser.isFileIgnored(makeUri('test12.yml'))).toBe(false);
        });

        it('should match character class [abc]', () => {
            mockCraftignore('test[123].yml');
            expect(parser.isFileIgnored(makeUri('test1.yml'))).toBe(true);
            expect(parser.isFileIgnored(makeUri('test2.yml'))).toBe(true);
            expect(parser.isFileIgnored(makeUri('test4.yml'))).toBe(false);
        });
    });

    describe('path pattern matching', () => {
        it('should match pattern with directory path', () => {
            mockCraftignore('src/generated/*.yml');
            expect(parser.isFileIgnored(makeUri('src/generated/output.yml'))).toBe(true);
            expect(parser.isFileIgnored(makeUri('src/other/output.yml'))).toBe(false);
        });

        it('should match ** for multi-level directories', () => {
            mockCraftignore('src/**/test.yml');
            expect(parser.isFileIgnored(makeUri('src/test.yml'))).toBe(true);
            expect(parser.isFileIgnored(makeUri('src/a/test.yml'))).toBe(true);
            expect(parser.isFileIgnored(makeUri('src/a/b/c/test.yml'))).toBe(true);
            expect(parser.isFileIgnored(makeUri('other/test.yml'))).toBe(false);
        });

        it('should anchor pattern starting with /', () => {
            mockCraftignore('/build');
            expect(parser.isFileIgnored(makeUri('build'))).toBe(true);
            expect(parser.isFileIgnored(makeUri('src/build'))).toBe(false);
        });
    });

    describe('negation rules', () => {
        it('should support ! negation', () => {
            mockCraftignore('*.yml\n!important.yml');
            expect(parser.isFileIgnored(makeUri('test.yml'))).toBe(true);
            expect(parser.isFileIgnored(makeUri('important.yml'))).toBe(false);
        });

        it('should let negation override earlier ignore rules', () => {
            mockCraftignore('*.generated.yml\n!keep.generated.yml');
            expect(parser.isFileIgnored(makeUri('test.generated.yml'))).toBe(true);
            expect(parser.isFileIgnored(makeUri('keep.generated.yml'))).toBe(false);
        });
    });

    describe('comments and blank lines', () => {
        it('should skip comment lines', () => {
            mockCraftignore('# this is a comment\ntest.yml');
            expect(parser.isFileIgnored(makeUri('test.yml'))).toBe(true);
        });

        it('should skip blank lines', () => {
            mockCraftignore('\n\ntest.yml\n\n');
            expect(parser.isFileIgnored(makeUri('test.yml'))).toBe(true);
        });
    });

    describe('directory-only rules', () => {
        it('should not match files when pattern ends with /', () => {
            mockCraftignore('build/');
            expect(parser.isFileIgnored(makeUri('build'))).toBe(false);
            expect(parser.isFileIgnored(makeUri('build/output.yml'))).toBe(false);
        });
    });

    describe('caching', () => {
        it('should cache parsed rules across calls', () => {
            mockCraftignore('test.yml');
            parser.isFileIgnored(makeUri('test.yml'));
            parser.isFileIgnored(makeUri('test.yml'));
            expect(mockReadFileSync).toHaveBeenCalledTimes(1);
        });

        it('should re-parse after clearCache()', () => {
            mockCraftignore('test.yml');
            parser.isFileIgnored(makeUri('test.yml'));
            parser.clearCache();
            parser.isFileIgnored(makeUri('test.yml'));
            expect(mockReadFileSync).toHaveBeenCalledTimes(2);
        });
    });

    describe('.gitignore fallback', () => {
        it('should use .gitignore when .craftignore is absent', () => {
            mockIgnoreFiles({ '.gitignore': '*.log' });
            expect(parser.isFileIgnored(makeUri('debug.log'))).toBe(true);
            expect(parser.isFileIgnored(makeUri('test.yml'))).toBe(false);
        });

        it('should merge rules from both files', () => {
            mockIgnoreFiles({
                '.gitignore': '*.log',
                '.craftignore': '*.tmp',
            });
            expect(parser.isFileIgnored(makeUri('debug.log'))).toBe(true);
            expect(parser.isFileIgnored(makeUri('cache.tmp'))).toBe(true);
            expect(parser.isFileIgnored(makeUri('test.yml'))).toBe(false);
        });

        it('.craftignore rules should override .gitignore rules', () => {
            mockIgnoreFiles({
                '.gitignore': '*.yml',
                '.craftignore': '!important.yml',
            });
            // .gitignore ignores all .yml, .craftignore negates important.yml
            expect(parser.isFileIgnored(makeUri('test.yml'))).toBe(true);
            expect(parser.isFileIgnored(makeUri('important.yml'))).toBe(false);
        });
    });
});
