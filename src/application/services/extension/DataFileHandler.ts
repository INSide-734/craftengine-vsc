import { Uri } from 'vscode';
import { ILogger } from '../../../core/interfaces/ILogger';
import { IEventBus } from '../../../core/interfaces/IEventBus';
import { IDataStoreService } from '../../../core/interfaces/IDataStoreService';

/**
 * 数据文件处理器
 *
 * 负责处理文件变更事件（创建、修改、删除）
 * 统一处理模板和翻译键的更新
 */
export class DataFileHandler {
    private disposed = false;

    constructor(
        private readonly logger: ILogger,
        private readonly eventBus: IEventBus,
        private readonly dataStoreService: IDataStoreService,
        private readonly generateEventId: () => string
    ) {}

    /**
     * 处理文件修改
     *
     * @param uri 文件 URI
     */
    async handleFileModified(uri: Uri): Promise<void> {
        if (this.disposed) {return;}

        this.logger.debug('Handling file modification', { file: uri.fsPath });

        try {
            // 使用 DataStoreService 统一处理文件变更（模板 + 翻译）
            await this.dataStoreService.handleFileChange(uri);

            // 获取统计信息
            const stats = await this.dataStoreService.getStatistics();

            // 发布文档处理事件
            await this.eventBus.publish('document.processed', {
                id: this.generateEventId(),
                type: 'document.processed',
                timestamp: new Date(),
                source: 'DataFileHandler',
                uri: uri.fsPath,
                action: 'modified',
                templateCount: stats.templateCount,
                translationKeyCount: stats.translationKeyCount
            });

            this.logger.info('File modification handled successfully', {
                file: uri.fsPath
            });

        } catch (error) {
            this.logger.error('Failed to handle file modification', error as Error, {
                file: uri.fsPath
            });
        }
    }

    /**
     * 处理文件删除
     *
     * @param uri 文件 URI
     */
    async handleFileDeleted(uri: Uri): Promise<void> {
        if (this.disposed) {return;}

        try {
            // 使用 DataStoreService 统一处理文件删除（模板 + 翻译）
            await this.dataStoreService.handleFileDelete(uri);

            this.logger.debug('Handled file deletion', { file: uri.fsPath });

            // 发布文档处理事件
            await this.eventBus.publish('document.processed', {
                id: this.generateEventId(),
                type: 'document.processed',
                timestamp: new Date(),
                source: 'DataFileHandler',
                uri: uri.fsPath,
                action: 'deleted',
                templateCount: 0,
                translationKeyCount: 0
            });

        } catch (error) {
            this.logger.error('Failed to handle file deletion', error as Error, {
                file: uri.fsPath
            });
        }
    }

    /**
     * 释放资源
     */
    dispose(): void {
        this.disposed = true;
        this.logger.debug('Data file handler disposed');
    }
}


