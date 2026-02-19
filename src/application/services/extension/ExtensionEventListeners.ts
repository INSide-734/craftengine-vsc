import { ILogger } from '../../../core/interfaces/ILogger';
import { IEventBus, IEventSubscription } from '../../../core/interfaces/IEventBus';
import { EVENT_TYPES } from '../../../core/constants/ServiceTokens';
import { ExtensionStatistics } from './ExtensionStatistics';

/**
 * 扩展事件监听器管理器
 *
 * 负责设置和管理扩展的事件监听器，包括：
 * - 性能指标事件
 * - 模板事件
 * - 补全事件
 * - 文档处理事件
 * - 配置变更事件
 */
export class ExtensionEventListeners {
    private readonly subscriptions: IEventSubscription[] = [];

    constructor(
        private readonly logger: ILogger,
        private readonly eventBus: IEventBus,
        private readonly statistics: ExtensionStatistics
    ) {}

    /**
     * 设置所有事件监听器
     */
    setup(): void {
        this.setupPerformanceMetricListener();
        this.setupTemplateEventListener();
        this.setupCompletionEventListener();
        this.setupDocumentEventListener();
        this.setupConfigurationChangeListener();
        this.setupFileSystemListener();

        this.logger.debug('Event listeners setup completed');
    }

    /**
     * 释放资源，取消所有订阅
     */
    dispose(): void {
        for (const sub of this.subscriptions) {
            sub.unsubscribe();
        }
        this.subscriptions.length = 0;
        this.logger.debug('Event listeners disposed');
    }

    /**
     * 设置性能指标事件监听器
     */
    private setupPerformanceMetricListener(): void {
        const sub = this.eventBus.subscribe<{ metric: string; value: number; unit: string }>(EVENT_TYPES.PerformanceMetric, (event) => {
            this.logger.debug('Performance metric recorded', {
                metric: event.metric,
                value: event.value,
                unit: event.unit
            });
        });
        this.subscriptions.push(sub);
    }

    /**
     * 设置模板事件监听器
     */
    private setupTemplateEventListener(): void {
        const sub = this.eventBus.subscribe<{ type: string; timestamp: Date }>('template.*', (event) => {
            this.logger.debug('Template event received', {
                eventType: event.type,
                timestamp: event.timestamp.toISOString()
            });
        });
        this.subscriptions.push(sub);
    }

    /**
     * 设置补全事件监听器
     */
    private setupCompletionEventListener(): void {
        const sub = this.eventBus.subscribe<{ itemCount: number }>('completion.provided', (event) => {
            this.statistics.incrementCompletionsProvided();
            this.logger.debug('Completion provided event', {
                itemCount: event.itemCount
            });
        });
        this.subscriptions.push(sub);
    }

    /**
     * 设置文档处理事件监听器
     */
    private setupDocumentEventListener(): void {
        const sub = this.eventBus.subscribe<{ uri: string }>('document.processed', (event) => {
            this.statistics.incrementProcessedDocuments();
            this.logger.debug('Document processed event', {
                documentUri: event.uri
            });
        });
        this.subscriptions.push(sub);
    }

    /**
     * 设置配置变更事件监听器
     */
    private setupConfigurationChangeListener(): void {
        const sub = this.eventBus.subscribe<{ key: string; oldValue: unknown; newValue: unknown }>('extension.configuration.changed', (event) => {
            this.logger.info('Configuration changed', {
                key: event.key,
                oldValue: event.oldValue,
                newValue: event.newValue
            });

            // 根据配置类型记录调试信息
            if (event.key?.startsWith('diagnostics.')) {
                this.logger.debug('Diagnostics configuration changed, may need to refresh');
            } else if (event.key?.startsWith('completion.')) {
                this.logger.debug('Completion configuration changed');
            }
        });
        this.subscriptions.push(sub);
    }

    /**
     * 设置文件系统事件监听器
     */
    private setupFileSystemListener(): void {
        const sub = this.eventBus.subscribe<{ type: string; uri?: { fsPath: string } }>('file.created', (event) => {
            this.logger.debug('File system event', {
                eventType: event.type,
                file: event.uri?.fsPath
            });
        });
        this.subscriptions.push(sub);
    }
}

