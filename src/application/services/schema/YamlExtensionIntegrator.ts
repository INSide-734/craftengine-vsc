import { extensions } from 'vscode';
import { ILogger } from '../../../core/interfaces/ILogger';
import { IPerformanceMonitor } from '../../../core/interfaces/IPerformanceMonitor';
import { SchemaDynamicGenerator } from './SchemaDynamicGenerator';

/**
 * Red Hat YAML 扩展 Schema API 接口
 */
interface IYamlSchemaApi {
    registerContributor(
        name: string,
        requestSchema: (uri: string) => Promise<string | null>,
        requestSchemaContent: (uri: string) => boolean
    ): Promise<void>;
}

/**
 * YAML 扩展集成器
 *
 * 负责检测、连接 Red Hat YAML 扩展并注册动态 Schema 提供者。
 * 从 SchemaLoaderService 中提取的 YAML 扩展集成职责。
 */
export class YamlExtensionIntegrator {
    private yamlExtension: ReturnType<typeof extensions.getExtension> | null = null;
    private isSchemaRegistered = false;

    constructor(
        private readonly logger: ILogger,
        private readonly performanceMonitor?: IPerformanceMonitor
    ) {}

    /**
     * 设置 YAML 扩展连接
     */
    async setup(): Promise<void> {
        try {
            this.yamlExtension = extensions.getExtension('redhat.vscode-yaml');

            if (!this.yamlExtension) {
                this.logger.info('Red Hat YAML extension not found, schema features may be limited');
                return;
            }

            // 确保扩展已激活
            if (!this.yamlExtension.isActive) {
                await this.yamlExtension.activate();
                this.logger.debug('Red Hat YAML extension activated');
            }
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
                                // 每次请求时动态生成最新的 Schema
                                if (uri.endsWith('.yml') || uri.endsWith('.yaml')) {
                                    return await generator.generateDynamicSchema();
                                }
                                return null;
                            },
                            (uri: string) => uri.endsWith('.yml') || uri.endsWith('.yaml')
                        );

                        this.isSchemaRegistered = true;
                        this.logger.info('Dynamic schema contributor registered successfully');
                    } else {
                        // 已注册，Schema 提供函数会自动返回最新内容
                        this.logger.debug('Schema contributor already registered, will use latest schema on next request');
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
    }
}
