/**
 * 缺失必需字段快速修复
 *
 * 为 "required" 错误提供添加缺失字段的快速修复
 */

import {
    CodeAction,
    CodeActionKind,
    Diagnostic,
    Position,
    TextDocument,
    WorkspaceEdit
} from 'vscode';
import { IQuickFixProvider } from './IQuickFixProvider';
import { QUICK_FIX_MESSAGES } from '../../../core/constants/DiagnosticMessages';

/**
 * 缺失必需字段快速修复提供者
 */
export class RequiredFieldFix implements IQuickFixProvider {
    readonly supportedCodes = ['CE2001', 'required'];

    canFix(diagnostic: Diagnostic): boolean {
        const code = this.extractCode(diagnostic);
        return this.supportedCodes.includes(code);
    }

    provideFixes(diagnostic: Diagnostic, document: TextDocument): CodeAction[] {
        const fixes: CodeAction[] = [];

        // 从诊断消息中提取缺失的字段名
        const missingField = this.extractMissingField(diagnostic);
        if (!missingField) {
            return fixes;
        }

        // 创建添加字段的修复
        const addFieldFix = this.createAddFieldFix(diagnostic, document, missingField);
        if (addFieldFix) {
            fixes.push(addFieldFix);
        }

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
     * 从诊断消息中提取缺失的字段名
     */
    private extractMissingField(diagnostic: Diagnostic): string | undefined {
        // 匹配消息格式: Missing required field "fieldName"
        const match = diagnostic.message.match(/Missing required field "([^"]+)"/);
        if (match) {
            return match[1];
        }

        // 匹配旧格式: ❌ Missing required field "fieldName"
        const oldMatch = diagnostic.message.match(/❌\s*Missing required field "([^"]+)"/);
        if (oldMatch) {
            return oldMatch[1];
        }

        return undefined;
    }

    /**
     * 创建添加字段的修复操作
     */
    private createAddFieldFix(
        diagnostic: Diagnostic,
        document: TextDocument,
        fieldName: string
    ): CodeAction | undefined {
        // 计算插入位置（在诊断范围的下一行）
        const insertPosition = this.calculateInsertPosition(diagnostic, document);
        if (!insertPosition) {
            return undefined;
        }

        // 计算缩进
        const indent = this.calculateIndent(diagnostic, document);

        // 生成字段片段
        const fieldSnippet = this.generateFieldSnippet(fieldName, indent);

        // 创建修复操作
        const fix = new CodeAction(
            QUICK_FIX_MESSAGES.addMissingField(fieldName),
            CodeActionKind.QuickFix
        );

        fix.edit = new WorkspaceEdit();
        fix.edit.insert(document.uri, insertPosition, fieldSnippet);
        fix.diagnostics = [diagnostic];
        fix.isPreferred = true;

        return fix;
    }

    /**
     * 计算插入位置
     */
    private calculateInsertPosition(diagnostic: Diagnostic, document: TextDocument): Position | undefined {
        const line = diagnostic.range.start.line;

        // 查找当前对象的结束位置或下一个同级键
        const currentLine = document.lineAt(line);
        const currentIndent = this.getLineIndent(currentLine.text);

        // 向下查找合适的插入位置
        for (let i = line + 1; i < document.lineCount; i++) {
            const nextLine = document.lineAt(i);
            const nextIndent = this.getLineIndent(nextLine.text);
            const trimmed = nextLine.text.trim();

            // 跳过空行
            if (trimmed === '') {
                continue;
            }

            // 如果缩进小于或等于当前行，说明到达了同级或父级
            if (nextIndent <= currentIndent) {
                // 在这一行之前插入
                return new Position(i, 0);
            }
        }

        // 如果没找到，在文档末尾插入
        return new Position(document.lineCount, 0);
    }

    /**
     * 计算缩进
     */
    private calculateIndent(diagnostic: Diagnostic, document: TextDocument): string {
        const line = diagnostic.range.start.line;
        const currentLine = document.lineAt(line);
        const currentIndent = this.getLineIndent(currentLine.text);

        // 子字段需要额外缩进
        return currentIndent + '  ';
    }

    /**
     * 获取行的缩进
     */
    private getLineIndent(lineText: string): string {
        const match = lineText.match(/^(\s*)/);
        return match ? match[1] : '';
    }

    /**
     * 生成字段片段
     */
    private generateFieldSnippet(fieldName: string, indent: string): string {
        // 根据字段名猜测默认值
        const defaultValue = this.guessDefaultValue(fieldName);
        return `${indent}${fieldName}: ${defaultValue}\n`;
    }

    /**
     * 根据字段名猜测默认值
     */
    private guessDefaultValue(fieldName: string): string {
        const lowerName = fieldName.toLowerCase();

        // 布尔类型
        if (lowerName.startsWith('is_') || lowerName.startsWith('has_') ||
            lowerName.startsWith('enable') || lowerName.startsWith('disable') ||
            lowerName === 'enabled' || lowerName === 'disabled') {
            return 'true';
        }

        // 数字类型
        if (lowerName.includes('count') || lowerName.includes('amount') ||
            lowerName.includes('size') || lowerName.includes('limit') ||
            lowerName.includes('max') || lowerName.includes('min')) {
            return '1';
        }

        // 列表类型
        if (lowerName.endsWith('s') || lowerName.includes('list') ||
            lowerName.includes('items') || lowerName.includes('array')) {
            return '[]';
        }

        // 对象类型
        if (lowerName.includes('config') || lowerName.includes('settings') ||
            lowerName.includes('options')) {
            return '{}';
        }

        // 默认为空字符串占位符
        return '""';
    }
}
