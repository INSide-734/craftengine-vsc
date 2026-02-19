/**
 * SchemaFileLoader 单元测试
 *
 * 测试 Schema 文件加载器的所有功能，包括：
 * - 文件加载（缓存命中/未命中）
 * - 缓存管理
 * - 工作区 Schema 目录优先级
 * - 错误处理
 * - 重新加载
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchemaFileLoader } from '../../../../../application/services/schema/SchemaFileLoader';
import { ILogger } from '../../../../../core/interfaces/ILogger';
import { SCHEMA_METADATA } from '../../../../../application/services/schema/SchemaConstants';

const defaultSchemaJson = JSON.stringify({
    title: 'Test Schema',
    type: 'object',
    properties: {},
});

// Mock fs/promises 模块
vi.mock('fs/promises', () => ({
    access: vi.fn(() => Promise.resolve()),
    readFile: vi.fn(() => Promise.resolve(defaultSchemaJson)),
}));

// Mock path 模块（保留原始实现但可以监控）
vi.mock('path', async () => {
    const actual = await vi.importActual('path');
    return {
        ...actual,
        posix: {
            ...(actual as any).posix,
            dirname: vi.fn((p: string) => {
                const parts = p.replace(/\\/g, '/').split('/');
                parts.pop();
                return parts.join('/') || '.';
            }),
        },
    };
});

import * as fs from 'fs/promises';

describe('SchemaFileLoader', () => {
    let loader: SchemaFileLoader;
    let mockLogger: ILogger;
    const schemasDir = '/extension/schemas';

    beforeEach(() => {
        vi.clearAllMocks();

        // 重新设置 fs/promises mock 的默认行为
        vi.mocked(fs.access).mockResolvedValue(undefined);
        vi.mocked(fs.readFile).mockResolvedValue(defaultSchemaJson);

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

        loader = new SchemaFileLoader(schemasDir, mockLogger, 10);
    });

    // ========================================
    // loadSchema - 基本功能
    // ========================================

    describe('loadSchema', () => {
        it('should load and parse a JSON schema file', async () => {
            const schema = await loader.loadSchema('test.schema.json');
            expect(schema.title).toBe('Test Schema');
            expect(schema.type).toBe('object');
        });

        it('should add schema metadata', async () => {
            const schema = await loader.loadSchema('test.schema.json');
            expect(schema[SCHEMA_METADATA.SCHEMA_FILE]).toBe('test.schema.json');
            expect(schema[SCHEMA_METADATA.LOADED_AT]).toBeTypeOf('number');
            expect(schema[SCHEMA_METADATA.SCHEMA_SOURCE]).toBe('extension');
        });

        it('should add schema directory metadata', async () => {
            const schema = await loader.loadSchema('common/base.schema.json');
            expect(schema[SCHEMA_METADATA.SCHEMA_DIR]).toBe('common');
        });

        it('should log debug after loading', async () => {
            await loader.loadSchema('test.schema.json');
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Schema file loaded',
                expect.objectContaining({
                    filename: 'test.schema.json',
                    source: 'extension',
                })
            );
        });
    });

    // ========================================
    // loadSchema - 缓存
    // ========================================

    describe('loadSchema - caching', () => {
        it('should return cached schema on second call', async () => {
            await loader.loadSchema('test.schema.json');
            vi.mocked(fs.readFile).mockClear();

            const cached = await loader.loadSchema('test.schema.json');
            expect(cached.title).toBe('Test Schema');
            // 不应该再次读取文件
            expect(fs.readFile).not.toHaveBeenCalled();
        });

        it('should bypass cache when useCache is false', async () => {
            await loader.loadSchema('test.schema.json');
            vi.mocked(fs.readFile).mockClear();

            await loader.loadSchema('test.schema.json', false);
            // 应该再次读取文件
            expect(fs.readFile).toHaveBeenCalled();
        });
    });

    // ========================================
    // loadSchema - 错误处理
    // ========================================

    describe('loadSchema - error handling', () => {
        it('should throw when file does not exist', async () => {
            vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

            await expect(loader.loadSchema('nonexistent.json')).rejects.toThrow();
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to load schema file',
                expect.any(Error),
                expect.objectContaining({ filename: 'nonexistent.json' })
            );
        });

        it('should throw when JSON is invalid', async () => {
            vi.mocked(fs.readFile).mockResolvedValue('{ invalid json }');

            await expect(loader.loadSchema('bad.json')).rejects.toThrow();
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    // ========================================
    // clearCache
    // ========================================

    describe('clearCache', () => {
        it('should clear all cached schemas', async () => {
            await loader.loadSchema('test.schema.json');
            loader.clearCache();

            vi.mocked(fs.readFile).mockClear();
            await loader.loadSchema('test.schema.json');
            // 缓存已清除，应该重新读取文件
            expect(fs.readFile).toHaveBeenCalled();
        });

        it('should log debug when clearing cache', () => {
            loader.clearCache();
            expect(mockLogger.debug).toHaveBeenCalledWith('Schema cache cleared');
        });
    });

    // ========================================
    // reloadSchema
    // ========================================

    describe('reloadSchema', () => {
        it('should reload schema bypassing cache', async () => {
            await loader.loadSchema('test.schema.json');
            vi.mocked(fs.readFile).mockClear();

            await loader.reloadSchema('test.schema.json');
            // 应该重新读取文件
            expect(fs.readFile).toHaveBeenCalled();
        });

        it('should log info when reloading', async () => {
            await loader.reloadSchema('test.schema.json');
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Reloading schema file',
                expect.objectContaining({ filename: 'test.schema.json' })
            );
        });
    });

    // ========================================
    // 工作区 Schema 目录
    // ========================================

    describe('workspace schema directory', () => {
        it('should prioritize workspace schema directory', async () => {
            const workspaceDir = '/workspace/.craftengine/schemas';
            const loaderWithWorkspace = new SchemaFileLoader(
                schemasDir,
                mockLogger,
                10,
                workspaceDir
            );

            // 模拟：工作区路径和扩展路径都存在
            vi.mocked(fs.access).mockResolvedValue(undefined);

            const schema = await loaderWithWorkspace.loadSchema('test.schema.json');
            // 工作区路径优先，所以 source 应该是 workspace
            expect(schema[SCHEMA_METADATA.SCHEMA_SOURCE]).toBe('workspace');
        });

        it('should fall back to extension directory when workspace file not found', async () => {
            const workspaceDir = '/workspace/.craftengine/schemas';
            const loaderWithWorkspace = new SchemaFileLoader(
                schemasDir,
                mockLogger,
                10,
                workspaceDir
            );

            // 工作区文件不存在（第一次 access 调用），扩展目录文件存在（后续调用）
            vi.mocked(fs.access)
                .mockRejectedValueOnce(new Error('ENOENT'))  // resolveSchemaPath: workspace path
                .mockResolvedValue(undefined);  // loadSchema: extension path

            const schema = await loaderWithWorkspace.loadSchema('test.schema.json');
            expect(schema[SCHEMA_METADATA.SCHEMA_SOURCE]).toBe('extension');
        });

        it('should update workspace schema directory', () => {
            loader.setWorkspaceSchemaDir('/new/workspace/schemas');
            expect(loader.getWorkspaceSchemaDir()).toBe('/new/workspace/schemas');
        });

        it('should clear cache when workspace directory changes', async () => {
            await loader.loadSchema('test.schema.json');
            loader.setWorkspaceSchemaDir('/new/workspace/schemas');

            vi.mocked(fs.readFile).mockClear();
            await loader.loadSchema('test.schema.json');
            // 缓存应该已被清除
            expect(fs.readFile).toHaveBeenCalled();
        });

        it('should not clear cache when setting same directory', async () => {
            loader.setWorkspaceSchemaDir('/some/dir');
            await loader.loadSchema('test.schema.json');

            vi.mocked(fs.readFile).mockClear();
            loader.setWorkspaceSchemaDir('/some/dir');
            await loader.loadSchema('test.schema.json');
            // 缓存不应该被清除
            expect(fs.readFile).not.toHaveBeenCalled();
        });
    });
});
