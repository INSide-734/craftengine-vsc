import * as path from 'path';
import * as crypto from 'crypto';
import { Uri } from 'vscode';
import { ILogger } from '../../../core/interfaces/ILogger';
import { IConfiguration } from '../../../core/interfaces/IConfiguration';
import { IEventBus } from '../../../core/interfaces/IEventBus';
import { IFileReader, FileType } from '../../../core/interfaces/IFileReader';
import { IWorkspaceService } from '../../../core/interfaces/IWorkspaceService';
import {
    ISchemaDeploymentService,
    IDeploymentResult,
    ISchemaVersionInfo,
    SchemaSource
} from '../../../core/interfaces/ISchemaDeploymentService';

/**
 * Schema 部署服务
 *
 * 负责将扩展内置的 Schema 文件部署到工作区，支持版本管理和增量更新。
 *
 * @remarks
 * **部署策略**：
 *
 * 1. **首次部署**
 *    - 工作区不存在 `.craftengine/schemas/` 目录
 *    - 完整复制所有 Schema 文件
 *
 * 2. **版本更新**
 *    - 扩展版本高于工作区已部署版本
 *    - 根据配置决定是否自动更新
 *
 * 3. **强制重部署**
 *    - 用户手动触发
 *    - 覆盖所有文件，包括用户修改
 *
 * **目录结构**：
 * ```
 * 工作区/
 * └── .craftengine/
 *     └── schemas/
 *         ├── .version              # 版本信息文件
 *         ├── index.schema.json
 *         ├── common/
 *         ├── sections/
 *         └── types/
 * ```
 */
export class SchemaDeploymentService implements ISchemaDeploymentService {
    /** 工作区 Schema 目录名 */
    private static readonly WORKSPACE_SCHEMA_DIR = '.craftengine/schemas';

    /** 版本信息文件名 */
    private static readonly VERSION_FILE = '.version';

    /** 扩展路径 */
    private extensionPath: string = '';

    /** 当前扩展版本 */
    private extensionVersion: string = '';

    /** 是否已释放资源 */
    private disposed = false;

    constructor(
        private readonly logger: ILogger,
        private readonly configuration: IConfiguration,
        private readonly eventBus: IEventBus,
        private readonly fileReader: IFileReader,
        private readonly workspaceService: IWorkspaceService
    ) {}

    /**
     * 初始化部署服务
     */
    async initialize(extensionPath: string): Promise<void> {
        this.extensionPath = extensionPath;

        // 获取扩展版本
        try {
            const packageJsonPath = path.join(extensionPath, 'package.json');
            const packageJsonUri = Uri.file(packageJsonPath);
            const content = await this.fileReader.readFileText(packageJsonUri);
            const packageJson = JSON.parse(content);
            this.extensionVersion = packageJson.version || '0.0.0';
        } catch (error) {
            this.logger.warn('Failed to read extension version', {
                error: (error as Error).message
            });
            this.extensionVersion = '0.0.0';
        }

        this.logger.info('Schema deployment service initialized', {
            extensionPath,
            extensionVersion: this.extensionVersion
        });
    }

    /**
     * 部署 Schema 到工作区
     */
    async deploySchemas(): Promise<IDeploymentResult> {
        const workspaceSchemaDir = this.getWorkspaceSchemaDir();

        if (!workspaceSchemaDir) {
            return {
                success: false,
                deployedCount: 0,
                skippedCount: 0,
                failedCount: 0,
                failures: [{ file: '', reason: 'No workspace folder found' }],
                version: this.extensionVersion,
                targetDir: ''
            };
        }

        // 检查是否启用部署
        const deployEnabled = this.configuration.get<boolean>(
            'craftengine.schema.deployToWorkspace',
            true
        );

        if (!deployEnabled) {
            this.logger.info('Schema deployment to workspace is disabled');
            return {
                success: true,
                deployedCount: 0,
                skippedCount: 0,
                failedCount: 0,
                version: this.extensionVersion,
                targetDir: workspaceSchemaDir
            };
        }

        // 检查是否需要部署
        const needsDeploy = await this.needsDeployment();
        if (!needsDeploy) {
            this.logger.debug('Schema deployment not needed, version is up to date');
            return {
                success: true,
                deployedCount: 0,
                skippedCount: 0,
                failedCount: 0,
                version: this.extensionVersion,
                targetDir: workspaceSchemaDir
            };
        }

        return this.performDeployment(workspaceSchemaDir, false);
    }

