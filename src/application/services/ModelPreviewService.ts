/**
 * 模型预览服务
 *
 * 编排模型生成和渲染流程，提供完整的预览功能。
 *
 * @remarks
 * 该服务是应用层的核心服务，负责：
 * - 从物品 ID 获取配置
 * - 调用模型生成器生成模型
 * - 调用渲染器渲染预览图像
 * - 管理配置和资源
 */

import { Uri } from 'vscode';
import { type ILogger } from '../../core/interfaces/ILogger';
import { type IConfiguration } from '../../core/interfaces/IConfiguration';
import { type IDataStoreService } from '../../core/interfaces/IDataStoreService';
import { type IModelGenerator, type IMinecraftModelJson } from '../../core/interfaces/IModelGenerator';
import { type IModelPreviewService } from '../../core/interfaces/IModelPreviewService';
import { type ITemplateExpander } from '../../core/interfaces/ITemplateExpander';
import { type IRendererAdapter } from '../../core/interfaces/IRendererAdapter';
import { type IYamlParser } from '../../core/interfaces/IYamlParser';
import { type IResourcePackDiscovery } from '../../core/interfaces/IResourcePackDiscovery';
import { type IWorkspaceService } from '../../core/interfaces/IWorkspaceService';
import { ITEM_SECTION_KEYS } from '../../core/constants/ExtensionConstants';

// ============================================
// 模型预览服务
// ============================================

/**
 * 模型预览服务
 *
 * 编排模型生成和渲染流程，提供完整的预览功能。
 */
export class ModelPreviewService implements IModelPreviewService {
    private readonly logger: ILogger;
    private readonly configuration: IConfiguration;
    private readonly dataStoreService: IDataStoreService;
    private readonly modelGenerator: IModelGenerator;
    private readonly rendererAdapter: IRendererAdapter;
    private readonly yamlParser: IYamlParser;
    private readonly templateExpander: ITemplateExpander;
    private readonly workspaceService: IWorkspaceService;
    private readonly resourcePackDiscovery?: IResourcePackDiscovery;

    constructor(
        logger: ILogger,
        configuration: IConfiguration,
        dataStoreService: IDataStoreService,
        modelGenerator: IModelGenerator,
        rendererAdapter: IRendererAdapter,
        yamlParser: IYamlParser,
        templateExpander: ITemplateExpander,
        workspaceService: IWorkspaceService,
        resourcePackDiscovery?: IResourcePackDiscovery,
    ) {
        this.logger = logger.createChild('ModelPreviewService');
        this.configuration = configuration;
        this.dataStoreService = dataStoreService;
        this.modelGenerator = modelGenerator;
        this.rendererAdapter = rendererAdapter;
        this.yamlParser = yamlParser;
        this.templateExpander = templateExpander;
        this.workspaceService = workspaceService;
        this.resourcePackDiscovery = resourcePackDiscovery;
    }

    /**
     * 预览物品模型
     */
    async previewItem(itemId: string, options?: IPreviewOptions): Promise<IPreviewResult> {
        const startTime = performance.now();

        try {
            this.logger.info('Starting item preview', { itemId });

            // 1. 获取物品信息
            const item = await this.dataStoreService.getItemById(itemId);
            if (!item) {
                return {
                    success: false,
                    error: `Item not found: ${itemId}`,
                    itemId,
                };
            }

            // 2. 读取物品配置
            const itemConfig = await this.loadItemConfig(item.sourceFile, itemId);
            if (!itemConfig) {
                return {
                    success: false,
                    error: `Failed to load item configuration for: ${itemId}`,
                    itemId,
                };
            }

            // 3. 生成模型
            const modelResult = await this.modelGenerator.generateModel(itemConfig, itemId);

            if (!modelResult.success) {
                return {
                    success: false,
                    error: modelResult.error ?? 'Failed to generate model',
                    itemId,
                };
            }

            // 4. 初始化渲染器
            await this.initializeRenderer(options);

            // 5. 渲染模型
            let imageBuffer: Buffer;
            if (modelResult.modelJson) {
                // 优先使用 modelJson 渲染，因为它包含生成的完整模型定义
                if (this.rendererAdapter.supportsJsonRendering()) {
                    imageBuffer = await this.rendererAdapter.renderModelFromJson(modelResult.modelJson);
                } else if (modelResult.modelPath) {
                    // 如果不支持 JSON 渲染，尝试使用 modelPath
                    this.logger.debug('JSON rendering not supported, falling back to model path', {
                        modelPath: modelResult.modelPath,
                    });
                    imageBuffer = await this.rendererAdapter.renderModel(modelResult.modelPath);
                } else {
                    return {
                        success: false,
                        error: 'Custom model JSON rendering not supported and no model path available',
                        itemId,
                    };
                }
            } else if (modelResult.modelPath) {
                imageBuffer = await this.rendererAdapter.renderModel(modelResult.modelPath);
            } else {
                return {
                    success: false,
                    error: 'No model path or JSON available',
                    itemId,
                };
            }

            const duration = performance.now() - startTime;
            this.logger.info('Item preview completed', {
                itemId,
                modelPath: modelResult.modelPath,
                duration: `${duration.toFixed(2)}ms`,
            });

            return {
                success: true,
                imageBuffer,
                modelPath: modelResult.modelPath,
                itemId,
            };
        } catch (error) {
            this.logger.error('Failed to preview item', error as Error, { itemId });
            return {
                success: false,
                error: (error as Error).message,
                itemId,
            };
        }
    }

