import { type ILogger } from '../../core/interfaces/ILogger';
import { type IMinecraftVersionService } from '../../core/interfaces/IMinecraftVersionService';
import { type IDataConfigLoader } from '../../core/interfaces/IDataConfigLoader';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { ServiceContainer } from '../ServiceContainer';
import { HttpUtils } from '../utils/HttpUtils';

/**
 * PrismarineJS minecraft-data 原始数据结构
 */
interface PrismarineEnchantment {
    id: number;
    name: string;
    displayName: string;
    maxLevel: number;
    minCost?: { a: number; b: number };
    maxCost?: { a: number; b: number };
    treasureOnly: boolean;
    curse: boolean;
    exclude: string[];
    category: string;
    weight: number;
    tradeable?: boolean;
    discoverable?: boolean;
}

interface PrismarineEntity {
    id: number;
    internalId?: number;
    name: string;
    displayName: string;
    width: number;
    height: number;
    type: string;
    category?: string;
}

interface PrismarineParticle {
    id: number;
    name: string;
}

interface PrismarineEffect {
    id: number;
    name: string;
    displayName: string;
    type: 'good' | 'bad';
}

interface PrismarineBiome {
    id: number;
    name: string;
    displayName: string;
    category: string;
    temperature: number;
    precipitation?: string;
    color?: number;
    dimension?: string;
}

interface PrismarineBlock {
    id: number;
    name: string;
    displayName: string;
    hardness: number | null;
    resistance: number;
    stackSize: number;
    diggable: boolean;
    transparent: boolean;
    emitLight: number;
    filterLight: number;
    boundingBox: string;
    defaultState?: number;
    minStateId?: number;
    maxStateId?: number;
    states?: Array<{
        name: string;
        type: 'bool' | 'int' | 'enum';
        values?: string[];
        num_values?: number;
    }>;
    drops?: number[];
    material?: string;
}

interface PrismarineItem {
    id: number;
    name: string;
    displayName: string;
    stackSize: number;
    durability?: number;
    enchantCategories?: string[];
    repairWith?: string[];
}

interface PrismarineAttribute {
    name: string;
    resource: string;
    min: number;
    max: number;
    default: number;
}

/**
 * PrismarineJS 伤害类型原始数据结构
 */
interface PrismarineDamageType {
    name: string;
    scaling: string;
    exhaustion: number;
    effects?: string;
    message_id?: string;
}

/**
 * PrismarineJS 游戏事件原始数据结构
 */
interface PrismarineGameEvent {
    id: number;
    name: string;
}

/**
 * 标签数据原始格式（从 registries.json 或单独标签文件）
 */
interface TagData {
    values: string[];
}

/**
 * Minecraft 数据加载器
 *
 * 从 PrismarineJS/minecraft-data 仓库加载 Minecraft 原版数据
 *
 * ## 特性
 *
 * - **多源支持**：主站 + 镜像站 fallback 机制
 * - **配置驱动**：URL 和超时时间从配置文件加载（必须预加载）
 * - **错误处理**：网络错误时返回空数组
 *
 * ## 前置条件
 *
 * 使用此类前必须确保 DataConfigLoader.preloadAllConfigs() 已调用成功
 *
 * @example
 * ```typescript
 * const loader = new MinecraftDataLoader();
 * const enchantments = await loader.loadEnchantments('1.21.4');
 * const entities = await loader.loadEntities('1.21.4');
 * ```
 */
export class MinecraftDataLoader {
    private readonly logger: ILogger;
    private readonly versionService: IMinecraftVersionService;
    private readonly configLoader: IDataConfigLoader;

    /** 请求超时（从配置加载） */
    private readonly requestTimeout: number;

    /** PrismarineJS 主站 URL */
    private readonly prismarineBaseUrl: string;

    /** PrismarineJS 镜像站 URL 列表 */
    private readonly prismarineMirrorUrls: string[];

    /** MinecraftAssets 主站 URL */
    private readonly minecraftAssetsBaseUrl: string;