    /**
     * 检查是否需要部署
     */
    async needsDeployment(): Promise<boolean> {
        const workspaceSchemaDir = this.getWorkspaceSchemaDir();

        if (!workspaceSchemaDir) {
            return false;
        }

        // 检查目录是否存在
        const dirUri = Uri.file(workspaceSchemaDir);
        const exists = await this.fileReader.exists(dirUri);
        if (!exists) {
            // 目录不存在，需要部署
            return true;
        }

        // 检查版本文件
        const versionInfo = await this.getWorkspaceVersionInfo();
        if (!versionInfo) {
            // 版本文件不存在，需要部署
            return true;
        }

        // 比较版本
        if (versionInfo.version !== this.extensionVersion) {
            const autoUpdate = this.configuration.get<boolean>(
                'craftengine.schema.autoUpdateOnVersionChange',
                true
            );

            if (autoUpdate) {
                this.logger.info('Schema version mismatch, update required', {
                    workspaceVersion: versionInfo.version,
                    extensionVersion: this.extensionVersion
                });
                return true;
            } else {
                // 发布版本不匹配事件，让用户决定
                await this.eventBus.publish('schema.version.mismatch', {
                    id: crypto.randomUUID(),
                    type: 'schema.version.mismatch',
                    timestamp: new Date(),
                    workspaceVersion: versionInfo.version,
                    extensionVersion: this.extensionVersion
                });
                return false;
            }
        }

        return false;
    }

    /**
     * 强制重新部署
     */
    async forceRedeploy(): Promise<IDeploymentResult> {
        const workspaceSchemaDir = this.getWorkspaceSchemaDir();

        if (!workspaceSchemaDir) {
            return {
                success: false,
                deployedCount: 0,
                skippedCount: 0,
                failedCount: 0,
                failures: [{ file: '', reason: 'No workspace folder found' }],
                version: this.extensionVersion,
                targetDir: ''
            };
        }

        this.logger.info('Force redeploying schemas to workspace');
        return this.performDeployment(workspaceSchemaDir, true);
    }

    /**
     * 获取工作区 Schema 目录路径
     */
    getWorkspaceSchemaDir(): string | undefined {
        const rootPath = this.workspaceService.getWorkspaceRootPath();
        if (!rootPath) {
            return undefined;
        }

        return path.join(rootPath, SchemaDeploymentService.WORKSPACE_SCHEMA_DIR);
    }

    /**
     * 获取当前 Schema 源
     */
    async getSchemaSource(): Promise<SchemaSource> {
        const workspaceSchemaDir = this.getWorkspaceSchemaDir();

        if (!workspaceSchemaDir) {
            return 'extension';
        }

        const dirUri = Uri.file(workspaceSchemaDir);
        const stat = await this.fileReader.stat(dirUri);

        if (stat && stat.type === FileType.Directory) {
            return 'workspace';
        }

        return 'extension';
    }

    /**
     * 获取工作区 Schema 版本信息
     */
    async getWorkspaceVersionInfo(): Promise<ISchemaVersionInfo | undefined> {
        const workspaceSchemaDir = this.getWorkspaceSchemaDir();

        if (!workspaceSchemaDir) {
            return undefined;
        }

        const versionFilePath = path.join(
            workspaceSchemaDir,
            SchemaDeploymentService.VERSION_FILE
        );

        try {
            const versionFileUri = Uri.file(versionFilePath);
            const content = await this.fileReader.readFileText(versionFileUri);
            return JSON.parse(content) as ISchemaVersionInfo;
        } catch {
            return undefined;
        }
    }

    /**
     * 检查指定的 Schema 文件是否存在于工作区
     */
    async hasWorkspaceSchema(filename: string): Promise<boolean> {
        const workspaceSchemaDir = this.getWorkspaceSchemaDir();

        if (!workspaceSchemaDir) {
            return false;
        }

        const filePath = path.join(workspaceSchemaDir, filename);
        const fileUri = Uri.file(filePath);

        return this.fileReader.exists(fileUri);
    }

