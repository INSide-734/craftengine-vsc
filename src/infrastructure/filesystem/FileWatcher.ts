import { Uri, workspace, FileSystemWatcher, RelativePattern } from 'vscode';
import {
    IFileWatcher,
    IFileChangeEvent,
    IFileWatchOptions,
    FileChangeType
} from '../../core/interfaces/IFileWatcher';
import { ILogger } from '../../core/interfaces/ILogger';
import { IEventBus } from '../../core/interfaces/IEventBus';
import { EVENT_TYPES } from '../../core/constants/ServiceTokens';
import { generateEventId } from '../utils';

/**
 * VSCode 文件监控器实现
 */
export class VSCodeFileWatcher implements IFileWatcher {
    private readonly watchers = new Map<string, FileSystemWatcher>();
    private readonly watchOptions = new Map<string, IFileWatchOptions>();
    private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
    private readonly changeHandlers: ((event: IFileChangeEvent) => void)[] = [];
    private disposed = false;
    
    constructor(
        private readonly logger?: ILogger,
        private readonly eventBus?: IEventBus
    ) {}
    
    watch(path: string | Uri, options?: IFileWatchOptions): void {
        this.ensureNotDisposed();
        
        const pathStr = typeof path === 'string' ? path : path.fsPath;
        
        // 如果已经在监控，先停止
        if (this.watchers.has(pathStr)) {
            this.unwatch(pathStr);
        }
        
        const finalOptions: IFileWatchOptions = {
            include: ['**/*.{yml,yaml}'],
            recursive: true,
            debounceDelay: 300,
            ...options
        };
        
        this.watchOptions.set(pathStr, finalOptions);
        
        try {
            const watcher = this.createWatcher(pathStr, finalOptions);
            this.watchers.set(pathStr, watcher);
            
            this.logger?.info('Started watching path', {
                path: pathStr,
                options: finalOptions
            });
            
        } catch (error) {
            this.logger?.error('Failed to start watching path', error as Error, {
                path: pathStr
            });
            throw error;
        }
    }
    
    unwatch(path: string | Uri): void {
        const pathStr = typeof path === 'string' ? path : path.fsPath;
        
        const watcher = this.watchers.get(pathStr);
        if (watcher) {
            watcher.dispose();
            this.watchers.delete(pathStr);
            this.watchOptions.delete(pathStr);
            
            // 清理防抖计时器
            const timer = this.debounceTimers.get(pathStr);
            if (timer) {
                clearTimeout(timer);
                this.debounceTimers.delete(pathStr);
            }
            
            this.logger?.info('Stopped watching path', { path: pathStr });
        }
    }
    
    unwatchAll(): void {
        const paths = Array.from(this.watchers.keys());
        for (const path of paths) {
            this.unwatch(path);
        }
        
        this.logger?.info('Stopped watching all paths');
    }
    
    onFileChange(handler: (event: IFileChangeEvent) => void): () => void {
        this.ensureNotDisposed();
        
        this.changeHandlers.push(handler);
        
        return () => {
            const index = this.changeHandlers.indexOf(handler);
            if (index !== -1) {
                this.changeHandlers.splice(index, 1);
            }
        };
    }
    
    getWatchedPaths(): string[] {
        return Array.from(this.watchers.keys());
    }
    
    isWatching(path: string | Uri): boolean {
        const pathStr = typeof path === 'string' ? path : path.fsPath;
        return this.watchers.has(pathStr);
    }
    
    dispose(): void {
        if (this.disposed) {
            return;
        }
        
        // 停止所有监控
        this.unwatchAll();
        
        // 清理处理器
        this.changeHandlers.length = 0;
        
        // 清理所有计时器
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
        
        this.disposed = true;
        this.logger?.info('File watcher disposed');
    }
    
    /**
     * 创建VSCode文件系统监控器
     */
    private createWatcher(path: string, options: IFileWatchOptions): FileSystemWatcher {
        // 构建监控模式
        let pattern: string | RelativePattern;
        
        if (options.include) {
            if (Array.isArray(options.include)) {
                // 多个模式，使用第一个作为主模式
                pattern = options.include[0];
            } else {
                pattern = options.include;
            }
        } else {
            pattern = '**/*';
        }
        
        // 创建相对模式
        if (typeof pattern === 'string' && !pattern.startsWith('/')) {
            pattern = new RelativePattern(path, pattern);
        }
        
        const watcher = workspace.createFileSystemWatcher(pattern);
        
        // 设置事件监听器
        watcher.onDidCreate(uri => this.handleFileChange(uri, FileChangeType.Created, path, options));
        watcher.onDidChange(uri => this.handleFileChange(uri, FileChangeType.Modified, path, options));
        watcher.onDidDelete(uri => this.handleFileChange(uri, FileChangeType.Deleted, path, options));
        
        return watcher;
    }
    
