import { type EditorTextDocument, type EditorRange } from '../types/EditorTypes';
import { type ITemplate } from './ITemplate';

/**
 * 文档解析结果
 */
export interface IDocumentParseResult {
    /** 解析出的模板 */
    templates: ITemplate[];
    /** 解析错误 */
    errors: IDocumentParseError[];
    /** 解析警告 */
    warnings: IDocumentParseWarning[];
}

/**
 * 文档解析错误
 */
export interface IDocumentParseError {
    /** 错误消息 */
    message: string;
    /** 错误位置范围 */
    range?: EditorRange;
    /** 严重级别 */
    severity: 'error' | 'warning' | 'info' | 'hint';
    /** 错误代码 */
    code?: string;
}

/**
 * 文档解析警告
 */
export interface IDocumentParseWarning {
    /** 警告消息 */
    message: string;
    /** 警告位置范围 */
    range?: EditorRange;
    /** 警告代码 */
    code?: string;
}

/**
 * 文档解析器接口
 *
 * 提供文档内容的解析功能，提取模板和错误信息
 */
export interface IDocumentParser {
    /**
     * 解析文档
     *
     * @param document 要解析的文档
     * @returns 解析结果
     */
    parseDocument(document: EditorTextDocument): Promise<IDocumentParseResult>;

    /**
     * 解析文本内容
     *
     * @param content 文本内容
     * @param fileName 文件名（可选，用于错误报告）
     * @returns 解析结果
     */
    parseText(content: string, fileName?: string): Promise<IDocumentParseResult>;

    /**
     * 验证文档语法
     *
     * @param document 要验证的文档
     * @returns 语法错误列表
     */
    validateSyntax(document: EditorTextDocument): Promise<IDocumentParseError[]>;
}
