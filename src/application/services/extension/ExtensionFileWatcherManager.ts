import { type ILogger } from '../../../core/interfaces/ILogger';
import { type IConfiguration } from '../../../core/interfaces/IConfiguration';
import { type IFileWatcher } from '../../../core/interfaces/IFileWatcher';
import { type DataFileHandler } from './DataFileHandler';

/**
 * 扩展文件监控管理器
 *
 * 负责设置和管理文件监控，统一处理各类数据文件的变更
 */
export class ExtensionFileWatcherManager {
    /** 文件变更取消订阅函数 */
    private fileChangeUnsubscribe?: () => void;

    constructor(
        private readonly logger: ILogger,
        private readonly configuration: IConfiguration,
        private readonly fileWatcher: IFileWatcher,
        private readonly fileHandler: DataFileHandler,
    ) {}

    /**
     * 设置文件监控
     */
    async setup(): Promise<void> {
        try {
            const excludePattern = this.configuration.get('files.exclude', '**/node_modules/**');

            // 监控YAML文件
            this.fileWatcher.watch('**/*.{yml,yaml}', {
                exclude: excludePattern,
                recursive: true,
                debounceDelay: 300,
            });

            // 设置文件变更处理器
            this.setupFileChangeHandler();

            this.logger.debug('File watching setup completed');
        } catch (error) {
            this.logger.error('Failed to setup file watching', error as Error);
            throw error;
        }
    }

    /**
     * 释放资源
     */
    dispose(): void {
        this.fileChangeUnsubscribe?.();
        this.fileChangeUnsubscribe = undefined;
        this.logger.debug('File watcher manager disposed');
    }

    /**
     * 设置文件变更处理器
     */
    private setupFileChangeHandler(): void {
        this.fileChangeUnsubscribe = this.fileWatcher.onFileChange(async (event) => {
            this.logger.debug('File change detected', {
                file: event.uri.fsPath,
                type: event.type,
            });

            try {
                // 根据文件变更类型处理
                switch (event.type) {
                    case 'created':
                    case 'modified':
                        await this.fileHandler.handleFileModified(event.uri);
                        break;
                    case 'deleted':
                        await this.fileHandler.handleFileDeleted(event.uri);
                        break;
                }
            } catch (error) {
                this.logger.error('Error handling file change', error as Error, {
                    file: event.uri.fsPath,
                    type: event.type,
                });
            }
        });
    }
}
