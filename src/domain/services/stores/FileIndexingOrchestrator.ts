import { type EditorUri } from '../../../core/types/EditorTypes';
import { type ILogger } from '../../../core/interfaces/ILogger';
import { type IFileReader } from '../../../core/interfaces/IFileReader';
import { type IYamlScanner, type IYamlScanResult, type IYamlScanOptions } from '../../../core/interfaces/IYamlScanner';
import { type IYamlParser } from '../../../core/interfaces/IYamlParser';
import { type IBuiltinItemLoader } from '../../../core/interfaces/IItemId';
import { type IEventBus } from '../../../core/interfaces/IEventBus';
import { TemplateStore } from './TemplateStore';
import { TranslationStore } from './TranslationStore';
import { TranslationReferenceStore } from './TranslationReferenceStore';
import { ItemStore } from './ItemStore';
import { CategoryStore } from './CategoryStore';
import { DocumentProcessor } from './DocumentProcessor';
import { TemplateParserService } from '../template/TemplateParserService';
import { FileLockManager, WorkspaceInitializer, FileChangeHandler } from './indexing';

/**
 * 文件索引编排器
 *
 * 负责工作区扫描、初始化、文件变更和删除处理。
 * 协调 FileLockManager、WorkspaceInitializer 和 FileChangeHandler 等子组件。
 *
 * @remarks
 * **核心职责**：
 * - 生命周期管理（初始化、重载、清理）
 * - 文件操作协调（变更、删除）
 * - 子组件管理（Store、Processor、子组件）
 *
 * **子组件**：
 * - FileLockManager：文件锁管理，防止并发冲突
 * - WorkspaceInitializer：工作区初始化，批量处理文档
 * - FileChangeHandler：文件变更处理，保持数据同步
 *
 * @example
 * ```typescript
 * const orchestrator = new FileIndexingOrchestrator(
 *     logger,
 *     yamlScanner,
 *     yamlParser,
 *     fileReader
 * );
 *
 * // 初始化
 * await orchestrator.initialize();
 *
 * // 处理文件变更
 * await orchestrator.handleFileChange(fileUri);
 *
 * // 清理资源
 * orchestrator.dispose();
 * ```
 */
export class FileIndexingOrchestrator {
    readonly templateStore: TemplateStore;
    readonly translationStore: TranslationStore;
    readonly translationReferenceStore: TranslationReferenceStore;
    readonly itemStore: ItemStore;
    readonly categoryStore: CategoryStore;
    private readonly documentProcessor: DocumentProcessor;

    // 子组件
    private readonly fileLockManager: FileLockManager;
    private readonly workspaceInitializer: WorkspaceInitializer;
    private readonly fileChangeHandler: FileChangeHandler;

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
        },
    ) {
        // 初始化 Store
        this.templateStore = new TemplateStore(logger, eventBus);
        this.translationStore = new TranslationStore(logger, eventBus);
        this.translationReferenceStore = new TranslationReferenceStore();
        this.itemStore = new ItemStore(logger, builtinItemLoader, eventBus);
        this.categoryStore = new CategoryStore(logger, eventBus);

        // 初始化文档处理器
        this.documentProcessor = new DocumentProcessor(
            logger,
            this.templateStore,
            this.translationStore,
            this.itemStore,
            this.categoryStore,
            new TemplateParserService(logger),
            this.translationReferenceStore,
        );

        // 初始化子组件
        this.fileLockManager = new FileLockManager(logger, {
            lockCleanupIntervalMs: fileIndexingConfig?.lockCleanupIntervalMs,
            lockExpiryMs: fileIndexingConfig?.lockExpiryMs,
        });

        this.workspaceInitializer = new WorkspaceInitializer(
            logger,
            this.documentProcessor,
            this.itemStore,
            yamlScanner,
            scanResultProvider,
            {
                maxRetries: fileIndexingConfig?.maxRetries,
                retryBaseDelayMs: fileIndexingConfig?.retryBaseDelayMs,
                batchSize: fileIndexingConfig?.batchSize,
            },
        );

        this.fileChangeHandler = new FileChangeHandler(
            logger,
            fileReader,
            yamlParser,
            this.documentProcessor,
            this.templateStore,
            this.translationStore,
            this.translationReferenceStore,
            this.itemStore,
            this.categoryStore,
        );
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
        // 清理子组件
        this.fileLockManager.dispose();

        void this.clear();
        this.initialized = false;
        this.initPromise = null;
    }

    // ========================================
    // 文件操作
    // ========================================

    async handleFileChange(fileUri: EditorUri): Promise<void> {
        await this.ensureInitialized();
        return this.fileLockManager.withFileLock(fileUri, () => this.fileChangeHandler.handleFileChange(fileUri));
    }

    async handleFileDelete(fileUri: EditorUri): Promise<void> {
        await this.ensureInitialized();
        return this.fileLockManager.withFileLock(fileUri, () => this.fileChangeHandler.handleFileDelete(fileUri));
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
        await this.workspaceInitializer.performInitialization(
            this.templateStore,
            this.translationStore,
            this.categoryStore,
        );
        this.initialized = true;
    }
}
