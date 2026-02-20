import { type EditorDisposable, type EditorUri } from '../types/EditorTypes';

/**
 * 文件监控器接口
 *
 * 抽象编辑器的文件系统监控功能。
 */
export interface IFileWatcherInstance extends EditorDisposable {
    /** 文件创建事件 */
    onDidCreate(handler: (uri: EditorUri) => void): EditorDisposable;
    /** 文件变更事件 */
    onDidChange(handler: (uri: EditorUri) => void): EditorDisposable;
    /** 文件删除事件 */
    onDidDelete(handler: (uri: EditorUri) => void): EditorDisposable;
}

/**
 * 文件监控工厂接口
 *
 * 抽象编辑器的文件监控创建功能，使 Application 层不直接依赖 vscode.workspace。
 */
export interface IFileWatcherFactory {
    /**
     * 创建文件监控器
     *
     * @param baseDir - 监控的基础目录路径
     * @param globPattern - 文件匹配模式（如 `**\/*.json`）
     * @returns 文件监控器实例，如果无法创建则返回 null
     */
    createWatcher(baseDir: string, globPattern: string): IFileWatcherInstance | null;
}
