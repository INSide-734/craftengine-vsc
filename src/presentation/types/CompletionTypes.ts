import { CompletionItem } from 'vscode';

/**
 * 扩展 CompletionItem 类型，添加策略标识和 Schema 提供者 ID
 *
 * 用于在 resolveCompletionItem 时找回对应的处理策略。
 * 统一所有补全策略中对 CompletionItem 的扩展属性定义。
 */
export interface CompletionItemWithStrategy extends CompletionItem {
    /** 补全策略名称 */
    _strategy?: string;
    /** Schema 提供者 ID */
    _schemaProviderId?: string;
    /** 翻译键 */
    _translationKey?: string;
}

/**
 * 文件路径补全项扩展接口
 *
 * 用于 FilePathCompletionStrategy 在 resolveCompletionItem 时传递文件路径数据
 */
export interface FilePathCompletionItem extends CompletionItemWithStrategy {
    /** 文件路径补全数据 */
    _filePathData?: {
        relativePath: string;
        fullPath: string;
        namespace: string;
        resourceType?: string;
        absolutePath?: string;
    };
}
