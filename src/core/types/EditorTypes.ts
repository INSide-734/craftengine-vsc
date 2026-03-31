/**
 * 编辑器类型抽象层
 *
 * 将 VS Code 类型集中导出，使 Core/Domain 层不直接依赖 'vscode' 模块。
 * 未来如需支持其他编辑器，只需修改此文件的实现。
 *
 * 使用方式：
 * ```typescript
 * import { EditorUri, EditorPosition, EditorRange } from '../../core/types/EditorTypes';
 * ```
 */
import {
    Uri,
    Position,
    type Range,
    type TextDocument,
    type TextEdit,
    type CompletionItem,
    type CompletionContext,
    type CancellationToken,
    type ExtensionContext,
    type Disposable,
    type Progress,
} from 'vscode';

// 基础类型别名
export type EditorUri = Uri;
export type EditorPosition = Position;
export type EditorRange = Range;
export type EditorTextDocument = TextDocument;
export type EditorTextEdit = TextEdit;

// 补全相关
export type EditorCompletionItem = CompletionItem;
export type EditorCompletionContext = CompletionContext;
export type EditorCancellationToken = CancellationToken;

// 扩展生命周期
export type EditorExtensionContext = ExtensionContext;
export type EditorDisposable = Disposable;

// 进度
export type EditorProgress<T> = Progress<T>;

// 工厂函数 — 供 Domain 层使用，避免直接 import 'vscode'

/**
 * 创建 EditorUri 实例
 *
 * @param uriString - URI 字符串
 * @returns EditorUri 实例
 */
export function createEditorUri(uriString: string): EditorUri {
    return Uri.parse(uriString);
}

/**
 * 创建 EditorPosition 实例
 *
 * @param line - 行号（从 0 开始）
 * @param character - 列号（从 0 开始）
 * @returns EditorPosition 实例
 */
export function createEditorPosition(line: number, character: number): EditorPosition {
    return new Position(line, character);
}

/**
 * 从文件路径创建 EditorUri 实例
 *
 * @param filePath - 文件系统路径
 * @returns EditorUri 实例
 */
export function createFileUri(filePath: string): EditorUri {
    return Uri.file(filePath);
}
