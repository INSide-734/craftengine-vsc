import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchemaFileLoader } from '../../../../infrastructure/schema/SchemaFileLoader';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import { SCHEMA_METADATA } from '../../../../core/constants/SchemaConstants';
import { SchemaNotFoundError } from '../../../../core/errors/ExtensionErrors';

// mock fs/promises
vi.mock('fs/promises', () => ({
    readFile: vi.fn(),
    access: vi.fn(),
}));

import * as fs from 'fs/promises';

const mockedReadFile = vi.mocked(fs.readFile);
const mockedAccess = vi.mocked(fs.access);

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

describe('SchemaFileLoader', () => {
    let loader: SchemaFileLoader;
    let logger: ILogger;
    const schemasDir = '/ext/schemas';
    const sampleSchema = JSON.stringify({ type: 'object', properties: { name: { type: 'string' } } });

    beforeEach(() => {
        vi.clearAllMocks();
        logger = createMockLogger();
        loader = new SchemaFileLoader(schemasDir, logger);
    });
    describe('loadSchema', () => {
        it('should load schema from extension directory', async () => {
            mockedReadFile.mockResolvedValue(sampleSchema);

            const schema = await loader.loadSchema('test.json');

            expect(schema.type).toBe('object');
            expect(schema[SCHEMA_METADATA.SCHEMA_FILE]).toBe('test.json');
            expect(schema[SCHEMA_METADATA.SCHEMA_SOURCE]).toBe('extension');
            expect(schema[SCHEMA_METADATA.LOADED_AT]).toBeDefined();
        });

        it('should return cached schema on second call', async () => {
            mockedReadFile.mockResolvedValue(sampleSchema);

            await loader.loadSchema('test.json');
            await loader.loadSchema('test.json');

            // readFile 只调用一次（第二次走缓存）
            expect(mockedReadFile).toHaveBeenCalledTimes(1);
        });

        it('should bypass cache when useCache is false', async () => {
            mockedReadFile.mockResolvedValue(sampleSchema);

            await loader.loadSchema('test.json', true);
            await loader.loadSchema('test.json', false);

            expect(mockedReadFile).toHaveBeenCalledTimes(2);
        });

        it('should return deep copy from cache (not reference)', async () => {
            mockedReadFile.mockResolvedValue(sampleSchema);

            const schema1 = await loader.loadSchema('test.json');
            schema1.type = 'modified';

            const schema2 = await loader.loadSchema('test.json');
            expect(schema2.type).toBe('object'); // 未被修改
        });

        it('should throw SchemaNotFoundError when file does not exist', async () => {
            mockedReadFile.mockRejectedValue(new Error('ENOENT'));

            await expect(loader.loadSchema('missing.json')).rejects.toThrow(SchemaNotFoundError);
        });

        it('should throw on invalid JSON', async () => {
            mockedReadFile.mockResolvedValue('not valid json{{{');

            await expect(loader.loadSchema('bad.json')).rejects.toThrow();
        });
    });

    describe('workspace schema priority', () => {
        it('should load from workspace directory when available', async () => {
            const wsDir = '/workspace/.craftengine/schemas';
            loader = new SchemaFileLoader(schemasDir, logger, 50, wsDir);

            mockedAccess.mockResolvedValue(undefined);
            mockedReadFile.mockResolvedValue(sampleSchema);

            const schema = await loader.loadSchema('test.json');
            expect(schema[SCHEMA_METADATA.SCHEMA_SOURCE]).toBe('workspace');
        });

        it('should fallback to extension directory when workspace file missing', async () => {
            const wsDir = '/workspace/.craftengine/schemas';
            loader = new SchemaFileLoader(schemasDir, logger, 50, wsDir);

            mockedAccess.mockRejectedValue(new Error('ENOENT'));
            mockedReadFile.mockResolvedValue(sampleSchema);

            const schema = await loader.loadSchema('test.json');
            expect(schema[SCHEMA_METADATA.SCHEMA_SOURCE]).toBe('extension');
        });
    });

    describe('setWorkspaceSchemaDir', () => {
        it('should clear cache when directory changes', async () => {
            mockedReadFile.mockResolvedValue(sampleSchema);
            await loader.loadSchema('test.json');

            loader.setWorkspaceSchemaDir('/new/dir');

            // 缓存已清除，需要重新读取
            mockedReadFile.mockResolvedValue(sampleSchema);
            mockedAccess.mockResolvedValue(undefined);
            await loader.loadSchema('test.json');
            expect(mockedReadFile).toHaveBeenCalledTimes(2);
        });

        it('should not clear cache when setting same directory', async () => {
            loader.setWorkspaceSchemaDir('/dir1');
            loader.setWorkspaceSchemaDir('/dir1'); // 相同目录
            // logger.info 只调用一次（第一次设置时）
            expect(logger.info).toHaveBeenCalledTimes(1);
        });
    });

    describe('getWorkspaceSchemaDir', () => {
        it('should return undefined by default', () => {
            expect(loader.getWorkspaceSchemaDir()).toBeUndefined();
        });

        it('should return set directory', () => {
            loader.setWorkspaceSchemaDir('/ws/schemas');
            expect(loader.getWorkspaceSchemaDir()).toBe('/ws/schemas');
        });
    });

    describe('clearCache', () => {
        it('should clear all cached schemas', async () => {
            mockedReadFile.mockResolvedValue(sampleSchema);
            await loader.loadSchema('a.json');
            await loader.loadSchema('b.json');

            loader.clearCache();

            // 需要重新读取
            await loader.loadSchema('a.json');
            expect(mockedReadFile).toHaveBeenCalledTimes(3);
        });
    });

    describe('reloadSchema', () => {
        it('should force reload bypassing cache', async () => {
            mockedReadFile.mockResolvedValue(sampleSchema);
            await loader.loadSchema('test.json');
            await loader.reloadSchema('test.json');

            expect(mockedReadFile).toHaveBeenCalledTimes(2);
        });
    });
});
