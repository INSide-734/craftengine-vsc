import * as path from 'path';
import {
    workspace,
    FileSystemWatcher,
    RelativePattern,
    Uri,
    Disposable
} from 'vscode';
import { ILogger } from '../../../core/interfaces/ILogger';
import { IEventBus } from '../../../core/interfaces/IEventBus';
import { IConfiguration } from '../../../core/interfaces/IConfiguration';

/**
 * Schema 文件变更事件
 */
export interface ISchemaFileChangeEvent {
    /** 事件 ID */
    id: string;
    /** 事件类型 */
    type: 'schema.file.changed' | 'schema.file.created' | 'schema.file.deleted';
    /** 时间戳 */
    timestamp: Date;
    /** 变更的文件 URI */
    uri: Uri;
    /** 相对路径 */
    relativePath: string;
    /** 变更类型 */
    changeType: 'created' | 'changed' | 'deleted';
}

/**
 * Schema 文件监控管理器
 * 
 * 监控工作区中 `.craftengine/schemas/` 目录的文件变更，
 * 实现 Schema 的热重载功能。
 * 
 * @remarks
 * **监控策略**：
 * 
 * 1. **监控范围**
 *    - 仅监控 `.craftengine/schemas/` 目录
 *    - 支持子目录递归监控
 *    - 过滤非 JSON 文件
 * 
 * 2. **事件处理**
 *    - 使用防抖机制避免频繁触发
 *    - 发布事件到事件总线
 *    - 支持批量变更合并
 * 
 * 3. **热重载触发**
 *    - 文件创建：重新加载 Schema
 *    - 文件修改：重新加载 Schema
 *    - 文件删除：回退到扩展内置 Schema
 */
export class SchemaFileWatcherManager implements Disposable {
    /** 工作区 Schema 目录名 */
    private static readonly WORKSPACE_SCHEMA_DIR = '.craftengine/schemas';
    
    /** 文件监控器 */
    private watcher: FileSystemWatcher | null = null;
    
    /** 防抖定时器 */
    private debounceTimer: NodeJS.Timeout | null = null;
    
    /** 防抖延迟（毫秒） */
    private static readonly DEBOUNCE_DELAY = 500;
    
    /** 待处理的变更事件 */
    private pendingChanges: Map<string, ISchemaFileChangeEvent> = new Map();
    
    /** 是否已初始化 */
    private initialized = false;
    
    /** 是否已释放 */
    private disposed = false;
    
    /** 事件订阅清理列表 */
    private disposables: Disposable[] = [];
    
    constructor(
        private readonly logger: ILogger,
        private readonly eventBus: IEventBus,
        private readonly configuration: IConfiguration,
        private readonly generateEventId: (prefix?: string) => string = (prefix = 'evt') => `${prefix}_${Date.now()}`
    ) {}
    
