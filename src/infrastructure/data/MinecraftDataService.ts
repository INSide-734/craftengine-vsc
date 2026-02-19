import {
    IMinecraftDataService,
    IEnchantment,
    IEntity,
    IParticle,
    IPotionEffect,
    IBiome,
    ISound,
    IBlock,
    IMinecraftItem,
    IAttribute,
    IDamageType,
    IGameEvent,
    IMinecraftTag
} from '../../core/interfaces/IMinecraftDataService';
import { ILogger } from '../../core/interfaces/ILogger';
import { IDataConfigLoader } from '../../core/interfaces/IDataConfigLoader';
import { MinecraftDataLoader } from './MinecraftDataLoader';
import { MinecraftDataConverter } from './MinecraftDataConverter';
import { MinecraftTagCache } from './MinecraftTagCache';
import { MinecraftDataValidator } from './MinecraftDataValidator';

/**
 * Minecraft 数据服务实现
 *
 * 统一管理 Minecraft 原版数据的加载、缓存和查询。
 * 将标签管理委托给 MinecraftTagCache，验证逻辑委托给 MinecraftDataValidator。
 */
export class MinecraftDataService implements IMinecraftDataService {
    // 基础数据缓存
    private enchantments: IEnchantment[] = [];
    private entities: IEntity[] = [];
    private particles: IParticle[] = [];
    private potionEffects: IPotionEffect[] = [];
    private biomes: IBiome[] = [];
    private sounds: ISound[] = [];
    private blocks: IBlock[] = [];
    private items: IMinecraftItem[] = [];
    private attributes: IAttribute[] = [];
    private damageTypes: IDamageType[] = [];
    private gameEvents: IGameEvent[] = [];

    // 名称列表缓存（避免每次调用 getXxxNames() 都创建新数组）
    private readonly nameCache = new Map<string, string[]>();

    // 委托组件
    private readonly tagCache = new MinecraftTagCache();
    private readonly validator = new MinecraftDataValidator();

    // 加载状态
    private loaded = false;
    private lastLoadTime = 0;
    private loadPromise: Promise<void> | null = null;
    private dataVersion = '';

    private readonly cacheTTL: number;
    private readonly logger: ILogger;
    private readonly dataLoader: MinecraftDataLoader;
    private readonly configLoader: IDataConfigLoader;
    private readonly dataConverter: MinecraftDataConverter;

    constructor(
        logger: ILogger,
        configLoader: IDataConfigLoader,
        dataLoader?: MinecraftDataLoader,
        dataConverter?: MinecraftDataConverter
    ) {
        this.logger = logger.createChild('MinecraftDataService');
        this.configLoader = configLoader;

        const timingConfig = this.configLoader.getTimingConfigSync();
        if (!timingConfig) {
            throw new Error('DataConfigLoader must be preloaded before creating MinecraftDataService');
        }

        this.cacheTTL = timingConfig.cache.minecraftDataCacheTTL;
        this.dataLoader = dataLoader ?? new MinecraftDataLoader();
        this.dataConverter = dataConverter ?? new MinecraftDataConverter();

        this.logger.debug('MinecraftDataService initialized', { cacheTTL: this.cacheTTL });
    }

    // ========================================
    // 加载控制
    // ========================================

    async ensureLoaded(): Promise<void> {
        const now = Date.now();
        if (this.loaded && (now - this.lastLoadTime) < this.cacheTTL) {
            return;
        }
        if (this.loadPromise) {
            return this.loadPromise;
        }
        this.loadPromise = this.loadAllData();
        try {
            await this.loadPromise;
        } finally {
            this.loadPromise = null;
        }
    }

    async refresh(): Promise<void> {
        this.loaded = false;
        this.lastLoadTime = 0;
        await this.ensureLoaded();
    }

    // ========================================
    // 数据获取
    // ========================================

    getEnchantments(): IEnchantment[] { return this.enchantments; }
    getEntities(): IEntity[] { return this.entities; }
    getParticles(): IParticle[] { return this.particles; }
    getPotionEffects(): IPotionEffect[] { return this.potionEffects; }
    getBiomes(): IBiome[] { return this.biomes; }
    getSounds(): ISound[] { return this.sounds; }
    getBlocks(): IBlock[] { return this.blocks; }
    getItems(): IMinecraftItem[] { return this.items; }
    getAttributes(): IAttribute[] { return this.attributes; }
    getDamageTypes(): IDamageType[] { return this.damageTypes; }
    getGameEvents(): IGameEvent[] { return this.gameEvents; }

