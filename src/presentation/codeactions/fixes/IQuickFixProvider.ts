/**
 * 快速修复提供者接口
 */

import { CodeAction, Diagnostic, TextDocument } from 'vscode';

/**
 * 快速修复提供者接口
 *
 * 为特定类型的诊断错误提供快速修复操作
 */
export interface IQuickFixProvider {
    /**
     * 支持的错误代码列表
     */
    readonly supportedCodes: string[];

    /**
     * 提供修复操作
     *
     * @param diagnostic 诊断信息
     * @param document 文档
     * @returns 可用的修复操作列表
     */
    provideFixes(diagnostic: Diagnostic, document: TextDocument): CodeAction[];

    /**
     * 检查是否支持该诊断
     *
     * @param diagnostic 诊断信息
     * @returns 是否支持
     */
    canFix(diagnostic: Diagnostic): boolean;
}

/**
 * 快速修复上下文
 *
 * 提供修复操作所需的上下文信息
 */
export interface IQuickFixContext {
    /** 诊断信息 */
    diagnostic: Diagnostic;
    /** 文档 */
    document: TextDocument;
    /** 错误代码 */
    errorCode: string;
    /** 错误路径 */
    errorPath?: string;
    /** 额外数据 */
    data?: Record<string, unknown>;
}

/**
 * 快速修复结果
 */
export interface IQuickFixResult {
    /** 修复标题 */
    title: string;
    /** 是否为首选修复 */
    isPreferred?: boolean;
    /** 修复操作 */
    action: CodeAction;
}
