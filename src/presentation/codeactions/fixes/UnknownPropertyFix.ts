/**
 * 未知属性快速修复
 *
 * 为 "additionalProperties" 错误提供删除或重命名的快速修复
 */

import { CodeAction, CodeActionKind, type Diagnostic, Range, type TextDocument, WorkspaceEdit } from 'vscode';
import { type IQuickFixProvider } from './IQuickFixProvider';
import { QUICK_FIX_MESSAGES } from '../../../core/constants/DiagnosticMessages';
import { findSimilarStrings } from '../../../core/utils/StringSimilarityUtils';

/**
 * 未知属性快速修复提供者
 */
export class UnknownPropertyFix implements IQuickFixProvider {
    readonly supportedCodes = ['CE2010', 'additionalProperties'];

    /** 已知属性列表（用于建议重命名） */
    private knownProperties: string[] = [];

    /**
     * 设置已知属性列表
     */
    setKnownProperties(properties: string[]): void {
        this.knownProperties = properties;
    }

    canFix(diagnostic: Diagnostic): boolean {
        const code = this.extractCode(diagnostic);
        return this.supportedCodes.includes(code);
    }

    provideFixes(diagnostic: Diagnostic, document: TextDocument): CodeAction[] {
        const fixes: CodeAction[] = [];

        // 从诊断消息中提取未知属性名
        const unknownProperty = this.extractUnknownProperty(diagnostic);
        if (!unknownProperty) {
            return fixes;
        }

        // 创建删除属性的修复
        const removeFix = this.createRemovePropertyFix(diagnostic, document, unknownProperty);
        if (removeFix) {
            fixes.push(removeFix);
        }

        // 创建重命名建议（如果有相似的已知属性）
        const renameFixes = this.createRenameFixes(diagnostic, document, unknownProperty);
        fixes.push(...renameFixes);

        return fixes;
    }

    /**
     * 从诊断中提取错误代码
     */
    private extractCode(diagnostic: Diagnostic): string {
        if (typeof diagnostic.code === 'string') {
            return diagnostic.code;
        }
        if (typeof diagnostic.code === 'object' && diagnostic.code !== null && 'value' in diagnostic.code) {
            return String(diagnostic.code.value);
        }
        return '';
    }

    /**
     * 从诊断消息中提取未知属性名
     */
    private extractUnknownProperty(diagnostic: Diagnostic): string | undefined {
        // 匹配消息格式: Unknown property "propertyName"
        const match = diagnostic.message.match(/Unknown property "([^"]+)"/);
        if (match) {
            return match[1];
        }

        // 匹配旧格式: 💡 Unknown property "propertyName"
        const oldMatch = diagnostic.message.match(/💡\s*Unknown property "([^"]+)"/);
        if (oldMatch) {
            return oldMatch[1];
        }

        return undefined;
    }

    /**
     * 创建删除属性的修复操作
     */
    private createRemovePropertyFix(
        diagnostic: Diagnostic,
        document: TextDocument,
        propertyName: string,
    ): CodeAction | undefined {
        // 计算要删除的范围（整行，包括换行符）
        const deleteRange = this.calculateDeleteRange(diagnostic, document);
        if (!deleteRange) {
            return undefined;
        }

        const fix = new CodeAction(QUICK_FIX_MESSAGES.removeUnknownProperty(propertyName), CodeActionKind.QuickFix);

        fix.edit = new WorkspaceEdit();
        fix.edit.delete(document.uri, deleteRange);
        fix.diagnostics = [diagnostic];

        return fix;
    }

    /**
     * 计算要删除的范围
     */
    private calculateDeleteRange(diagnostic: Diagnostic, document: TextDocument): Range | undefined {
        const line = diagnostic.range.start.line;
        const currentLine = document.lineAt(line);
        const currentIndent = this.getLineIndent(currentLine.text);

        // 查找属性的结束位置（包括子属性）
        let endLine = line;

        for (let i = line + 1; i < document.lineCount; i++) {
            const nextLine = document.lineAt(i);
            const nextIndent = this.getLineIndent(nextLine.text);
            const trimmed = nextLine.text.trim();

            // 跳过空行
            if (trimmed === '') {
                continue;
            }

            // 如果缩进小于或等于当前行，说明到达了同级或父级
            if (nextIndent.length <= currentIndent.length) {
                break;
            }

            // 这是子属性，继续
            endLine = i;
        }

        // 删除从当前行开始到结束行（包括换行符）
        const startPos = currentLine.range.start;
        const endPos =
            endLine < document.lineCount - 1
                ? document.lineAt(endLine + 1).range.start
                : document.lineAt(endLine).range.end;

        return new Range(startPos, endPos);
    }

    /**
     * 获取行的缩进
     */
    private getLineIndent(lineText: string): string {
        const match = lineText.match(/^(\s*)/);
        return match ? match[1] : '';
    }

    /**
     * 创建重命名修复操作
     */
    private createRenameFixes(diagnostic: Diagnostic, document: TextDocument, unknownProperty: string): CodeAction[] {
        const fixes: CodeAction[] = [];

        // 查找相似的已知属性
        const similarProperties = this.findSimilarProperties(unknownProperty);

        for (const suggestion of similarProperties.slice(0, 3)) {
            const fix = new CodeAction(QUICK_FIX_MESSAGES.renameTo(suggestion), CodeActionKind.QuickFix);

            fix.edit = new WorkspaceEdit();

            // 替换属性名
            const keyRange = this.getKeyRange(diagnostic, document);
            if (keyRange) {
                fix.edit.replace(document.uri, keyRange, suggestion);
            }

            fix.diagnostics = [diagnostic];
            fixes.push(fix);
        }

        return fixes;
    }

    /**
     * 获取键名的范围
     */
    private getKeyRange(diagnostic: Diagnostic, document: TextDocument): Range | undefined {
        const line = document.lineAt(diagnostic.range.start.line);
        const lineText = line.text;

        // 查找冒号位置
        const colonIndex = lineText.indexOf(':');
        if (colonIndex === -1) {
            return undefined;
        }

        // 提取键名部分
        const keyPart = lineText.substring(0, colonIndex);
        const keyMatch = keyPart.match(/^\s*(\S+)\s*$/);

        if (!keyMatch) {
            return undefined;
        }

        const keyStart = keyPart.indexOf(keyMatch[1]);
        const keyEnd = keyStart + keyMatch[1].length;

        return new Range(diagnostic.range.start.line, keyStart, diagnostic.range.start.line, keyEnd);
    }

    /**
     * 查找相似的已知属性
     */
    private findSimilarProperties(unknownProperty: string): string[] {
        if (this.knownProperties.length === 0) {
            return [];
        }

        return findSimilarStrings(unknownProperty, this.knownProperties, {
            threshold: 0.3,
            maxResults: 3,
        }).map((r) => r.item);
    }
}
