import { EditorUri, EditorTextDocument } from '../types/EditorTypes';
import { IYamlDocument, IYamlParseResult, IYamlParseError } from './IYamlDocument';

/**
 * YAML 解析选项
 */
export interface IYamlParseOptions {
    /** 是否严格模式（遇到错误时抛出异常） */
    strict?: boolean;
    
    /** 是否保留注释 */
    keepComments?: boolean;
    
    /** 是否保留位置信息 */
    keepPosition?: boolean;
    
    /** 最大解析深度 */
    maxDepth?: number;
    
    /** 自定义错误处理 */
    onError?: (error: IYamlParseError) => void;
}

/**
 * 增量解析上下文
 *
 * 用于增量解析时保存状态
 */
export interface IIncrementalParseContext {
    /** 文档 URI */
    readonly uri: EditorUri;

    /** 上次解析的版本号 */
    readonly lastVersion: number;

    /** 上次解析的结果 */
    readonly lastResult: IYamlParseResult | null;

    /** 上次解析的原始文本（用于计算变更偏移） */
    readonly lastText?: string;

    /** 变更范围 */
    readonly changeRange?: {
        startLine: number;
        endLine: number;
    };
}

/**
 * 流式解析选项
 */
export interface IStreamParseOptions extends IYamlParseOptions {
    /** 块大小（每次处理的字符数） */
    chunkSize?: number;
    
    /** 进度回调 */
    onProgress?: (progress: {
        processed: number;
        total: number;
        percentage: number;
    }) => void;
}

/**
 * YAML 解析器接口
 * 
 * 提供 YAML 文档的解析功能，支持流式和增量解析
 */
export interface IYamlParser {
    /**
     * 解析文本内容
     * 
     * @param text YAML 文本内容
     * @param sourceFile 源文件 URI
     * @param options 解析选项
     * @returns 解析结果
     */
    parseText(
        text: string,
        sourceFile: EditorUri,
        options?: IYamlParseOptions
    ): Promise<IYamlParseResult>;
    
    /**
     * 解析 VSCode 文档
     * 
     * @param document VSCode 文档对象
     * @param options 解析选项
     * @returns 解析结果
     */
    parseDocument(
        document: EditorTextDocument,
        options?: IYamlParseOptions
    ): Promise<IYamlParseResult>;
    
    /**
     * 流式解析文本内容
     * 
     * 适用于大文件的逐步解析
     * 
     * @param text YAML 文本内容
     * @param sourceFile 源文件 URI
     * @param options 流式解析选项
     * @returns 异步迭代器，每次产生解析进度
     */
    parseStream(
        text: string,
        sourceFile: EditorUri,
        options?: IStreamParseOptions
    ): AsyncIterableIterator<IYamlParseResult>;
    
    /**
     * 增量解析文档
     * 
     * 基于上次解析结果和变更范围，只解析变更部分
     * 
     * @param document VSCode 文档对象
     * @param context 增量解析上下文
     * @param options 解析选项
     * @returns 解析结果
     */
    parseIncremental(
        document: EditorTextDocument,
        context: IIncrementalParseContext,
        options?: IYamlParseOptions
    ): Promise<IYamlParseResult>;
    
    /**
     * 创建 YAML 文档对象
     * 
     * @param parseResult 解析结果
     * @param content 文档内容
     * @returns YAML 文档对象
     */
    createDocument(
        parseResult: IYamlParseResult,
        content: string
    ): IYamlDocument;
}

