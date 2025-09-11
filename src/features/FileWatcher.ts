// src/features/FileWatcher.ts
import { workspace, FileSystemWatcher, ExtensionContext, Uri } from 'vscode';
import { templateCache } from '../core/TemplateCache';

let watcher: FileSystemWatcher | null = null;

/**
 * 初始化并激活文件系统监视器，以实时更新模板缓存
 * 
 * 创建一个文件系统监视器，监听工作区中所有 YAML 文件的变化。
 * 当文件被创建、修改或删除时，会自动更新模板缓存以保持同步。
 * 
 * @param {ExtensionContext} context - 扩展的上下文，用于管理资源的生命周期
 * 
 * @example
 * // 在扩展激活时调用：
 * // setupFileWatcher(context);
 */
export function setupFileWatcher(context: ExtensionContext) {
    // 创建一个监视器，只关注 YAML 文件
    watcher = workspace.createFileSystemWatcher('**/*.{yaml,yml}');

    // --- 注册事件监听器 ---

    // 1. 当一个文件被创建时
    watcher.onDidCreate((uri: Uri) => {
        console.log(`[FileWatcher] File created: ${uri.fsPath}. Updating cache.`);
        // 调用缓存的增量更新方法，只处理这一个新文件
        templateCache.updateFile(uri);
    });

    // 2. 当一个文件内容被修改时
    watcher.onDidChange((uri: Uri) => {
        console.log(`[FileWatcher] File changed: ${uri.fsPath}. Updating cache.`);
        // 同样调用增量更新，此方法会先移除旧的，再添加新的
        templateCache.updateFile(uri);
    });

    // 3. 当一个文件被删除时
    watcher.onDidDelete((uri: Uri) => {
        console.log(`[FileWatcher] File deleted: ${uri.fsPath}. Removing from cache.`);
        // 调用缓存的精确移除方法
        templateCache.removeByFile(uri);
    });

    // --- 生命周期管理 ---

    // 将监视器实例添加到扩展的订阅中
    // 这样做可以确保当扩展被禁用或卸载时，监视器会被正确地清理，防止内存泄漏
    if (watcher) {
        context.subscriptions.push(watcher);
    }
}

/**
 * 停用文件监视器
 * 
 * 清理文件系统监视器资源，防止内存泄漏。
 * 通常在扩展停用时调用此方法。
 * 
 * @example
 * // 在扩展停用时调用：
 * // disposeFileWatcher();
 */
export function disposeFileWatcher() {
    if (watcher) {
        watcher.dispose();
        watcher = null;
    }
}