    /**
     * 预览原始模型路径
     */
    async previewModel(modelPath: string, options?: IPreviewOptions): Promise<IPreviewResult> {
        try {
            this.logger.info('Starting model preview', { modelPath });

            // 初始化渲染器
            await this.initializeRenderer(options);

            // 渲染模型
            const imageBuffer = await this.rendererAdapter.renderModel(modelPath);

            return {
                success: true,
                imageBuffer,
                modelPath,
            };
        } catch (error) {
            this.logger.error('Failed to preview model', error as Error, { modelPath });
            return {
                success: false,
                error: (error as Error).message,
                modelPath,
            };
        }
    }

    /**
     * 预览自定义模型 JSON
     */
    async previewCustomModel(modelJson: IMinecraftModelJson, options?: IPreviewOptions): Promise<IPreviewResult> {
        try {
            this.logger.info('Starting custom model preview', {
                parent: modelJson.parent,
            });

            // 初始化渲染器
            await this.initializeRenderer(options);

            // 检查是否支持 JSON 渲染
            if (!this.rendererAdapter.supportsJsonRendering()) {
                return {
                    success: false,
                    error: 'Custom model JSON rendering not supported by current renderer',
                };
            }

            // 渲染模型
            const imageBuffer = await this.rendererAdapter.renderModelFromJson(modelJson);

            this.logger.info('Custom model preview completed', {
                parent: modelJson.parent,
            });

            return {
                success: true,
                imageBuffer,
            };
        } catch (error) {
            this.logger.error('Failed to preview custom model', error as Error);
            return {
                success: false,
                error: (error as Error).message,
            };
        }
    }

    /**
     * 检查预览服务是否可用
     */
    isAvailable(): boolean {
        return true;
    }

    /**
     * 释放资源
     */
    dispose(): void {
        this.rendererAdapter.dispose();
        this.logger.info('Model preview service disposed');
    }

    // ============================================
    // 私有方法
    // ============================================

    /**
     * 初始化渲染器
     */
    private async initializeRenderer(options?: IPreviewOptions): Promise<void> {
        const mergedOptions = this.getMergedOptions(options);

        // 调试：打印渲染器初始化选项
        this.logger.info('Initializing renderer with options', {
            resourcePacks: mergedOptions.resourcePacks,
            useInternalResources: mergedOptions.useInternalResources,
            renderSize: mergedOptions.renderSize,
        });

        await this.rendererAdapter.initialize(mergedOptions);
    }

    /**
     * 获取合并后的选项
     */
    private getMergedOptions(options?: IPreviewOptions): IPreviewOptions {
        // 从配置中读取默认值
        const configResourcePacks = this.configuration.get<string[]>('craftengine.preview.resourcePacks', []);
        const configUseInternal = this.configuration.get<boolean>('craftengine.preview.useInternalResources', true);
        const configRenderSize = this.configuration.get<number>('craftengine.preview.renderSize', 256);

        // 解析资源包路径（支持相对路径）
        let resourcePacks = options?.resourcePacks ?? configResourcePacks;

        // 如果没有配置资源包，尝试自动发现工作区中的资源包
        if (resourcePacks.length === 0) {
            resourcePacks = this.discoverResourcePacks();
        }

        const resolvedPacks = this.resolveResourcePacks(resourcePacks);

        return {
            renderSize: options?.renderSize ?? configRenderSize,
            resourcePacks: resolvedPacks,
            useInternalResources: options?.useInternalResources ?? configUseInternal,
        };
    }

