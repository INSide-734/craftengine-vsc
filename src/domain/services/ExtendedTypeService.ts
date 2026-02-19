/**
 * 扩展参数类型服务
 *
 * 提供扩展参数类型的查询和验证功能
 * 从 JSON 配置文件加载类型定义
 */

import {
    IExtendedTypeService,
    IExtendedParameterTypeDefinition,
    IExtendedPropertyDefinition
} from '../../core/interfaces/IExtendedParameterType';
import { IDataConfigLoader, IExtendedTypesConfig } from '../../core/interfaces/IDataConfigLoader';
import { ILogger } from '../../core/interfaces/ILogger';
import { ServiceNotInitializedError } from '../../core/errors/ExtensionErrors';
import { createAsyncInitializer, AsyncInitializer } from '../../core/utils';

/**
 * 扩展参数类型服务实现
 *
 * 从 JSON 配置文件加载类型定义
 */
export class ExtendedTypeService implements IExtendedTypeService {
    private readonly logger: ILogger;
    private readonly configLoader: IDataConfigLoader;

    // 缓存配置数据
    private configCache: IExtendedTypesConfig | null = null;

    // 异步初始化器
    private readonly initializer: AsyncInitializer;

    constructor(logger: ILogger, configLoader: IDataConfigLoader) {
        this.logger = logger.createChild('ExtendedTypeService');
        this.configLoader = configLoader;

        this.initializer = createAsyncInitializer(async () => {
            this.configCache = await this.configLoader.loadExtendedTypesConfig();
            this.logger.debug('Extended types config loaded from JSON');
        });
    }

    /**
     * 确保配置已加载
     */
    private async ensureConfigLoaded(): Promise<void> {
        await this.initializer.ensure();
    }

    /**
     * 获取类型定义
     */
    private getTypes(): Record<string, IExtendedParameterTypeDefinition> {
        if (!this.configCache) {
            throw new ServiceNotInitializedError('ExtendedTypeService');
        }
        return this.configCache.types;
    }

    /**
     * 获取属性定义
     */
    private getPropertyDefinitions(): Record<string, IExtendedPropertyDefinition[]> {
        if (!this.configCache) {
            throw new ServiceNotInitializedError('ExtendedTypeService');
        }
        return this.configCache.propertyDefinitions;
    }

    /**
     * 获取代码片段
     */
    private getSnippets(): Record<string, string> {
        if (!this.configCache) {
            throw new ServiceNotInitializedError('ExtendedTypeService');
        }
        return this.configCache.snippets;
    }

    /**
     * 获取所有扩展参数类型名称
     */
    getTypeNames(): string[] {
        return Object.keys(this.getTypes());
    }

    /**
     * 检查是否是有效的扩展参数类型
     * @param typeName 类型名称
     */
    isValidType(typeName: string): boolean {
        return typeName in this.getTypes();
    }

    /**
     * 获取扩展参数类型定义
     * @param typeName 类型名称
     */
    getTypeDefinition(typeName: string): IExtendedParameterTypeDefinition | undefined {
        return this.getTypes()[typeName];
    }

    /**
     * 获取扩展参数类型的属性定义
     * @param typeName 类型名称
     */
    getTypeProperties(typeName: string): IExtendedPropertyDefinition[] {
        return this.getPropertyDefinitions()[typeName] || [];
    }

    /**
     * 获取扩展参数类型的代码片段
     * @param typeName 类型名称
     */
    getTypeSnippet(typeName: string): string | undefined {
        return this.getSnippets()[typeName];
    }

    /**
     * 初始化服务（预加载配置）
     *
     * 必须在使用服务前调用
     */
    async initialize(): Promise<void> {
        await this.ensureConfigLoaded();
    }

    /**
     * 清除配置缓存，强制下次访问时重新加载
     */
    clearCache(): void {
        this.configCache = null;
        this.initializer.reset();
        this.logger.debug('Extended types config cache cleared');
    }
}
