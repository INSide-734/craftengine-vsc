import { type EditorTextDocument, type EditorUri } from '../types/EditorTypes';
import { type IParsedDocument } from './IParsedDocument';

/**
 * 诊断提供者接口
 *
 * 支持两种更新模式：
 * 1. 传统模式：只传入文档，提供者自行解析
 * 2. 优化模式：传入预解析结果，避免重复解析
 */
export interface IDiagnosticProvider {
    /** 更新诊断（支持可选的预解析结果） */
    updateDiagnostics: (doc: EditorTextDocument, parsedDoc?: IParsedDocument) => void | Promise<void>;
    /** 清除诊断 */
    clearDiagnostics: (uri: EditorUri) => void;
    /** 清除缓存（可选） */
    clearCache?: (uri: EditorUri) => void;
}

/**
 * 诊断提供者集合接口
 */
export interface IDiagnosticProviders {
    template?: IDiagnosticProvider;
    translation?: IDiagnosticProvider;
    schema?: IDiagnosticProvider;
    filePath?: IDiagnosticProvider;
    miniMessage?: IDiagnosticProvider;
    itemId?: IDiagnosticProvider;
    versionCondition?: IDiagnosticProvider;
    category?: IDiagnosticProvider;
}

/**
 * 诊断忽略解析器接口
 *
 * 判断特定文件是否应该跳过诊断检查
 */
export interface IDiagnosticIgnoreParser {
    /** 检查文件是否应该被忽略 */
    isFileIgnored(uri: EditorUri): boolean;
}
