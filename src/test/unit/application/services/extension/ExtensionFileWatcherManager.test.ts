/**
 * ExtensionFileWatcherManager 单元测试
 *
 * 测试扩展文件监控管理器的所有功能，包括：
 * - 文件监控设置
 * - 文件变更处理（创建/修改/删除）
 * - 错误处理
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExtensionFileWatcherManager } from '../../../../../application/services/extension/ExtensionFileWatcherManager';
import { type ILogger } from '../../../../../core/interfaces/ILogger';
import { type IConfiguration } from '../../../../../core/interfaces/IConfiguration';
import { type IFileWatcher } from '../../../../../core/interfaces/IFileWatcher';
import { type DataFileHandler } from '../../../../../application/services/extension/DataFileHandler';
import { Uri } from 'vscode';

describe('ExtensionFileWatcherManager', () => {
    let manager: ExtensionFileWatcherManager;
    let mockLogger: ILogger;
    let mockConfiguration: IConfiguration;
    let mockFileWatcher: IFileWatcher;
    let mockFileHandler: DataFileHandler;
    let capturedOnFileChangeCallback: ((event: any) => void) | null;

    beforeEach(() => {
        capturedOnFileChangeCallback = null;

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

        mockConfiguration = {
            get: vi.fn((_key: string, defaultValue?: any) => defaultValue),
        } as unknown as IConfiguration;

        mockFileWatcher = {
            watch: vi.fn(),
            onFileChange: vi.fn((cb: (event: any) => void) => {
                capturedOnFileChangeCallback = cb;
            }),
        } as unknown as IFileWatcher;

        mockFileHandler = {
            handleFileModified: vi.fn(() => Promise.resolve()),
            handleFileDeleted: vi.fn(() => Promise.resolve()),
        } as unknown as DataFileHandler;

        manager = new ExtensionFileWatcherManager(mockLogger, mockConfiguration, mockFileWatcher, mockFileHandler);
    });

    // ========================================
    // setup - 基本功能
    // ========================================

    describe('setup', () => {
        it('should read exclude pattern from configuration', async () => {
            await manager.setup();
            expect(mockConfiguration.get).toHaveBeenCalledWith('files.exclude', '**/node_modules/**');
        });

        it('should watch YAML files with correct pattern', async () => {
            await manager.setup();
            expect(mockFileWatcher.watch).toHaveBeenCalledWith(
                '**/*.{yml,yaml}',
                expect.objectContaining({
                    recursive: true,
                    debounceDelay: 300,
                }),
            );
        });

        it('should setup file change handler', async () => {
            await manager.setup();
            expect(mockFileWatcher.onFileChange).toHaveBeenCalled();
        });

        it('should log debug on successful setup', async () => {
            await manager.setup();
            expect(mockLogger.debug).toHaveBeenCalledWith('File watching setup completed');
        });

        it('should throw and log error when setup fails', async () => {
            const error = new Error('Watch failed');
            vi.mocked(mockFileWatcher.watch).mockImplementation(() => {
                throw error;
            });

            await expect(manager.setup()).rejects.toThrow('Watch failed');
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to setup file watching', error);
        });
    });

    // ========================================
    // 文件变更处理
    // ========================================

    describe('file change handling', () => {
        beforeEach(async () => {
            await manager.setup();
        });

        it('should call handleFileModified for created files', async () => {
            const uri = Uri.file('/test/new-file.yaml');
            expect(capturedOnFileChangeCallback).not.toBeNull();

            await capturedOnFileChangeCallback!({ uri, type: 'created' });

            expect(mockFileHandler.handleFileModified).toHaveBeenCalledWith(uri);
        });

        it('should call handleFileModified for modified files', async () => {
            const uri = Uri.file('/test/modified.yaml');

            await capturedOnFileChangeCallback!({ uri, type: 'modified' });

            expect(mockFileHandler.handleFileModified).toHaveBeenCalledWith(uri);
        });

        it('should call handleFileDeleted for deleted files', async () => {
            const uri = Uri.file('/test/deleted.yaml');

            await capturedOnFileChangeCallback!({ uri, type: 'deleted' });

            expect(mockFileHandler.handleFileDeleted).toHaveBeenCalledWith(uri);
        });

        it('should log debug for file change events', async () => {
            const uri = Uri.file('/test/file.yaml');

            await capturedOnFileChangeCallback!({ uri, type: 'modified' });

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'File change detected',
                expect.objectContaining({
                    file: uri.fsPath,
                    type: 'modified',
                }),
            );
        });

        it('should log error when file handler throws', async () => {
            const uri = Uri.file('/test/error.yaml');
            const error = new Error('Handler error');
            vi.mocked(mockFileHandler.handleFileModified).mockRejectedValue(error);

            await capturedOnFileChangeCallback!({ uri, type: 'modified' });

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Error handling file change',
                error,
                expect.objectContaining({
                    file: uri.fsPath,
                    type: 'modified',
                }),
            );
        });
    });
});