    // 标签操作委托给 MinecraftTagCache
    getTags(type: IMinecraftTag['type']): IMinecraftTag[] { return this.tagCache.getTags(type); }
    getAllTags(): IMinecraftTag[] { return this.tagCache.getAllTags(); }
    getTagNames(type: IMinecraftTag['type']): string[] { return this.tagCache.getTagNames(type); }
    isValidTag(type: IMinecraftTag['type'], name: string): boolean { return this.tagCache.isValidTag(type, name); }
    isInTag(type: IMinecraftTag['type'], tagName: string, value: string): boolean { return this.tagCache.isInTag(type, tagName, value); }

    // ========================================
    // 名称列表（带缓存）
    // ========================================

    getEnchantmentNames(): string[] { return this.getNamesCached(this.enchantments, 'enchantments'); }
    getEntityNames(): string[] { return this.getNamesCached(this.entities, 'entities'); }
    getParticleNames(): string[] { return this.getNamesCached(this.particles, 'particles'); }
    getPotionEffectNames(): string[] { return this.getNamesCached(this.potionEffects, 'potionEffects'); }
    getBiomeNames(): string[] { return this.getNamesCached(this.biomes, 'biomes'); }
    getSoundNames(): string[] { return this.getNamesCached(this.sounds, 'sounds'); }
    getBlockNames(): string[] { return this.getNamesCached(this.blocks, 'blocks'); }
    getItemNames(): string[] { return this.getNamesCached(this.items, 'items'); }
    getAttributeNames(): string[] { return this.getNamesCached(this.attributes, 'attributes'); }
    getDamageTypeNames(): string[] { return this.getNamesCached(this.damageTypes, 'damageTypes'); }
    getGameEventNames(): string[] { return this.getNamesCached(this.gameEvents, 'gameEvents'); }

    // ========================================
    // 验证方法（委托给 MinecraftDataValidator）
    // ========================================

    isValidEnchantment(name: string): boolean { return this.validator.isValidEnchantment(name); }
    isValidEntity(name: string): boolean { return this.validator.isValidEntity(name); }
    isValidParticle(name: string): boolean { return this.validator.isValidParticle(name); }
    isValidPotionEffect(name: string): boolean { return this.validator.isValidPotionEffect(name); }
    isValidBiome(name: string): boolean { return this.validator.isValidBiome(name); }
    isValidSound(name: string): boolean { return this.validator.isValidSound(name); }
    isValidBlock(name: string): boolean { return this.validator.isValidBlock(name); }
    isValidItem(name: string): boolean { return this.validator.isValidItem(name); }
    isValidAttribute(name: string): boolean { return this.validator.isValidAttribute(name); }
    isValidDamageType(name: string): boolean { return this.validator.isValidDamageType(name); }
    isValidGameEvent(name: string): boolean { return this.validator.isValidGameEvent(name); }

    // ========================================
    // 元数据
    // ========================================

    getDataVersion(): string { return this.dataVersion; }
    isLoaded(): boolean { return this.loaded; }
    // ========================================
    // 私有方法
    // ========================================

    /**
     * 从缓存获取名称列表，避免每次调用都创建新数组
     */
    private getNamesCached(data: Array<{ name: string }>, cacheKey: string): string[] {
        const cached = this.nameCache.get(cacheKey);
        if (cached) {
            return cached;
        }
        const names = data.map(item => item.name);
        this.nameCache.set(cacheKey, names);
        return names;
    }

    /**
     * 从 Promise.allSettled 结果中提取值，失败时使用 fallback
     */
    private extractResult<T>(result: PromiseSettledResult<T>, dataType: string, fallback: T): T {
        if (result.status === 'fulfilled') {
            return result.value;
        }
        this.logger.warn(`Failed to load ${dataType}, using fallback`, {
            error: result.reason instanceof Error ? result.reason.message : String(result.reason)
        });
        return fallback;
    }

