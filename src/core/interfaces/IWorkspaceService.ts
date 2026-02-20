import { type EditorUri, type EditorTextDocument } from '../types/EditorTypes';

/**
 * 工作区文件夹信息
 */
export interface IWorkspaceFolder {
    /** 文件夹 URI */
    uri: EditorUri;
    /** 文件夹名称 */
    name: string;
    /** 文件夹索引 */
    index: number;
}

/**
 * 工作区服务接口
 *
 * 抽象 VS Code workspace API，使 Application 层不直接依赖 vscode 模块。
 * 提供工作区文件夹访问、文档打开等功能。
 */
export interface IWorkspaceService {
    /**
     * 获取所有工作区文件夹
     *
     * @returns 工作区文件夹数组，如果没有打开的工作区则返回空数组
     */
    getWorkspaceFolders(): IWorkspaceFolder[];

    /**
     * 获取第一个工作区文件夹
     *
     * @returns 第一个工作区文件夹，如果没有则返回 undefined
     */
    getFirstWorkspaceFolder(): IWorkspaceFolder | undefined;

    /**
     * 检查是否有打开的工作区
     *
     * @returns 如果有打开的工作区返回 true
     */
    hasWorkspace(): boolean;

    /**
     * 获取工作区根路径
     *
     * @returns 第一个工作区文件夹的文件系统路径，如果没有则返回 undefined
     */
    getWorkspaceRootPath(): string | undefined;

    /**
     * 打开文本文档
     *
     * @param uri - 文档 URI
     * @returns 打开的文档
     */
    openTextDocument(uri: EditorUri): Promise<EditorTextDocument>;

    /**
     * 根据相对路径获取工作区内的 URI
     *
     * @param relativePath - 相对于工作区根目录的路径
     * @returns 完整的 URI，如果没有工作区则返回 undefined
     */
    getWorkspaceUri(relativePath: string): EditorUri | undefined;
}
