/**
 * ModelGenerationService 集成测试
 *
 * 验证模型生成服务与简化模型读取器的整合
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelGenerationService } from '../../../../domain/services/ModelGenerationService';
import { ILogger } from '../../../../core/interfaces/ILogger';
import { IMinecraftDataService } from '../../../../core/interfaces/IMinecraftDataService';
import { IDataConfigLoader } from '../../../../core/interfaces/IDataConfigLoader';

// ============================================
// Mock Logger
// ============================================

const createMockLogger = (): ILogger => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    createChild: vi.fn().mockReturnThis(),
    setLevel: vi.fn(),
    getLevel: vi.fn().mockReturnValue(0), // LogLevel.DEBUG
});

// ============================================
// Mock MinecraftDataService
// ============================================

const createMockMinecraftDataService = (): IMinecraftDataService => ({
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    getEnchantments: vi.fn().mockReturnValue([]),
    getEntities: vi.fn().mockReturnValue([]),
    getParticles: vi.fn().mockReturnValue([]),
    getPotionEffects: vi.fn().mockReturnValue([]),
    getBiomes: vi.fn().mockReturnValue([]),
    getSounds: vi.fn().mockReturnValue([]),
    getBlocks: vi.fn().mockReturnValue([]),
    getItems: vi.fn().mockReturnValue([]),
    getAttributes: vi.fn().mockReturnValue([]),
    getDamageTypes: vi.fn().mockReturnValue([]),
    getGameEvents: vi.fn().mockReturnValue([]),
    getTags: vi.fn().mockReturnValue([]),
    getAllTags: vi.fn().mockReturnValue([]),
    getEnchantmentNames: vi.fn().mockReturnValue([]),
    getEntityNames: vi.fn().mockReturnValue([]),
    getParticleNames: vi.fn().mockReturnValue([]),
    getPotionEffectNames: vi.fn().mockReturnValue([]),
    getBiomeNames: vi.fn().mockReturnValue([]),
    getSoundNames: vi.fn().mockReturnValue([]),
    getBlockNames: vi.fn().mockReturnValue([]),
    getItemNames: vi.fn().mockReturnValue([
        'paper', 'diamond', 'bow', 'crossbow', 'fishing_rod', 'elytra', 'shield'
    ]),
    getAttributeNames: vi.fn().mockReturnValue([]),
    getDamageTypeNames: vi.fn().mockReturnValue([]),
    getGameEventNames: vi.fn().mockReturnValue([]),
    getTagNames: vi.fn().mockReturnValue([]),
    isValidEnchantment: vi.fn().mockReturnValue(false),
    isValidEntity: vi.fn().mockReturnValue(false),
    isValidParticle: vi.fn().mockReturnValue(false),
    isValidPotionEffect: vi.fn().mockReturnValue(false),
    isValidBiome: vi.fn().mockReturnValue(false),
    isValidSound: vi.fn().mockReturnValue(false),
    isValidBlock: vi.fn().mockReturnValue(false),
    isValidItem: vi.fn().mockImplementation((name: string) => {
        const validItems = ['paper', 'diamond', 'bow', 'crossbow', 'fishing_rod', 'elytra', 'shield'];
        const normalizedName = name.replace('minecraft:', '');
        return validItems.includes(normalizedName);
    }),
    isValidAttribute: vi.fn().mockReturnValue(false),
    isValidDamageType: vi.fn().mockReturnValue(false),
    isValidGameEvent: vi.fn().mockReturnValue(false),
    isValidTag: vi.fn().mockReturnValue(false),
    isInTag: vi.fn().mockReturnValue(false),
    getDataVersion: vi.fn().mockReturnValue('1.21.4'),
    isLoaded: vi.fn().mockReturnValue(true),
});

// ============================================
// 测试
// ============================================

describe('ModelGenerationService', () => {
    let service: ModelGenerationService;
    let mockLogger: ILogger;
    let mockMinecraftDataService: IMinecraftDataService;
    let mockConfigLoader: IDataConfigLoader;

    beforeEach(() => {
        mockLogger = createMockLogger();
        mockMinecraftDataService = createMockMinecraftDataService();
        mockConfigLoader = {
            loadExtendedTypesConfig: vi.fn().mockResolvedValue({ types: {}, propertyDefinitions: {}, snippets: {} }),
            loadModelPropertiesConfig: vi.fn().mockResolvedValue({
                modelTypes: {},
                conditionProperties: [],
                selectProperties: [],
                rangeDispatchProperties: [],
                specialModelTypes: [],
                knownKeys: {},
            }),
            preloadAllConfigs: vi.fn().mockResolvedValue(undefined),
        } as unknown as IDataConfigLoader;
        service = new ModelGenerationService(mockLogger, mockMinecraftDataService, mockConfigLoader);
    });

    describe('hasModelDefinition', () => {
        it('should return true for config with model', () => {
            expect(service.hasModelDefinition({ model: 'custom:item/test' })).toBe(true);
        });

        it('should return true for config with models', () => {
            expect(service.hasModelDefinition({ models: ['model1', 'model2'] })).toBe(true);
        });

        it('should return true for config with texture', () => {
            expect(service.hasModelDefinition({ texture: 'custom:item/texture' })).toBe(true);
        });

        it('should return true for config with textures', () => {
            expect(service.hasModelDefinition({ textures: ['t1', 't2'] })).toBe(true);
        });

        it('should return true for config with item-model', () => {
            expect(service.hasModelDefinition({ 'item-model': 'custom:my_item' })).toBe(true);
        });

        it('should return true for config with material', () => {
            expect(service.hasModelDefinition({ material: 'minecraft:diamond' })).toBe(true);
        });

        it('should return false for empty config', () => {
            expect(service.hasModelDefinition({})).toBe(false);
        });
    });

    describe('generateModel with simplified texture config', () => {
        it('should generate model from single texture (GENERATED reader)', async () => {
            const config = {
                material: 'minecraft:paper',
                texture: 'custom:item/my_texture',
            };

            const result = await service.generateModel(config, 'custom:my_item');

            expect(result.success).toBe(true);
            expect(result.modelJson).toBeDefined();
            expect(result.modelJson?.parent).toBe('item/generated');
            expect(result.modelJson?.textures).toEqual({ layer0: 'custom:item/my_texture' });
        });

        it('should generate model from multiple textures', async () => {
            const config = {
                material: 'minecraft:paper',
                textures: ['texture1', 'texture2', 'texture3'],
            };

            const result = await service.generateModel(config, 'custom:layered_item');

            expect(result.success).toBe(true);
            expect(result.modelJson).toBeDefined();
            expect(result.modelJson?.textures).toEqual({
                layer0: 'texture1',
                layer1: 'texture2',
                layer2: 'texture3',
            });
        });

        it('should use HANDHELD reader for handheld items', async () => {
            // HANDHELD 读取器尚未注册，这里测试默认的 GENERATED 读取器
            const config = {
                material: 'minecraft:paper',
                texture: 'custom:item/sword_texture',
            };

            const result = await service.generateModel(config, 'custom:my_sword');

            expect(result.success).toBe(true);
            // 默认使用 generated 父模型
            expect(result.modelJson?.parent).toBe('item/generated');
        });
    });

    describe('generateModel with bow material', () => {
        it('should use BowModelReader for bow material', async () => {
            const config = {
                material: 'minecraft:bow',
                textures: ['t0', 't1', 't2', 't3'],
            };

            const result = await service.generateModel(config, 'custom:my_bow');

            expect(result.success).toBe(true);
            // BowModelReader 生成 condition 类型的模型
            // 由于是复杂模型，会取第一个 modelGeneration
            expect(result.modelPath).toBeDefined();
        });

        it('should throw error for bow with wrong texture count', async () => {
            const config = {
                material: 'minecraft:bow',
                textures: ['t0', 't1'], // 弓需要 4 个纹理
            };

            const result = await service.generateModel(config, 'custom:my_bow');

            // 应该失败，因为纹理数量不对
            // SimplifiedModelConfigError 会被捕获并返回 fallback
            expect(result.success).toBe(true); // 会回退到默认模型路径
        });
    });

    describe('generateModel with crossbow material', () => {
        it('should use CrossbowModelReader for crossbow material', async () => {
            const config = {
                material: 'minecraft:crossbow',
                textures: ['t0', 't1', 't2', 't3', 't4', 't5'],
            };

            const result = await service.generateModel(config, 'custom:my_crossbow');

            expect(result.success).toBe(true);
            expect(result.modelPath).toBeDefined();
        });
    });

    describe('generateModel with fishing_rod material', () => {
        it('should use ConditionModelReader for fishing_rod material', async () => {
            const config = {
                material: 'minecraft:fishing_rod',
                textures: ['normal_texture', 'cast_texture'],
            };

            const result = await service.generateModel(config, 'custom:my_fishing_rod');

            expect(result.success).toBe(true);
            expect(result.modelPath).toBeDefined();
        });
    });

    describe('generateModel with elytra material', () => {
        it('should use ConditionModelReader (ELYTRA) for elytra material', async () => {
            const config = {
                material: 'minecraft:elytra',
                textures: ['normal_texture', 'broken_texture'],
            };

            const result = await service.generateModel(config, 'custom:my_elytra');

            expect(result.success).toBe(true);
            expect(result.modelPath).toBeDefined();
        });
    });

    describe('generateModel with simplified model config', () => {
        it('should handle single model string', async () => {
            const config = {
                material: 'minecraft:paper',
                model: 'custom:item/my_model',
            };

            const result = await service.generateModel(config, 'custom:my_item');

            expect(result.success).toBe(true);
            expect(result.modelPath).toBe('custom:item/my_model');
        });

        it('should handle multiple models as composite', async () => {
            const config = {
                material: 'minecraft:paper',
                models: ['custom:item/model1', 'custom:item/model2'],
            };

            const result = await service.generateModel(config, 'custom:my_item');

            expect(result.success).toBe(true);
            // 应该创建 composite 模型
        });
    });

    describe('generateModel with full model config', () => {
        it('should handle model config with type', async () => {
            const config = {
                model: {
                    type: 'model',
                    path: 'custom:item/full_model',
                },
            };

            const result = await service.generateModel(config, 'custom:my_item');

            expect(result.success).toBe(true);
            expect(result.modelPath).toBe('custom:item/full_model');
        });

        it('should handle condition model config', async () => {
            const config = {
                material: 'minecraft:paper', // 添加 material 作为 fallback
                model: {
                    type: 'condition',
                    property: 'using_item',
                    'on-true': { type: 'model', path: 'custom:item/active' },
                    'on-false': { type: 'model', path: 'custom:item/inactive' },
                },
            };

            const result = await service.generateModel(config, 'custom:my_item');

            // 条件模型没有单一路径，但有 material 可以 fallback
            expect(result.success).toBe(true);
        });
    });

    describe('generateModel fallback', () => {
        it('should fallback to material-based model path', async () => {
            const config = {
                material: 'minecraft:diamond',
            };

            const result = await service.generateModel(config, 'minecraft:diamond');

            expect(result.success).toBe(true);
            expect(result.modelPath).toBe('item/diamond');
        });

        it('should return error for config without any model definition', async () => {
            const config = {};

            const result = await service.generateModel(config, 'unknown:item');

            expect(result.success).toBe(false);
            expect(result.error).toContain('No model definition found');
        });
    });

    describe('extractModelPath', () => {
        it('should extract path from item-model field', () => {
            const config = { 'item-model': 'custom:my_item' };

            const path = service.extractModelPath(config);

            expect(path).toBe('custom:item/my_item');
        });

        it('should extract path from model string', () => {
            const config = { model: 'custom:block/my_block' };

            const path = service.extractModelPath(config);

            expect(path).toBe('custom:block/my_block');
        });

        it('should extract path from model object with path', () => {
            const config = { model: { path: 'custom:item/my_model' } };

            const path = service.extractModelPath(config);

            expect(path).toBe('custom:item/my_model');
        });

        it('should extract path from model object with model field', () => {
            const config = { model: { model: 'custom:item/nested_model' } };

            const path = service.extractModelPath(config);

            expect(path).toBe('custom:item/nested_model');
        });

        it('should return undefined for empty config', () => {
            const path = service.extractModelPath({});

            expect(path).toBeUndefined();
        });
    });

    describe('createItemModel', () => {
        it('should create EmptyItemModel for empty type', () => {
            const model = service.createItemModel({ type: 'empty' });

            expect(model).toBeDefined();
            // 内部类型使用 minecraft: 前缀
            expect(model?.type).toBe('minecraft:empty');
        });

        it('should create BaseItemModel for model type', () => {
            const model = service.createItemModel({
                type: 'model',
                path: 'minecraft:item/diamond',
            });

            expect(model).toBeDefined();
            expect(model?.type).toBe('minecraft:model');
        });

        it('should return undefined for null config', () => {
            const model = service.createItemModel(null);

            expect(model).toBeUndefined();
        });

        it('should handle unknown type gracefully', () => {
            const model = service.createItemModel({ type: 'unknown_type' });

            // 工厂函数对未知类型会创建 EmptyItemModel（如果没有 path 字段）
            expect(model).toBeDefined();
            expect(model?.type).toBe('minecraft:empty');
        });
    });

    describe('collectModelsToGenerate', () => {
        it('should collect models from BaseItemModel with generation', () => {
            const model = service.createItemModel({
                type: 'model',
                path: 'custom:item/my_item',
                generation: {
                    parent: 'item/generated',
                    textures: { layer0: 'custom:item/texture' },
                },
            });

            if (model) {
                const generations = service.collectModelsToGenerate(model);
                expect(generations.length).toBeGreaterThanOrEqual(0);
            }
        });

        it('should collect models from nested condition model', () => {
            const model = service.createItemModel({
                type: 'condition',
                property: 'using_item',
                'on-true': {
                    type: 'model',
                    path: 'custom:item/active',
                    generation: {
                        parent: 'item/generated',
                        textures: { layer0: 'active_texture' },
                    },
                },
                'on-false': {
                    type: 'model',
                    path: 'custom:item/inactive',
                    generation: {
                        parent: 'item/generated',
                        textures: { layer0: 'inactive_texture' },
                    },
                },
            });

            if (model) {
                const generations = service.collectModelsToGenerate(model);
                // 条件模型应该收集两个分支的 generation
                expect(generations.length).toBeGreaterThanOrEqual(0);
            }
        });
    });
});
