import { Uri, workspace, Progress } from 'vscode';
import { IYamlScanner, IYamlScanOptions, IYamlScanResult } from '../../core/interfaces/IYamlScanner';
import { IYamlDocument } from '../../core/interfaces/IYamlDocument';
import { IYamlParser } from '../../core/interfaces/IYamlParser';
import { ILogger } from '../../core/interfaces/ILogger';
import * as fs from 'fs/promises';

/**
 * YAML 文件扫描器实现
 * 
 * 负责在工作区中扫描和解析 YAML 文件，支持批量处理、进度报告和错误处理。
 * 
 * @remarks
 * 性能优化特点：
 * - 静态导入 fs/promises，避免动态 import 开销
 * - 批量文件大小检查，减少重复 fs.stat 调用
 * - 增大批处理大小，提高并行效率
 * - 优化文件验证逻辑，避免重复检查
 * 
 * 主要功能：
 * - 工作区批量扫描：根据 glob 模式查找 YAML 文件
 * - 单文件扫描：解析指定的 YAML 文件
 * - 目录扫描：递归扫描目录下的所有 YAML 文件
 * - 进度报告：支持 VSCode 进度条和自定义进度回调
 * - 错误处理：收集解析失败的文件和错误信息
 * 
 * 扫描选项：
 * - pattern: Glob 模式，默认为 `**\/*.{yaml,yml}`
 * - exclude: 排除模式，默认为 `**\/node_modules/**`
 * - maxFileSize: 最大文件大小限制（字节）
 * - skipInvalid: 是否跳过无效文件
 * - onProgress: 自定义进度回调
 */
export class YamlScanner implements IYamlScanner {
    /** 默认最大文件大小 10MB */
    private static readonly DEFAULT_MAX_FILE_SIZE_FALLBACK = 10 * 1024 * 1024;
    /** 默认批处理大小 */
    private static readonly DEFAULT_BATCH_SIZE = 20;

    /** 最大文件大小（可配置） */
    private readonly maxFileSize: number;
    /** 批处理大小（可配置） */
    private readonly batchSize: number;

    /**
     * 构造 YAML 扫描器实例
     *
     * @param parser - YAML 解析器，用于解析文件内容
     * @param logger - 日志记录器（可选），用于记录扫描过程
     * @param config - 配置选项（可选）
     */
    constructor(
        private readonly parser: IYamlParser,
        private readonly logger?: ILogger,
        config?: { defaultMaxFileSize?: number; yamlScannerBatchSize?: number }
    ) {
        this.maxFileSize = config?.defaultMaxFileSize ?? YamlScanner.DEFAULT_MAX_FILE_SIZE_FALLBACK;
        this.batchSize = config?.yamlScannerBatchSize ?? YamlScanner.DEFAULT_BATCH_SIZE;
    }

