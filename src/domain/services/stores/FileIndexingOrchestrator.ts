import { EditorUri } from '../../../core/types/EditorTypes';
import { ILogger } from '../../../core/interfaces/ILogger';
import { IFileReader } from '../../../core/interfaces/IFileReader';
import { IYamlScanner, IYamlScanResult, IYamlScanOptions } from '../../../core/interfaces/IYamlScanner';
import { IYamlParser } from '../../../core/interfaces/IYamlParser';
import { IBuiltinItemLoader } from '../../../core/interfaces/IItemId';
import { IEventBus } from '../../../core/interfaces/IEventBus';
import { TemplateStore } from './TemplateStore';
import { TranslationStore } from './TranslationStore';
import { TranslationReferenceStore } from './TranslationReferenceStore';
import { ItemStore } from './ItemStore';
import { CategoryStore } from './CategoryStore';
import { DocumentProcessor } from './DocumentProcessor';
import { TemplateParserService } from '../template/TemplateParserService';

/**
 * 文件索引编排器
 *
 * 负责工作区扫描、初始化、文件变更和删除处理。
 * 从 DataStoreService 中提取的生命周期管理职责。
 */
export class FileIndexingOrchestrator {
    readonly templateStore: TemplateStore;
    readonly translationStore: TranslationStore;
    readonly translationReferenceStore: TranslationReferenceStore;
    readonly itemStore: ItemStore;
    readonly categoryStore: CategoryStore;
    private readonly documentProcessor: DocumentProcessor;

    /** 按文件 URI 的操作锁，防止同一文件的并发变更互相干扰 */
    private readonly fileLocks = new Map<string, Promise<void>>();
    /** 文件锁创建时间，用于定期清理 */
    private readonly fileLockTimes = new Map<string, number>();
    /** 文件锁清理定时器 */
    private fileLockCleanupInterval: ReturnType<typeof setInterval> | null = null;

    /** 默认最大重试次数 */
    private static readonly DEFAULT_MAX_RETRIES = 2;
    /** 默认重试退避基数（毫秒） */
    private static readonly DEFAULT_RETRY_BASE_DELAY_MS = 1000;
    /** 默认文档处理批次大小 */
    private static readonly DEFAULT_BATCH_SIZE = 10;
    /** 默认文件锁清理间隔（毫秒） */
    private static readonly DEFAULT_LOCK_CLEANUP_INTERVAL_MS = 300000; // 5 分钟
    /** 默认文件锁过期时间（毫秒） */
    private static readonly DEFAULT_LOCK_EXPIRY_MS = 60000; // 1 分钟

    /** 最大重试次数 */
    private readonly maxRetries: number;
    /** 重试退避基数（毫秒） */
    private readonly retryBaseDelayMs: number;
    /** 文档处理批次大小 */
    private readonly batchSize: number;
    /** 文件锁清理间隔（毫秒） */
    private readonly lockCleanupIntervalMs: number;
    /** 文件锁过期时间（毫秒） */
    private readonly lockExpiryMs: number;

    private initialized = false;
    private initPromise: Promise<void> | null = null;

    constructor(
        private readonly logger: ILogger,
        private readonly yamlScanner: IYamlScanner,
        private readonly yamlParser: IYamlParser,
        private readonly fileReader: IFileReader,
        private readonly scanResultProvider?: { getScanResult(options: IYamlScanOptions): Promise<IYamlScanResult> },
        builtinItemLoader?: IBuiltinItemLoader,
        eventBus?: IEventBus,
        fileIndexingConfig?: {
            maxRetries?: number;
            retryBaseDelayMs?: number;
            batchSize?: number;
            lockCleanupIntervalMs?: number;
            lockExpiryMs?: number;
        }
    ) {
        this.maxRetries = fileIndexingConfig?.maxRetries ?? FileIndexingOrchestrator.DEFAULT_MAX_RETRIES;
        this.retryBaseDelayMs = fileIndexingConfig?.retryBaseDelayMs ?? FileIndexingOrchestrator.DEFAULT_RETRY_BASE_DELAY_MS;
        this.batchSize = fileIndexingConfig?.batchSize ?? FileIndexingOrchestrator.DEFAULT_BATCH_SIZE;
        this.lockCleanupIntervalMs = fileIndexingConfig?.lockCleanupIntervalMs ?? FileIndexingOrchestrator.DEFAULT_LOCK_CLEANUP_INTERVAL_MS;
        this.lockExpiryMs = fileIndexingConfig?.lockExpiryMs ?? FileIndexingOrchestrator.DEFAULT_LOCK_EXPIRY_MS;
        this.templateStore = new TemplateStore(logger, eventBus);
        this.translationStore = new TranslationStore(logger, eventBus);
        this.translationReferenceStore = new TranslationReferenceStore();
        this.itemStore = new ItemStore(logger, builtinItemLoader, eventBus);
        this.categoryStore = new CategoryStore(logger, eventBus);
        this.documentProcessor = new DocumentProcessor(
            logger, this.templateStore, this.translationStore,
            this.itemStore, this.categoryStore, new TemplateParserService(logger),
            this.translationReferenceStore
        );

        // 启动文件锁定期清理
        this.startFileLockCleanup();
    }

