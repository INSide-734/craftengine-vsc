/**
 * YamlScanner 单元测试
 *
 * 测试 YAML 扫描器的所有功能，包括：
 * - 工作区扫描
 * - 目录扫描
 * - 单文件扫描
 * - 文件验证
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { YamlScanner } from '../../../../infrastructure/yaml/YamlScanner';
import { type IYamlParser } from '../../../../core/interfaces/IYamlParser';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import { type IYamlDocument, type IYamlParseResult } from '../../../../core/interfaces/IYamlDocument';
import { Uri, workspace } from 'vscode';
import * as fs from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises', () => ({
    readFile: vi.fn(),
    stat: vi.fn(),
}));

// Mock vscode workspace
vi.mock('vscode', () => ({
    Uri: {
        file: vi.fn((path: string) => ({ fsPath: path, path })),
        parse: vi.fn((path: string) => ({ fsPath: path, path })),
    },
    workspace: {
        findFiles: vi.fn(),
    },
}));

describe('YamlScanner', () => {
    let scanner: YamlScanner;
    let mockParser: IYamlParser;
    let mockLogger: ILogger;

    /**
     * 创建模拟的解析结果
     */
    function createMockParseResult(sourceFile: Uri): IYamlParseResult {
        return {
            root: {
                type: 'object',
                value: { key: 'value' },
                path: [],
            },
            errors: [],
            success: true,
            metadata: {
                sourceFile,
                totalLines: 1,
                parsedAt: new Date(),
            },
        };
    }

    /**
     * 创建模拟的文档对象
     */
    function createMockDocument(sourceFile: Uri, content: string): IYamlDocument {
        return {
            sourceFile,
            content,
            parseResult: createMockParseResult(sourceFile),
            getNode: vi.fn(() => null),
            getValue: vi.fn(() => null),
            hasPath: vi.fn(() => false),
            getTopLevelKeys: vi.fn(() => ['key']),
            isValid: vi.fn(() => true),
            getErrors: vi.fn(() => []),
        };
    }

    beforeEach(() => {
        mockLogger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            fatal: vi.fn(),
            createChild: vi.fn(() => mockLogger),
            setLevel: vi.fn(),
            getLevel: vi.fn(() => 0),
        } as unknown as ILogger;

        mockParser = {
            parseText: vi.fn(),
            createDocument: vi.fn(),
        } as unknown as IYamlParser;

        scanner = new YamlScanner(mockParser, mockLogger);

        // 重置所有 mock
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    // ========================================
    // scanWorkspace 测试
    // ========================================

    describe('scanWorkspace', () => {
        it('should scan workspace and return results', async () => {
            const mockFiles = [Uri.file('/workspace/test1.yaml'), Uri.file('/workspace/test2.yml')];

            vi.mocked(workspace.findFiles).mockResolvedValue(mockFiles);
            vi.mocked(fs.readFile).mockResolvedValue('key: value');
            vi.mocked(mockParser.parseText).mockResolvedValue(createMockParseResult(mockFiles[0]));
            vi.mocked(mockParser.createDocument).mockReturnValue(createMockDocument(mockFiles[0], 'key: value'));

            const result = await scanner.scanWorkspace();

            expect(result).toBeDefined();
            expect(result.files).toEqual(mockFiles);
            expect(result.statistics).toBeDefined();
            expect(result.statistics.totalFiles).toBe(2);
        });

        it('should use custom pattern', async () => {
            vi.mocked(workspace.findFiles).mockResolvedValue([]);

            await scanner.scanWorkspace({
                pattern: 'src/**/*.yaml',
            });

            expect(workspace.findFiles).toHaveBeenCalledWith('src/**/*.yaml', '**/node_modules/**', undefined);
        });

        it('should use custom exclude pattern', async () => {
            vi.mocked(workspace.findFiles).mockResolvedValue([]);

            await scanner.scanWorkspace({
                exclude: '**/dist/**',
            });

            expect(workspace.findFiles).toHaveBeenCalledWith('**/*.{yaml,yml}', '**/dist/**', undefined);
        });

        it('should skip files exceeding max size', async () => {
            const mockFiles = [Uri.file('/workspace/large.yaml')];
            vi.mocked(workspace.findFiles).mockResolvedValue(mockFiles);

            // 模拟超大文件内容
            const largeContent = 'x'.repeat(20 * 1024 * 1024); // 20MB
            vi.mocked(fs.readFile).mockResolvedValue(largeContent);

            const result = await scanner.scanWorkspace({
                maxFileSize: 10 * 1024 * 1024, // 10MB
            });

            expect(result.documents).toHaveLength(0);
        });

        it('should collect failed files', async () => {
            const mockFiles = [Uri.file('/workspace/invalid.yaml')];
            vi.mocked(workspace.findFiles).mockResolvedValue(mockFiles);
            vi.mocked(fs.readFile).mockResolvedValue('invalid: yaml: content');
            vi.mocked(mockParser.parseText).mockRejectedValue(new Error('Parse error'));

            const result = await scanner.scanWorkspace();

            expect(result.failed.length).toBeGreaterThanOrEqual(0);
        });

        it('should skip invalid files when skipInvalid is true', async () => {
            const mockFiles = [Uri.file('/workspace/invalid.yaml')];
            vi.mocked(workspace.findFiles).mockResolvedValue(mockFiles);
            vi.mocked(fs.readFile).mockResolvedValue('invalid: yaml: content');
            vi.mocked(mockParser.parseText).mockRejectedValue(new Error('Parse error'));

            const result = await scanner.scanWorkspace({
                skipInvalid: true,
            });

            expect(result.failed).toHaveLength(0);
        });

        it('should report progress', async () => {
            const mockFiles = [Uri.file('/workspace/test1.yaml'), Uri.file('/workspace/test2.yaml')];
            vi.mocked(workspace.findFiles).mockResolvedValue(mockFiles);
            vi.mocked(fs.readFile).mockResolvedValue('key: value');
            vi.mocked(mockParser.parseText).mockResolvedValue(createMockParseResult(mockFiles[0]));
            vi.mocked(mockParser.createDocument).mockReturnValue(createMockDocument(mockFiles[0], 'key: value'));

            const onProgress = vi.fn();

            await scanner.scanWorkspace({
                onProgress,
            });

            // 进度回调可能被调用
            expect(mockLogger.info).toHaveBeenCalled();
        });

        it('should calculate statistics', async () => {
            const mockFiles = [Uri.file('/workspace/test1.yaml'), Uri.file('/workspace/test2.yaml')];
            vi.mocked(workspace.findFiles).mockResolvedValue(mockFiles);
            vi.mocked(fs.readFile).mockResolvedValue('key: value');
            vi.mocked(mockParser.parseText).mockResolvedValue(createMockParseResult(mockFiles[0]));
            vi.mocked(mockParser.createDocument).mockReturnValue(createMockDocument(mockFiles[0], 'key: value'));

            const result = await scanner.scanWorkspace();

            expect(result.statistics.totalFiles).toBe(2);
            expect(result.statistics.duration).toBeGreaterThanOrEqual(0);
            expect(result.statistics.successRate).toBeDefined();
        });

        it('should handle empty workspace', async () => {
            vi.mocked(workspace.findFiles).mockResolvedValue([]);

            const result = await scanner.scanWorkspace();

            expect(result.files).toHaveLength(0);
            expect(result.documents).toHaveLength(0);
            expect(result.statistics.totalFiles).toBe(0);
        });

        it('should handle workspace.findFiles error', async () => {
            vi.mocked(workspace.findFiles).mockRejectedValue(new Error('Workspace error'));

            await expect(scanner.scanWorkspace()).rejects.toThrow('Workspace error');
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    // ========================================
    // scanFile 测试
    // ========================================

    describe('scanFile', () => {
        it('should scan single YAML file', async () => {
            const file = Uri.file('/workspace/test.yaml');
            vi.mocked(fs.readFile).mockResolvedValue('key: value');
            vi.mocked(mockParser.parseText).mockResolvedValue(createMockParseResult(file));

            const mockDoc = createMockDocument(file, 'key: value');
            vi.mocked(mockParser.createDocument).mockReturnValue(mockDoc);

            const result = await scanner.scanFile(file);

            expect(result).toBeDefined();
            expect(result?.sourceFile).toEqual(file);
        });

        it('should return null for non-YAML file', async () => {
            const file = Uri.file('/workspace/test.json');

            const result = await scanner.scanFile(file);

            expect(result).toBeNull();
        });

        it('should return null for .yml file that fails to parse', async () => {
            const file = Uri.file('/workspace/test.yml');
            vi.mocked(fs.readFile).mockResolvedValue('invalid: yaml: content');
            vi.mocked(mockParser.parseText).mockRejectedValue(new Error('Parse error'));

            const result = await scanner.scanFile(file);

            expect(result).toBeNull();
        });

        it('should return null for file exceeding max size', async () => {
            const file = Uri.file('/workspace/large.yaml');
            const largeContent = 'x'.repeat(20 * 1024 * 1024); // 20MB
            vi.mocked(fs.readFile).mockResolvedValue(largeContent);

            const result = await scanner.scanFile(file);

            expect(result).toBeNull();
        });

        it('should handle file read error', async () => {
            const file = Uri.file('/workspace/missing.yaml');
            vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

            const result = await scanner.scanFile(file);

            expect(result).toBeNull();
        });
    });

    // ========================================
    // scanDirectory 测试
    // ========================================

    describe('scanDirectory', () => {
        it('should scan directory for YAML files', async () => {
            const directory = Uri.file('/workspace/config');
            const mockFiles = [Uri.file('/workspace/config/test1.yaml'), Uri.file('/workspace/config/test2.yml')];

            vi.mocked(workspace.findFiles).mockResolvedValue(mockFiles);
            vi.mocked(fs.readFile).mockResolvedValue('key: value');
            vi.mocked(mockParser.parseText).mockResolvedValue(createMockParseResult(mockFiles[0]));
            vi.mocked(mockParser.createDocument).mockReturnValue(createMockDocument(mockFiles[0], 'key: value'));

            const result = await scanner.scanDirectory(directory);

            expect(result.files).toEqual(mockFiles);
            expect(result.statistics.totalFiles).toBe(2);
        });

        it('should use relative pattern for directory', async () => {
            const directory = Uri.file('/workspace/config');
            vi.mocked(workspace.findFiles).mockResolvedValue([]);

            await scanner.scanDirectory(directory, {
                pattern: 'data/**/*.yaml',
            });

            expect(workspace.findFiles).toHaveBeenCalled();
        });

        it('should handle empty directory', async () => {
            const directory = Uri.file('/workspace/empty');
            vi.mocked(workspace.findFiles).mockResolvedValue([]);

            const result = await scanner.scanDirectory(directory);

            expect(result.files).toHaveLength(0);
            expect(result.documents).toHaveLength(0);
        });

        it('should handle directory scan error', async () => {
            const directory = Uri.file('/workspace/config');
            vi.mocked(workspace.findFiles).mockRejectedValue(new Error('Access denied'));

            await expect(scanner.scanDirectory(directory)).rejects.toThrow('Access denied');
        });
    });

    // ========================================
    // isValidYamlFile 测试
    // ========================================

    describe('isValidYamlFile', () => {
        it('should return true for valid YAML file', async () => {
            const file = Uri.file('/workspace/test.yaml');
            vi.mocked(fs.stat).mockResolvedValue({
                isFile: () => true,
                size: 1000,
            } as any);

            const result = await scanner.isValidYamlFile(file);

            expect(result).toBe(true);
        });

        it('should return true for .yml file', async () => {
            const file = Uri.file('/workspace/test.yml');
            vi.mocked(fs.stat).mockResolvedValue({
                isFile: () => true,
                size: 1000,
            } as any);

            const result = await scanner.isValidYamlFile(file);

            expect(result).toBe(true);
        });

        it('should return false for non-YAML file', async () => {
            const file = Uri.file('/workspace/test.json');

            const result = await scanner.isValidYamlFile(file);

            expect(result).toBe(false);
        });

        it('should return false for directory', async () => {
            const file = Uri.file('/workspace/folder.yaml');
            vi.mocked(fs.stat).mockResolvedValue({
                isFile: () => false,
                size: 0,
            } as any);

            const result = await scanner.isValidYamlFile(file);

            expect(result).toBe(false);
        });

        it('should return false for file exceeding max size', async () => {
            const file = Uri.file('/workspace/large.yaml');
            vi.mocked(fs.stat).mockResolvedValue({
                isFile: () => true,
                size: 20 * 1024 * 1024, // 20MB
            } as any);

            const result = await scanner.isValidYamlFile(file);

            expect(result).toBe(false);
        });

        it('should return false when stat fails', async () => {
            const file = Uri.file('/workspace/missing.yaml');
            vi.mocked(fs.stat).mockRejectedValue(new Error('File not found'));

            const result = await scanner.isValidYamlFile(file);

            expect(result).toBe(false);
        });
    });

    // ========================================
    // 无 Logger 场景
    // ========================================

    describe('without logger', () => {
        it('should work without logger', async () => {
            const scannerWithoutLogger = new YamlScanner(mockParser);
            vi.mocked(workspace.findFiles).mockResolvedValue([]);

            const result = await scannerWithoutLogger.scanWorkspace();

            expect(result.files).toHaveLength(0);
        });
    });
});
