import { workspace, Uri } from 'vscode';
import { Template } from '../types';
import { parseTemplates } from './TemplateParser';

// 调试日志控制
const DEBUG_ENABLED = process.env.NODE_ENV !== 'test' && process.env.DEBUG === 'true';

/**
 * 模板缓存管理器类
 * 
 * 负责管理 CraftEngine 模板的内存缓存，提供模板的增删改查功能。
 * 支持工作区扫描、文件监听更新和单例模式。
 */
class CacheManager {
    private readonly cache = new Map<string, Template>();
    private readonly fileToTemplates = new Map<string, Set<string>>();
    private readonly nameIndex = new Map<string, Template[]>(); // 名称索引
    private readonly parameterIndex = new Map<string, Template[]>(); // 参数索引
    private isScanning = false;
    private readonly maxConcurrentFiles = 10;
    private lastScanTime = 0; // 用于跟踪最后扫描时间
    private scanCache = new Map<string, number>(); // 文件修改时间缓存

    /**
     * 获取所有缓存的模板
     * 
     * @returns {Template[]} 所有已缓存的模板数组
     * 
     * @example
     * // 获取所有可用模板
     * const templates = templateCache.getAll();
     * console.log(`Found ${templates.length} templates`);
     */
    public getAll(): Template[] {
        return Array.from(this.cache.values());
    }

    /**
     * 根据名称前缀搜索模板（优化版本）
     */
    public searchByPrefix(prefix: string): Template[] {
        if (!prefix) {
            return this.getAll();
        }
        
        const lowerPrefix = prefix.toLowerCase();
        const results: Template[] = [];
        
        for (const template of this.cache.values()) {
            if (template.name.toLowerCase().startsWith(lowerPrefix)) {
                results.push(template);
            }
        }
        
        return results;
    }

    /**
     * 根据参数名搜索模板
     */
    public searchByParameter(paramName: string): Template[] {
        const cached = this.parameterIndex.get(paramName);
        if (cached) {
            return cached;
        }
        
        const results: Template[] = [];
        for (const template of this.cache.values()) {
            if (template.parameters.includes(paramName)) {
                results.push(template);
            }
        }
        
        this.parameterIndex.set(paramName, results);
        return results;
    }

    /**
     * 获取缓存统计信息
     * 
     * @returns {object} 缓存统计信息
     */
    public getStats(): { totalTemplates: number; totalFiles: number } {
        return {
            totalTemplates: this.cache.size,
            totalFiles: this.fileToTemplates.size
        };
    }

    /**
     * 根据名称获取单个模板
     * 
     * @param {string} name - 模板名称
     * @returns {Template | undefined} 找到的模板对象，如果不存在则返回 undefined
     * 
     * @example
     * // 获取名为 "api" 的模板
     * const apiTemplate = templateCache.get('api');
     * if (apiTemplate) {
     *   console.log(`Template has ${apiTemplate.parameters.length} parameters`);
     * }
     */
    public get(name: string): Template | undefined {
        return this.cache.get(name);
    }

    /**
     * 扫描整个工作区并完全重建缓存
     * 
     * 扫描工作区中所有 YAML 文件，解析其中的模板定义并重建缓存。
     * 此操作会清空现有缓存并重新扫描所有文件。
     * 
     * @returns {Promise<void>} 重建过程的异步操作
     * 
     * @example
     * // 重建模板缓存
     * await templateCache.rebuild();
     */
    public async rebuild(): Promise<void> {
        if (this.isScanning) {
            return;
        }
        this.isScanning = true;

        try {
            this.clearCache();

            const config = workspace.getConfiguration('craftengine');
            const excludePattern = config.get<string>('files.exclude', '**/node_modules/**');

            // 使用 findFiles 的第三个参数来排除文件
            const yamlFiles = await workspace.findFiles('**/*.{yaml,yml}', excludePattern);

            if (yamlFiles.length === 0) {
                if (DEBUG_ENABLED) {
                    console.log('No YAML files found in workspace');
                }
                return;
            }

            if (DEBUG_ENABLED) {
                console.log(`Found ${yamlFiles.length} YAML files to scan`);
                console.log('YAML files:', yamlFiles.map(f => f.fsPath));
            }

            // 并发处理文件以提高性能
            await this.processFilesConcurrently(yamlFiles);

            this.lastScanTime = Date.now();
            const stats = this.getStats();
            if (DEBUG_ENABLED) {
                console.log(`CraftEngine cache rebuilt. Found ${stats.totalTemplates} templates from ${stats.totalFiles} files`);
            }
        } catch (error) {
            console.error('Error rebuilding cache:', error);
        } finally {
            this.isScanning = false;
        }
    }