    /** MinecraftAssets 镜像站 URL 列表 */
    private readonly minecraftAssetsMirrorUrls: string[];

    constructor() {
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild('MinecraftDataLoader');
        this.versionService = ServiceContainer.getService<IMinecraftVersionService>(
            SERVICE_TOKENS.MinecraftVersionService,
        );
        this.configLoader = ServiceContainer.getService<IDataConfigLoader>(SERVICE_TOKENS.DataConfigLoader);

        // 从预加载的配置中获取值
        const timingConfig = this.configLoader.getTimingConfigSync();
        const dataSourcesConfig = this.configLoader.getDataSourcesConfigSync();

        if (!timingConfig || !dataSourcesConfig) {
            throw new Error('DataConfigLoader must be preloaded before creating MinecraftDataLoader');
        }

        // 从 timing-config.json 加载网络配置
        this.requestTimeout = timingConfig.network.requestTimeout;

        // 从 data-sources.json 加载数据源 URL
        const prismarineSource = dataSourcesConfig.sources['prismarineData'];
        this.prismarineBaseUrl = prismarineSource.primary;
        this.prismarineMirrorUrls = prismarineSource.mirrors;

        const minecraftAssetsSource = dataSourcesConfig.sources['minecraftAssets'];
        this.minecraftAssetsBaseUrl = minecraftAssetsSource.primary;
        this.minecraftAssetsMirrorUrls = minecraftAssetsSource.mirrors;

        this.logger.debug('MinecraftDataLoader initialized', {
            requestTimeout: this.requestTimeout,
            prismarineBaseUrl: this.prismarineBaseUrl,
            minecraftAssetsBaseUrl: this.minecraftAssetsBaseUrl,
        });
    }

    // ========================================================================
    // 公共方法
    // ========================================================================

    /**
     * 获取最新 Minecraft 版本号
     *
     * @returns 版本号字符串
     */
    async getLatestVersion(): Promise<string> {
        return this.versionService.getLatestRelease();
    }

    /**
     * 加载附魔数据
     *
     * @param version Minecraft 版本号
     * @returns 附魔数据数组
     */
    async loadEnchantments(version: string): Promise<PrismarineEnchantment[]> {
        const data = await this.loadDataFile<PrismarineEnchantment[]>(version, 'enchantments.json');
        return data ?? [];
    }

    /**
     * 加载实体数据
     *
     * @param version Minecraft 版本号
     * @returns 实体数据数组
     */
    async loadEntities(version: string): Promise<PrismarineEntity[]> {
        const data = await this.loadDataFile<PrismarineEntity[]>(version, 'entities.json');
        return data ?? [];
    }

    /**
     * 加载粒子效果数据
     *
     * @param version Minecraft 版本号
     * @returns 粒子效果数据数组
     */
    async loadParticles(version: string): Promise<PrismarineParticle[]> {
        const data = await this.loadDataFile<PrismarineParticle[]>(version, 'particles.json');
        return data ?? [];
    }

    /**
     * 加载药水效果数据
     *
     * @param version Minecraft 版本号
     * @returns 药水效果数据数组
     */
    async loadEffects(version: string): Promise<PrismarineEffect[]> {
        const data = await this.loadDataFile<PrismarineEffect[]>(version, 'effects.json');
        return data ?? [];
    }

    /**
     * 加载生物群系数据
     *
     * @param version Minecraft 版本号
     * @returns 生物群系数据数组
     */
    async loadBiomes(version: string): Promise<PrismarineBiome[]> {
        const data = await this.loadDataFile<PrismarineBiome[]>(version, 'biomes.json');
        return data ?? [];
    }

