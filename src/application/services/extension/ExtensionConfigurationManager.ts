import { ILogger } from '../../../core/interfaces/ILogger';
import { IConfiguration } from '../../../core/interfaces/IConfiguration';
import { IEventBus } from '../../../core/interfaces/IEventBus';
import { EVENT_TYPES } from '../../../core/constants/ServiceTokens';

/**
 * 扩展配置管理器
 *
 * 负责初始化和管理扩展配置
 */
export class ExtensionConfigurationManager {
    /** 配置变更取消订阅函数 */
    private configChangeUnsubscribe?: () => void;

    constructor(
        private readonly logger: ILogger,
        private readonly configuration: IConfiguration,
        private readonly eventBus: IEventBus,
        private readonly generateEventId: () => string
    ) {}

    /**
     * 初始化配置
     */
    async initialize(): Promise<void> {
        try {
            // 验证配置
            await this.validateConfiguration();

            // 设置配置变更监听
            this.setupConfigurationChangeListener();

            this.logger.debug('Configuration initialized');

        } catch (error) {
            this.logger.error('Failed to initialize configuration', error as Error);
            throw error;
        }
    }

    /**
     * 释放资源
     */
    dispose(): void {
        this.configChangeUnsubscribe?.();
        this.configChangeUnsubscribe = undefined;
        this.logger.debug('Configuration manager disposed');
    }

    /**
     * 验证配置
     */
    private async validateConfiguration(): Promise<void> {
        const errors = await this.configuration.validate();

        if (errors.length > 0) {
            this.logger.warn('Configuration validation warnings', { errors });
        }
    }

    /**
     * 设置配置变更监听器
     */
    private setupConfigurationChangeListener(): void {
        this.configChangeUnsubscribe = this.configuration.onChange((event) => {
            this.logger.info('Configuration changed', {
                key: event.key,
                oldValue: event.oldValue,
                newValue: event.newValue
            });

            // 发布配置变更事件
            this.eventBus.publish(EVENT_TYPES.ConfigurationChanged, {
                id: this.generateEventId(),
                type: EVENT_TYPES.ConfigurationChanged,
                timestamp: event.timestamp,
                source: 'ExtensionService',
                key: event.key,
                oldValue: event.oldValue,
                newValue: event.newValue
            });
        });
    }
}