    /**
     * 初始化文件监控
     * 
     * @returns true 如果成功初始化监控
     */
    async initialize(): Promise<boolean> {
        if (this.initialized) {
            return true;
        }
        
        // 检查是否启用热重载
        const hotReloadEnabled = this.configuration.get<boolean>(
            'craftengine.schema.hotReload',
            true
        );
        
        if (!hotReloadEnabled) {
            this.logger.info('Schema hot reload is disabled');
            return false;
        }
        
        const schemaDir = this.getWorkspaceSchemaDir();
        
        if (!schemaDir) {
            this.logger.debug('No workspace schema directory to watch');
            return false;
        }
        
        try {
            // 创建文件监控器
            const workspaceFolders = workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return false;
            }
            
            const pattern = new RelativePattern(
                workspaceFolders[0],
                '.craftengine/schemas/**/*.{json,schema.json}'
            );
            
            this.watcher = workspace.createFileSystemWatcher(pattern);
            
            // 注册事件处理器
            this.disposables.push(
                this.watcher.onDidCreate(uri => this.handleFileChange(uri, 'created')),
                this.watcher.onDidChange(uri => this.handleFileChange(uri, 'changed')),
                this.watcher.onDidDelete(uri => this.handleFileChange(uri, 'deleted'))
            );
            
            this.initialized = true;
            this.logger.info('Schema file watcher initialized', { schemaDir });
            
            return true;
            
        } catch (error) {
            this.logger.error('Failed to initialize schema file watcher', error as Error);
            return false;
        }
    }
    
    /**
     * 获取工作区 Schema 目录路径
     */
    getWorkspaceSchemaDir(): string | undefined {
        const workspaceFolders = workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return undefined;
        }
        
        return path.join(
            workspaceFolders[0].uri.fsPath,
            SchemaFileWatcherManager.WORKSPACE_SCHEMA_DIR
        );
    }
    
    /**
     * 检查是否正在监控
     */
    isWatching(): boolean {
        return this.initialized && this.watcher !== null;
    }
    
    /**
     * 停止监控
     */
    stopWatching(): void {
        if (this.watcher) {
            this.watcher.dispose();
            this.watcher = null;
        }
        
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        
        this.pendingChanges.clear();
        this.initialized = false;
        
        this.logger.debug('Schema file watcher stopped');
    }
    
    /**
     * 重新启动监控
     */
    async restart(): Promise<boolean> {
        this.stopWatching();
        return this.initialize();
    }
    
    /**
     * 释放资源
     */
    dispose(): void {
        if (this.disposed) {
            return;
        }
        
        this.stopWatching();
        
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
        
        this.disposed = true;
        this.logger.debug('Schema file watcher manager disposed');
    }
    
    // ==================== 私有方法 ====================
    
    /**
     * 处理文件变更
     */
    private handleFileChange(uri: Uri, changeType: 'created' | 'changed' | 'deleted'): void {
        // 忽略版本文件
        if (uri.fsPath.endsWith('.version')) {
            return;
        }
        
        const schemaDir = this.getWorkspaceSchemaDir();
        if (!schemaDir) {
            return;
        }
        
        const relativePath = path.relative(schemaDir, uri.fsPath);
        
        // 创建变更事件
        const event: ISchemaFileChangeEvent = {
            id: this.generateEventId('schema'),
            type: this.getEventType(changeType),
            timestamp: new Date(),
            uri,
            relativePath,
            changeType
        };
        
        // 添加到待处理队列（同一文件的新变更会覆盖旧变更）
        this.pendingChanges.set(uri.fsPath, event);
        
        // 使用防抖处理
        this.scheduleFlush();
    }
    
    /**
     * 调度刷新待处理的变更
     */
    private scheduleFlush(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        this.debounceTimer = setTimeout(() => {
            this.flushPendingChanges();
        }, SchemaFileWatcherManager.DEBOUNCE_DELAY);
    }
    
    /**
     * 刷新待处理的变更
     */
    private async flushPendingChanges(): Promise<void> {
        if (this.pendingChanges.size === 0) {
            return;
        }
        
        const changes = Array.from(this.pendingChanges.values());
        this.pendingChanges.clear();
        
        this.logger.info('Schema files changed', {
            count: changes.length,
            files: changes.map(c => c.relativePath)
        });
        
        // 发布每个变更事件
        for (const change of changes) {
            await this.eventBus.publish(change.type, change);
        }
        
        // 发布汇总的热重载事件
        await this.eventBus.publish('schema.hot.reloaded', {
            id: this.generateEventId('schema'),
            type: 'schema.hot.reloaded',
            timestamp: new Date(),
            changes
        });
    }
    
    /**
     * 获取事件类型
     */
    private getEventType(changeType: 'created' | 'changed' | 'deleted'): ISchemaFileChangeEvent['type'] {
        switch (changeType) {
            case 'created':
                return 'schema.file.created';
            case 'deleted':
                return 'schema.file.deleted';
            default:
                return 'schema.file.changed';
        }
    }
}