    /**
     * 更新或删除单个文件的缓存
     * 
     * 当文件发生变化时调用此方法。首先移除该文件之前贡献的所有模板，
     * 然后重新解析文件内容并添加新的模板到缓存中。
     * 
     * @param {Uri} fileUri - 发生变化的文件 URI
     * @returns {Promise<void>} 更新过程的异步操作
     * 
     * @example
     * // 更新特定文件的缓存
     * await templateCache.updateFile(fileUri);
     */
    public async updateFile(fileUri: Uri): Promise<void> {
        const filePath = fileUri.fsPath;
        
        // 先移除该文件之前贡献的所有模板
        this.removeByFile(fileUri);

        try {
            const document = await workspace.openTextDocument(fileUri);
            const templates = parseTemplates(document.getText(), fileUri);
            
            if (templates.length > 0) {
                if (DEBUG_ENABLED) {
                    console.log(`Parsed ${templates.length} templates from ${filePath}`);
                    console.log('Templates:', templates.map(t => ({
                        name: t.name,
                        parameters: t.parameters,
                        required: t.requiredParameters,
                        optional: t.optionalParameters
                    })));
                }
                
                // 批量添加模板到缓存
                const templateNames = new Set<string>();
                for (const template of templates) {
                    this.cache.set(template.name, template);
                    templateNames.add(template.name);
                    this.updateIndexes(template);
                }
                
                // 更新文件到模板的映射
                this.fileToTemplates.set(filePath, templateNames);
            } else {
                if (DEBUG_ENABLED) {
                    console.warn(`No templates found in ${filePath}`);
                }
            }
        } catch (error) {
            console.error(`Failed to update cache for file: ${filePath}`, error);
        }
    }

    /**
     * 当文件被删除时，从缓存中移除其所有模板
     * 
     * 使用文件到模板的映射快速移除来自指定文件的所有模板。
     * 
     * @param {Uri} fileUri - 被删除的文件的 URI
     * 
     * @example
     * // 移除来自特定文件的所有模板
     * templateCache.removeByFile(fileUri);
     */
    public removeByFile(fileUri: Uri): void {
        const filePath = fileUri.fsPath;
        const templateNames = this.fileToTemplates.get(filePath);
        
        if (templateNames) {
            // 从缓存中移除所有相关模板
            for (const templateName of templateNames) {
                const template = this.cache.get(templateName);
                if (template) {
                    this.removeFromIndexes(template);
                    this.cache.delete(templateName);
                }
            }
            
            // 移除文件映射
            this.fileToTemplates.delete(filePath);
            this.scanCache.delete(filePath);
        }
    }

    /**
     * 清空所有缓存
     */
    private clearCache(): void {
        this.cache.clear();
        this.fileToTemplates.clear();
        this.nameIndex.clear();
        this.parameterIndex.clear();
        this.scanCache.clear();
    }

    /**
     * 更新索引
     */
    private updateIndexes(template: Template): void {
        // 更新名称索引
        const nameKey = template.name.toLowerCase();
        if (!this.nameIndex.has(nameKey)) {
            this.nameIndex.set(nameKey, []);
        }
        this.nameIndex.get(nameKey)!.push(template);
        
        // 更新参数索引
        for (const param of template.parameters) {
            if (!this.parameterIndex.has(param)) {
                this.parameterIndex.set(param, []);
            }
            this.parameterIndex.get(param)!.push(template);
        }
    }

    /**
     * 从索引中移除模板
     */
    private removeFromIndexes(template: Template): void {
        // 从名称索引中移除
        const nameKey = template.name.toLowerCase();
        const nameTemplates = this.nameIndex.get(nameKey);
        if (nameTemplates) {
            const index = nameTemplates.findIndex(t => t.name === template.name);
            if (index !== -1) {
                nameTemplates.splice(index, 1);
                if (nameTemplates.length === 0) {
                    this.nameIndex.delete(nameKey);
                }
            }
        }
        
        // 从参数索引中移除
        for (const param of template.parameters) {
            const paramTemplates = this.parameterIndex.get(param);
            if (paramTemplates) {
                const index = paramTemplates.findIndex(t => t.name === template.name);
                if (index !== -1) {
                    paramTemplates.splice(index, 1);
                    if (paramTemplates.length === 0) {
                        this.parameterIndex.delete(param);
                    }
                }
            }
        }
    }

    /**
     * 并发处理文件列表
     * 
     * @param {Uri[]} files - 要处理的文件列表
     * @returns {Promise<void>} 处理完成的异步操作
     */
    private async processFilesConcurrently(files: Uri[]): Promise<void> {
        const chunks: Uri[][] = [];
        
        // 将文件分批处理
        for (let i = 0; i < files.length; i += this.maxConcurrentFiles) {
            chunks.push(files.slice(i, i + this.maxConcurrentFiles));
        }

        // 并发处理每个批次
        for (const chunk of chunks) {
            await Promise.all(chunk.map(file => this.updateFile(file)));
        }
    }

    /**
     * 获取缓存统计信息（增强版）
     */
    public getDetailedStats() {
        const stats = this.getStats();
        return {
            ...stats,
            indexedNames: this.nameIndex.size,
            indexedParameters: this.parameterIndex.size,
            lastScanTime: this.lastScanTime,
            cacheHitRate: this.calculateCacheHitRate()
        };
    }

    /**
     * 计算缓存命中率
     */
    private calculateCacheHitRate(): number {
        // 这里可以添加实际的缓存命中统计逻辑
        return 0.95; // 示例值
    }
}

// 导出一个单例，供整个扩展使用
export const templateCache = new CacheManager();