    /**
     * 自动发现工作区中的资源包
     *
     * 通过 assets/minecraft 目录结构识别有效的资源包目录。
     */
    private discoverResourcePacks(): string[] {
        if (!this.resourcePackDiscovery) {
            return [];
        }

        const packs = this.resourcePackDiscovery.discoverInWorkspace();
        const discovered = packs.map((pack) => pack.path);

        if (discovered.length > 0) {
            this.logger.info('Discovered resource packs', {
                count: discovered.length,
                paths: discovered,
            });
        }

        return discovered;
    }

    /**
     * 解析资源包路径
     */
    private resolveResourcePacks(paths: string[]): string[] {
        const workspaceRoot = this.workspaceService.getWorkspaceRootPath();
        if (!workspaceRoot) {
            return paths;
        }

        return paths.map((p) => {
            // 如果是绝对路径，直接返回
            if (p.startsWith('/') || p.match(/^[a-zA-Z]:\\/)) {
                return p;
            }
            // 相对路径，相对于工作区根目录
            return Uri.joinPath(Uri.file(workspaceRoot), p).fsPath;
        });
    }

    /**
     * 加载物品配置
     *
     * 根据物品 ID 从 YAML 文件中提取对应的物品配置。
     * 支持从 items、blocks、furniture 节点中查找。
     *
     * @param sourceFile - 源文件路径
     * @param itemId - 物品 ID（命名空间:物品名）
     * @returns 物品配置对象
     */
    private async loadItemConfig(sourceFile: string, itemId: string): Promise<unknown | undefined> {
        try {
            const uri = Uri.file(sourceFile);
            const document = await this.workspaceService.openTextDocument(uri);

            // 解析 YAML
            const parseResult = await this.yamlParser.parseDocument(document);
            if (!parseResult || !parseResult.root) {
                return undefined;
            }

            const parsed = parseResult.root.value;
            if (!parsed || typeof parsed !== 'object') {
                return undefined;
            }

            const root = parsed as Record<string, unknown>;

            // 在 items、blocks、furniture 节点中查找物品配置
            const sectionKeys: readonly string[] = ITEM_SECTION_KEYS;

            for (const sectionKey of sectionKeys) {
                const section = root[sectionKey];
                if (section && typeof section === 'object' && !Array.isArray(section)) {
                    const sectionObj = section as Record<string, unknown>;
                    const itemConfig = sectionObj[itemId];
                    if (itemConfig && typeof itemConfig === 'object') {
                        this.logger.debug('Found item config', {
                            itemId,
                            section: sectionKey,
                        });

                        // blocks 节点的模型配置在 state.model 下
                        // 需要提取并转换为 ModelGenerationService 期望的格式
                        let modelConfig: unknown;
                        if (sectionKey === 'blocks') {
                            const blockConfig = itemConfig as Record<string, unknown>;
                            const stateConfig = blockConfig.state as Record<string, unknown> | undefined;
                            if (stateConfig?.model) {
                                // 将 state.model 提升到根级别
                                modelConfig = { model: stateConfig.model };
                            } else {
                                // 如果没有 state.model，返回原始配置
                                modelConfig = itemConfig;
                            }
                        } else {
                            modelConfig = itemConfig;
                        }

                        // 展开模板引用
                        const expandedConfig = await this.expandTemplateConfig(modelConfig);
                        return expandedConfig;
                    }
                }
            }

            this.logger.warn('Item config not found in any section', {
                itemId,
                sourceFile,
                availableSections: Object.keys(root).filter((k) => sectionKeys.includes(k)),
            });
            return undefined;
        } catch (error) {
            this.logger.error('Failed to load item config', error as Error, { sourceFile, itemId });
            return undefined;
        }
    }

    /**
     * 展开配置中的模板引用
     *
     * @param config - 原始配置对象
     * @returns 展开后的配置对象
     */
    private async expandTemplateConfig(config: unknown): Promise<unknown> {
        if (!config || typeof config !== 'object') {
            return config;
        }

        const configObj = config as Record<string, unknown>;

        // 检查 model 字段是否包含 template
        if (configObj.model && typeof configObj.model === 'object') {
            const modelObj = configObj.model as Record<string, unknown>;
            if (modelObj.template) {
                this.logger.debug('Expanding model template', {
                    template: modelObj.template,
                });

                // 使用 TemplateExpander 展开模板
                const expansionResult = await this.templateExpander.expandObject(modelObj);
                if (expansionResult.success) {
                    this.logger.debug('Template expanded successfully', {
                        usedTemplates: expansionResult.usedTemplates,
                    });
                    return { ...configObj, model: expansionResult.expanded };
                } else {
                    this.logger.warn('Template expansion failed', {
                        errors: expansionResult.errors.map((e) => e.message),
                    });
                    // 展开失败时返回原始配置
                    return config;
                }
            }
        }

        return config;
    }
}
