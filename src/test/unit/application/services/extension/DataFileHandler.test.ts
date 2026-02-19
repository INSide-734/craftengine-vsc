/**
 * DataFileHandler 单元测试
 *
 * 测试数据文件处理器的所有功能，包括：
 * - 文件修改处理
 * - 文件删除处理
 * - 事件发布
 * - 错误处理
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataFileHandler } from '../../../../../application/services/extension/DataFileHandler';
import { ILogger } from '../../../../../core/interfaces/ILogger';
import { IEventBus } from '../../../../../core/interfaces/IEventBus';
import { IDataStoreService } from '../../../../../core/interfaces/IDataStoreService';
import { Uri } from 'vscode';

describe('DataFileHandler', () => {
    let handler: DataFileHandler;
    let mockLogger: ILogger;
    let mockEventBus: IEventBus;
    let mockDataStoreService: IDataStoreService;
    let mockGenerateEventId: ReturnType<typeof vi.fn>;

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

        mockEventBus = {
            publish: vi.fn(() => Promise.resolve()),
            subscribe: vi.fn(),
            unsubscribe: vi.fn(),
        } as unknown as IEventBus;

        mockDataStoreService = {
            handleFileChange: vi.fn(() => Promise.resolve()),
            handleFileDelete: vi.fn(() => Promise.resolve()),
            getStatistics: vi.fn(() => Promise.resolve({
                templateCount: 5,
                translationKeyCount: 10,
                itemCount: 3,
                categoryCount: 2,
                indexedFileCount: 8,
                languageCount: 1,
                namespaceCount: 1,
                lastUpdated: new Date(),
                isInitialized: true,
            })),
        } as unknown as IDataStoreService;

        mockGenerateEventId = vi.fn(() => 'test-event-id');

        handler = new DataFileHandler(
            mockLogger,
            mockEventBus,
            mockDataStoreService,
            mockGenerateEventId as unknown as () => string
        );
    });

    // ========================================
    // handleFileModified
    // ========================================

    describe('handleFileModified', () => {
        it('should call dataStoreService.handleFileChange with the uri', async () => {
            const uri = Uri.file('/test/templates.yaml');
            await handler.handleFileModified(uri);
            expect(mockDataStoreService.handleFileChange).toHaveBeenCalledWith(uri);
        });

        it('should publish document.processed event after handling', async () => {
            const uri = Uri.file('/test/templates.yaml');
            await handler.handleFileModified(uri);

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                'document.processed',
                expect.objectContaining({
                    id: 'test-event-id',
                    type: 'document.processed',
                    source: 'DataFileHandler',
                    uri: uri.fsPath,
                    action: 'modified',
                    templateCount: 5,
                    translationKeyCount: 10,
                })
            );
        });

        it('should log success after handling', async () => {
            const uri = Uri.file('/test/templates.yaml');
            await handler.handleFileModified(uri);
            expect(mockLogger.info).toHaveBeenCalledWith(
                'File modification handled successfully',
                expect.objectContaining({ file: uri.fsPath })
            );
        });

        it('should log error when handleFileChange throws', async () => {
            const uri = Uri.file('/test/templates.yaml');
            vi.mocked(mockDataStoreService.handleFileChange).mockRejectedValue(
                new Error('Parse error')
            );

            await handler.handleFileModified(uri);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to handle file modification',
                expect.any(Error),
                expect.objectContaining({ file: uri.fsPath })
            );
            // 不应该发布事件
            expect(mockEventBus.publish).not.toHaveBeenCalled();
        });
    });

    // ========================================
    // handleFileDeleted
    // ========================================

    describe('handleFileDeleted', () => {
        it('should call dataStoreService.handleFileDelete with the uri', async () => {
            const uri = Uri.file('/test/templates.yaml');
            await handler.handleFileDeleted(uri);
            expect(mockDataStoreService.handleFileDelete).toHaveBeenCalledWith(uri);
        });

        it('should publish document.processed event with deleted action', async () => {
            const uri = Uri.file('/test/templates.yaml');
            await handler.handleFileDeleted(uri);

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                'document.processed',
                expect.objectContaining({
                    id: 'test-event-id',
                    type: 'document.processed',
                    source: 'DataFileHandler',
                    uri: uri.fsPath,
                    action: 'deleted',
                    templateCount: 0,
                    translationKeyCount: 0,
                })
            );
        });

        it('should log error when handleFileDelete throws', async () => {
            const uri = Uri.file('/test/templates.yaml');
            vi.mocked(mockDataStoreService.handleFileDelete).mockRejectedValue(
                new Error('Delete error')
            );

            await handler.handleFileDeleted(uri);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to handle file deletion',
                expect.any(Error),
                expect.objectContaining({ file: uri.fsPath })
            );
            expect(mockEventBus.publish).not.toHaveBeenCalled();
        });
    });
});