    /**
     * 加载声音事件数据
     *
     * 声音数据来自 InventivetalentDev/minecraft-assets 仓库
     *
     * @param version Minecraft 版本号
     * @returns 声音事件名称数组
     */
    async loadSounds(version: string): Promise<string[]> {
        try {
            const urls = this.buildSoundUrls(version);
            const data = await HttpUtils.fetchFromMultipleSources<Record<string, unknown>>(
                urls,
                this.requestTimeout,
                this.logger,
            );

            if (!data) {
                this.logger.warn('Failed to load sounds data', { version });
                return [];
            }

            // 提取所有声音事件键名
            const soundNames = Object.keys(data);
            this.logger.info('Sounds loaded successfully', {
                version,
                count: soundNames.length,
            });

            return soundNames;
        } catch (error) {
            this.logger.error('Failed to load sounds', error as Error, { version });
            return [];
        }
    }

    /**
     * 加载方块数据
     *
     * @param version Minecraft 版本号
     * @returns 方块数据数组
     */
    async loadBlocks(version: string): Promise<PrismarineBlock[]> {
        const data = await this.loadDataFile<PrismarineBlock[]>(version, 'blocks.json');
        return data ?? [];
    }

    /**
     * 加载物品数据
     *
     * @param version Minecraft 版本号
     * @returns 物品数据数组
     */
    async loadItems(version: string): Promise<PrismarineItem[]> {
        const data = await this.loadDataFile<PrismarineItem[]>(version, 'items.json');
        return data ?? [];
    }

    /**
     * 加载属性数据
     *
     * @param version Minecraft 版本号
     * @returns 属性数据数组
     */
    async loadAttributes(version: string): Promise<PrismarineAttribute[]> {
        const data = await this.loadDataFile<PrismarineAttribute[]>(version, 'attributes.json');
        return data ?? [];
    }

    /**
     * 加载标签数据
     *
     * 标签数据来自 InventivetalentDev/minecraft-assets 仓库
     *
     * @param version Minecraft 版本号
     * @param tagType 标签类型（blocks/items/entity_types）
     * @returns 标签数据 Map（标签名 -> 包含的值列表）
     */
    async loadTags(version: string, tagType: string): Promise<Map<string, string[]>> {
        const result = new Map<string, string[]>();

        try {
            // 加载标签列表
            const listUrl = this.buildTagListUrl(version, tagType);
            const tagList = await HttpUtils.fetchFromMultipleSources<string[]>(
                [listUrl],
                this.requestTimeout,
                this.logger,
            );

            if (!tagList || tagList.length === 0) {
                this.logger.warn('Failed to load tag list or empty', { version, tagType });
                return result;
            }

            // 并行加载每个标签的内容（限制并发数）
            const BATCH_SIZE = 10;
            for (let i = 0; i < tagList.length; i += BATCH_SIZE) {
                const batch = tagList.slice(i, i + BATCH_SIZE);
                const promises = batch.map(async (tagFileName) => {
                    const tagName = tagFileName.replace('.json', '');
                    const tagUrl = this.buildTagContentUrl(version, tagType, tagFileName);
                    const tagData = await HttpUtils.fetchFromMultipleSources<TagData>(
                        [tagUrl],
                        this.requestTimeout,
                        this.logger,
                    );

                    if (tagData && tagData.values) {
                        // 规范化值（移除命名空间或 # 前缀）
                        const normalizedValues = tagData.values.map((v) => {
                            // 处理嵌套标签引用（以 # 开头）
                            if (v.startsWith('#')) {
                                return v; // 保留标签引用
                            }
                            // 移除 minecraft: 前缀
                            return v.startsWith('minecraft:') ? v.substring('minecraft:'.length) : v;
                        });
                        result.set(tagName, normalizedValues);
                    }
                });

                await Promise.all(promises);
            }

            this.logger.info('Tags loaded successfully', {
                version,
                tagType,
                count: result.size,
            });

            return result;
        } catch (error) {
            this.logger.error('Failed to load tags', error as Error, { version, tagType });
            return result;
        }
    }

    /**
     * 加载方块标签
     *
     * @param version Minecraft 版本号
     * @returns 方块标签 Map
     */
    async loadBlockTags(version: string): Promise<Map<string, string[]>> {
        return this.loadTags(version, 'blocks');
    }

