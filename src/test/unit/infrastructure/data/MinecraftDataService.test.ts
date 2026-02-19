import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ILogger } from '../../../../core/interfaces/ILogger';

// Mock data loader 实例 - 在 beforeEach 中初始化
const mockDataLoaderInstance = {
    getLatestVersion: vi.fn(),
    loadEnchantments: vi.fn(),
    loadEntities: vi.fn(),
    loadParticles: vi.fn(),
    loadEffects: vi.fn(),
    loadBiomes: vi.fn(),
    loadSounds: vi.fn(),
    loadBlocks: vi.fn(),
    loadItems: vi.fn(),
    loadAttributes: vi.fn(),
    loadBlockTags: vi.fn(),
    loadItemTags: vi.fn(),
    loadEntityTags: vi.fn(),
    loadFluidTags: vi.fn(),
    loadGameEventTags: vi.fn(),
    loadDamageTypes: vi.fn(),
    loadGameEvents: vi.fn()
};

// Mock MinecraftDataLoader - 必须在 import 之前
vi.mock('../../../../infrastructure/data/MinecraftDataLoader', () => {
    return {
        MinecraftDataLoader: function() {
            return mockDataLoaderInstance;
        }
    };
});

// 在 mock 之后导入
import { MinecraftDataService } from '../../../../infrastructure/data/MinecraftDataService';

/**
 * MinecraftDataService 单元测试
 *
 * 测试场景：
 * 1. 缓存机制（TTL、并发控制）
 * 2. 数据转换（原始数据 -> 统一接口）
 * 3. 验证方法（O(1) 查找）
 * 4. 名称规范化（命名空间处理）
 * 5. 标签处理（嵌套标签、反向索引）
 */
