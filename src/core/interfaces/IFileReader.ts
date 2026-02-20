import { type EditorUri } from '../types/EditorTypes';

/**
 * 文件类型枚举
 */
export enum FileType {
    /** 未知类型 */
    Unknown = 0,
    /** 普通文件 */
    File = 1,
    /** 目录 */
    Directory = 2,
    /** 符号链接 */
    SymbolicLink = 64,
}

/**
 * 文件状态信息
 */
export interface IFileStat {
    /** 文件类型 */
    type: FileType;
    /** 文件大小（字节） */
    size: number;
    /** 修改时间（毫秒时间戳） */
    mtime: number;
    /** 创建时间（毫秒时间戳） */
    ctime: number;
}

/**
 * 目录条目
 */
export interface IDirectoryEntry {
    /** 文件/目录名称 */
    name: string;
    /** 文件类型 */
    type: FileType;
}

/**
 * 文件读取器接口
 *
 * 抽象文件读取操作，使 Domain 层不直接依赖 vscode.workspace。
 * 提供完整的文件系统访问能力，包括读取、检查存在性、获取状态和目录遍历。
 */
export interface IFileReader {
    /**
     * 读取文件内容（二进制）
     *
     * @param uri - 文件 URI
     * @returns 文件内容的字节数组
     */
    readFile(uri: EditorUri): Promise<Uint8Array>;

    /**
     * 读取文件内容（文本）
     *
     * @param uri - 文件 URI
     * @param encoding - 编码格式，默认 'utf-8'
     * @returns 文件内容字符串
     */
    readFileText(uri: EditorUri, encoding?: string): Promise<string>;

    /**
     * 检查文件或目录是否存在
     *
     * @param uri - 文件或目录 URI
     * @returns 如果存在返回 true
     */
    exists(uri: EditorUri): Promise<boolean>;

    /**
     * 获取文件或目录的状态信息
     *
     * @param uri - 文件或目录 URI
     * @returns 文件状态信息，如果不存在返回 null
     */
    stat(uri: EditorUri): Promise<IFileStat | null>;

    /**
     * 读取目录内容
     *
     * @param uri - 目录 URI
     * @returns 目录条目数组
     */
    readDirectory(uri: EditorUri): Promise<IDirectoryEntry[]>;

    /**
     * 写入文件内容（二进制）
     *
     * @param uri - 文件 URI
     * @param content - 文件内容
     */
    writeFile(uri: EditorUri, content: Uint8Array): Promise<void>;

    /**
     * 写入文件内容（文本）
     *
     * @param uri - 文件 URI
     * @param content - 文件内容字符串
     * @param encoding - 编码格式，默认 'utf-8'
     */
    writeFileText(uri: EditorUri, content: string, encoding?: string): Promise<void>;

    /**
     * 创建目录
     *
     * @param uri - 目录 URI
     */
    createDirectory(uri: EditorUri): Promise<void>;

    /**
     * 删除文件或目录
     *
     * @param uri - 文件或目录 URI
     * @param options - 删除选项
     */
    delete(uri: EditorUri, options?: { recursive?: boolean }): Promise<void>;
}
