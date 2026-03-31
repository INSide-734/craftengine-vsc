import { commands, window, type ExtensionContext } from 'vscode';
import { type ILogger } from '../../core/interfaces/ILogger';
import { type ISchemaService } from '../../core/interfaces/ISchemaService';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { type SchemaLoaderService } from '../../application/services/schema';

/**
 * Schema 相关命令
 *
 * 提供 Schema 重载的手动命令。
 *
 * @remarks
 * **可用命令**：
 *
 * - `craftengine.schema.reload`: 从工作区重新加载 Schema
 */
export class SchemaCommands {
    private readonly logger: ILogger;

    constructor() {
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild('SchemaCommands');
    }

    /**
     * 注册所有 Schema 命令
     *
     * @param context - 扩展上下文
     */
    register(context: ExtensionContext): void {
        // 重载 Schema 命令
        context.subscriptions.push(commands.registerCommand('craftengine.schema.reload', () => this.reloadSchemas()));

        this.logger.info('Schema commands registered');
    }

    /**
     * 从工作区重新加载 Schema
     */
    private async reloadSchemas(): Promise<void> {
        try {
            this.logger.info('Reloading schemas from workspace');

            const schemaService = ServiceContainer.getService<ISchemaService>(SERVICE_TOKENS.SchemaService);

            const loaderService = schemaService.getLoaderService() as SchemaLoaderService | undefined;

            if (!loaderService) {
                window.showErrorMessage('Schema service not initialized');
                return;
            }

            // 重新加载根 Schema
            await loaderService.reloadRootSchema();

            window.showInformationMessage('Schema files reloaded successfully');
        } catch (error) {
            this.logger.error('Failed to reload schemas', error as Error);
            window.showErrorMessage(`Failed to reload schemas: ${(error as Error).message}`);
        }
    }
}