describe('MinecraftDataService', () => {
    let service: MinecraftDataService;
    let mockLogger: ILogger;

    // Mock 数据
    const mockEnchantmentsRaw = [
        {
            id: 16,
            name: 'sharpness',
            displayName: 'Sharpness',
            maxLevel: 5,
            category: 'weapon',
            treasureOnly: false,
            curse: false,
            weight: 10,
            exclude: ['smite']
        },
        {
            id: 17,
            name: 'smite',
            displayName: 'Smite',
            maxLevel: 5,
            category: 'weapon',
            treasureOnly: false,
            curse: false
        }
    ];

    const mockEntitiesRaw = [
        {
            id: 54,
            name: 'zombie',
            displayName: 'Zombie',
            width: 0.6,
            height: 1.95,
            type: 'mob',
            category: 'hostile'
        },
        {
            id: 95,
            name: 'player',
            displayName: 'Player',
            width: 0.6,
            height: 1.8,
            type: 'player'
        }
    ];

    const mockParticlesRaw = [
        { id: 0, name: 'ambient_entity_effect' },
        { id: 26, name: 'flame' }
    ];

    const mockEffectsRaw = [
        { id: 1, name: 'speed', displayName: 'Speed', type: 'good' },
        { id: 2, name: 'slowness', displayName: 'Slowness', type: 'bad' }
    ];

    const mockBiomesRaw = [
        {
            id: 1,
            name: 'plains',
            displayName: 'Plains',
            category: 'none',
            temperature: 0.8,
            precipitation: 'rain'
        }
    ];

    const mockSoundNames = [
        'ambient.cave',
        'block.stone.break',
        'entity.player.hurt'
    ];

    const mockBlocksRaw = [
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
            boundingBox: 'block'
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
            states: [
                { name: 'snowy', type: 'bool', values: ['true', 'false'] }
            ]
        }
    ];

    const mockItemsRaw = [
        {
            id: 1,
            name: 'stone',
            displayName: 'Stone',
            stackSize: 64
        },
        {
            id: 802,
            name: 'diamond_sword',
            displayName: 'Diamond Sword',
            stackSize: 1,
            durability: 1561,
            enchantCategories: ['weapon'],
            repairWith: ['diamond']
        }
    ];

    const mockAttributesRaw = [
        {
            name: 'generic.max_health',
            resource: 'max_health',
            min: 1,
            max: 1024,
            default: 20
        },
        {
            name: 'generic.attack_damage',
            resource: 'attack_damage',
            min: 0,
            max: 2048,
            default: 2
        }
    ];

    const mockBlockTags = new Map([
        ['planks', ['oak_planks', 'spruce_planks', 'birch_planks']],
        ['logs', ['oak_log', 'spruce_log', '#oak_logs']]
    ]);

    const mockItemTags = new Map([
        ['swords', ['diamond_sword', 'iron_sword', 'wooden_sword']]
    ]);

    const mockEntityTags = new Map([
        ['undead', ['zombie', 'skeleton', 'wither']]
    ]);

    const mockFluidTags = new Map([
        ['water', ['water', 'flowing_water']]
    ]);

    const mockGameEventTags = new Map<string, string[]>();

    const mockDamageTypesRaw = [
        {
            name: 'in_fire',
            scaling: 'when_caused_by_living_non_player',
            exhaustion: 0.1,
            effects: 'burning'
        },
        {
            name: 'arrow',
            scaling: 'when_caused_by_living_non_player',
            exhaustion: 0.1
        }
    ];

    const mockGameEventsRaw = [
        { id: 1, name: 'block_change' },
        { id: 2, name: 'block_activate' }
    ];

    beforeEach(() => {
        // 重置所有 Mock
        vi.clearAllMocks();

        // Mock Logger
        mockLogger = {
            info: vi.fn(),
            debug: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            createChild: vi.fn().mockReturnThis()
        } as unknown as ILogger;

        // Mock DataConfigLoader
        const mockConfigLoader = {
            getTimingConfigSync: vi.fn().mockReturnValue({
                cache: {
                    minecraftDataCacheTTL: 3600000
                },
                network: {
                    requestTimeout: 10000
                }
            }),
            getDataSourcesConfigSync: vi.fn().mockReturnValue({
                sources: {
                    prismarineData: {
                        primary: 'https://example.com',
                        mirrors: []
                    },
                    minecraftAssets: {
                        primary: 'https://example.com',
                        mirrors: []
                    }
                },
                builtinSource: {
                    identifier: '<minecraft:builtin>'
                }
            }),
            loadTimingConfig: vi.fn().mockResolvedValue({
                cache: {
                    minecraftDataCacheTTL: 3600000
                }
            })
        };

        // 设置 mock data loader 实例的返回值
        mockDataLoaderInstance.getLatestVersion.mockResolvedValue('1.21.4');
        mockDataLoaderInstance.loadEnchantments.mockResolvedValue(mockEnchantmentsRaw);
        mockDataLoaderInstance.loadEntities.mockResolvedValue(mockEntitiesRaw);
        mockDataLoaderInstance.loadParticles.mockResolvedValue(mockParticlesRaw);
        mockDataLoaderInstance.loadEffects.mockResolvedValue(mockEffectsRaw);
        mockDataLoaderInstance.loadBiomes.mockResolvedValue(mockBiomesRaw);
        mockDataLoaderInstance.loadSounds.mockResolvedValue(mockSoundNames);
        mockDataLoaderInstance.loadBlocks.mockResolvedValue(mockBlocksRaw);
        mockDataLoaderInstance.loadItems.mockResolvedValue(mockItemsRaw);
        mockDataLoaderInstance.loadAttributes.mockResolvedValue(mockAttributesRaw);
        mockDataLoaderInstance.loadBlockTags.mockResolvedValue(mockBlockTags);
        mockDataLoaderInstance.loadItemTags.mockResolvedValue(mockItemTags);
        mockDataLoaderInstance.loadEntityTags.mockResolvedValue(mockEntityTags);
        mockDataLoaderInstance.loadFluidTags.mockResolvedValue(mockFluidTags);
        mockDataLoaderInstance.loadGameEventTags.mockResolvedValue(mockGameEventTags);
        mockDataLoaderInstance.loadDamageTypes.mockResolvedValue(mockDamageTypesRaw);
        mockDataLoaderInstance.loadGameEvents.mockResolvedValue(mockGameEventsRaw);

        // 创建 service 实例
        service = new MinecraftDataService(mockLogger, mockConfigLoader as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('ensureLoaded', () => {
        it('should load all data on first call', async () => {
            await service.ensureLoaded();

            expect(mockDataLoaderInstance.getLatestVersion).toHaveBeenCalled();
            expect(mockDataLoaderInstance.loadEnchantments).toHaveBeenCalledWith('1.21.4');
            expect(mockDataLoaderInstance.loadEntities).toHaveBeenCalledWith('1.21.4');
            expect(mockDataLoaderInstance.loadParticles).toHaveBeenCalledWith('1.21.4');
            expect(mockDataLoaderInstance.loadEffects).toHaveBeenCalledWith('1.21.4');
            expect(mockDataLoaderInstance.loadBiomes).toHaveBeenCalledWith('1.21.4');
            expect(mockDataLoaderInstance.loadSounds).toHaveBeenCalledWith('1.21.4');
            expect(mockDataLoaderInstance.loadBlocks).toHaveBeenCalledWith('1.21.4');
            expect(mockDataLoaderInstance.loadItems).toHaveBeenCalledWith('1.21.4');
            expect(mockDataLoaderInstance.loadAttributes).toHaveBeenCalledWith('1.21.4');
            expect(mockDataLoaderInstance.loadBlockTags).toHaveBeenCalledWith('1.21.4');
            expect(mockDataLoaderInstance.loadItemTags).toHaveBeenCalledWith('1.21.4');
            expect(mockDataLoaderInstance.loadEntityTags).toHaveBeenCalledWith('1.21.4');
        });

        it('should use cache on subsequent calls', async () => {
            await service.ensureLoaded();
            await service.ensureLoaded();

            // 应该只加载一次
            expect(mockDataLoaderInstance.loadEnchantments).toHaveBeenCalledTimes(1);
        });

        it('should share promise for concurrent calls', async () => {
            // 并发调用
            const promise1 = service.ensureLoaded();
            const promise2 = service.ensureLoaded();

            await Promise.all([promise1, promise2]);

            // 应该只加载一次
            expect(mockDataLoaderInstance.loadEnchantments).toHaveBeenCalledTimes(1);
        });

        it('should set loaded flag after successful load', async () => {
            expect(service.isLoaded()).toBe(false);

            await service.ensureLoaded();

            expect(service.isLoaded()).toBe(true);
        });

        it('should set data version after load', async () => {
            await service.ensureLoaded();

            expect(service.getDataVersion()).toBe('1.21.4');
        });
    });

    describe('refresh', () => {
        it('should reload data even if cache is valid', async () => {
            await service.ensureLoaded();
            await service.refresh();

            expect(mockDataLoaderInstance.loadEnchantments).toHaveBeenCalledTimes(2);
        });
    });

    describe('Data getters', () => {
        beforeEach(async () => {
            await service.ensureLoaded();
        });

        describe('getEnchantments', () => {
            it('should return converted enchantment data', () => {
                const enchantments = service.getEnchantments();

                expect(enchantments).toHaveLength(2);
                expect(enchantments[0]).toMatchObject({
                    id: 16,
                    name: 'sharpness',
                    displayName: 'Sharpness',
                    maxLevel: 5,
                    category: 'weapon',
                    treasureOnly: false,
                    curse: false
                });
            });
        });

        describe('getEntities', () => {
            it('should return converted entity data', () => {
                const entities = service.getEntities();

                expect(entities).toHaveLength(2);
                expect(entities[0]).toMatchObject({
                    id: 54,
                    name: 'zombie',
                    displayName: 'Zombie',
                    type: 'mob'
                });
            });
        });

        describe('getParticles', () => {
            it('should return converted particle data', () => {
                const particles = service.getParticles();

                expect(particles).toHaveLength(2);
                expect(particles[0]).toMatchObject({
                    id: 0,
                    name: 'ambient_entity_effect'
                });
            });
        });

        describe('getPotionEffects', () => {
            it('should return converted potion effect data', () => {
                const effects = service.getPotionEffects();

                expect(effects).toHaveLength(2);
                expect(effects[0]).toMatchObject({
                    id: 1,
                    name: 'speed',
                    displayName: 'Speed',
                    type: 'good'
                });
            });
        });

        describe('getBiomes', () => {
            it('should return converted biome data', () => {
                const biomes = service.getBiomes();

                expect(biomes).toHaveLength(1);
                expect(biomes[0]).toMatchObject({
                    id: 1,
                    name: 'plains',
                    displayName: 'Plains',
                    category: 'none'
                });
            });
        });

        describe('getSounds', () => {
            it('should return sound data', () => {
                const sounds = service.getSounds();

                expect(sounds).toHaveLength(3);
                expect(sounds[0]).toMatchObject({ name: 'ambient.cave' });
            });
        });

        describe('getBlocks', () => {
            it('should return converted block data', () => {
                const blocks = service.getBlocks();

                expect(blocks).toHaveLength(2);
                expect(blocks[0]).toMatchObject({
                    id: 1,
                    name: 'stone',
                    displayName: 'Stone'
                });
            });

            it('should include block states', () => {
                const blocks = service.getBlocks();
                const grassBlock = blocks.find(b => b.name === 'grass_block');

                expect(grassBlock?.states).toBeDefined();
                expect(grassBlock?.states?.[0]).toMatchObject({
                    name: 'snowy',
                    type: 'bool'
                });
            });
        });

        describe('getItems', () => {
            it('should return converted item data', () => {
                const items = service.getItems();

                expect(items).toHaveLength(2);
                expect(items[0]).toMatchObject({
                    id: 1,
                    name: 'stone',
                    displayName: 'Stone',
                    stackSize: 64
                });
            });
        });

        describe('getAttributes', () => {
            it('should return converted attribute data', () => {
                const attributes = service.getAttributes();

                expect(attributes).toHaveLength(2);
                expect(attributes[0]).toMatchObject({
                    name: 'generic.max_health',
                    resource: 'max_health',
                    min: 1,
                    max: 1024,
                    default: 20
                });
            });
        });

        describe('getTags', () => {
            it('should return block tags', () => {
                const tags = service.getTags('blocks');

                expect(tags.length).toBeGreaterThan(0);
                const planksTag = tags.find(t => t.name === 'planks');
                expect(planksTag).toBeDefined();
                expect(planksTag?.type).toBe('blocks');
                expect(planksTag?.values).toContain('oak_planks');
            });

            it('should return item tags', () => {
                const tags = service.getTags('items');

                expect(tags.length).toBeGreaterThan(0);
                const swordsTag = tags.find(t => t.name === 'swords');
                expect(swordsTag).toBeDefined();
            });

            it('should return entity tags', () => {
                const tags = service.getTags('entity_types');

                expect(tags.length).toBeGreaterThan(0);
                const undeadTag = tags.find(t => t.name === 'undead');
                expect(undeadTag).toBeDefined();
            });
        });

        describe('getAllTags', () => {
            it('should return all tags from all types', () => {
                const allTags = service.getAllTags();

                expect(allTags.length).toBeGreaterThan(0);
                // 应该包含不同类型的标签
                const blockTag = allTags.find(t => t.type === 'blocks');
                const itemTag = allTags.find(t => t.type === 'items');
                expect(blockTag).toBeDefined();
                expect(itemTag).toBeDefined();
            });
        });
    });

    describe('Name lists', () => {
        beforeEach(async () => {
            await service.ensureLoaded();
        });

        it('should return enchantment names', () => {
            const names = service.getEnchantmentNames();
            expect(names).toContain('sharpness');
            expect(names).toContain('smite');
        });

        it('should return entity names', () => {
            const names = service.getEntityNames();
            expect(names).toContain('zombie');
            expect(names).toContain('player');
        });

        it('should return particle names', () => {
            const names = service.getParticleNames();
            expect(names).toContain('ambient_entity_effect');
            expect(names).toContain('flame');
        });

        it('should return potion effect names', () => {
            const names = service.getPotionEffectNames();
            expect(names).toContain('speed');
            expect(names).toContain('slowness');
        });

        it('should return biome names', () => {
            const names = service.getBiomeNames();
            expect(names).toContain('plains');
        });

        it('should return sound names', () => {
            const names = service.getSoundNames();
            expect(names).toContain('ambient.cave');
            expect(names).toContain('entity.player.hurt');
        });

        it('should return block names', () => {
            const names = service.getBlockNames();
            expect(names).toContain('stone');
            expect(names).toContain('grass_block');
        });

        it('should return item names', () => {
            const names = service.getItemNames();
            expect(names).toContain('stone');
            expect(names).toContain('diamond_sword');
        });

        it('should return attribute names', () => {
            const names = service.getAttributeNames();
            expect(names).toContain('generic.max_health');
            expect(names).toContain('generic.attack_damage');
        });

        it('should return tag names', () => {
            const names = service.getTagNames('blocks');
            expect(names).toContain('planks');
            expect(names).toContain('logs');
        });
    });

    describe('Validation methods', () => {
        beforeEach(async () => {
            await service.ensureLoaded();
        });

        describe('isValidEnchantment', () => {
            it('should return true for valid enchantment', () => {
                expect(service.isValidEnchantment('sharpness')).toBe(true);
            });

            it('should return true for valid enchantment with namespace', () => {
                expect(service.isValidEnchantment('minecraft:sharpness')).toBe(true);
            });

            it('should return false for invalid enchantment', () => {
                expect(service.isValidEnchantment('invalid_enchantment')).toBe(false);
            });
        });

        describe('isValidEntity', () => {
            it('should return true for valid entity', () => {
                expect(service.isValidEntity('zombie')).toBe(true);
            });

            it('should return true for valid entity with namespace', () => {
                expect(service.isValidEntity('minecraft:zombie')).toBe(true);
            });

            it('should return false for invalid entity', () => {
                expect(service.isValidEntity('invalid_entity')).toBe(false);
            });
        });

        describe('isValidParticle', () => {
            it('should return true for valid particle', () => {
                expect(service.isValidParticle('flame')).toBe(true);
            });

            it('should return true for valid particle with namespace', () => {
                expect(service.isValidParticle('minecraft:flame')).toBe(true);
            });

            it('should return false for invalid particle', () => {
                expect(service.isValidParticle('invalid_particle')).toBe(false);
            });
        });

        describe('isValidPotionEffect', () => {
            it('should return true for valid potion effect', () => {
                expect(service.isValidPotionEffect('speed')).toBe(true);
            });

            it('should return true for valid potion effect with namespace', () => {
                expect(service.isValidPotionEffect('minecraft:speed')).toBe(true);
            });

            it('should return false for invalid potion effect', () => {
                expect(service.isValidPotionEffect('invalid_effect')).toBe(false);
            });
        });

        describe('isValidBiome', () => {
            it('should return true for valid biome', () => {
                expect(service.isValidBiome('plains')).toBe(true);
            });

            it('should return true for valid biome with namespace', () => {
                expect(service.isValidBiome('minecraft:plains')).toBe(true);
            });

            it('should return false for invalid biome', () => {
                expect(service.isValidBiome('invalid_biome')).toBe(false);
            });
        });

        describe('isValidSound', () => {
            it('should return true for valid sound', () => {
                expect(service.isValidSound('ambient.cave')).toBe(true);
            });

            it('should return false for invalid sound', () => {
                expect(service.isValidSound('invalid.sound')).toBe(false);
            });
        });

        describe('isValidBlock', () => {
            it('should return true for valid block', () => {
                expect(service.isValidBlock('stone')).toBe(true);
            });

            it('should return true for valid block with namespace', () => {
                expect(service.isValidBlock('minecraft:stone')).toBe(true);
            });

            it('should return false for invalid block', () => {
                expect(service.isValidBlock('invalid_block')).toBe(false);
            });
        });

        describe('isValidItem', () => {
            it('should return true for valid item', () => {
                expect(service.isValidItem('diamond_sword')).toBe(true);
            });

            it('should return true for valid item with namespace', () => {
                expect(service.isValidItem('minecraft:diamond_sword')).toBe(true);
            });

            it('should return false for invalid item', () => {
                expect(service.isValidItem('invalid_item')).toBe(false);
            });
        });

        describe('isValidAttribute', () => {
            it('should return true for valid attribute with full name', () => {
                expect(service.isValidAttribute('generic.max_health')).toBe(true);
            });

            it('should return true for valid attribute with namespace', () => {
                expect(service.isValidAttribute('minecraft:generic.max_health')).toBe(true);
            });

            it('should return true for valid attribute with short name', () => {
                expect(service.isValidAttribute('max_health')).toBe(true);
            });

            it('should return false for invalid attribute', () => {
                expect(service.isValidAttribute('invalid_attribute')).toBe(false);
            });
        });

        describe('isValidTag', () => {
            it('should return true for valid block tag', () => {
                expect(service.isValidTag('blocks', 'planks')).toBe(true);
            });

            it('should return true for valid tag with # prefix', () => {
                expect(service.isValidTag('blocks', '#planks')).toBe(true);
            });

            it('should return true for valid tag with namespace', () => {
                expect(service.isValidTag('blocks', 'minecraft:planks')).toBe(true);
            });

            it('should return true for valid tag with # and namespace', () => {
                expect(service.isValidTag('blocks', '#minecraft:planks')).toBe(true);
            });

            it('should return false for invalid tag', () => {
                expect(service.isValidTag('blocks', 'invalid_tag')).toBe(false);
            });

            it('should return false for wrong tag type', () => {
                expect(service.isValidTag('items', 'planks')).toBe(false);
            });
        });

        describe('isInTag', () => {
            it('should return true when value is in tag', () => {
                expect(service.isInTag('blocks', 'planks', 'oak_planks')).toBe(true);
            });

            it('should return true with namespace prefix on value', () => {
                expect(service.isInTag('blocks', 'planks', 'minecraft:oak_planks')).toBe(true);
            });

            it('should return true with # prefix on tag name', () => {
                expect(service.isInTag('blocks', '#planks', 'oak_planks')).toBe(true);
            });

            it('should return false when value is not in tag', () => {
                expect(service.isInTag('blocks', 'planks', 'stone')).toBe(false);
            });

            it('should return false for non-existent tag', () => {
                expect(service.isInTag('blocks', 'non_existent', 'oak_planks')).toBe(false);
            });
        });
    });

    describe('Data conversion', () => {
        describe('convertEnchantments', () => {
            it('should handle empty array', async () => {
                mockDataLoaderInstance.loadEnchantments.mockResolvedValue([]);

                await service.ensureLoaded();
                const enchantments = service.getEnchantments();

                expect(enchantments).toEqual([]);
            });

            it('should handle null/undefined values', async () => {
                mockDataLoaderInstance.loadEnchantments.mockResolvedValue([
                    { id: 1, name: 'test', displayName: 'Test', maxLevel: 1, category: 'armor', treasureOnly: false, curse: false }
                ]);

                await service.ensureLoaded();
                const enchantments = service.getEnchantments();

                expect(enchantments[0].weight).toBeUndefined();
                expect(enchantments[0].exclude).toBeUndefined();
            });
        });

        describe('convertBlocks', () => {
            it('should convert block states correctly', async () => {
                await service.ensureLoaded();
                const blocks = service.getBlocks();
                const grassBlock = blocks.find(b => b.name === 'grass_block');

                expect(grassBlock?.states?.[0]).toEqual({
                    name: 'snowy',
                    type: 'bool',
                    values: ['true', 'false'],
                    num_values: undefined
                });
            });
        });

        describe('convertTags', () => {
            it('should convert Map to IMinecraftTag array', async () => {
                await service.ensureLoaded();
                const blockTags = service.getTags('blocks');

                expect(blockTags).toBeInstanceOf(Array);
                expect(blockTags[0]).toHaveProperty('name');
                expect(blockTags[0]).toHaveProperty('type');
                expect(blockTags[0]).toHaveProperty('values');
            });
        });
    });

    describe('Error handling', () => {
        it('should handle data loader errors gracefully', async () => {
            mockDataLoaderInstance.getLatestVersion.mockRejectedValue(new Error('Network error'));

            await service.ensureLoaded();

            // 不应抛出错误，但数据可能为空
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to load Minecraft data',
                expect.any(Error)
            );
        });

        it('should preserve previous data on refresh failure', async () => {
            // 首次加载成功
            await service.ensureLoaded();
            const enchantmentsBefore = service.getEnchantments();

            // 刷新时失败
            mockDataLoaderInstance.getLatestVersion.mockRejectedValue(new Error('Network error'));
            await service.refresh();

            // 应该保留之前的数据
            const enchantmentsAfter = service.getEnchantments();
            expect(enchantmentsAfter).toEqual(enchantmentsBefore);
        });
    });

    describe('Logging', () => {
        it('should log info when starting load', async () => {
            await service.ensureLoaded();

            expect(mockLogger.info).toHaveBeenCalledWith(
                'Loading Minecraft data',
                expect.objectContaining({ version: '1.21.4' })
            );
        });

        it('should log info when load completes', async () => {
            await service.ensureLoaded();

            expect(mockLogger.info).toHaveBeenCalledWith(
                'Minecraft data loaded successfully',
                expect.objectContaining({
                    version: '1.21.4',
                    duration: expect.any(Number),
                    counts: expect.any(Object)
                })
            );
        });

        it('should not reload when using cached data', async () => {
            await service.ensureLoaded();

            // 重置调用计数
            mockDataLoaderInstance.getLatestVersion.mockClear();

            await service.ensureLoaded();

            // 第二次调用不应触发重新加载
            expect(mockDataLoaderInstance.getLatestVersion).not.toHaveBeenCalled();
        });
    });

    describe('Performance', () => {
        beforeEach(async () => {
            await service.ensureLoaded();
        });

        it('should have O(1) validation performance', () => {
            const iterations = 10000;
            const startTime = Date.now();

            for (let i = 0; i < iterations; i++) {
                service.isValidEntity('zombie');
                service.isValidBlock('stone');
                service.isValidItem('diamond_sword');
            }

            const duration = Date.now() - startTime;
            // 10000 次验证应该在 100ms 内完成
            expect(duration).toBeLessThan(100);
        });

        it('should have fast name list retrieval', () => {
            const iterations = 1000;
            const startTime = Date.now();

            for (let i = 0; i < iterations; i++) {
                service.getEnchantmentNames();
                service.getEntityNames();
                service.getBlockNames();
            }

            const duration = Date.now() - startTime;
            // 3000 次获取应该在 50ms 内完成
            expect(duration).toBeLessThan(50);
        });

        it('should return cached name arrays (same reference)', () => {
            const names1 = service.getEnchantmentNames();
            const names2 = service.getEnchantmentNames();
            expect(names1).toBe(names2);
        });
    });

    describe('DamageTypes and GameEvents', () => {
        beforeEach(async () => {
            await service.ensureLoaded();
        });

        it('should return converted damage type data', () => {
            const damageTypes = service.getDamageTypes();
            expect(damageTypes).toHaveLength(2);
            expect(damageTypes[0]).toMatchObject({
                name: 'in_fire',
                scaling: 'when_caused_by_living_non_player',
                exhaustion: 0.1,
                effects: 'burning'
            });
        });

        it('should return converted game event data', () => {
            const gameEvents = service.getGameEvents();
            expect(gameEvents).toHaveLength(2);
            expect(gameEvents[0]).toMatchObject({
                id: 1,
                name: 'block_change'
            });
        });

        it('should return damage type names', () => {
            const names = service.getDamageTypeNames();
            expect(names).toContain('in_fire');
            expect(names).toContain('arrow');
        });

        it('should return game event names', () => {
            const names = service.getGameEventNames();
            expect(names).toContain('block_change');
            expect(names).toContain('block_activate');
        });

        it('should validate damage types', () => {
            expect(service.isValidDamageType('in_fire')).toBe(true);
            expect(service.isValidDamageType('invalid_damage')).toBe(false);
        });

        it('should validate game events', () => {
            expect(service.isValidGameEvent('block_change')).toBe(true);
            expect(service.isValidGameEvent('invalid_event')).toBe(false);
        });
    });

    describe('Promise.allSettled partial failure', () => {
        it('should handle partial data loading failure gracefully', async () => {
            // 让 enchantments 加载失败，其他正常
            mockDataLoaderInstance.loadEnchantments.mockRejectedValue(new Error('Network error'));

            await service.ensureLoaded();

            // enchantments 应该为空（fallback）
            expect(service.getEnchantments()).toEqual([]);
            // 其他数据应该正常加载
            expect(service.getEntities()).toHaveLength(2);
            expect(service.getBlocks()).toHaveLength(2);
            expect(service.getItems()).toHaveLength(2);
        });

        it('should handle multiple data loading failures', async () => {
            mockDataLoaderInstance.loadEnchantments.mockRejectedValue(new Error('Fail 1'));
            mockDataLoaderInstance.loadEntities.mockRejectedValue(new Error('Fail 2'));
            mockDataLoaderInstance.loadBlocks.mockRejectedValue(new Error('Fail 3'));

            await service.ensureLoaded();

            expect(service.getEnchantments()).toEqual([]);
            expect(service.getEntities()).toEqual([]);
            expect(service.getBlocks()).toEqual([]);
            // 未失败的数据应该正常
            expect(service.getItems()).toHaveLength(2);
            expect(service.getParticles()).toHaveLength(2);
        });

        it('should log warnings for failed data sources', async () => {
            mockDataLoaderInstance.loadEnchantments.mockRejectedValue(new Error('Network error'));

            await service.ensureLoaded();

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Failed to load enchantments'),
                expect.any(Object)
            );
        });
    });
});
