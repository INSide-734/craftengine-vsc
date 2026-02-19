import { IMinecraftVersion, IMinecraftVersionService } from '../../core/interfaces/IMinecraftVersionService';
import { ILogger } from '../../core/interfaces/ILogger';
import { IDataConfigLoader } from '../../core/interfaces/IDataConfigLoader';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { ServiceContainer } from '../ServiceContainer';
import { HttpUtils } from '../utils/HttpUtils';

/**
 * Mojang 版本清单 API 响应结构
 */
interface VersionManifestResponse {
    latest: {
        release: string;
        snapshot: string;
    };
    versions: Array<{
        id: string;
        type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
        url: string;
        time: string;
        releaseTime: string;
    }>;
}

/**
 * Minecraft 版本数据服务
 *
 * 从 Mojang 官方 API 动态获取版本列表
 *
 * ## 特性
 *
 * - **动态获取**：从 Mojang 官方 API 获取最新版本列表
 * - **缓存机制**：缓存有效期从配置加载，避免频繁请求
 * - **并发控制**：多个并发请求共享同一个请求 Promise
 * - **版本过滤**：只返回配置的最低支持版本及以上的正式版本
 *
 * ## 前置条件
 *
 * 使用此类前必须确保 DataConfigLoader.preloadAllConfigs() 已调用成功
 *
 * @example
 * ```typescript
 * const service = new MinecraftVersionService();
 * const versions = await service.getVersions();
 * const latest = await service.getLatestRelease();
 * ```
 */
export class MinecraftVersionService implements IMinecraftVersionService {
    /** 缓存的版本列表 */
    private cachedVersions: IMinecraftVersion[] | null = null;

    /** 上次获取时间 */
    private lastFetchTime: number = 0;

    /** 当前正在进行的请求 Promise */
    private fetchPromise: Promise<IMinecraftVersion[]> | null = null;

    /** 缓存 TTL */
    private readonly cacheTTL: number;

    /** 请求超时 */
    private readonly requestTimeout: number;

    /** 最低支持版本 */
    private readonly minSupportedVersion: string;

    /** API 主站 URL */
    private readonly primaryUrl: string;

    /** API 镜像站 URL */
    private readonly fallbackUrl: string;

    private readonly logger: ILogger;
    private readonly configLoader: IDataConfigLoader;

    constructor() {
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger)
            .createChild('MinecraftVersionService');
        this.configLoader = ServiceContainer.getService<IDataConfigLoader>(
            SERVICE_TOKENS.DataConfigLoader
        );

        // 从预加载的配置中获取值
        const timingConfig = this.configLoader.getTimingConfigSync();
        const apiEndpointsConfig = this.configLoader.getApiEndpointsConfigSync();
        const versionRequirementsConfig = this.configLoader.getVersionRequirementsConfigSync();

        if (!timingConfig || !apiEndpointsConfig || !versionRequirementsConfig) {
            throw new Error('DataConfigLoader must be preloaded before creating MinecraftVersionService');
        }

        // 从 timing-config.json 加载缓存和网络配置
        this.cacheTTL = timingConfig.cache.versionCacheTTL;
        this.requestTimeout = timingConfig.network.requestTimeout;

        // 从 api-endpoints.json 加载 API URL
        this.primaryUrl = apiEndpointsConfig.minecraft.versionManifest.primary;
        this.fallbackUrl = apiEndpointsConfig.minecraft.versionManifest.fallback || this.primaryUrl;

        // 从 version-requirements.json 加载版本要求
        this.minSupportedVersion = versionRequirementsConfig.minecraft.minSupported;

