/**
 * 数据配置加载器接口定义
 *
 * 提供从 JSON 配置文件加载各种配置数据的能力。
 * 数据类型定义已提取到 ../types/ConfigTypes.ts。
 */

import {
    type IDataSourcesConfig,
    type ICompletionPrioritiesConfig,
    type IPerformanceConfig,
    type IExtendedTypesConfig,
    type IMinecraftVersionsConfig,
    type IModelPropertiesConfig,
    type IVersionConditionConfig,
    type ITimingConfig,
    type IVersionRequirementsConfig,
    type IApiEndpointsConfig,
    type IMiniMessageConstantsConfig,
    type IResourceTypePresetsConfig,
    type IParameterTypesConfig,
    type IDiagnosticCodesConfig,
    type IDiagnosticSeverityRulesConfig,
    type ISchemaConfig,
    type IItemTypeConfig,
} from '../types/ConfigTypes';

// 向后兼容：重新导出所有配置类型
export * from '../types/ConfigTypes';

/**
 * 数据配置加载器接口
 */
export interface IDataConfigLoader {
    /**
     * 加载数据源配置
     * @returns 数据源配置
     */
    loadDataSourcesConfig(): Promise<IDataSourcesConfig>;

    /**
     * 加载补全优先级配置
     * @returns 补全优先级配置
     */
    loadCompletionPrioritiesConfig(): Promise<ICompletionPrioritiesConfig>;

    /**
     * 加载性能配置
     * @returns 性能配置
     */
    loadPerformanceConfig(): Promise<IPerformanceConfig>;

    /**
     * 加载扩展类型配置
     * @returns 扩展类型配置
     */
    loadExtendedTypesConfig(): Promise<IExtendedTypesConfig>;

    /**
     * 加载 Minecraft 版本配置
     * @returns Minecraft 版本配置
     */
    loadMinecraftVersionsConfig(): Promise<IMinecraftVersionsConfig>;

    /**
     * 加载模型属性配置
     * @returns 模型属性配置
     */
    loadModelPropertiesConfig(): Promise<IModelPropertiesConfig>;

    /**
     * 加载版本条件配置
     * @returns 版本条件配置
     */
    loadVersionConditionConfig(): Promise<IVersionConditionConfig>;

    /**
     * 加载时间配置
     * @returns 时间配置
     */
    loadTimingConfig(): Promise<ITimingConfig>;

    /**
     * 加载版本要求配置
     * @returns 版本要求配置
     */
    loadVersionRequirementsConfig(): Promise<IVersionRequirementsConfig>;

    /**
     * 加载 API 端点配置
     * @returns API 端点配置
     */
    loadApiEndpointsConfig(): Promise<IApiEndpointsConfig>;

    /**
     * 加载 MiniMessage 常量配置
     * @returns MiniMessage 常量配置
     */
    loadMiniMessageConstantsConfig(): Promise<IMiniMessageConstantsConfig>;

    /**
     * 加载资源类型预设配置
     * @returns 资源类型预设配置
     */
    loadResourceTypePresetsConfig(): Promise<IResourceTypePresetsConfig>;

    /**
     * 加载参数类型配置
     * @returns 参数类型配置
     */
    loadParameterTypesConfig(): Promise<IParameterTypesConfig>;

    /**
     * 加载诊断代码配置
     * @returns 诊断代码配置
     */
    loadDiagnosticCodesConfig(): Promise<IDiagnosticCodesConfig>;

    /**
     * 加载诊断严重程度规则配置
     * @returns 诊断严重程度规则配置
     */
    loadDiagnosticSeverityRulesConfig(): Promise<IDiagnosticSeverityRulesConfig>;

    /**
     * 加载 Schema 配置
     * @returns Schema 配置
     */
    loadSchemaConfig(): Promise<ISchemaConfig>;

    /**
     * 加载物品类型配置
     * @returns 物品类型配置
     */
    loadItemTypeConfig(): Promise<IItemTypeConfig>;

    /**
     * 同步获取物品类型配置（从缓存）
     * @returns 物品类型配置或 null
     */
    getItemTypeConfigSync(): IItemTypeConfig | null;

    /**
     * 同步获取 MiniMessage 常量配置（从缓存）
     * @returns MiniMessage 常量配置或 null
     */
    getMiniMessageConstantsConfigSync(): IMiniMessageConstantsConfig | null;

    /**
     * 同步获取诊断代码配置（从缓存）
     * @returns 诊断代码配置或 null
     */
    getDiagnosticCodesConfigSync(): IDiagnosticCodesConfig | null;

    /**
     * 同步获取诊断严重程度规则配置（从缓存）
     * @returns 诊断严重程度规则配置或 null
     */
    getDiagnosticSeverityRulesConfigSync(): IDiagnosticSeverityRulesConfig | null;

    /**
     * 同步获取 Schema 配置（从缓存）
     * @returns Schema 配置或 null
     */
    getSchemaConfigSync(): ISchemaConfig | null;

    /**
     * 同步获取 Minecraft 版本配置（从缓存）
     * @returns Minecraft 版本配置或 null
     */
    getMinecraftVersionsConfigSync(): IMinecraftVersionsConfig | null;

    /**
     * 同步获取模型属性配置（从缓存）
     * @returns 模型属性配置或 null
     */
    getModelPropertiesConfigSync(): IModelPropertiesConfig | null;

    /**
     * 获取数据源 URL 列表
     * @param sourceKey 数据源键名
     * @param endpointKey 端点键名
     * @param params URL 参数替换
     * @returns URL 列表（主站 + 镜像站）
     */
    getDataSourceUrls(sourceKey: string, endpointKey: string, params?: Record<string, string>): Promise<string[]>;

    /**
     * 获取补全策略优先级（异步）
     * @param strategyKey 策略键名
     * @param isDelegate 是否是委托策略
     * @returns 优先级数值
     */
    getCompletionPriority(strategyKey: string, isDelegate?: boolean): Promise<number>;

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
    getCompletionPrioritySync(strategyKey: string, isDelegate?: boolean): number;

    /**
     * 同步获取时间配置（从缓存）
     * @returns 时间配置或 null
     */
    getTimingConfigSync(): ITimingConfig | null;

    /**
     * 同步获取版本要求配置（从缓存）
     * @returns 版本要求配置或 null
     */
    getVersionRequirementsConfigSync(): IVersionRequirementsConfig | null;

    /**
     * 同步获取数据源配置（从缓存）
     * @returns 数据源配置或 null
     */
    getDataSourcesConfigSync(): IDataSourcesConfig | null;

    /**
     * 同步获取 API 端点配置（从缓存）
     * @returns API 端点配置或 null
     */
    getApiEndpointsConfigSync(): IApiEndpointsConfig | null;

    /**
     * 检查配置是否已预加载
     * @returns 如果所有必需配置都已加载则返回 true
     */
    isPreloaded(): boolean;

    /**
     * 预加载所有配置到缓存
     */
    preloadAllConfigs(): Promise<void>;

    /**
     * 获取网络请求超时时间
     * @returns 超时时间（毫秒）
     */
    getRequestTimeout(): Promise<number>;

    /**
     * 清除配置缓存
     */
    clearCache(): void;
}
