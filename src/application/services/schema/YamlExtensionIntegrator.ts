import { type ILogger } from '../../../core/interfaces/ILogger';
import { type IPerformanceMonitor } from '../../../core/interfaces/IPerformanceMonitor';
import {
    type IExtensionRegistry,
    type IExtensionInfo,
    type IYamlSchemaApi,
} from '../../../core/interfaces/IExtensionRegistry';
import { type IWorkspaceService } from '../../../core/interfaces/IWorkspaceService';
import { type SchemaDynamicGenerator } from './SchemaDynamicGenerator';
import * as path from 'path';
import * as fs from 'fs';

/**
 * YAML 扩展集成器
 *
 * 负责检测、连接 Red Hat YAML 扩展并注册动态 Schema 提供者。
 * 从 SchemaLoaderService 中提取的 YAML 扩展集成职责。
 */
export class YamlExtensionIntegrator {
    private yamlExtension: IExtensionInfo | null = null;
    private isSchemaRegistered = false;
    /** 工作区是否为 CraftEngine 项目的缓存 */
    private craftEngineWorkspaceCache: boolean | null = null;

    constructor(
        private readonly logger: ILogger,
        private readonly extensionRegistry: IExtensionRegistry,
        private readonly workspaceService: IWorkspaceService,
        private readonly performanceMonitor?: IPerformanceMonitor,
    ) {}

    /**
     * 设置 YAML 扩展连接
     */
    async setup(): Promise<void> {
        try {
            const ext = this.extensionRegistry.getExtension('redhat.vscode-yaml');

            if (!ext) {
                this.logger.info('Red Hat YAML extension not found, schema features may be limited');
                this.yamlExtension = null;
                return;
            }

            // 确保扩展已激活
            if (!ext.isActive) {
                await ext.activate();
                this.logger.debug('Red Hat YAML extension activated');
            }

            this.yamlExtension = ext;
        } catch (error) {
            this.logger.error('Failed to setup YAML extension', error as Error);
            this.yamlExtension = null;
        }
    }

    /**
     * 注册动态 Schema 到 YAML 扩展
     */
    async registerDynamicSchema(generator: SchemaDynamicGenerator): Promise<void> {
        const timer = this.performanceMonitor?.startTimer('schema.register');

        try {
            if (this.yamlExtension?.exports) {
                const schemaApi = this.yamlExtension.exports as unknown as IYamlSchemaApi;

                if (schemaApi && typeof schemaApi.registerContributor === 'function') {
                    // 只在首次注册，避免重复注册导致错误
                    if (!this.isSchemaRegistered) {
                        await schemaApi.registerContributor(
                            'craftengine',
                            async (uri: string) => {
                                // 仅在 CraftEngine 工作区中提供 Schema
                                if (!this.isCraftEngineWorkspace()) {
                                    return null;
                                }
                                // 每次请求时动态生成最新的 Schema
                                if (uri.endsWith('.yml') || uri.endsWith('.yaml')) {
                                    return generator.generateDynamicSchema();
                                }
                                return null;
                            },
                            (uri: string) => {
                                // 仅在 CraftEngine 工作区中匹配 YAML 文件
                                if (!this.isCraftEngineWorkspace()) {
                                    return false;
                                }
                                return uri.endsWith('.yml') || uri.endsWith('.yaml');
                            },
                        );

                        this.isSchemaRegistered = true;
                        this.logger.info('Dynamic schema contributor registered successfully');
                    } else {
                        // 已注册，Schema 提供函数会自动返回最新内容
                        this.logger.debug(
                            'Schema contributor already registered, will use latest schema on next request',
                        );
                    }
                } else {
                    this.logger.info('YAML extension API not compatible, using fallback schema');
                }
            }

            timer?.stop({ success: true, alreadyRegistered: this.isSchemaRegistered });
        } catch (error) {
            this.logger.error('Failed to register dynamic schema', error as Error);
            timer?.stop({ success: false, error: (error as Error).message });
        }
    }

    /**
     * YAML 扩展是否可用
     */
    isAvailable(): boolean {
        return this.yamlExtension !== null;
    }

    /**
     * 重置注册状态
     */
    reset(): void {
        this.isSchemaRegistered = false;
        this.craftEngineWorkspaceCache = null;
    }

    /**
     * 检查当前工作区是否为 CraftEngine 项目
     *
     * 通过检测工作区根目录下是否存在 `.craftengine` 目录来判断。
     * 结果会被缓存，避免重复文件系统访问。
     */
    private isCraftEngineWorkspace(): boolean {
        if (this.craftEngineWorkspaceCache !== null) {
            return this.craftEngineWorkspaceCache;
        }

        const rootPath = this.workspaceService.getWorkspaceRootPath();
        if (!rootPath) {
            this.craftEngineWorkspaceCache = false;
            return false;
        }

        try {
            this.craftEngineWorkspaceCache = fs.existsSync(path.join(rootPath, '.craftengine'));
        } catch {
            this.craftEngineWorkspaceCache = false;
        }

        return this.craftEngineWorkspaceCache;
    }
}