    /**
     * 启动文件锁定期清理
     */
    private startFileLockCleanup(): void {
        if (this.fileLockCleanupInterval) {
            return;
        }

        this.fileLockCleanupInterval = setInterval(() => {
            this.cleanupExpiredFileLocks();
        }, this.lockCleanupIntervalMs);
    }

    /**
     * 清理过期的文件锁
     */
    private cleanupExpiredFileLocks(): void {
        const now = Date.now();
        const expiredKeys: string[] = [];

        for (const [key, createTime] of this.fileLockTimes) {
            if (now - createTime > this.lockExpiryMs) {
                expiredKeys.push(key);
            }
        }

        for (const key of expiredKeys) {
            this.fileLocks.delete(key);
            this.fileLockTimes.delete(key);
        }

        if (expiredKeys.length > 0) {
            this.logger.debug('Cleaned up expired file locks', { count: expiredKeys.length });
        }
    }

    // ========================================
    // 生命周期管理
    // ========================================

    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }
        if (this.initPromise) {
            return this.initPromise;
        }
        this.initPromise = this.performInitialization().finally(() => {
            this.initPromise = null;
        });
        return this.initPromise;
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    async reload(): Promise<void> {
        this.initialized = false;
        this.initPromise = null;
        this.templateStore.clear();
        this.translationStore.clear();
        this.translationReferenceStore.clear();
        this.itemStore.clear();
        await this.categoryStore.clearCategories();
        await this.initialize();
    }

    async clear(): Promise<void> {
        this.templateStore.clear();
        this.translationStore.clear();
        this.translationReferenceStore.clear();
        this.itemStore.clear();
        await this.categoryStore.clearCategories();
    }

    dispose(): void {
        // 停止文件锁清理定时器
        if (this.fileLockCleanupInterval) {
            clearInterval(this.fileLockCleanupInterval);
            this.fileLockCleanupInterval = null;
        }

        // 清理文件锁
        this.fileLocks.clear();
        this.fileLockTimes.clear();

        this.clear();
        this.initialized = false;
        this.initPromise = null;
    }

    // ========================================
    // 文件操作
    // ========================================

    async handleFileChange(fileUri: EditorUri): Promise<void> {
        await this.ensureInitialized();
        return this.withFileLock(fileUri, () => this.doHandleFileChange(fileUri));
    }

    async handleFileDelete(fileUri: EditorUri): Promise<void> {
        await this.ensureInitialized();
        return this.withFileLock(fileUri, () => this.doHandleFileDelete(fileUri));
    }

    async ensureInitialized(): Promise<void> {
        if (!this.initialized) {
            await this.initialize();
        }
    }

    // ========================================
    // 内部方法
    // ========================================

    private async performInitialization(): Promise<void> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            if (attempt > 0) {
                const delay = this.retryBaseDelayMs * (attempt * 2 - 1);
                this.logger.warn('Retrying data store initialization', { attempt, delayMs: delay });

                // 清理上次失败的残留数据
                this.templateStore.clear();
                this.translationStore.clear();
                this.translationReferenceStore.clear();
                this.itemStore.clear();
                await this.categoryStore.clearCategories();

                await new Promise(resolve => setTimeout(resolve, delay));
            }

            try {
                await this.doPerformInitialization();
                return;
            } catch (error) {
                lastError = error as Error;
                this.logger.warn('Data store initialization attempt failed', {
                    attempt: attempt + 1,
                    maxAttempts: this.maxRetries + 1,
                    error: lastError.message
                });
            }
        }

        this.logger.error('Data store initialization failed after all retries', lastError!);
        throw lastError;
    }

    /**
     * 执行实际的初始化逻辑
     *
     * 优化：并行执行工作区扫描和 Minecraft 物品加载，
     * 批量并行处理文档以提高初始化速度。
     */
    private async doPerformInitialization(): Promise<void> {
        const startTime = performance.now();

        this.logger.info('Initializing data store service...');

        // 并行执行：工作区扫描和 Minecraft 物品加载
        const [scanResult] = await Promise.all([
            this.getScanResult(),
            // 提前开始加载 Minecraft 内置物品（不等待扫描完成）
            this.itemStore.loadMinecraftBuiltinItems().catch(error => {
                this.logger.warn('Failed to load Minecraft builtin items', {
                    error: error instanceof Error ? error.message : String(error)
                });
            })
        ]);

        // 批量并行处理文档
        const documents = scanResult.documents;
        for (let i = 0; i < documents.length; i += this.batchSize) {
            const batch = documents.slice(i, i + this.batchSize);

            // 并行处理当前批次
            await Promise.all(batch.map(async (document) => {
                try {
                    await this.documentProcessor.processDocument(document.sourceFile, document.content);
                } catch (error) {
                    this.logger.warn('Failed to process document', {
                        file: document.sourceFile.fsPath,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }));
        }

        this.initialized = true;

        this.logger.info('Data store initialized', {
            templateCount: await this.templateStore.count(),
            translationKeyCount: this.translationStore.getCount(),
            translationReferenceCount: this.translationReferenceStore.getCount(),
            itemCount: await this.itemStore.getItemCount(),
            categoryCount: await this.categoryStore.getCategoryCount(),
            languageCount: this.translationStore.getLanguageCount(),
            namespaceCount: this.itemStore.getNamespaceCount(),
            builtinItemsLoaded: this.itemStore.isBuiltinItemsLoaded(),
            duration: `${(performance.now() - startTime).toFixed(2)}ms`
        });
    }

    private async getScanResult(): Promise<IYamlScanResult> {
        if (this.scanResultProvider) {
            return this.scanResultProvider.getScanResult({ exclude: '**/node_modules/**', skipInvalid: true });
        }
        return this.yamlScanner.scanWorkspace({ exclude: '**/node_modules/**', skipInvalid: true });
    }

    /**
     * 按文件 URI 串行化操作，不同文件可并行
     */
    private async withFileLock(fileUri: EditorUri, fn: () => Promise<void>): Promise<void> {
        const key = fileUri.toString();
        const prev = this.fileLocks.get(key) ?? Promise.resolve();

        // 记录锁创建时间
        this.fileLockTimes.set(key, Date.now());

        const next = prev.then(fn, fn).finally(() => {
            // 操作完成后，如果当前 Promise 仍是最新的，则清理
            if (this.fileLocks.get(key) === next) {
                this.fileLocks.delete(key);
                this.fileLockTimes.delete(key);
            }
        });

        this.fileLocks.set(key, next);

        return next;
    }

    private async doHandleFileChange(fileUri: EditorUri): Promise<void> {
        await this.templateStore.removeByFile(fileUri);
        await this.translationStore.removeByFile(fileUri);
        this.translationReferenceStore.removeByFile(fileUri.fsPath);
        await this.itemStore.removeItemsByFile(fileUri);
        await this.categoryStore.removeCategoriesByFile(fileUri);

        try {
            const fileContent = await this.fileReader.readFile(fileUri);
            const content = new TextDecoder('utf-8').decode(fileContent);

            const parseResult = await this.yamlParser.parseText(content, fileUri);
            if (parseResult.errors.length === 0) {
                await this.documentProcessor.processDocument(fileUri, content);
            }
        } catch (error) {
            this.logger.warn('Failed to process file change', {
                file: fileUri.fsPath,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private async doHandleFileDelete(fileUri: EditorUri): Promise<void> {
        await this.templateStore.removeByFile(fileUri);
        await this.translationStore.removeByFile(fileUri);
        this.translationReferenceStore.removeByFile(fileUri.fsPath);
        await this.itemStore.removeItemsByFile(fileUri);
        await this.categoryStore.removeCategoriesByFile(fileUri);
    }
}
