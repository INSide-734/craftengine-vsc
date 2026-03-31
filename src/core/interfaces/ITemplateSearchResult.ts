import { type EditorTextDocument, type EditorPosition, type EditorTextEdit } from '../types/EditorTypes';
import { type ITemplate } from './ITemplate';

/**
 * 模板搜索结果
 */
export interface ITemplateSearchResult {
    /** 匹配的模板 */
    template: ITemplate;
    /** 匹配分数 */
    score: number;
    /** 匹配类型 */
    matchType: 'exact' | 'prefix' | 'fuzzy';
    /** 相关度 */
    relevance: number;
}

/**
 * 高级模板搜索选项
 */
export interface IAdvancedTemplateSearchOptions {
    /** 搜索前缀 */
    prefix?: string;
    /** 结果数量限制 */
    limit?: number;
    /** 是否启用模糊匹配 */
    fuzzy?: boolean;
    /** 是否区分大小写 */
    caseSensitive?: boolean;
    /** 包含的命名空间 */
    includeNamespace?: string;
    /** 排除的命名空间 */
    excludeNamespace?: string;
}

/**
 * 模板建议上下文
 */
export interface ITemplateSuggestionContext {
    /** 文档 */
    document: EditorTextDocument;
    /** 光标位置 */
    position: EditorPosition;
    /** 当前行文本 */
    lineText: string;
    /** 缩进级别 */
    indentLevel: number;
    /** 触发类型 */
    triggerType?: 'direct' | 'array' | 'manual';
}

/**
 * 模板建议结果
 */
export interface ITemplateSuggestion {
    /** 建议的模板 */
    template: ITemplate;
    /** 建议分数 */
    score: number;
    /** 插入文本 */
    insertText?: string;
    /** 额外的文本编辑 */
    additionalTextEdits?: EditorTextEdit[];
}
