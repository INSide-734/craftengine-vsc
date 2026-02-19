import { EditorUri } from '../types/EditorTypes';

/**
 * 文件变更类型枚举
 * 定义文件系统中可能发生的变更类型
 */
export enum FileChangeType {
    /** 文件创建 */
    Created = 'created',
    
    /** 文件修改 */
    Modified = 'modified',
    
    /** 文件删除 */
    Deleted = 'deleted'
}

/**
 * 文件变更事件
 * 描述文件系统中发生的具体变更事件
 */
export interface IFileChangeEvent {
    /** 文件URI */
    uri: EditorUri;
    
    /** 变更类型 */
    type: FileChangeType;
    
    /** 时间戳 */
    timestamp: Date;
}

/**
 * 文件监控选项
 * 配置文件监控器的行为参数
 */
export interface IFileWatchOptions {
    /** 包含模式 - glob 格式的文件匹配模式 */
    include?: string | string[];
    
    /** 排除模式 - glob 格式的文件排除模式 */
    exclude?: string | string[];
    
    /** 是否递归监控子目录 */
    recursive?: boolean;
    
    /** 防抖延迟（毫秒） */
    debounceDelay?: number;
}

/**
 * 文件监控器接口
 * 提供文件系统监控功能，支持文件变更检测、事件通知和防抖处理
 */
export interface IFileWatcher {
    /**
     * 开始监控指定路径
     * @param path 要监控的路径（字符串或 Uri）
     * @param options 监控选项
     */
    watch(path: string | EditorUri, options?: IFileWatchOptions): void;
    
    /**
     * 停止监控指定路径
     * @param path 要停止监控的路径
     */
    unwatch(path: string | EditorUri): void;
    
    /**
     * 停止所有监控
     */
    unwatchAll(): void;
    
    /**
     * 监听文件变更事件
     * @param handler 事件处理函数
     * @returns 取消监听的函数
     */
    onFileChange(handler: (event: IFileChangeEvent) => void): () => void;
    
    /**
     * 获取当前监控的路径
     * @returns 监控路径的字符串数组
     */
    getWatchedPaths(): string[];
    
    /**
     * 检查路径是否被监控
     * @param path 要检查的路径
     * @returns 如果正在监控返回 true，否则返回 false
     */
    isWatching(path: string | EditorUri): boolean;
    
    /**
     * 清理资源
     */
    dispose(): void;
}
