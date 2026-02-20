import { workspace, RelativePattern, Uri } from 'vscode';
import { type IFileWatcherFactory, type IFileWatcherInstance } from '../../core/interfaces/IFileWatcherFactory';
import { type EditorDisposable, type EditorUri } from '../../core/types/EditorTypes';

/**
 * VS Code 文件监控工厂实现
 *
 * 包装 vscode.workspace.createFileSystemWatcher。
 */
export class VscodeFileWatcherFactory implements IFileWatcherFactory {
    createWatcher(baseDir: string, globPattern: string): IFileWatcherInstance | null {
        const workspaceFolders = workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }

        const pattern = new RelativePattern(Uri.file(baseDir), globPattern);

        const watcher = workspace.createFileSystemWatcher(pattern);

        return {
            onDidCreate(handler: (uri: EditorUri) => void): EditorDisposable {
                return watcher.onDidCreate(handler);
            },
            onDidChange(handler: (uri: EditorUri) => void): EditorDisposable {
                return watcher.onDidChange(handler);
            },
            onDidDelete(handler: (uri: EditorUri) => void): EditorDisposable {
                return watcher.onDidDelete(handler);
            },
            dispose(): void {
                watcher.dispose();
            },
        };
    }
}
