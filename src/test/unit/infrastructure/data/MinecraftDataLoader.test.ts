import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MinecraftDataLoader } from '../../../../infrastructure/data/MinecraftDataLoader';
import { type IMinecraftVersionService } from '../../../../core/interfaces/IMinecraftVersionService';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import { ServiceContainer } from '../../../../infrastructure/ServiceContainer';
import { SERVICE_TOKENS } from '../../../../core/constants/ServiceTokens';

// Mock HttpUtils 模块（MinecraftDataLoader 通过 HttpUtils 发起网络请求）
const mockFetchFromMultipleSources = vi.fn();
vi.mock('../../../../infrastructure/utils/HttpUtils', () => ({
    HttpUtils: {
        fetchFromMultipleSources: (...args: unknown[]) => mockFetchFromMultipleSources(...args),
        fetchJson: vi.fn(),
        maskUrl: (url: string) => url,
    },
}));

/**
 * MinecraftDataLoader 单元测试
 *
 * 测试场景：
 * 1. 成功加载各类数据
 * 2. 所有数据源失败时返回空数组
 * 3. 各种数据类型的加载
 * 4. 标签数据加载
 * 5. URL 构建验证
 * 6. 日志记录
 */
describe('MinecraftDataLoader', () => {
    let loader: MinecraftDataLoader;
    let mockVersionService: IMinecraftVersionService;
    let mockLogger: ILogger;

    const mockEnchantmentsResponse = [
        {
            id: 16,
            name: 'sharpness',
            displayName: 'Sharpness',
            maxLevel: 5,
            category: 'weapon',
            treasureOnly: false,
            curse: false,
            weight: 10,
            exclude: ['smite', 'bane_of_arthropods'],
        },
        {
            id: 17,
            name: 'smite',
            displayName: 'Smite',
            maxLevel: 5,
            category: 'weapon',
            treasureOnly: false,
            curse: false,
            weight: 5,
            exclude: ['sharpness', 'bane_of_arthropods'],
        },
    ];

    const mockEntitiesResponse = [
        { id: 54, name: 'zombie', displayName: 'Zombie', width: 0.6, height: 1.95, type: 'mob', category: 'hostile' },
        { id: 95, name: 'player', displayName: 'Player', width: 0.6, height: 1.8, type: 'player' },
    ];

    const mockParticlesResponse = [
        { id: 0, name: 'ambient_entity_effect' },
        { id: 26, name: 'flame' },
        { id: 27, name: 'flash' },
    ];

    const mockEffectsResponse = [
        { id: 1, name: 'speed', displayName: 'Speed', type: 'good' },
        { id: 2, name: 'slowness', displayName: 'Slowness', type: 'bad' },
    ];

    const mockBiomesResponse = [
        { id: 1, name: 'plains', displayName: 'Plains', category: 'none', temperature: 0.8, precipitation: 'rain' },
        { id: 4, name: 'forest', displayName: 'Forest', category: 'forest', temperature: 0.7 },
    ];

    const mockBlocksResponse = [
        {
            id: 1,
            name: 'stone',
            displayName: 'Stone',
            hardness: 1.5,
            resistance: 6,
            stackSize: 64,
            diggable: true,
            transparent: false,
            emitLight: 0,
            filterLight: 15,
            boundingBox: 'block',
        },
        {
            id: 2,
            name: 'grass_block',
            displayName: 'Grass Block',
            hardness: 0.6,
            resistance: 0.6,
            stackSize: 64,
            diggable: true,
            transparent: false,
            states: [{ name: 'snowy', type: 'bool', values: ['true', 'false'] }],
        },
    ];

    const mockItemsResponse = [
        { id: 1, name: 'stone', displayName: 'Stone', stackSize: 64 },
        {
            id: 802,
            name: 'diamond_sword',
            displayName: 'Diamond Sword',
            stackSize: 1,
            durability: 1561,
            enchantCategories: ['weapon', 'breakable'],
            repairWith: ['diamond'],
        },
    ];

    const mockAttributesResponse = [
        { name: 'generic.max_health', resource: 'max_health', min: 1, max: 1024, default: 20 },
        { name: 'generic.attack_damage', resource: 'attack_damage', min: 0, max: 2048, default: 2 },
    ];

    const mockSoundsResponse = {
        'ambient.cave': {},
        'block.stone.break': {},
        'entity.player.hurt': {},
    };

    beforeEach(() => {
        vi.clearAllMocks();

        mockLogger = {
            info: vi.fn(),
            debug: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            createChild: vi.fn().mockReturnThis(),
        } as unknown as ILogger;

        mockVersionService = {
            getLatestRelease: vi.fn().mockResolvedValue('1.21.4'),
            getVersions: vi.fn(),
            refresh: vi.fn(),
            isValidVersion: vi.fn(),
            compareVersions: vi.fn(),
            isValidVersionFormat: vi.fn(),
            getSuggestedVersions: vi.fn(),
        };

        const mockConfigLoader = {
            getTimingConfigSync: vi.fn().mockReturnValue({
                cache: { minecraftDataCacheTTL: 3600000, versionCacheTTL: 3600000 },
                network: { requestTimeout: 10000 },
            }),
            getDataSourcesConfigSync: vi.fn().mockReturnValue({
                sources: {
                    prismarineData: {
                        primary: 'https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc',
                        mirrors: ['https://mirror1.example.com', 'https://mirror2.example.com'],
                    },
                    minecraftAssets: {
                        primary: 'https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/refs/heads',
                        mirrors: ['https://mirror1.example.com', 'https://mirror2.example.com'],
                    },
                },
                builtinSource: { identifier: '<minecraft:builtin>' },
            }),
            loadTimingConfig: vi.fn(),
            loadDataSourcesConfig: vi.fn(),
        };

        vi.spyOn(ServiceContainer, 'getService').mockImplementation((token: string | symbol) => {
            if (token === SERVICE_TOKENS.Logger) {
                return mockLogger as unknown;
            }
            if (token === SERVICE_TOKENS.MinecraftVersionService) {
                return mockVersionService as unknown;
            }
            if (token === SERVICE_TOKENS.DataConfigLoader) {
                return mockConfigLoader as unknown;
            }
            return null as unknown;
        });

        loader = new MinecraftDataLoader();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('getLatestVersion', () => {
        it('should return latest version from version service', async () => {
            const version = await loader.getLatestVersion();
            expect(version).toBe('1.21.4');
            expect(mockVersionService.getLatestRelease).toHaveBeenCalled();
        });
    });

    describe('loadEnchantments', () => {
        it('should successfully load enchantments', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(mockEnchantmentsResponse);
            const enchantments = await loader.loadEnchantments('1.21.4');
            expect(enchantments).toHaveLength(2);
            expect(enchantments[0]).toMatchObject({ id: 16, name: 'sharpness', displayName: 'Sharpness', maxLevel: 5 });
            expect(enchantments[1].name).toBe('smite');
        });

        it('should return empty array when all sources fail', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(null);
            const enchantments = await loader.loadEnchantments('1.21.4');
            expect(enchantments).toEqual([]);
            expect(mockLogger.warn).toHaveBeenCalled();
        });
    });

    describe('loadEntities', () => {
        it('should successfully load entities', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(mockEntitiesResponse);
            const entities = await loader.loadEntities('1.21.4');
            expect(entities).toHaveLength(2);
            expect(entities[0]).toMatchObject({ id: 54, name: 'zombie', displayName: 'Zombie', type: 'mob' });
        });

        it('should return empty array on failure', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(null);
            const entities = await loader.loadEntities('1.21.4');
            expect(entities).toEqual([]);
        });
    });

    describe('loadParticles', () => {
        it('should successfully load particles', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(mockParticlesResponse);
            const particles = await loader.loadParticles('1.21.4');
            expect(particles).toHaveLength(3);
            expect(particles[0]).toMatchObject({ id: 0, name: 'ambient_entity_effect' });
            expect(particles[1].name).toBe('flame');
        });
    });

    describe('loadEffects', () => {
        it('should successfully load potion effects', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(mockEffectsResponse);
            const effects = await loader.loadEffects('1.21.4');
            expect(effects).toHaveLength(2);
            expect(effects[0]).toMatchObject({ id: 1, name: 'speed', displayName: 'Speed', type: 'good' });
            expect(effects[1].type).toBe('bad');
        });
    });

    describe('loadBiomes', () => {
        it('should successfully load biomes', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(mockBiomesResponse);
            const biomes = await loader.loadBiomes('1.21.4');
            expect(biomes).toHaveLength(2);
            expect(biomes[0]).toMatchObject({ id: 1, name: 'plains', displayName: 'Plains', category: 'none' });
        });
    });

    describe('loadBlocks', () => {
        it('should successfully load blocks', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(mockBlocksResponse);
            const blocks = await loader.loadBlocks('1.21.4');
            expect(blocks).toHaveLength(2);
            expect(blocks[0]).toMatchObject({ id: 1, name: 'stone', displayName: 'Stone', hardness: 1.5 });
        });

        it('should handle blocks with states', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(mockBlocksResponse);
            const blocks = await loader.loadBlocks('1.21.4');
            const grassBlock = blocks.find((b) => b.name === 'grass_block');
            expect(grassBlock?.states).toBeDefined();
            expect(grassBlock?.states?.[0]).toMatchObject({ name: 'snowy', type: 'bool' });
        });
    });

    describe('loadItems', () => {
        it('should successfully load items', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(mockItemsResponse);
            const items = await loader.loadItems('1.21.4');
            expect(items).toHaveLength(2);
            expect(items[0]).toMatchObject({ id: 1, name: 'stone', displayName: 'Stone', stackSize: 64 });
        });

        it('should handle items with durability and enchant categories', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(mockItemsResponse);
            const items = await loader.loadItems('1.21.4');
            const sword = items.find((i) => i.name === 'diamond_sword');
            expect(sword?.durability).toBe(1561);
            expect(sword?.enchantCategories).toContain('weapon');
            expect(sword?.repairWith).toContain('diamond');
        });
    });

    describe('loadAttributes', () => {
        it('should successfully load attributes', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(mockAttributesResponse);
            const attributes = await loader.loadAttributes('1.21.4');
            expect(attributes).toHaveLength(2);
            expect(attributes[0]).toMatchObject({
                name: 'generic.max_health',
                resource: 'max_health',
                min: 1,
                max: 1024,
                default: 20,
            });
        });
    });

    describe('loadSounds', () => {
        it('should successfully load sounds', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(mockSoundsResponse);
            const sounds = await loader.loadSounds('1.21.4');
            expect(sounds).toHaveLength(3);
            expect(sounds).toContain('ambient.cave');
            expect(sounds).toContain('block.stone.break');
            expect(sounds).toContain('entity.player.hurt');
        });

        it('should return empty array when load fails', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(null);
            const sounds = await loader.loadSounds('1.21.4');
            expect(sounds).toEqual([]);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Failed to load sounds data',
                expect.objectContaining({ version: '1.21.4' }),
            );
        });
    });

    describe('loadTags', () => {
        const mockPlanksTagResponse = {
            values: ['minecraft:oak_planks', 'minecraft:spruce_planks', 'minecraft:birch_planks'],
        };
        const mockLogsTagResponse = {
            values: ['#minecraft:oak_logs', 'minecraft:birch_log'],
        };

        it('should successfully load tags', async () => {
            // 第一次调用返回标签列表，后续调用返回标签内容
            mockFetchFromMultipleSources
                .mockResolvedValueOnce(['planks.json', 'logs.json', 'wool.json'])
                .mockResolvedValueOnce(mockPlanksTagResponse)
                .mockResolvedValueOnce(mockLogsTagResponse)
                .mockResolvedValueOnce({ values: [] });

            const tags = await loader.loadTags('1.21.4', 'blocks');
            expect(tags.size).toBeGreaterThan(0);
            expect(tags.has('planks')).toBe(true);
            const planksValues = tags.get('planks');
            expect(planksValues).toContain('oak_planks');
            expect(planksValues).toContain('spruce_planks');
        });

        it('should preserve nested tag references with # prefix', async () => {
            mockFetchFromMultipleSources
                .mockResolvedValueOnce(['logs.json'])
                .mockResolvedValueOnce(mockLogsTagResponse);

            const tags = await loader.loadTags('1.21.4', 'blocks');
            const logsValues = tags.get('logs');
            expect(logsValues).toContain('#minecraft:oak_logs');
            expect(logsValues).toContain('birch_log');
        });

        it('should return empty map when tag list fails to load', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(null);
            const tags = await loader.loadTags('1.21.4', 'blocks');
            expect(tags.size).toBe(0);
        });
    });

    describe('loadBlockTags', () => {
        it('should call loadTags with blocks type', async () => {
            const loadTagsSpy = vi.spyOn(loader, 'loadTags').mockResolvedValue(new Map());
            await loader.loadBlockTags('1.21.4');
            expect(loadTagsSpy).toHaveBeenCalledWith('1.21.4', 'blocks');
        });
    });

    describe('loadItemTags', () => {
        it('should call loadTags with items type', async () => {
            const loadTagsSpy = vi.spyOn(loader, 'loadTags').mockResolvedValue(new Map());
            await loader.loadItemTags('1.21.4');
            expect(loadTagsSpy).toHaveBeenCalledWith('1.21.4', 'items');
        });
    });

    describe('loadEntityTags', () => {
        it('should call loadTags with entity_types type', async () => {
            const loadTagsSpy = vi.spyOn(loader, 'loadTags').mockResolvedValue(new Map());
            await loader.loadEntityTags('1.21.4');
            expect(loadTagsSpy).toHaveBeenCalledWith('1.21.4', 'entity_types');
        });
    });

    describe('loadFluidTags', () => {
        it('should call loadTags with fluids type', async () => {
            const loadTagsSpy = vi.spyOn(loader, 'loadTags').mockResolvedValue(new Map());
            await loader.loadFluidTags('1.21.4');
            expect(loadTagsSpy).toHaveBeenCalledWith('1.21.4', 'fluids');
        });
    });

    describe('loadGameEventTags', () => {
        it('should call loadTags with game_events type', async () => {
            const loadTagsSpy = vi.spyOn(loader, 'loadTags').mockResolvedValue(new Map());
            await loader.loadGameEventTags('1.21.4');
            expect(loadTagsSpy).toHaveBeenCalledWith('1.21.4', 'game_events');
        });
    });

    describe('URL building', () => {
        it('should pass correct URLs for PrismarineJS data', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(mockEnchantmentsResponse);
            await loader.loadEnchantments('1.21.4');

            const urls = mockFetchFromMultipleSources.mock.calls[0][0] as string[];
            expect(urls[0]).toContain('PrismarineJS/minecraft-data');
            expect(urls[0]).toContain('1.21.4');
            expect(urls[0]).toContain('enchantments.json');
        });

        it('should pass correct URLs for InventivetalentDev sounds', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(mockSoundsResponse);
            await loader.loadSounds('1.21.4');

            const urls = mockFetchFromMultipleSources.mock.calls[0][0] as string[];
            expect(urls[0]).toContain('InventivetalentDev/minecraft-assets');
            expect(urls[0]).toContain('1.21.4');
            expect(urls[0]).toContain('sounds.json');
        });
    });

    describe('Error handling', () => {
        it('should not throw error when all sources fail', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(null);
            await expect(loader.loadEnchantments('1.21.4')).resolves.toEqual([]);
        });

        it('should handle fetch exception gracefully', async () => {
            mockFetchFromMultipleSources.mockRejectedValue(new Error('Network error'));
            const enchantments = await loader.loadEnchantments('1.21.4');
            expect(enchantments).toEqual([]);
        });

        it('should handle connection refused error', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(null);
            const enchantments = await loader.loadEnchantments('1.21.4');
            expect(enchantments).toEqual([]);
        });
    });

    describe('Logging', () => {
        it('should log success after loading data', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(mockEnchantmentsResponse);
            await loader.loadEnchantments('1.21.4');
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Data file loaded successfully',
                expect.objectContaining({ version: '1.21.4', fileName: 'enchantments.json' }),
            );
        });

        it('should log warning when all sources fail', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(null);
            await loader.loadEnchantments('1.21.4');
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Failed to load data file',
                expect.objectContaining({ version: '1.21.4', fileName: 'enchantments.json' }),
            );
        });
    });

    describe('Performance', () => {
        it('should complete within reasonable time', async () => {
            mockFetchFromMultipleSources.mockResolvedValue(mockEnchantmentsResponse);
            const startTime = Date.now();
            await loader.loadEnchantments('1.21.4');
            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(5000);
        });
    });
});
