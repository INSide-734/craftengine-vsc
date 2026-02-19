import { Uri, workspace, FileType as VscodeFileType } from 'vscode';
import {
    IFileReader,
    IFileStat,
    IDirectoryEntry,
    FileType
} from '../../core/interfaces/IFileReader';

/**
 * VS Code 文件读取器实现
 *
 * 使用 vscode.workspace.fs API 实现文件系统操作。
 * 提供完整的文件系统访问能力，包括读取、写入、检查存在性、获取状态和目录遍历。
 */
export class VscodeFileReader implements IFileReader {
    /**
     * 读取文件内容（二进制）
     *
     * @param uri - 文件 URI
     * @returns 文件内容的字节数组
     */
    async readFile(uri: Uri): Promise<Uint8Array> {
        return workspace.fs.readFile(uri);
    }

    /**
     * 读取文件内容（文本）
     *
     * @param uri - 文件 URI
     * @param _encoding - 编码格式（VS Code API 自动处理编码）
     * @returns 文件内容字符串
     */
    async readFileText(uri: Uri, _encoding?: string): Promise<string> {
        const content = await workspace.fs.readFile(uri);
        return new TextDecoder().decode(content);
    }

    /**
     * 检查文件或目录是否存在
     *
     * @param uri - 文件或目录 URI
     * @returns 如果存在返回 true
     */
    async exists(uri: Uri): Promise<boolean> {
        try {
            await workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 获取文件或目录的状态信息
     *
     * @param uri - 文件或目录 URI
     * @returns 文件状态信息，如果不存在返回 null
     */
    async stat(uri: Uri): Promise<IFileStat | null> {
        try {
            const stat = await workspace.fs.stat(uri);
            return {
                type: this.convertFileType(stat.type),
                size: stat.size,
                mtime: stat.mtime,
                ctime: stat.ctime
            };
        } catch {
            return null;
        }
    }

    /**
     * 读取目录内容
     *
     * @param uri - 目录 URI
     * @returns 目录条目数组
     */
    async readDirectory(uri: Uri): Promise<IDirectoryEntry[]> {
        const entries = await workspace.fs.readDirectory(uri);
        return entries.map(([name, type]) => ({
            name,
            type: this.convertFileType(type)
        }));
    }

    /**
     * 写入文件内容（二进制）
     *
     * @param uri - 文件 URI
     * @param content - 文件内容
     */
    async writeFile(uri: Uri, content: Uint8Array): Promise<void> {
        await workspace.fs.writeFile(uri, content);
    }

    /**
     * 写入文件内容（文本）
     *
     * @param uri - 文件 URI
     * @param content - 文件内容字符串
     * @param _encoding - 编码格式（VS Code API 自动处理编码）
     */
    async writeFileText(uri: Uri, content: string, _encoding?: string): Promise<void> {
        const encoded = new TextEncoder().encode(content);
        await workspace.fs.writeFile(uri, encoded);
    }

    /**
     * 创建目录
     *
     * @param uri - 目录 URI
     */
    async createDirectory(uri: Uri): Promise<void> {
        await workspace.fs.createDirectory(uri);
    }

    /**
     * 删除文件或目录
     *
     * @param uri - 文件或目录 URI
     * @param options - 删除选项
     */
    async delete(uri: Uri, options?: { recursive?: boolean }): Promise<void> {
        await workspace.fs.delete(uri, options);
    }

    /**
     * 转换 VS Code 文件类型到接口定义的文件类型
     */
    private convertFileType(vscodeType: VscodeFileType): FileType {
        switch (vscodeType) {
            case VscodeFileType.File:
                return FileType.File;
            case VscodeFileType.Directory:
                return FileType.Directory;
            case VscodeFileType.SymbolicLink:
                return FileType.SymbolicLink;
            default:
                return FileType.Unknown;
        }
    }
}
