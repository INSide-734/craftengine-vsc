/**
 * 数据配置加载器服务
 *
 * 从 JSON 配置文件加载各种配置数据，支持缓存和热重载
 */

import * as fs from 'fs';
import * as path from 'path';
import { ILogger } from '../../core/interfaces/ILogger';
import {
    IDataConfigLoader,
    IDataSourcesConfig,
    ICompletionPrioritiesConfig,
    IPerformanceConfig,
    IExtendedTypesConfig,
    IMinecraftVersionsConfig,
    IModelPropertiesConfig,
    IVersionConditionConfig,
    ITimingConfig,
    IVersionRequirementsConfig,
    IApiEndpointsConfig,
    IMiniMessageConstantsConfig,
    IResourceTypePresetsConfig,
    IParameterTypesConfig,
    IDiagnosticCodesConfig,
    IDiagnosticSeverityRulesConfig,
    ISchemaConfig,
    IItemTypeConfig
} from '../../core/interfaces/IDataConfigLoader';

/**
 * 配置文件加载错误
 */
export class ConfigLoadError extends Error {
    constructor(
        public readonly configPath: string,
        message: string
    ) {
        super(`Failed to load config '${configPath}': ${message}`);
        this.name = 'ConfigLoadError';
    }
}

/**
 * 数据配置加载器实现
 *
 * ## 特性
 *
 * - **缓存机制**：配置文件只加载一次，后续从缓存读取
 * - **路径解析**：自动解析扩展根目录下的 data 文件夹
 * - **错误处理**：加载失败时抛出错误
 * - **类型安全**：完整的 TypeScript 类型定义
 *
 * @example
 * ```typescript
 * const loader = new DataConfigLoader();
 * const dataSources = await loader.loadDataSourcesConfig();
 * const urls = await loader.getDataSourceUrls('prismarineData', 'enchantments', { version: '1.21.4' });
 * ```
 */
export class DataConfigLoader implements IDataConfigLoader {
    private readonly logger: ILogger;
    private readonly dataDir: string;

    // 通用配置缓存
    private readonly configCache = new Map<string, unknown>();

    constructor(logger: ILogger, extensionPath?: string) {
        this.logger = logger.createChild('DataConfigLoader');

        // 确定 data 目录路径
        const basePath = extensionPath || this.getExtensionPath();
        this.dataDir = path.join(basePath, 'data');

        this.logger.debug('DataConfigLoader initialized', { dataDir: this.dataDir });
    }

    /**
     * 获取扩展根目录路径
     */
    private getExtensionPath(): string {
        // esbuild 打包后 __dirname = <root>/out/，向上 1 级即为扩展根目录
        return path.resolve(__dirname, '..');
    }

    /**
     * 加载 JSON 配置文件
     *
     * @param relativePath 相对于 data 目录的路径
     * @param validator 可选的验证函数，用于验证加载的数据结构
     * @throws ConfigLoadError 当配置文件不存在或加载失败时
     */
    private async loadJsonFile<T>(
        relativePath: string,
        validator?: (data: unknown) => data is T
    ): Promise<T> {
        // 路径安全检查：防止路径遍历攻击
        const normalizedPath = path.normalize(relativePath);
        if (normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
            throw new ConfigLoadError(relativePath, 'Path traversal detected');
        }

        const filePath = path.join(this.dataDir, normalizedPath);

        try {
            // 直接读取文件，避免 access + readFile 的竞态条件
            let content: string;
            try {
                content = await fs.promises.readFile(filePath, 'utf-8');
            } catch {
                throw new ConfigLoadError(relativePath, 'File not found');
            }

            const data: unknown = JSON.parse(content);

            // 如果提供了验证器，进行数据结构验证
            if (validator) {
                if (!validator(data)) {
                    throw new ConfigLoadError(relativePath, 'Invalid config structure');
                }
                return data;
            }

            // 基本结构验证：确保是对象且有 version 字段
            if (!this.isValidConfigObject(data)) {
                throw new ConfigLoadError(relativePath, 'Missing required fields (version)');
            }

            this.logger.debug('Config file loaded successfully', { filePath });
            return data as T;

        } catch (error) {
            if (error instanceof ConfigLoadError) {
                this.logger.error('Config load error', error, { filePath });
                throw error;
            }
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new ConfigLoadError(relativePath, message);
        }
    }

