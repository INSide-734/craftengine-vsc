import { type ILogger } from '../../core/interfaces/ILogger';
import { type IMinecraftVersionService } from '../../core/interfaces/IMinecraftVersionService';
import { type IDataConfigLoader } from '../../core/interfaces/IDataConfigLoader';
import { type IItemId, type IBuiltinItemLoader } from '../../core/interfaces/IItemId';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { ServiceContainer } from '../ServiceContainer';
import { HttpUtils } from '../utils/HttpUtils';

/**
 * Minecraft 物品列表 API 响应结构
 */
interface MinecraftItemListResponse {
    directories: string[];
    files: string[];
}

/**
 * Minecraft 内置物品加载器
 *
 * 从 GitHub (InventivetalentDev/minecraft-assets) 加载 Minecraft 原版物品列表
 *
 * ## 特性
 *
 * - **动态版本**：自动获取最新 Minecraft 版本
 * - **多源支持**：主站 + 镜像站 fallback 机制
 * - **格式转换**：将文件名转换为物品 ID 格式
 * - **错误处理**：网络错误时返回空列表
 *
 * ## 数据源
 *
 * 1. **主站**: GitHub raw.githubusercontent.com
 * 2. **镜像站**: 支持多个 GitHub 镜像代理
 *
 * ## 前置条件
 *
 * 使用此类前必须确保 DataConfigLoader.preloadAllConfigs() 已调用成功
 *
 * @example
 * ```typescript
 * const loader = new MinecraftBuiltinItemLoader();
 * const items = await loader.loadBuiltinItems();
 * // 返回: [{ id: 'minecraft:diamond', namespace: 'minecraft', name: 'diamond', ... }]
 * ```
 */
export class MinecraftBuiltinItemLoader implements IBuiltinItemLoader {
    /** 请求超时时间 */
    private readonly requestTimeout: number;

    /** 内置物品的虚拟源文件标识 */
    private readonly builtinSource: string;

    private readonly logger: ILogger;
    private readonly versionService: IMinecraftVersionService;
    private readonly configLoader: IDataConfigLoader;

    constructor() {
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild(
            'MinecraftBuiltinItemLoader',
        );
        this.versionService = ServiceContainer.getService<IMinecraftVersionService>(
            SERVICE_TOKENS.MinecraftVersionService,
        );
        this.configLoader = ServiceContainer.getService<IDataConfigLoader>(SERVICE_TOKENS.DataConfigLoader);

        // 从预加载的配置中获取值
        const timingConfig = this.configLoader.getTimingConfigSync();
        const dataSourcesConfig = this.configLoader.getDataSourcesConfigSync();

        if (!timingConfig || !dataSourcesConfig) {
            throw new Error('DataConfigLoader must be preloaded before creating MinecraftBuiltinItemLoader');
        }

        this.requestTimeout = timingConfig.network.requestTimeout;
        this.builtinSource = dataSourcesConfig.builtinSource.identifier;

        this.logger.debug('MinecraftBuiltinItemLoader initialized', {
            requestTimeout: this.requestTimeout,
            builtinSource: this.builtinSource,
        });
    }

    /**
     * 加载 Minecraft 内置物品列表
     *
     * 使用多源 fallback 策略：
     * 1. 尝试从 GitHub 主站获取
     * 2. 失败时依次尝试镜像站
     * 3. 全部失败返回空数组
     *
     * @returns 物品 ID 列表，失败时返回空数组
     */
    async loadBuiltinItems(): Promise<IItemId[]> {
        try {
            // 1. 获取最新 Minecraft 版本
            const latestVersion = await this.versionService.getLatestRelease();
            this.logger.info('Loading Minecraft builtin items', { version: latestVersion });

            // 2. 从配置构建所有数据源 URL（主站 + 镜像站）
            const urls = await this.configLoader.getDataSourceUrls('minecraftAssets', 'builtinItems', {
                version: latestVersion,
            });

            // 3. 尝试从多个源获取数据
            const response = await HttpUtils.fetchFromMultipleSources<MinecraftItemListResponse>(
                urls,
                this.requestTimeout,
                this.logger,
            );

            if (!response) {
                this.logger.error('Failed to fetch from all data sources', new Error('All sources failed'));
                return [];
            }

            // 4. 转换为 IItemId 格式
            const items = this.convertToItemIds(response.files, latestVersion);

            this.logger.info('Minecraft builtin items loaded successfully', {
                version: latestVersion,
                count: items.length,
            });

            return items;
        } catch (error) {
            this.logger.error('Failed to load Minecraft builtin items', error as Error);
            return [];
        }
    }

    /**
     * 将文件名列表转换为物品 ID
     *
     * @param files 文件名列表（如 ["diamond.json", "iron_ingot.json"]）
     * @param version Minecraft 版本号
     * @returns 物品 ID 列表
     */
    private convertToItemIds(files: string[], version: string): IItemId[] {
        const items: IItemId[] = [];

        for (const file of files) {
            // 移除 .json 扩展名
            if (!file.endsWith('.json')) {
                continue;
            }

            const itemName = file.slice(0, -5); // 移除 '.json'

            // 构建物品 ID（Minecraft 内置物品类型为 'item'）
            const item: IItemId = {
                id: `minecraft:${itemName}`,
                namespace: 'minecraft',
                name: itemName,
                type: 'item',
                sourceFile: `${this.builtinSource}@${version}`,
                lineNumber: 0,
            };

            items.push(item);
        }

        return items;
    }
}