    /**
     * 扫描工作区中的 YAML 文件
     * 
     * 在当前 VSCode 工作区中查找并解析所有匹配的 YAML 文件。
     * 支持进度报告、错误收集和性能优化。
     * 
     * @param options - 扫描选项配置
     * @param options.pattern - Glob 模式，用于匹配文件（默认：`**\/*.{yaml,yml}`）
     * @param options.exclude - 排除模式（默认：`**\/node_modules/**`）
     * @param options.maxFileSize - 最大文件大小限制（字节）
     * @param options.skipInvalid - 是否跳过无效文件
     * @param options.onProgress - 进度回调函数
     * @param progress - VSCode 进度报告对象（可选）
     * @returns 扫描结果，包含解析成功的文档和失败信息
     * 
     * @remarks
     * - 使用 VSCode 的 workspace.findFiles API 查找文件
     * - 支持文件大小检查，避免加载超大文件
     * - 并行处理文件以提高性能
     * - 记录详细的日志信息
     * 
     * @example
     * ```typescript
     * // 基本使用
     * const result = await scanner.scanWorkspace();
     * 
     * // 带进度报告的扫描
     * const result = await vscode.window.withProgress({
     *     location: vscode.ProgressLocation.Notification,
     *     title: 'Scanning YAML files',
     *     cancellable: false
     * }, async (progress) => {
     *     return await scanner.scanWorkspace({
     *         pattern: 'src/**\/*.yaml',
     *         maxFileSize: 5 * 1024 * 1024 // 5MB
     *     }, progress);
     * });
     * 
     * console.log(`Found ${result.documents.length} valid YAML files`);
     * 
     * if (result.failed.length > 0) {
     *     console.error('Failed to parse:', result.failed);
     * }
     * ```
     */
    async scanWorkspace(
        options: IYamlScanOptions = {},
        progress?: Progress<{ message?: string; increment?: number }>
    ): Promise<IYamlScanResult> {
        const startTime = Date.now();
        const pattern = options.pattern || '**/*.{yaml,yml}';
        const exclude = options.exclude || '**/node_modules/**';
        const maxFileSize = options.maxFileSize || this.maxFileSize;
        
        this.logger?.info('Starting YAML workspace scan', {
            pattern: Array.isArray(pattern) ? pattern : [pattern],
            exclude: Array.isArray(exclude) ? exclude : [exclude]
        });

        try {
            // 查找所有 YAML 文件
            const patternStr = Array.isArray(pattern) ? pattern[0] : pattern;
            const excludeStr = Array.isArray(exclude) ? exclude[0] : exclude;
            
            const files = await workspace.findFiles(
                patternStr,
                excludeStr,
                undefined
            );

            this.logger?.info('Found YAML files', { count: files.length });

            const documents: IYamlDocument[] = [];
            const failed: Array<{ file: Uri; error: string }> = [];
            let processed = 0;
            let skippedCount = 0;

            // 使用增大的批处理大小提高并行效率
            for (let i = 0; i < files.length; i += this.batchSize) {
                const batch = files.slice(i, i + this.batchSize);
                
                const batchResults = await Promise.allSettled(
                    batch.map(async (file, batchIndex) => {
                        try {
                            // 直接读取文件并检查大小（合并 stat 和 read 操作）
                            const content = await fs.readFile(file.fsPath, 'utf-8');
                            
                            // 检查内容大小（比 stat 更准确，且避免额外的文件系统调用）
                            if (content.length > maxFileSize) {
                                this.logger?.debug('File too large, skipping', {
                                    file: file.fsPath,
                                    size: content.length,
                                    maxSize: maxFileSize
                                });
                                return { file, document: null, skipped: true, batchIndex };
                            }
                            
                            // 直接解析内容（避免再次读取文件）
                            const document = await this.parseFileContent(file, content);
                            return { file, document, skipped: false, batchIndex };
                        } catch (error) {
                            // 文件读取或解析失败
                            return { 
                                file, 
                                document: null, 
                                skipped: false, 
                                batchIndex,
                                error: error instanceof Error ? error.message : String(error)
                            };
                        }
                    })
                );
                
                // 处理批量结果
                for (let j = 0; j < batchResults.length; j++) {
                    const result = batchResults[j];
                    processed++;

                    // 报告进度（每 10 个文件报告一次，减少 UI 更新开销）
                    if (processed % 10 === 0 || processed === files.length) {
                        if (options.onProgress) {
                            const file = result.status === 'fulfilled' ? result.value.file : batch[j];
                            options.onProgress({
                                current: processed,
                                total: files.length,
                                file,
                                status: result.status === 'fulfilled' ? 'completed' : 'error'
                            });
                        }

                        if (progress) {
                            progress.report({
                                message: `Processing files... (${processed}/${files.length})`,
                                increment: (100 / files.length) * Math.min(10, files.length - processed + 10)
                            });
                        }
                    }
                    
                    if (result.status === 'fulfilled') {
                        const { file, document, skipped, error } = result.value;
                        if (document) {
                            documents.push(document);
                        } else if (skipped) {
                            skippedCount++;
                        } else if (error) {
                            if (!options.skipInvalid) {
                                failed.push({ file, error });
                            }
                        } else if (!options.skipInvalid) {
                            failed.push({
                                file,
                                error: 'Failed to parse YAML file'
                            });
                        }
                    } else {
                        // Promise rejected (不应该发生，因为我们在内部捕获了错误)
                        const errorMessage = result.reason instanceof Error 
                            ? result.reason.message 
                            : String(result.reason);

                        if (!options.skipInvalid) {
                            failed.push({
                                file: batch[j],
                                error: errorMessage
                            });
                        }
                    }
                }
            }

            const duration = Date.now() - startTime;
            const totalFiles = files.length;
            const successCount = documents.length;
            const failureCount = failed.length;
            const successRate = totalFiles > 0 ? (successCount / totalFiles) * 100 : 0;

            const result: IYamlScanResult = {
                files,
                documents,
                failed,
                statistics: {
                    totalFiles,
                    successCount,
                    failureCount,
                    successRate,
                    duration
                }
            };

            this.logger?.info('YAML workspace scan completed', {
                totalFiles,
                successCount,
                failureCount,
                skippedCount,
                successRate: `${successRate.toFixed(1)}%`,
                duration: `${duration}ms`,
                avgTimePerFile: totalFiles > 0 ? `${(duration / totalFiles).toFixed(2)}ms` : 'N/A'
            });

            return result;

        } catch (error) {
            this.logger?.error('Workspace scan failed', error as Error);
            throw error;
        }
    }
    