    /**
     * 验证配置对象的基本结构
     */
    private isValidConfigObject(data: unknown): data is { version: string } {
        return (
            typeof data === 'object' &&
            data !== null &&
            'version' in data &&
            typeof (data as Record<string, unknown>).version === 'string'
        );
    }

    // ========================================================================
    // 公共方法 - 加载配置
    // ========================================================================

    /**
     * 通用缓存加载方法
     *
     * @param cacheKey 缓存键
     * @param relativePath 相对于 data 目录的路径
     * @returns 配置对象
     */
    private async loadCachedConfig<T>(cacheKey: string, relativePath: string): Promise<T> {
        const cached = this.configCache.get(cacheKey) as T | undefined;
        if (cached) {
            return cached;
        }

        const config = await this.loadJsonFile<T>(relativePath);
        this.configCache.set(cacheKey, config);
        return config;
    }

    async loadDataSourcesConfig(): Promise<IDataSourcesConfig> {
        return this.loadCachedConfig<IDataSourcesConfig>('dataSources', 'network/data-sources.json');
    }

    async loadCompletionPrioritiesConfig(): Promise<ICompletionPrioritiesConfig> {
        return this.loadCachedConfig<ICompletionPrioritiesConfig>('completionPriorities', 'constants/completion-priorities.json');
    }

    async loadPerformanceConfig(): Promise<IPerformanceConfig> {
        return this.loadCachedConfig<IPerformanceConfig>('performance', 'constants/performance-config.json');
    }

    async loadExtendedTypesConfig(): Promise<IExtendedTypesConfig> {
        return this.loadCachedConfig<IExtendedTypesConfig>('extendedTypes', 'constants/extended-types.json');
    }

    async loadMinecraftVersionsConfig(): Promise<IMinecraftVersionsConfig> {
        return this.loadCachedConfig<IMinecraftVersionsConfig>('minecraftVersions', 'minecraft/versions.json');
    }

    async loadModelPropertiesConfig(): Promise<IModelPropertiesConfig> {
        return this.loadCachedConfig<IModelPropertiesConfig>('modelProperties', 'minecraft/model-properties.json');
    }

    async loadVersionConditionConfig(): Promise<IVersionConditionConfig> {
        return this.loadCachedConfig<IVersionConditionConfig>('versionCondition', 'constants/version-condition.json');
    }

    async loadTimingConfig(): Promise<ITimingConfig> {
        return this.loadCachedConfig<ITimingConfig>('timing', 'constants/timing-config.json');
    }

    async loadVersionRequirementsConfig(): Promise<IVersionRequirementsConfig> {
        return this.loadCachedConfig<IVersionRequirementsConfig>('versionRequirements', 'constants/version-requirements.json');
    }

    async loadApiEndpointsConfig(): Promise<IApiEndpointsConfig> {
        return this.loadCachedConfig<IApiEndpointsConfig>('apiEndpoints', 'network/api-endpoints.json');
    }

    async loadMiniMessageConstantsConfig(): Promise<IMiniMessageConstantsConfig> {
        return this.loadCachedConfig<IMiniMessageConstantsConfig>('miniMessageConstants', 'schema/minimessage-constants.json');
    }

    async loadResourceTypePresetsConfig(): Promise<IResourceTypePresetsConfig> {
        return this.loadCachedConfig<IResourceTypePresetsConfig>('resourceTypePresets', 'schema/resource-type-presets.json');
    }

    async loadParameterTypesConfig(): Promise<IParameterTypesConfig> {
        return this.loadCachedConfig<IParameterTypesConfig>('parameterTypes', 'schema/parameter-types.json');
    }

    async loadDiagnosticCodesConfig(): Promise<IDiagnosticCodesConfig> {
        return this.loadCachedConfig<IDiagnosticCodesConfig>('diagnosticCodes', 'constants/diagnostic-codes.json');
    }

    async loadDiagnosticSeverityRulesConfig(): Promise<IDiagnosticSeverityRulesConfig> {
        return this.loadCachedConfig<IDiagnosticSeverityRulesConfig>('diagnosticSeverityRules', 'constants/diagnostic-severity-rules.json');
    }

    async loadSchemaConfig(): Promise<ISchemaConfig> {
        return this.loadCachedConfig<ISchemaConfig>('schemaConfig', 'constants/schema-config.json');
    }

    async loadItemTypeConfig(): Promise<IItemTypeConfig> {
        return this.loadCachedConfig<IItemTypeConfig>('itemTypeConfig', 'constants/item-type-config.json');
    }

    // ========================================================================
    // 公共方法 - 便捷访问
    // ========================================================================

