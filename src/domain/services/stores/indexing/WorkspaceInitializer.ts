import { type ILogger } from '../../../../core/interfaces/ILogger';
import {
    type IYamlScanner,
    type IYamlScanResult,
    type IYamlScanOptions,
} from '../../../../core/interfaces/IYamlScanner';
import { type TemplateStore } from '../TemplateStore';
import { type TranslationStore } from '../TranslationStore';
import { type ItemStore } from '../ItemStore';
import { type CategoryStore } from '../CategoryStore';
import { type DocumentProcessor } from '../DocumentProcessor';

/**
 * 工作区初始化器
 *
 * 负责执行工作区扫描和批量文档处理。
 * 支持重试机制和并行批处理以提高初始化速度。
 *
 * @remarks
 * **初始化流程**：
 * 1. 并行执行工作区扫描和 Minecraft 物品加载
 * 2. 批量并行处理文档（默认批次大小：10）
 * 3. 失败时自动重试（默认最大重试次数：2）
 *
 * **性能优化**：
 * - 并行执行独立任务
 * - 批量处理文档，避免阻塞
 * - 失败时使用指数退避重试
 *
 * @example
 * ```typescript
 * const initializer = new WorkspaceInitializer(
 *     logger,
 *     documentProcessor,
 *     itemStore,
 *     scanResultProvider
 * );
 *
 * // 执行初始化
 * await initializer.performInitialization(
 *     templateStore,
 *     translationStore,
 *     categoryStore
 * );
 * ```
 */
export class WorkspaceInitializer {
    /** 默认最大重试次数 */
    private static readonly DEFAULT_MAX_RETRIES = 2;
    /** 默认重试退避基数（毫秒） */
    private static readonly DEFAULT_RETRY_BASE_DELAY_MS = 1000;
    /** 默认文档处理批次大小 */
    private static readonly DEFAULT_BATCH_SIZE = 10;

    /** 最大重试次数 */
    private readonly maxRetries: number;
    /** 重试退避基数（毫秒） */
    private readonly retryBaseDelayMs: number;
    /** 文档处理批次大小 */
    private readonly batchSize: number;

    /**
     * 构造工作区初始化器实例
     *
     * @param logger - 日志记录器
     * @param documentProcessor - 文档处理器
     * @param itemStore - 物品存储
     * @param yamlScanner - YAML 扫描器
     * @param scanResultProvider - 扫描结果提供者（可选）
     * @param config - 配置选项
     */
    constructor(
        private readonly logger: ILogger,
        private readonly documentProcessor: DocumentProcessor,
        private readonly itemStore: ItemStore,
        private readonly yamlScanner: IYamlScanner,
        private readonly scanResultProvider?: { getScanResult(options: IYamlScanOptions): Promise<IYamlScanResult> },
        config?: {
            maxRetries?: number;
            retryBaseDelayMs?: number;
            batchSize?: number;
        },
    ) {
        this.maxRetries = config?.maxRetries ?? WorkspaceInitializer.DEFAULT_MAX_RETRIES;
        this.retryBaseDelayMs = config?.retryBaseDelayMs ?? WorkspaceInitializer.DEFAULT_RETRY_BASE_DELAY_MS;
        this.batchSize = config?.batchSize ?? WorkspaceInitializer.DEFAULT_BATCH_SIZE;
    }

    /**
     * 执行初始化
     *
     * 带重试机制的初始化流程。
     *
     * @param templateStore - 模板存储
     * @param translationStore - 翻译存储
     * @param categoryStore - 分类存储
     * @returns Promise，表示初始化完成
     * @throws {Error} 如果所有重试都失败
     */
    async performInitialization(
        templateStore: TemplateStore,
        translationStore: TranslationStore,
        categoryStore: CategoryStore,
    ): Promise<void> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            if (attempt > 0) {
                const delay = this.retryBaseDelayMs * (attempt * 2 - 1);
                this.logger.warn('Retrying data store initialization', { attempt, delayMs: delay });

                // 清理上次失败的残留数据
                templateStore.clear();
                translationStore.clear();
                this.itemStore.clear();
                await categoryStore.clearCategories();

                await new Promise((resolve) => setTimeout(resolve, delay));
            }

            try {
                await this.doPerformInitialization(templateStore, translationStore, categoryStore);
                return;
            } catch (error) {
                lastError = error as Error;
                this.logger.warn('Data store initialization attempt failed', {
                    attempt: attempt + 1,
                    maxAttempts: this.maxRetries + 1,
                    error: lastError.message,
                });
            }
        }

        const finalError = lastError ?? new Error('Data store initialization failed after all retries');
        this.logger.error('Data store initialization failed after all retries', finalError);
        throw finalError;
    }

    /**
     * 执行实际的初始化逻辑
     *
     * 优化：并行执行工作区扫描和 Minecraft 物品加载，
     * 批量并行处理文档以提高初始化速度。
     *
     * @param templateStore - 模板存储
     * @param translationStore - 翻译存储
     * @param categoryStore - 分类存储
     */
    private async doPerformInitialization(
        templateStore: TemplateStore,
        translationStore: TranslationStore,
        categoryStore: CategoryStore,
    ): Promise<void> {
        const startTime = performance.now();

        this.logger.info('Initializing data store service...');

        // 并行执行：工作区扫描和 Minecraft 物品加载
        const [scanResult] = await Promise.all([
            this.getScanResult(),
            // 提前开始加载 Minecraft 内置物品（不等待扫描完成）
            this.itemStore.loadMinecraftBuiltinItems().catch((error) => {
                this.logger.warn('Failed to load Minecraft builtin items', {
                    error: error instanceof Error ? error.message : String(error),
                });
            }),
        ]);

        // 批量并行处理文档
        const documents = scanResult.documents;
        for (let i = 0; i < documents.length; i += this.batchSize) {
            const batch = documents.slice(i, i + this.batchSize);

            // 并行处理当前批次
            await Promise.all(
                batch.map(async (document) => {
                    try {
                        await this.documentProcessor.processDocument(document.sourceFile, document.content);
                    } catch (error) {
                        this.logger.warn('Failed to process document', {
                            file: document.sourceFile.fsPath,
                            error: error instanceof Error ? error.message : String(error),
                        });
                    }
                }),
            );
        }

        this.logger.info('Data store initialized', {
            templateCount: await templateStore.count(),
            translationKeyCount: translationStore.getCount(),
            itemCount: await this.itemStore.getItemCount(),
            categoryCount: await categoryStore.getCategoryCount(),
            languageCount: translationStore.getLanguageCount(),
            namespaceCount: this.itemStore.getNamespaceCount(),
            builtinItemsLoaded: this.itemStore.isBuiltinItemsLoaded(),
            duration: `${(performance.now() - startTime).toFixed(2)}ms`,
        });
    }

    /**
     * 获取扫描结果
     */
    private async getScanResult(): Promise<IYamlScanResult> {
        if (this.scanResultProvider) {
            return this.scanResultProvider.getScanResult({ exclude: '**/node_modules/**', skipInvalid: true });
        }
        return this.yamlScanner.scanWorkspace({ exclude: '**/node_modules/**', skipInvalid: true });
    }
}
