/**
 * 枚举值快速修复
 *
 * 为 "enum" 错误提供选择正确值的快速修复
 */

import {
    CodeAction,
    CodeActionKind,
    Diagnostic,
    Range,
    TextDocument,
    WorkspaceEdit
} from 'vscode';
import { IQuickFixProvider } from './IQuickFixProvider';
import { QUICK_FIX_MESSAGES } from '../../../core/constants/DiagnosticMessages';

/**
 * 枚举值快速修复提供者
 */
export class EnumValueFix implements IQuickFixProvider {
    readonly supportedCodes = ['CE2003', 'enum'];

    canFix(diagnostic: Diagnostic): boolean {
        const code = this.extractCode(diagnostic);
        return this.supportedCodes.includes(code);
    }

    provideFixes(diagnostic: Diagnostic, document: TextDocument): CodeAction[] {
        const fixes: CodeAction[] = [];

        // 从诊断消息或关联信息中提取允许的值
        const allowedValues = this.extractAllowedValues(diagnostic);
        if (allowedValues.length === 0) {
            return fixes;
        }

        // 获取当前值的范围
        const valueRange = this.getValueRange(diagnostic, document);
        if (!valueRange) {
            return fixes;
        }

        // 为每个允许的值创建修复
        for (const value of allowedValues.slice(0, 5)) {
            const fix = this.createValueFix(diagnostic, document, valueRange, value);
            if (fix) {
                fixes.push(fix);
            }
        }

        // 第一个选项设为首选
        if (fixes.length > 0) {
            fixes[0].isPreferred = true;
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
     * 从诊断消息中提取允许的值
     */
    private extractAllowedValues(diagnostic: Diagnostic): string[] {
        // 尝试从消息中提取
        // 格式: Invalid value. Allowed: "value1", "value2", "value3"
        const match = diagnostic.message.match(/Allowed:\s*(.+)$/);
        if (match) {
            const valuesStr = match[1];
            const values = valuesStr.match(/"([^"]+)"/g);
            if (values) {
                return values.map(v => v.replace(/"/g, ''));
            }
        }

        // 尝试从关联信息中提取
        if (diagnostic.relatedInformation) {
            for (const info of diagnostic.relatedInformation) {
                const relatedMatch = info.message.match(/Allowed values:\s*(.+)$/);
                if (relatedMatch) {
                    return relatedMatch[1].split(',').map(v => v.trim());
                }
            }
        }

        return [];
    }

    /**
     * 获取值的范围
     */
    private getValueRange(diagnostic: Diagnostic, document: TextDocument): Range | undefined {
        const line = document.lineAt(diagnostic.range.start.line);
        const lineText = line.text;

        // 查找冒号位置
        const colonIndex = lineText.indexOf(':');
        if (colonIndex === -1) {
            return diagnostic.range;
        }

        // 提取值部分
        const valuePart = lineText.substring(colonIndex + 1).trim();
        const valueStart = colonIndex + 1 + (lineText.substring(colonIndex + 1).length - lineText.substring(colonIndex + 1).trimStart().length);
        const valueEnd = lineText.length;

        // 如果值为空，返回冒号后的位置
        if (valuePart === '') {
            return new Range(
                diagnostic.range.start.line,
                colonIndex + 2,
                diagnostic.range.start.line,
                colonIndex + 2
            );
        }

        return new Range(
            diagnostic.range.start.line,
            valueStart,
            diagnostic.range.start.line,
            valueEnd
        );
    }

    /**
     * 创建值修复操作
     */
    private createValueFix(
        diagnostic: Diagnostic,
        document: TextDocument,
        valueRange: Range,
        newValue: string
    ): CodeAction | undefined {
        const fix = new CodeAction(
            QUICK_FIX_MESSAGES.useSuggestedValue(newValue),
            CodeActionKind.QuickFix
        );

        fix.edit = new WorkspaceEdit();

        // 格式化值（如果需要引号）
        const formattedValue = this.formatValue(newValue);
        fix.edit.replace(document.uri, valueRange, formattedValue);

        fix.diagnostics = [diagnostic];

        return fix;
    }

    /**
     * 格式化值
     */
    private formatValue(value: string): string {
        // 如果值包含特殊字符，需要引号
        if (this.needsQuotes(value)) {
            return `"${value}"`;
        }
        return value;
    }

    /**
     * 检查值是否需要引号
     */
    private needsQuotes(value: string): boolean {
        // 包含特殊字符
        if (/[:#\[\]{}|>&*!?,]/.test(value)) {
            return true;
        }

        // 以特殊字符开头
        if (/^[@`'"]/.test(value)) {
            return true;
        }

        // 包含空格
        if (/\s/.test(value)) {
            return true;
        }

        // 是 YAML 保留字
        const reserved = ['true', 'false', 'null', 'yes', 'no', 'on', 'off'];
        if (reserved.includes(value.toLowerCase())) {
            return true;
        }

        return false;
    }
}