    /**
     * 获取数据源 URL 列表
     */
    async getDataSourceUrls(
        sourceKey: string,
        endpointKey: string,
        params?: Record<string, string>
    ): Promise<string[]> {
        const config = await this.loadDataSourcesConfig();
        const source = config.sources[sourceKey];

        if (!source) {
            this.logger.warn('Data source not found', { sourceKey });
            return [];
        }

        const endpointTemplate = source.endpoints[endpointKey];
        if (!endpointTemplate) {
            this.logger.warn('Endpoint not found', { sourceKey, endpointKey });
            return [];
        }

        const urls: string[] = [];

        // 构建主站 URL
        const mainUrl = this.buildUrl(source.primary, endpointTemplate, params);
        urls.push(mainUrl);

        // 构建镜像站 URL
        for (const mirror of source.mirrors) {
            const mirrorUrl = this.buildUrl(mirror, endpointTemplate, params);
            urls.push(mirrorUrl);
        }

        return urls;
    }

    /**
     * 获取补全策略优先级（异步）
     */
    async getCompletionPriority(strategyKey: string, isDelegate = false): Promise<number> {
        const config = await this.loadCompletionPrioritiesConfig();
        const strategies = isDelegate ? config.strategies.delegates : config.strategies.main;
        const strategy = strategies[strategyKey];

        if (strategy) {
            return strategy.priority;
        }

        // 返回默认优先级
        return isDelegate ? 75 : 85;
    }

    /**
     * 同步获取补全策略优先级（从缓存）
     *
     * 用于策略类构造函数中同步获取优先级。
     * 如果缓存未加载，返回默认值。
     *
     * @param strategyKey 策略键名（如 'schemaAware', 'schemaKey', 'filePath'）
     * @param isDelegate 是否是委托策略
     * @returns 优先级数值
     */
    getCompletionPrioritySync(strategyKey: string, isDelegate = false): number {
        const cache = this.configCache.get('completionPriorities') as ICompletionPrioritiesConfig | undefined;
        if (!cache) {
            // 缓存未加载，返回默认值
            return isDelegate ? 75 : (strategyKey === 'schemaAware' ? 90 : 85);
        }

        const strategies = isDelegate
            ? cache.strategies.delegates
            : cache.strategies.main;
        const strategy = strategies[strategyKey];

        if (strategy) {
            return strategy.priority;
        }

        // 返回默认优先级
        return isDelegate ? 75 : 85;
    }

    /**
     * 同步获取时间配置（从缓存）
     *
     * 用于需要同步访问时间配置的场景。
     * 如果缓存未加载，返回 null。
     *
     * @returns 时间配置或 null
     */
    getTimingConfigSync(): ITimingConfig | null {
        return (this.configCache.get('timing') as ITimingConfig) ?? null;
    }

    /**
     * 同步获取版本要求配置（从缓存）
     *
     * @returns 版本要求配置或 null
     */
    getVersionRequirementsConfigSync(): IVersionRequirementsConfig | null {
        return (this.configCache.get('versionRequirements') as IVersionRequirementsConfig) ?? null;
    }

    /**
     * 预加载所有配置到缓存
     *
     * 在扩展初始化时调用，确保后续同步访问可用。
     * 此方法必须在使用任何配置之前调用成功。
     *
     * @throws ConfigLoadError 当任何配置文件加载失败时
     */
    async preloadAllConfigs(): Promise<void> {
        this.logger.info('Preloading all configuration files');

        await Promise.all([
            this.loadCompletionPrioritiesConfig(),
            this.loadTimingConfig(),
            this.loadVersionRequirementsConfig(),
            this.loadDataSourcesConfig(),
            this.loadApiEndpointsConfig(),
            this.loadPerformanceConfig(),
            this.loadExtendedTypesConfig(),
            this.loadDiagnosticCodesConfig(),
            this.loadDiagnosticSeverityRulesConfig(),
            this.loadSchemaConfig(),
            this.loadMinecraftVersionsConfig(),
            this.loadModelPropertiesConfig(),
            this.loadItemTypeConfig(),
            this.loadMiniMessageConstantsConfig()
        ]);

        this.logger.info('All configuration files preloaded successfully');
    }