    /**
     * 处理文件变更事件
     */
    private handleFileChange(
        uri: Uri, 
        type: FileChangeType, 
        _watchPath: string, 
        options: IFileWatchOptions
    ): void {
        // 应用排除过滤器
        if (options.exclude && this.matchesPattern(uri.fsPath, options.exclude)) {
            return;
        }
        
        // 应用包含过滤器
        if (options.include && !this.matchesAnyPattern(uri.fsPath, options.include)) {
            return;
        }
        
        const event: IFileChangeEvent = {
            uri,
            type,
            timestamp: new Date()
        };
        
        // 防抖处理
        if (options.debounceDelay && options.debounceDelay > 0) {
            this.debounceFileChange(uri.fsPath, event, options.debounceDelay);
        } else {
            this.notifyFileChange(event);
        }
    }
    
    /**
     * 防抖文件变更事件
     */
    private debounceFileChange(filePath: string, event: IFileChangeEvent, delay: number): void {
        // 清除现有的计时器
        const existingTimer = this.debounceTimers.get(filePath);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        
        // 设置新的计时器
        const timer = setTimeout(() => {
            this.debounceTimers.delete(filePath);
            this.notifyFileChange(event);
        }, delay);
        
        this.debounceTimers.set(filePath, timer);
    }
    
    /**
     * 通知文件变更
     */
    private notifyFileChange(event: IFileChangeEvent): void {
        this.logger?.debug('File change detected', {
            file: event.uri.fsPath,
            type: event.type,
            timestamp: event.timestamp
        });
        
        // 通知所有处理器
        for (const handler of this.changeHandlers) {
            try {
                handler(event);
            } catch (error) {
                this.logger?.error('Error in file change handler', error as Error, {
                    file: event.uri.fsPath,
                    type: event.type
                });
            }
        }
        
        // 发布事件总线事件
        const eventType = this.getEventTypeForFileChange(event.type);
        this.eventBus?.publish(eventType, {
            id: generateEventId('file'),
            type: eventType,
            timestamp: event.timestamp,
            source: 'FileWatcher',
            uri: event.uri
        });
    }
    
    /**
     * 检查文件路径是否匹配模式
     */
    private matchesPattern(filePath: string, pattern: string | string[]): boolean {
        const patterns = Array.isArray(pattern) ? pattern : [pattern];
        return patterns.some(p => this.matchGlob(filePath, p));
    }
    
    /**
     * 检查文件路径是否匹配任何模式
     */
    private matchesAnyPattern(filePath: string, patterns: string | string[]): boolean {
        const patternArray = Array.isArray(patterns) ? patterns : [patterns];
        return patternArray.some(pattern => this.matchGlob(filePath, pattern));
    }
    
    /**
     * 简单的glob模式匹配
     */
    private matchGlob(path: string, pattern: string): boolean {
        // 将glob模式转换为正则表达式
        // 先转义所有正则元字符，再还原 glob 通配符
        const regexPattern = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // 转义正则元字符（不含 * 和 ?）
            .replace(/\*\*/g, '.*')   // ** 匹配任何路径
            .replace(/\*/g, '[^/]*')  // * 匹配除 / 外的任何字符
            .replace(/\?/g, '[^/]');  // ? 匹配除 / 外的单个字符

        const regex = new RegExp(`^${regexPattern}$`, 'i');
        return regex.test(path);
    }
    
    /**
     * 获取文件变更对应的事件类型
     */
    private getEventTypeForFileChange(changeType: FileChangeType): string {
        switch (changeType) {
            case FileChangeType.Created:
                return EVENT_TYPES.FileCreated;
            case FileChangeType.Modified:
                return EVENT_TYPES.FileModified;
            case FileChangeType.Deleted:
                return EVENT_TYPES.FileDeleted;
            default:
                return EVENT_TYPES.FileModified;
        }
    }

    /**
     * 确保未被释放
     */
    private ensureNotDisposed(): void {
        if (this.disposed) {
            throw new Error('FileWatcher has been disposed');
        }
    }
}