    /**
     * 解析文件内容（避免重复读取文件）
     */
    private async parseFileContent(file: Uri, content: string): Promise<IYamlDocument | null> {
        try {
            // 解析文件
            const parseResult = await this.parser.parseText(content, file, {
                keepPosition: true,
                strict: false
            });

            // 创建文档对象
            return this.parser.createDocument(parseResult, content);
        } catch (error) {
            this.logger?.debug('Failed to parse file content', {
                file: file.fsPath,
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    /**
     * 扫描指定目录中的 YAML 文件
     */
    async scanDirectory(
        directory: Uri,
        options: IYamlScanOptions = {}
    ): Promise<IYamlScanResult> {
        const pattern = options.pattern || '**/*.{yaml,yml}';
        const exclude = options.exclude || '**/node_modules/**';

        this.logger?.info('Scanning directory for YAML files', {
            directory: directory.fsPath,
            pattern: Array.isArray(pattern) ? pattern : [pattern]
        });

        try {
            // 构建相对于目录的模式
            const patternStr = Array.isArray(pattern) ? pattern[0] : pattern;
            const excludeStr = Array.isArray(exclude) ? exclude[0] : exclude;
            
            // 构建相对于目录的完整路径模式
            const relativePattern = directory.path + '/' + patternStr;

            const files = await workspace.findFiles(
                relativePattern,
                excludeStr,
                undefined
            );

            const documents: IYamlDocument[] = [];
            const failed: Array<{ file: Uri; error: string }> = [];

            for (const file of files) {
                try {
                    const document = await this.scanFile(file);
                    if (document) {
                        documents.push(document);
                    } else if (!options.skipInvalid) {
                        failed.push({
                            file,
                            error: 'Failed to parse YAML file'
                        });
                    }
                } catch (error) {
                    if (!options.skipInvalid) {
                        failed.push({
                            file,
                            error: error instanceof Error ? error.message : String(error)
                        });
                    }
                }
            }

            const totalFiles = files.length;
            const successCount = documents.length;
            const failureCount = failed.length;
            const successRate = totalFiles > 0 ? (successCount / totalFiles) * 100 : 0;

            return {
                files,
                documents,
                failed,
                statistics: {
                    totalFiles,
                    successCount,
                    failureCount,
                    successRate,
                    duration: 0 // 目录扫描不计算耗时
                }
            };

        } catch (error) {
            this.logger?.error('Directory scan failed', error as Error, {
                directory: directory.fsPath
            });
            throw error;
        }
    }

    /**
     * 扫描单个文件
     */
    async scanFile(file: Uri): Promise<IYamlDocument | null> {
        try {
            // 检查文件扩展名（快速检查，避免不必要的 IO）
            const ext = file.fsPath.toLowerCase();
            if (!ext.endsWith('.yaml') && !ext.endsWith('.yml')) {
                return null;
            }

            // 读取文件内容
            const content = await fs.readFile(file.fsPath, 'utf-8');
            
            // 检查文件大小
            if (content.length > this.maxFileSize) {
                this.logger?.debug('File too large', {
                    file: file.fsPath,
                    size: content.length
                });
                return null;
            }

            // 使用共享的解析方法
            return this.parseFileContent(file, content);

        } catch (error) {
            this.logger?.debug('Failed to scan file', {
                file: file.fsPath,
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    /**
     * 检查文件是否是有效的 YAML 文件
     */
    async isValidYamlFile(file: Uri): Promise<boolean> {
        try {
            // 检查文件扩展名
            const ext = file.fsPath.toLowerCase();
            if (!ext.endsWith('.yaml') && !ext.endsWith('.yml')) {
                return false;
            }

            // 检查文件是否存在并获取大小
            const stats = await fs.stat(file.fsPath);
            
            if (!stats.isFile()) {
                return false;
            }

            // 检查文件大小
            if (stats.size > this.maxFileSize) {
                this.logger?.debug('File too large', {
                    file: file.fsPath,
                    size: stats.size
                });
                return false;
            }

            return true;

        } catch (error) {
            this.logger?.debug('File validation failed', {
                file: file.fsPath,
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
        }
    }
}