    /**
     * 检查配置是否已预加载
     *
     * @returns 如果所有必需配置都已加载则返回 true
     */
    isPreloaded(): boolean {
        return !!(
            this.configCache.has('timing') &&
            this.configCache.has('dataSources') &&
            this.configCache.has('apiEndpoints') &&
            this.configCache.has('versionRequirements') &&
            this.configCache.has('diagnosticCodes') &&
            this.configCache.has('diagnosticSeverityRules') &&
            this.configCache.has('schemaConfig') &&
            this.configCache.has('minecraftVersions') &&
            this.configCache.has('modelProperties') &&
            this.configCache.has('itemTypeConfig') &&
            this.configCache.has('miniMessageConstants')
        );
    }

    /**
     * 同步获取数据源配置（从缓存）
     *
     * @returns 数据源配置或 null（如果未预加载）
     */
    getDataSourcesConfigSync(): IDataSourcesConfig | null {
        return (this.configCache.get('dataSources') as IDataSourcesConfig) ?? null;
    }

    /**
     * 同步获取 API 端点配置（从缓存）
     *
     * @returns API 端点配置或 null（如果未预加载）
     */
    getApiEndpointsConfigSync(): IApiEndpointsConfig | null {
        return (this.configCache.get('apiEndpoints') as IApiEndpointsConfig) ?? null;
    }

    /**
     * 同步获取诊断代码配置（从缓存）
     *
     * @returns 诊断代码配置或 null（如果未预加载）
     */
    getDiagnosticCodesConfigSync(): IDiagnosticCodesConfig | null {
        return (this.configCache.get('diagnosticCodes') as IDiagnosticCodesConfig) ?? null;
    }

    /**
     * 同步获取诊断严重程度规则配置（从缓存）
     *
     * @returns 诊断严重程度规则配置或 null（如果未预加载）
     */
    getDiagnosticSeverityRulesConfigSync(): IDiagnosticSeverityRulesConfig | null {
        return (this.configCache.get('diagnosticSeverityRules') as IDiagnosticSeverityRulesConfig) ?? null;
    }

    /**
     * 同步获取 Schema 配置（从缓存）
     *
     * @returns Schema 配置或 null（如果未预加载）
     */
    getSchemaConfigSync(): ISchemaConfig | null {
        return (this.configCache.get('schemaConfig') as ISchemaConfig) ?? null;
    }

    /**
     * 同步获取物品类型配置（从缓存）
     *
     * @returns 物品类型配置或 null（如果未预加载）
     */
    getItemTypeConfigSync(): IItemTypeConfig | null {
        return (this.configCache.get('itemTypeConfig') as IItemTypeConfig) ?? null;
    }

    /**
     * 同步获取 MiniMessage 常量配置（从缓存）
     *
     * @returns MiniMessage 常量配置或 null（如果未预加载）
     */
    getMiniMessageConstantsConfigSync(): IMiniMessageConstantsConfig | null {
        return (this.configCache.get('miniMessageConstants') as IMiniMessageConstantsConfig) ?? null;
    }

    /**
     * 同步获取 Minecraft 版本配置（从缓存）
     *
     * @returns Minecraft 版本配置或 null（如果未预加载）
     */
    getMinecraftVersionsConfigSync(): IMinecraftVersionsConfig | null {
        return (this.configCache.get('minecraftVersions') as IMinecraftVersionsConfig) ?? null;
    }

    /**
     * 同步获取模型属性配置（从缓存）
     *
     * @returns 模型属性配置或 null（如果未预加载）
     */
    getModelPropertiesConfigSync(): IModelPropertiesConfig | null {
        return (this.configCache.get('modelProperties') as IModelPropertiesConfig) ?? null;
    }

    /**
     * 获取网络请求超时时间
     */
    async getRequestTimeout(): Promise<number> {
        const config = await this.loadPerformanceConfig();
        return config.network.requestTimeout;
    }

    /**
     * 清除配置缓存
     */
    clearCache(): void {
        this.configCache.clear();
        this.logger.info('Config cache cleared');
    }

    /**
     * 释放资源
     *
     * 在扩展停用时调用，清理所有缓存
     */
    dispose(): void {
        this.clearCache();
        this.logger.debug('DataConfigLoader disposed');
    }

    // ========================================================================
    // 私有方法 - 辅助函数
    // ========================================================================

    /**
     * 构建完整 URL
     */
    private buildUrl(
        baseUrl: string,
        endpointTemplate: string,
        params?: Record<string, string>
    ): string {
        let url = `${baseUrl}/${endpointTemplate}`;

        if (params) {
            for (const [key, value] of Object.entries(params)) {
                url = url.replace(`{${key}}`, value);
            }
        }

        return url;
    }
}
