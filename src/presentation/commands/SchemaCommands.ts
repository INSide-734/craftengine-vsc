import { commands, window, ExtensionContext } from 'vscode';
import { ILogger } from '../../core/interfaces/ILogger';
import { ISchemaService } from '../../core/interfaces/ISchemaService';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { SchemaLoaderService } from '../../application/services/schema';

/**
 * Schema 相关命令
 * 
 * 提供 Schema 部署、重置和重载的手动命令。
 * 
 * @remarks
 * **可用命令**：
 * 
 * - `craftengine.schema.deploy`: 部署 Schema 到工作区
 * - `craftengine.schema.reset`: 重置工作区 Schema（恢复默认）
 * - `craftengine.schema.reload`: 从工作区重新加载 Schema
 */
export class SchemaCommands {
    private readonly logger: ILogger;
    
    constructor() {
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger)
            .createChild('SchemaCommands');
    }
    
    /**
     * 注册所有 Schema 命令
     * 
     * @param context - 扩展上下文
     */
    register(context: ExtensionContext): void {
        // 部署 Schema 命令
        context.subscriptions.push(
            commands.registerCommand(
                'craftengine.schema.deploy',
                () => this.deploySchemas()
            )
        );
        
        // 重置 Schema 命令
        context.subscriptions.push(
            commands.registerCommand(
                'craftengine.schema.reset',
                () => this.resetSchemas()
            )
        );
        
        // 重载 Schema 命令
        context.subscriptions.push(
            commands.registerCommand(
                'craftengine.schema.reload',
                () => this.reloadSchemas()
            )
        );
        
        this.logger.info('Schema commands registered');
    }
    
    /**
     * 部署 Schema 到工作区
     */
    private async deploySchemas(): Promise<void> {
        try {
            this.logger.info('Deploying schemas to workspace');
            
            const schemaService = ServiceContainer.getService<ISchemaService>(
                SERVICE_TOKENS.SchemaService
            );
            
            // 获取 loaderService 来访问部署服务
            const loaderService = schemaService.getLoaderService() as SchemaLoaderService | undefined;
            
            if (!loaderService) {
                window.showErrorMessage('Schema service not initialized');
                return;
            }
            
            const deploymentService = loaderService.getDeploymentService();
            
            if (!deploymentService) {
                window.showErrorMessage('Schema deployment service not available');
                return;
            }
            
            const result = await deploymentService.deploySchemas();
            
            if (result.success) {
                if (result.deployedCount > 0) {
                    window.showInformationMessage(
                        `Deployed ${result.deployedCount} schema files to workspace`
                    );
                } else {
                    window.showInformationMessage(
                        'Schema files are up to date'
                    );
                }
            } else {
                window.showErrorMessage(
                    `Failed to deploy schemas: ${result.failures?.[0]?.reason || 'Unknown error'}`
                );
            }
            
        } catch (error) {
            this.logger.error('Failed to deploy schemas', error as Error);
            window.showErrorMessage(`Failed to deploy schemas: ${(error as Error).message}`);
        }
    }
    
    /**
     * 重置工作区 Schema（恢复默认）
     */
    private async resetSchemas(): Promise<void> {
        try {
            // 确认操作
            const confirm = await window.showWarningMessage(
                'This will overwrite all custom schema modifications. Continue?',
                'Yes, Reset',
                'Cancel'
            );
            
            if (confirm !== 'Yes, Reset') {
                return;
            }
            
            this.logger.info('Resetting workspace schemas');
            
            const schemaService = ServiceContainer.getService<ISchemaService>(
                SERVICE_TOKENS.SchemaService
            );
            
            const loaderService = schemaService.getLoaderService() as SchemaLoaderService | undefined;

            if (!loaderService) {
                window.showErrorMessage('Schema service not initialized');
                return;
            }

            const deploymentService = loaderService.getDeploymentService();

            if (!deploymentService) {
                window.showErrorMessage('Schema deployment service not available');
                return;
            }

            const result = await deploymentService.forceRedeploy();
            
            if (result.success) {
                window.showInformationMessage(
                    `Reset ${result.deployedCount} schema files to default`
                );
            } else {
                window.showErrorMessage(
                    `Failed to reset schemas: ${result.failures?.[0]?.reason || 'Unknown error'}`
                );
            }
            
        } catch (error) {
            this.logger.error('Failed to reset schemas', error as Error);
            window.showErrorMessage(`Failed to reset schemas: ${(error as Error).message}`);
        }
    }
    
    /**
     * 从工作区重新加载 Schema
     */
    private async reloadSchemas(): Promise<void> {
        try {
            this.logger.info('Reloading schemas from workspace');
            
            const schemaService = ServiceContainer.getService<ISchemaService>(
                SERVICE_TOKENS.SchemaService
            );
            
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

