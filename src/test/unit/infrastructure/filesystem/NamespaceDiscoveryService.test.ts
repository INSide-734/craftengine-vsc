/**
 * NamespaceDiscoveryService 单元测试
 *
 * 测试命名空间发现服务的所有功能，包括：
 * - 命名空间验证
 * - 资源路径验证
 * - 资源位置解析
 * - 命名空间发现
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NamespaceDiscoveryService } from '../../../../infrastructure/filesystem/NamespaceDiscoveryService';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import * as fs from 'fs';

// Mock fs
vi.mock('fs', () => ({
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
}));

// Mock vscode workspace
vi.mock('vscode', () => ({
    workspace: {
        workspaceFolders: [],
    },
}));

// Mock ServiceContainer
vi.mock('../../../../infrastructure/ServiceContainer', () => ({
    ServiceContainer: {
        tryGetService: vi.fn(() => null),
    },
}));

// Mock ResourcePackDiscovery
vi.mock('../../../../infrastructure/filesystem/ResourcePackDiscovery', () => ({
    ResourcePackDiscovery: {
        discoverInWorkspace: vi.fn(() => []),
    },
}));

describe('NamespaceDiscoveryService', () => {
    let service: NamespaceDiscoveryService;
    let mockLogger: ILogger;

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

        service = new NamespaceDiscoveryService(mockLogger);

        // 重置所有 mock
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    // ========================================
    // isValidNamespace 测试
    // ========================================

    describe('isValidNamespace', () => {
        it('should return true for valid namespace', () => {
            expect(service.isValidNamespace('minecraft')).toBe(true);
            expect(service.isValidNamespace('my_mod')).toBe(true);
            expect(service.isValidNamespace('mypack123')).toBe(true);
        });

        it('should return true for namespace with allowed characters', () => {
            expect(service.isValidNamespace('my-pack')).toBe(true);
            expect(service.isValidNamespace('my.pack')).toBe(true);
            expect(service.isValidNamespace('my_pack')).toBe(true);
        });

        it('should return false for namespace with uppercase', () => {
            expect(service.isValidNamespace('MyMod')).toBe(false);
            expect(service.isValidNamespace('MINECRAFT')).toBe(false);
        });

        it('should return false for namespace starting with number', () => {
            expect(service.isValidNamespace('123mod')).toBe(false);
        });

        it('should return false for namespace with spaces', () => {
            expect(service.isValidNamespace('my mod')).toBe(false);
        });

        it('should return false for empty string', () => {
            expect(service.isValidNamespace('')).toBe(false);
        });

        it('should return false for null/undefined', () => {
            expect(service.isValidNamespace(null as any)).toBe(false);
            expect(service.isValidNamespace(undefined as any)).toBe(false);
        });

        it('should return false for namespace with invalid characters', () => {
            expect(service.isValidNamespace('my@mod')).toBe(false);
            expect(service.isValidNamespace('my:mod')).toBe(false);
            expect(service.isValidNamespace('my/mod')).toBe(false);
        });
    });

    // ========================================
    // isValidPath 测试
    // ========================================

    describe('isValidPath', () => {
        it('should return true for valid path', () => {
            expect(service.isValidPath('item/sword')).toBe(true);
            expect(service.isValidPath('models/item/diamond_sword')).toBe(true);
        });

        it('should return true for path with allowed characters', () => {
            expect(service.isValidPath('my-item')).toBe(true);
            expect(service.isValidPath('my_item')).toBe(true);
            expect(service.isValidPath('my.item')).toBe(true);
        });

        it('should return false for path with uppercase', () => {
            expect(service.isValidPath('Item/Sword')).toBe(false);
        });

        it('should return false for empty string', () => {
            expect(service.isValidPath('')).toBe(false);
        });

        it('should return false for null/undefined', () => {
            expect(service.isValidPath(null as any)).toBe(false);
            expect(service.isValidPath(undefined as any)).toBe(false);
        });

        it('should return false for path with invalid characters', () => {
            expect(service.isValidPath('item@sword')).toBe(false);
            expect(service.isValidPath('item:sword')).toBe(false);
        });
    });

    // ========================================
    // parseResourceLocation 测试
    // ========================================

    describe('parseResourceLocation', () => {
        it('should parse resource location with namespace', () => {
            const result = service.parseResourceLocation('minecraft:item/sword');

            expect(result.isValid).toBe(true);
            expect(result.namespace).toBe('minecraft');
            expect(result.path).toBe('item/sword');
        });

        it('should parse resource location without namespace', () => {
            const result = service.parseResourceLocation('item/sword');

            expect(result.isValid).toBe(true);
            expect(result.namespace).toBeNull();
            expect(result.path).toBe('item/sword');
        });

        it('should return invalid for invalid namespace', () => {
            const result = service.parseResourceLocation('MyMod:item/sword');

            expect(result.isValid).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should return invalid for invalid path', () => {
            const result = service.parseResourceLocation('minecraft:Item/Sword');

            expect(result.isValid).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should return invalid for empty string', () => {
            const result = service.parseResourceLocation('');

            expect(result.isValid).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should trim whitespace', () => {
            const result = service.parseResourceLocation('  minecraft:item/sword  ');

            expect(result.isValid).toBe(true);
            expect(result.namespace).toBe('minecraft');
        });
    });

    // ========================================
    // isValidResourceLocation 测试
    // ========================================

    describe('isValidResourceLocation', () => {
        it('should return true for valid resource location', () => {
            expect(service.isValidResourceLocation('minecraft:item/sword')).toBe(true);
        });

        it('should return true for path only', () => {
            expect(service.isValidResourceLocation('item/sword')).toBe(true);
        });

        it('should return false for invalid location', () => {
            expect(service.isValidResourceLocation('MyMod:Item/Sword')).toBe(false);
        });
    });

    // ========================================
    // buildResourceLocation 测试
    // ========================================

    describe('buildResourceLocation', () => {
        it('should build resource location with namespace', () => {
            const result = service.buildResourceLocation('minecraft', 'item/sword');

            expect(result).toBe('minecraft:item/sword');
        });

        it('should return path only when namespace is empty', () => {
            const result = service.buildResourceLocation('', 'item/sword');

            expect(result).toBe('item/sword');
        });
    });

    // ========================================
    // normalizeResourceLocation 测试
    // ========================================

    describe('normalizeResourceLocation', () => {
        it('should normalize to lowercase', () => {
            const result = service.normalizeResourceLocation('Minecraft:Item/Sword');

            expect(result).toBe('minecraft:item/sword');
        });

        it('should normalize path separators', () => {
            const result = service.normalizeResourceLocation('minecraft:item\\sword');

            expect(result).toBe('minecraft:item/sword');
        });

        it('should add default namespace when requested', () => {
            const result = service.normalizeResourceLocation('item/sword', true);

            expect(result).toBe('minecraft:item/sword');
        });

        it('should not add default namespace when not requested', () => {
            const result = service.normalizeResourceLocation('item/sword', false);

            expect(result).toBe('item/sword');
        });

        it('should return null for invalid input', () => {
            const result = service.normalizeResourceLocation('');

            expect(result).toBeNull();
        });

        it('should return null for null/undefined', () => {
            expect(service.normalizeResourceLocation(null as any)).toBeNull();
            expect(service.normalizeResourceLocation(undefined as any)).toBeNull();
        });
    });

    // ========================================
    // compareResourceLocations 测试
    // ========================================

    describe('compareResourceLocations', () => {
        it('should return true for equal locations', () => {
            expect(service.compareResourceLocations('minecraft:item/sword', 'minecraft:item/sword')).toBe(true);
        });

        it('should return true for normalized equal locations', () => {
            expect(service.compareResourceLocations('Minecraft:Item/Sword', 'minecraft:item/sword')).toBe(true);
        });

        it('should return true when one has default namespace', () => {
            expect(service.compareResourceLocations('minecraft:item/sword', 'item/sword')).toBe(true);
        });

        it('should return false for different locations', () => {
            expect(service.compareResourceLocations('minecraft:item/sword', 'minecraft:item/axe')).toBe(false);
        });

        it('should return false for invalid locations', () => {
            expect(service.compareResourceLocations('', 'minecraft:item/sword')).toBe(false);
        });
    });

    // ========================================
    // normalizeNamespace 测试
    // ========================================

    describe('normalizeNamespace', () => {
        it('should convert to lowercase', () => {
            expect(service.normalizeNamespace('MyMod')).toBe('mymod');
        });

        it('should replace spaces with underscores', () => {
            expect(service.normalizeNamespace('my mod')).toBe('my_mod');
        });

        it('should replace invalid characters with underscores', () => {
            expect(service.normalizeNamespace('my@mod')).toBe('my_mod');
        });

        it('should add prefix for names starting with number', () => {
            const result = service.normalizeNamespace('123mod');
            expect(result).toMatch(/^[a-z]/);
        });

        it('should return null for empty string', () => {
            expect(service.normalizeNamespace('')).toBeNull();
        });

        it('should return null for null/undefined', () => {
            expect(service.normalizeNamespace(null as any)).toBeNull();
            expect(service.normalizeNamespace(undefined as any)).toBeNull();
        });
    });

    // ========================================
    // normalizePath 测试
    // ========================================

    describe('normalizePath', () => {
        it('should convert to lowercase', () => {
            expect(service.normalizePath('Item/Sword')).toBe('item/sword');
        });

        it('should normalize path separators', () => {
            expect(service.normalizePath('item\\sword')).toBe('item/sword');
        });

        it('should remove leading/trailing slashes', () => {
            expect(service.normalizePath('/item/sword/')).toBe('item/sword');
        });

        it('should clean consecutive slashes', () => {
            expect(service.normalizePath('item//sword')).toBe('item/sword');
        });

        it('should return null for empty string', () => {
            expect(service.normalizePath('')).toBeNull();
        });

        it('should return null for null/undefined', () => {
            expect(service.normalizePath(null as any)).toBeNull();
            expect(service.normalizePath(undefined as any)).toBeNull();
        });
    });

    // ========================================
    // getDefaultNamespace 测试
    // ========================================

    describe('getDefaultNamespace', () => {
        it('should return minecraft as default', () => {
            expect(service.getDefaultNamespace()).toBe('minecraft');
        });
    });

    // ========================================
    // discoverNamespaces 测试
    // ========================================

    describe('discoverNamespaces', () => {
        it('should discover namespaces from directory', () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readdirSync).mockReturnValue([
                { name: 'minecraft', isDirectory: () => true },
                { name: 'mymod', isDirectory: () => true },
                { name: 'file.txt', isDirectory: () => false },
            ] as any);

            const result = service.discoverNamespaces('/assets');

            expect(result).toContain('minecraft');
            expect(result).toContain('mymod');
            expect(result).not.toContain('file.txt');
        });

        it('should filter out invalid namespaces', () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readdirSync).mockReturnValue([
                { name: 'minecraft', isDirectory: () => true },
                { name: 'InvalidMod', isDirectory: () => true },
                { name: '123mod', isDirectory: () => true },
            ] as any);

            const result = service.discoverNamespaces('/assets');

            expect(result).toContain('minecraft');
            expect(result).not.toContain('InvalidMod');
            expect(result).not.toContain('123mod');
        });

        it('should return empty array for non-existent path', () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);

            const result = service.discoverNamespaces('/nonexistent');

            expect(result).toEqual([]);
        });

        it('should cache results', () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readdirSync).mockReturnValue([{ name: 'minecraft', isDirectory: () => true }] as any);

            // 第一次调用
            service.discoverNamespaces('/assets');
            // 第二次调用（应该从缓存返回）
            service.discoverNamespaces('/assets');

            // readdirSync 应该只被调用一次
            expect(fs.readdirSync).toHaveBeenCalledTimes(1);
        });

        it('should handle fs errors gracefully', () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readdirSync).mockImplementation(() => {
                throw new Error('Permission denied');
            });

            const result = service.discoverNamespaces('/assets');

            expect(result).toEqual([]);
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    // ========================================
    // clearCache 测试
    // ========================================

    describe('clearCache', () => {
        it('should clear namespace cache', () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readdirSync).mockReturnValue([{ name: 'minecraft', isDirectory: () => true }] as any);

            // 填充缓存
            service.discoverNamespaces('/assets');
            // 清除缓存
            service.clearCache();
            // 再次调用
            service.discoverNamespaces('/assets');

            // readdirSync 应该被调用两次
            expect(fs.readdirSync).toHaveBeenCalledTimes(2);
        });
    });

    // ========================================
    // 无 Logger 场景
    // ========================================

    describe('without logger', () => {
        it('should work without logger', () => {
            const serviceWithoutLogger = new NamespaceDiscoveryService();

            expect(serviceWithoutLogger.isValidNamespace('minecraft')).toBe(true);
            expect(serviceWithoutLogger.parseResourceLocation('minecraft:item/sword').isValid).toBe(true);
        });
    });
});