    /**
     * 加载物品标签
     *
     * @param version Minecraft 版本号
     * @returns 物品标签 Map
     */
    async loadItemTags(version: string): Promise<Map<string, string[]>> {
        return this.loadTags(version, 'items');
    }

    /**
     * 加载实体标签
     *
     * @param version Minecraft 版本号
     * @returns 实体标签 Map
     */
    async loadEntityTags(version: string): Promise<Map<string, string[]>> {
        return this.loadTags(version, 'entity_types');
    }

    /**
     * 加载流体标签
     *
     * @param version Minecraft 版本号
     * @returns 流体标签 Map
     */
    async loadFluidTags(version: string): Promise<Map<string, string[]>> {
        return this.loadTags(version, 'fluids');
    }

    /**
     * 加载游戏事件标签
     *
     * @param version Minecraft 版本号
     * @returns 游戏事件标签 Map
     */
    async loadGameEventTags(version: string): Promise<Map<string, string[]>> {
        return this.loadTags(version, 'game_events');
    }

    /**
     * 加载伤害类型数据
     *
     * @param version Minecraft 版本号
     * @returns 伤害类型数据数组
     */
    async loadDamageTypes(version: string): Promise<PrismarineDamageType[]> {
        const data = await this.loadDataFile<PrismarineDamageType[]>(version, 'damageTypes.json');
        return data ?? [];
    }

    /**
     * 加载游戏事件数据
     *
     * @param version Minecraft 版本号
     * @returns 游戏事件数据数组
     */
    async loadGameEvents(version: string): Promise<PrismarineGameEvent[]> {
        const data = await this.loadDataFile<PrismarineGameEvent[]>(version, 'gameEvents.json');
        return data ?? [];
    }

    // ========================================================================
    // 私有方法
    // ========================================================================

    /**
     * 加载数据文件
     */
    private async loadDataFile<T>(version: string, fileName: string): Promise<T | null> {
        try {
            const urls = this.buildDataUrls(version, fileName);
            const data = await HttpUtils.fetchFromMultipleSources<T>(urls, this.requestTimeout, this.logger);

            if (!data) {
                this.logger.warn('Failed to load data file', { version, fileName });
                return null;
            }

            this.logger.debug('Data file loaded successfully', {
                version,
                fileName,
                itemCount: Array.isArray(data) ? data.length : 'N/A',
            });

            return data;
        } catch (error) {
            this.logger.error('Failed to load data file', error as Error, { version, fileName });
            return null;
        }
    }

    /**
     * 构建数据文件 URL 列表
     */
    private buildDataUrls(version: string, fileName: string): string[] {
        const urls: string[] = [];

        // 主站
        urls.push(`${this.prismarineBaseUrl}/${version}/${fileName}`);

        // 镜像站
        for (const mirror of this.prismarineMirrorUrls) {
            urls.push(`${mirror}/${version}/${fileName}`);
        }

        return urls;
    }

    /**
     * 构建声音文件 URL 列表
     */
    private buildSoundUrls(version: string): string[] {
        const urls: string[] = [];

        // 主站
        urls.push(`${this.minecraftAssetsBaseUrl}/${version}/assets/minecraft/sounds.json`);

        // 镜像站
        for (const mirror of this.minecraftAssetsMirrorUrls) {
            urls.push(`${mirror}/${version}/assets/minecraft/sounds.json`);
        }

        return urls;
    }

    /**
     * 构建标签列表 URL
     *
     * 标签数据来自 InventivetalentDev/minecraft-assets 仓库
     */
    private buildTagListUrl(version: string, tagType: string): string {
        return `${this.minecraftAssetsBaseUrl}/${version}/data/minecraft/tags/${tagType}/_list.json`;
    }

    /**
     * 构建标签内容 URL
     */
    private buildTagContentUrl(version: string, tagType: string, tagFileName: string): string {
        return `${this.minecraftAssetsBaseUrl}/${version}/data/minecraft/tags/${tagType}/${tagFileName}`;
    }
}