    private async loadAllData(): Promise<void> {
        const startTime = Date.now();

        try {
            const version = await this.dataLoader.getLatestVersion();
            this.logger.info('Loading Minecraft data', { version });

            // 清除名称缓存（数据即将更新）
            this.nameCache.clear();

            // 并行加载所有数据，使用 Promise.allSettled 确保部分失败不影响整体
            const results = await Promise.allSettled([
                this.dataLoader.loadEnchantments(version),      // 0
                this.dataLoader.loadEntities(version),           // 1
                this.dataLoader.loadParticles(version),          // 2
                this.dataLoader.loadEffects(version),            // 3
                this.dataLoader.loadBiomes(version),             // 4
                this.dataLoader.loadSounds(version),             // 5
                this.dataLoader.loadBlocks(version),             // 6
                this.dataLoader.loadItems(version),              // 7
                this.dataLoader.loadAttributes(version),         // 8
                this.dataLoader.loadBlockTags(version),          // 9
                this.dataLoader.loadItemTags(version),           // 10
                this.dataLoader.loadEntityTags(version),         // 11
                this.dataLoader.loadFluidTags(version),          // 12
                this.dataLoader.loadGameEventTags(version),      // 13
                this.dataLoader.loadDamageTypes(version),        // 14
                this.dataLoader.loadGameEvents(version)          // 15
            ]);

            // 提取结果，失败的数据源使用空数组/空 Map 作为 fallback
            const enchantmentsRaw = this.extractResult(results[0], 'enchantments', []);
            const entitiesRaw = this.extractResult(results[1], 'entities', []);
            const particlesRaw = this.extractResult(results[2], 'particles', []);
            const effectsRaw = this.extractResult(results[3], 'effects', []);
            const biomesRaw = this.extractResult(results[4], 'biomes', []);
            const soundNames = this.extractResult(results[5], 'sounds', []);
            const blocksRaw = this.extractResult(results[6], 'blocks', []);
            const itemsRaw = this.extractResult(results[7], 'items', []);
            const attributesRaw = this.extractResult(results[8], 'attributes', []);
            const blockTagsRaw = this.extractResult(results[9], 'blockTags', new Map<string, string[]>());
            const itemTagsRaw = this.extractResult(results[10], 'itemTags', new Map<string, string[]>());
            const entityTagsRaw = this.extractResult(results[11], 'entityTags', new Map<string, string[]>());
            const fluidTagsRaw = this.extractResult(results[12], 'fluidTags', new Map<string, string[]>());
            const gameEventTagsRaw = this.extractResult(results[13], 'gameEventTags', new Map<string, string[]>());
            const damageTypesRaw = this.extractResult(results[14], 'damageTypes', []);
            const gameEventsRaw = this.extractResult(results[15], 'gameEvents', []);

            // 转换基础数据格式
            this.enchantments = this.dataConverter.convertEnchantments(enchantmentsRaw);
            this.entities = this.dataConverter.convertEntities(entitiesRaw);
            this.particles = this.dataConverter.convertParticles(particlesRaw);
            this.potionEffects = this.dataConverter.convertPotionEffects(effectsRaw);
            this.biomes = this.dataConverter.convertBiomes(biomesRaw);
            this.sounds = soundNames.map(name => ({ name }));
            this.blocks = this.dataConverter.convertBlocks(blocksRaw);
            this.items = this.dataConverter.convertItems(itemsRaw);
            this.attributes = this.dataConverter.convertAttributes(attributesRaw);
            this.damageTypes = this.dataConverter.convertDamageTypes(damageTypesRaw);
            this.gameEvents = this.dataConverter.convertGameEvents(gameEventsRaw);

            // 设置标签缓存
            this.tagCache.setTags(
                this.dataConverter.convertTags(blockTagsRaw, 'blocks'),
                this.dataConverter.convertTags(itemTagsRaw, 'items'),
                this.dataConverter.convertTags(entityTagsRaw, 'entity_types'),
                this.dataConverter.convertTags(fluidTagsRaw, 'fluids'),
                this.dataConverter.convertTags(gameEventTagsRaw, 'game_events')
            );

            // 构建验证器查找集合
            this.validator.buildLookupSets({
                enchantments: this.enchantments,
                entities: this.entities,
                particles: this.particles,
                potionEffects: this.potionEffects,
                biomes: this.biomes,
                sounds: this.sounds,
                blocks: this.blocks,
                items: this.items,
                attributes: this.attributes,
                damageTypes: this.damageTypes,
                gameEvents: this.gameEvents
            });

            // 更新状态
            this.dataVersion = version;
            this.loaded = true;
            this.lastLoadTime = Date.now();

            this.logger.info('Minecraft data loaded successfully', {
                version,
                duration: Date.now() - startTime,
                counts: {
                    enchantments: this.enchantments.length,
                    entities: this.entities.length,
                    particles: this.particles.length,
                    potionEffects: this.potionEffects.length,
                    biomes: this.biomes.length,
                    sounds: this.sounds.length,
                    blocks: this.blocks.length,
                    items: this.items.length,
                    attributes: this.attributes.length,
                    damageTypes: this.damageTypes.length,
                    gameEvents: this.gameEvents.length
                }
            });
        } catch (error) {
            this.logger.error('Failed to load Minecraft data', error as Error);
        }
    }
}