        this.logger.debug('MinecraftVersionService initialized', {
            cacheTTL: this.cacheTTL,
            requestTimeout: this.requestTimeout,
            minSupportedVersion: this.minSupportedVersion
        });
    }
    
    /**
     * 获取所有可用版本
     *
     * 仅返回正式版本（release），不支持快照版本
     */
    async getVersions(): Promise<IMinecraftVersion[]> {
        const now = Date.now();

        // 缓存有效，直接返回
        if (this.cachedVersions && (now - this.lastFetchTime) < this.cacheTTL) {
            this.logger.debug('Using cached Minecraft versions', {
                count: this.cachedVersions.length,
                cacheAge: now - this.lastFetchTime
            });
            return this.cachedVersions;
        }

        // 正在请求中，等待结果
        if (this.fetchPromise) {
            this.logger.debug('Waiting for existing version fetch');
            return this.fetchPromise;
        }

        // 发起新请求
        this.fetchPromise = this.fetchVersions();

        try {
            const versions = await this.fetchPromise;
            this.cachedVersions = versions;
            this.lastFetchTime = now;
            return versions;
        } finally {
            this.fetchPromise = null;
        }
    }
    
    /**
     * 获取最新正式版
     */
    async getLatestRelease(): Promise<string> {
        const versions = await this.getVersions();
        const latest = versions.find(v => v.isLatest);
        return latest?.version || (versions.length > 0 ? versions[0].version : '1.21.4');
    }
    
    /**
     * 刷新缓存
     */
    async refresh(): Promise<void> {
        this.cachedVersions = null;
        this.lastFetchTime = 0;
        await this.getVersions();
    }
    
    /**
     * 检查版本是否有效
     */
    async isValidVersion(version: string): Promise<boolean> {
        // 快速检查版本格式
        if (!this.isValidVersionFormat(version)) {
            return false;
        }
        
        const versions = await this.getVersions();
        return versions.some(v => v.version === version);
    }
    
    /**
     * 检查版本格式是否有效
     */
    isValidVersionFormat(version: string): boolean {
        return /^\d+\.\d+(\.\d+)?$/.test(version);
    }
    
    /**
     * 比较两个版本号
     * 
     * @returns 正数表示 a > b，负数表示 a < b，0 表示相等
     */
    compareVersions(a: string, b: string): number {
        const partsA = a.split('.').map(Number);
        const partsB = b.split('.').map(Number);
        
        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
            const partA = partsA[i] || 0;
            const partB = partsB[i] || 0;
            if (partA !== partB) {
                return partA - partB;
            }
        }
        return 0;
    }
    
    /**
     * 获取最接近的有效版本
     * 
     * @param invalidVersion 无效的版本号
     * @returns 最接近的有效版本列表
     */
    async getSuggestedVersions(invalidVersion: string): Promise<string[]> {
        const versions = await this.getVersions();
        
        // 如果格式无效，返回最新的几个版本
        if (!this.isValidVersionFormat(invalidVersion)) {
            return versions.slice(0, 5).map(v => v.version);
        }
        
        // 解析无效版本
        const parts = invalidVersion.split('.').map(Number);
        const major = parts[0] || 1;
        const minor = parts[1] || 0;
        
        // 查找同主版本的版本
        const sameMinor = versions.filter(v => {
            const vParts = v.version.split('.').map(Number);
            return vParts[0] === major && vParts[1] === minor;
        });
        
        if (sameMinor.length > 0) {
            return sameMinor.slice(0, 3).map(v => v.version);
        }
        
        // 返回最接近的版本
        const sorted = [...versions].sort((a, b) => {
            const diffA = Math.abs(this.compareVersions(a.version, invalidVersion));
            const diffB = Math.abs(this.compareVersions(b.version, invalidVersion));
            return diffA - diffB;
        });
        
        return sorted.slice(0, 5).map(v => v.version);
    }
    
    /**
     * 从 Mojang API 获取版本列表，失败时尝试镜像站
     */
    private async fetchVersions(): Promise<IMinecraftVersion[]> {
        // 尝试主站
        try {
            this.logger.info('Fetching Minecraft versions from Mojang API');
            return await this.fetchVersionsFromUrl(this.primaryUrl);
        } catch (primaryError) {
            this.logger.warn('Failed to fetch from Mojang API, trying mirror', {
                error: (primaryError as Error).message
            });
        }

        // 尝试镜像站
        try {
            this.logger.info('Fetching Minecraft versions from mirror');
            return await this.fetchVersionsFromUrl(this.fallbackUrl);
        } catch (mirrorError) {
            this.logger.error('Failed to fetch Minecraft versions from mirror', mirrorError as Error);

            // 如果有缓存（即使过期），仍然返回
            if (this.cachedVersions) {
                this.logger.warn('Using expired cached versions');
                return this.cachedVersions;
            }

            // 没有缓存，返回空数组
            return [];
        }
    }

    /**
     * 从指定 URL 获取版本列表
     */
    private async fetchVersionsFromUrl(url: string): Promise<IMinecraftVersion[]> {
        const data = await HttpUtils.fetchJson<VersionManifestResponse>(
            url,
            this.requestTimeout
        );

        // 只保留正式版，过滤掉 snapshot、old_beta、old_alpha
        const releaseVersions = data.versions
            .filter(v => v.type === 'release')
            .map(v => ({
                version: v.id,
                releaseTime: new Date(v.releaseTime),
                isLatest: v.id === data.latest.release
            }));

        // 只保留配置的最低支持版本及以上版本
        const supportedVersions = releaseVersions.filter(v =>
            this.compareVersions(v.version, this.minSupportedVersion) >= 0
        );

        this.logger.info('Minecraft versions fetched successfully', {
            source: url.includes('bmclapi') ? 'mirror' : 'mojang',
            total: data.versions.length,
            releases: releaseVersions.length,
            supported: supportedVersions.length,
            latest: data.latest.release
        });

        return supportedVersions;
    }
}
