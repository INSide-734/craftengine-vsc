import { Uri, workspace, type TextDocument } from 'vscode';
import { type IWorkspaceService, type IWorkspaceFolder } from '../../core/interfaces/IWorkspaceService';

/**
 * VS Code 工作区服务实现
 *
 * 使用 vscode.workspace API 实现工作区相关操作。
 */
export class VscodeWorkspaceService implements IWorkspaceService {
    /**
     * 获取所有工作区文件夹
     */
    getWorkspaceFolders(): IWorkspaceFolder[] {
        const folders = workspace.workspaceFolders;
        if (!folders) {
            return [];
        }

        return folders.map((folder) => ({
            uri: folder.uri,
            name: folder.name,
            index: folder.index,
        }));
    }

    /**
     * 获取第一个工作区文件夹
     */
    getFirstWorkspaceFolder(): IWorkspaceFolder | undefined {
        const folders = this.getWorkspaceFolders();
        return folders.length > 0 ? folders[0] : undefined;
    }

    /**
     * 检查是否有打开的工作区
     */
    hasWorkspace(): boolean {
        const folders = workspace.workspaceFolders;
        return !!folders && folders.length > 0;
    }

    /**
     * 获取工作区根路径
     */
    getWorkspaceRootPath(): string | undefined {
        const folder = this.getFirstWorkspaceFolder();
        return folder?.uri.fsPath;
    }

    /**
     * 打开文本文档
     */
    async openTextDocument(uri: Uri): Promise<TextDocument> {
        return workspace.openTextDocument(uri);
    }

    /**
     * 根据相对路径获取工作区内的 URI
     */
    getWorkspaceUri(relativePath: string): Uri | undefined {
        const rootPath = this.getWorkspaceRootPath();
        if (!rootPath) {
            return undefined;
        }
        return Uri.joinPath(Uri.file(rootPath), relativePath);
    }
}
