import { type EditorUri, type EditorProgress } from '../types/EditorTypes';
import { type IYamlDocument } from './IYamlDocument';

/**
 * YAML 文件扫描选项
 */
export interface IYamlScanOptions {
    /** 文件匹配模式（glob 模式） */
    pattern?: string | string[];

    /** 排除模式 */
    exclude?: string | string[];

    /** 是否递归搜索 */
    recursive?: boolean;

    /** 最大文件大小（字节） */
    maxFileSize?: number;

    /** 是否跳过无效文件 */
    skipInvalid?: boolean;

    /** 进度报告回调 */
    onProgress?: (progress: {
        current: number;
        total: number;
        file: EditorUri;
        status: 'scanning' | 'parsing' | 'completed' | 'error';
    }) => void;
}

/**
 * YAML 文件扫描结果
 */
export interface IYamlScanResult {
    /** 扫描到的文件列表 */
    readonly files: EditorUri[];

    /** 成功解析的文档 */
    readonly documents: IYamlDocument[];

    /** 解析失败的文件 */
    readonly failed: Array<{
        file: EditorUri;
        error: string;
    }>;

    /** 扫描统计信息 */
    readonly statistics: {
        /** 总文件数 */
        totalFiles: number;
        /** 成功解析数 */
        successCount: number;
        /** 失败数 */
        failureCount: number;
        /** 成功率 */
        successRate: number;
        /** 扫描耗时（毫秒） */
        duration: number;
    };
}

/**
 * YAML 文件扫描器接口
 *
 * 负责扫描工作区中的 YAML 文件
 */
export interface IYamlScanner {
    /**
     * 扫描工作区中的 YAML 文件
     *
     * @param options 扫描选项
     * @param progress VSCode 进度对象（可选）
     * @returns 扫描结果
     */
    scanWorkspace(
        options?: IYamlScanOptions,
        progress?: EditorProgress<{ message?: string; increment?: number }>,
    ): Promise<IYamlScanResult>;

    /**
     * 扫描指定目录中的 YAML 文件
     *
     * @param directory 目录 URI
     * @param options 扫描选项
     * @returns 扫描结果
     */
    scanDirectory(directory: EditorUri, options?: IYamlScanOptions): Promise<IYamlScanResult>;

    /**
     * 扫描单个文件
     *
     * @param file 文件 URI
     * @returns YAML 文档对象，如果解析失败返回 null
     */
    scanFile(file: EditorUri): Promise<IYamlDocument | null>;

    /**
     * 检查文件是否是有效的 YAML 文件
     *
     * @param file 文件 URI
     * @returns 如果是有效的 YAML 文件返回 true
     */
    isValidYamlFile(file: EditorUri): Promise<boolean>;
}
