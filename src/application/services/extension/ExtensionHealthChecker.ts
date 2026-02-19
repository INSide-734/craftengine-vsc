import { ILogger } from '../../../core/interfaces/ILogger';
import { IConfiguration } from '../../../core/interfaces/IConfiguration';
import { IDataStoreService } from '../../../core/interfaces/IDataStoreService';
import { IFileWatcher } from '../../../core/interfaces/IFileWatcher';
import { ExtensionState } from '../../../core/interfaces/IExtensionService';

/**
 * 扩展健康检查器
 *
 * 负责检查扩展的运行健康状态
 */
export class ExtensionHealthChecker {
    private disposed = false;

    constructor(
        private readonly logger: ILogger,
        private readonly configuration: IConfiguration,
        private readonly dataStoreService: IDataStoreService,
        private readonly fileWatcher: IFileWatcher
    ) {}

    /**
     * 执行健康检查
     *
     * @param currentState 当前扩展状态
     * @returns 健康状态（true 表示健康）
     */
    async checkHealth(currentState: ExtensionState): Promise<boolean> {
        if (this.disposed) {
            return false;
        }

        try {
            // 1. 检查基本状态
            if (!this.checkState(currentState)) {
                return false;
            }

            // 2. 检查服务可用性
            if (!this.checkServices()) {
                return false;
            }

            // 3. 检查数据缓存（模板 + 翻译）
            await this.checkDataCache();

            // 4. 检查配置
            await this.checkConfiguration();

            this.logger.debug('Health check passed');
            return true;

        } catch (error) {
            this.logger.error('Health check failed', error as Error);
            return false;
        }
    }

    /**
     * 释放资源
     */
    dispose(): void {
        this.disposed = true;
        this.logger.debug('Health checker disposed');
    }

    /**
     * 检查扩展状态
     */
    private checkState(currentState: ExtensionState): boolean {
        if (currentState !== ExtensionState.Active) {
            this.logger.warn('Health check failed: extension not active', {
                currentState
            });
            return false;
        }
        return true;
    }

    /**
     * 检查服务可用性
     */
    private checkServices(): boolean {
        const services = [
            { name: 'dataStoreService', instance: this.dataStoreService },
            { name: 'fileWatcher', instance: this.fileWatcher },
            { name: 'configuration', instance: this.configuration }
        ];

        for (const service of services) {
            if (!service.instance) {
                this.logger.warn('Health check failed: service not available', {
                    service: service.name
                });
                return false;
            }
        }

        return true;
    }

    /**
     * 检查数据缓存（模板 + 翻译）
     */
    private async checkDataCache(): Promise<void> {
        const stats = await this.dataStoreService.getStatistics();

        if (stats.templateCount === 0 && stats.translationKeyCount === 0) {
            this.logger.debug('Data cache is empty (initial scan may still be running)');
            // 这不是致命错误，初始扫描是异步的
        } else {
            this.logger.debug('Data cache status', {
                templateCount: stats.templateCount,
                translationKeyCount: stats.translationKeyCount,
                indexedFileCount: stats.indexedFileCount,
                languageCount: stats.languageCount
            });
        }
    }

    /**
     * 检查配置
     */
    private async checkConfiguration(): Promise<void> {
        const validationErrors = await this.configuration.validate();

        if (validationErrors.length > 0) {
            this.logger.warn('Health check warning: configuration validation errors', {
                errors: validationErrors
            });
        }
    }
}
