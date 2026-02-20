/**
 * ExtensionHealthChecker 单元测试
 *
 * 测试扩展健康检查器的所有功能，包括：
 * - 状态检查
 * - 服务可用性检查
 * - 数据缓存检查
 * - 配置验证
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExtensionHealthChecker } from '../../../../../application/services/extension/ExtensionHealthChecker';
import { ExtensionState } from '../../../../../core/interfaces/IExtensionService';
import { type ILogger } from '../../../../../core/interfaces/ILogger';
import { type IConfiguration } from '../../../../../core/interfaces/IConfiguration';
import { type IDataStoreService } from '../../../../../core/interfaces/IDataStoreService';
import { type IFileWatcher } from '../../../../../core/interfaces/IFileWatcher';

describe('ExtensionHealthChecker', () => {
    let checker: ExtensionHealthChecker;
    let mockLogger: ILogger;
    let mockConfiguration: IConfiguration;
    let mockDataStoreService: IDataStoreService;
    let mockFileWatcher: IFileWatcher;

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

        mockConfiguration = {
            get: vi.fn(),
            set: vi.fn(),
            has: vi.fn(),
            delete: vi.fn(),
            getAll: vi.fn(),
            onChange: vi.fn(),
            validate: vi.fn(() => Promise.resolve([])),
            reload: vi.fn(),
        } as unknown as IConfiguration;

        mockDataStoreService = {
            getStatistics: vi.fn(() =>
                Promise.resolve({
                    templateCount: 10,
                    translationKeyCount: 20,
                    itemCount: 5,
                    categoryCount: 3,
                    indexedFileCount: 15,
                    languageCount: 2,
                    namespaceCount: 1,
                    lastUpdated: new Date(),
                    isInitialized: true,
                }),
            ),
        } as unknown as IDataStoreService;

        mockFileWatcher = {
            watch: vi.fn(),
            unwatch: vi.fn(),
            unwatchAll: vi.fn(),
            onFileChange: vi.fn(),
            getWatchedPaths: vi.fn(() => []),
            isWatching: vi.fn(),
            dispose: vi.fn(),
        } as unknown as IFileWatcher;

        checker = new ExtensionHealthChecker(mockLogger, mockConfiguration, mockDataStoreService, mockFileWatcher);
    });

    // ========================================
    // checkHealth - 正常场景
    // ========================================

    describe('checkHealth - success', () => {
        it('should return true when extension is active and all checks pass', async () => {
            const result = await checker.checkHealth(ExtensionState.Active);
            expect(result).toBe(true);
            expect(mockLogger.debug).toHaveBeenCalledWith('Health check passed');
        });

        it('should call getStatistics on dataStoreService', async () => {
            await checker.checkHealth(ExtensionState.Active);
            expect(mockDataStoreService.getStatistics).toHaveBeenCalled();
        });

        it('should call validate on configuration', async () => {
            await checker.checkHealth(ExtensionState.Active);
            expect(mockConfiguration.validate).toHaveBeenCalled();
        });
    });

    // ========================================
    // checkHealth - 状态检查
    // ========================================

    describe('checkHealth - state check', () => {
        it('should return false when state is Initializing', async () => {
            const result = await checker.checkHealth(ExtensionState.Initializing);
            expect(result).toBe(false);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Health check failed: extension not active',
                expect.objectContaining({ currentState: ExtensionState.Initializing }),
            );
        });

        it('should return false when state is Inactive', async () => {
            const result = await checker.checkHealth(ExtensionState.Inactive);
            expect(result).toBe(false);
        });

        it('should return false when state is Error', async () => {
            const result = await checker.checkHealth(ExtensionState.Error);
            expect(result).toBe(false);
        });

        it('should return false when state is Deactivating', async () => {
            const result = await checker.checkHealth(ExtensionState.Deactivating);
            expect(result).toBe(false);
        });
    });

    // ========================================
    // checkHealth - 数据缓存检查
    // ========================================

    describe('checkHealth - data cache', () => {
        it('should log debug when data cache is empty', async () => {
            vi.mocked(mockDataStoreService.getStatistics).mockResolvedValue({
                templateCount: 0,
                translationKeyCount: 0,
                itemCount: 0,
                categoryCount: 0,
                indexedFileCount: 0,
                languageCount: 0,
                namespaceCount: 0,
                lastUpdated: new Date(),
                isInitialized: true,
            });

            const result = await checker.checkHealth(ExtensionState.Active);
            expect(result).toBe(true);
            expect(mockLogger.debug).toHaveBeenCalledWith('Data cache is empty (initial scan may still be running)');
        });

        it('should log cache status when data exists', async () => {
            await checker.checkHealth(ExtensionState.Active);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Data cache status',
                expect.objectContaining({
                    templateCount: 10,
                    translationKeyCount: 20,
                }),
            );
        });
    });

    // ========================================
    // checkHealth - 配置验证
    // ========================================

    describe('checkHealth - configuration', () => {
        it('should log warning when configuration has validation errors', async () => {
            vi.mocked(mockConfiguration.validate).mockResolvedValue([
                'Invalid template path',
                'Missing required setting',
            ]);

            const result = await checker.checkHealth(ExtensionState.Active);
            expect(result).toBe(true); // 配置警告不影响健康状态
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Health check warning: configuration validation errors',
                expect.objectContaining({
                    errors: ['Invalid template path', 'Missing required setting'],
                }),
            );
        });
    });

    // ========================================
    // checkHealth - 错误处理
    // ========================================

    describe('checkHealth - error handling', () => {
        it('should return false and log error when an exception occurs', async () => {
            vi.mocked(mockDataStoreService.getStatistics).mockRejectedValue(new Error('Service unavailable'));

            const result = await checker.checkHealth(ExtensionState.Active);
            expect(result).toBe(false);
            expect(mockLogger.error).toHaveBeenCalledWith('Health check failed', expect.any(Error));
        });
    });
});