    /**
     * 获取 Schema 文件的完整路径
     */
    async getSchemaPath(filename: string): Promise<string> {
        // 优先检查工作区
        const hasWorkspace = await this.hasWorkspaceSchema(filename);

        if (hasWorkspace) {
            const workspaceSchemaDir = this.getWorkspaceSchemaDir()!;
            return path.join(workspaceSchemaDir, filename);
        }

        // 回退到扩展路径
        return path.join(this.extensionPath, 'schemas', filename);
    }

    /**
     * 释放资源
     */
    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        this.logger.debug('Schema deployment service disposed');
    }

    // ==================== 私有方法 ====================

    /**
     * 执行部署操作
     */
    private async performDeployment(
        targetDir: string,
        force: boolean
    ): Promise<IDeploymentResult> {
        const sourceDir = path.join(this.extensionPath, 'schemas');
        const result: IDeploymentResult = {
            success: true,
            deployedCount: 0,
            skippedCount: 0,
            failedCount: 0,
            failures: [],
            version: this.extensionVersion,
            targetDir
        };

        try {
            // 确保目标目录存在
            const targetDirUri = Uri.file(targetDir);
            await this.fileReader.createDirectory(targetDirUri);

            // 复制所有 Schema 文件
            const files = await this.collectSchemaFiles(sourceDir);
            const fileHashes: Record<string, string> = {};

            for (const file of files) {
                const relativePath = path.relative(sourceDir, file);
                const targetPath = path.join(targetDir, relativePath);

                try {
                    // 确保目标目录存在
                    const targetParentDir = Uri.file(path.dirname(targetPath));
                    await this.fileReader.createDirectory(targetParentDir);

                    // 读取源文件
                    const sourceUri = Uri.file(file);
                    const content = await this.fileReader.readFileText(sourceUri);
                    const hash = this.calculateHash(content);
                    fileHashes[relativePath] = hash;

                    // 检查是否需要复制
                    if (!force) {
                        try {
                            const targetUri = Uri.file(targetPath);
                            const existingContent = await this.fileReader.readFileText(targetUri);
                            const existingHash = this.calculateHash(existingContent);

                            if (existingHash === hash) {
                                result.skippedCount++;
                                continue;
                            }
                        } catch {
                            // 文件不存在，继续复制
                        }
                    }

                    // 复制文件
                    const targetUri = Uri.file(targetPath);
                    await this.fileReader.writeFileText(targetUri, content);
                    result.deployedCount++;

                    this.logger.debug('Schema file deployed', {
                        file: relativePath
                    });

                } catch (error) {
                    result.failedCount++;
                    result.failures!.push({
                        file: relativePath,
                        reason: (error as Error).message
                    });
                }
            }

            // 写入版本文件
            const versionInfo: ISchemaVersionInfo = {
                version: this.extensionVersion,
                deployedAt: new Date().toISOString(),
                files: fileHashes
            };

            const versionFileUri = Uri.file(
                path.join(targetDir, SchemaDeploymentService.VERSION_FILE)
            );
            await this.fileReader.writeFileText(
                versionFileUri,
                JSON.stringify(versionInfo, null, 2)
            );

            // 发布部署完成事件
            await this.eventBus.publish('schema.deployed', {
                id: crypto.randomUUID(),
                type: 'schema.deployed',
                timestamp: new Date(),
                result
            });

            this.logger.info('Schema deployment completed', {
                deployed: result.deployedCount,
                skipped: result.skippedCount,
                failed: result.failedCount,
                targetDir
            });

            return result;

        } catch (error) {
            result.success = false;
            result.failures!.push({
                file: '',
                reason: (error as Error).message
            });

            this.logger.error('Schema deployment failed', error as Error);
            return result;
        }
    }

    /**
     * 递归收集所有 Schema 文件
     */
    private async collectSchemaFiles(dir: string): Promise<string[]> {
        const files: string[] = [];

        const dirUri = Uri.file(dir);
        const entries = await this.fileReader.readDirectory(dirUri);

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.type === FileType.Directory) {
                const subFiles = await this.collectSchemaFiles(fullPath);
                files.push(...subFiles);
            } else if (entry.name.endsWith('.schema.json') || entry.name.endsWith('.json')) {
                files.push(fullPath);
            }
        }

        return files;
    }

    /**
     * 计算文件内容的哈希值
     */
    private calculateHash(content: string): string {
        return crypto.createHash('md5').update(content).digest('hex');
    }
}
