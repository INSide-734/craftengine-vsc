/**
 * 类型不匹配快速修复
 *
 * 为 "type" 错误提供类型转换的快速修复
 */

import { CodeAction, CodeActionKind, type Diagnostic, Range, type TextDocument, WorkspaceEdit } from 'vscode';
import { type IQuickFixProvider } from './IQuickFixProvider';
import { QUICK_FIX_MESSAGES } from '../../../core/constants/DiagnosticMessages';

/**
 * 类型不匹配快速修复提供者
 */
export class TypeMismatchFix implements IQuickFixProvider {
    readonly supportedCodes = ['CE2002', 'type'];

    canFix(diagnostic: Diagnostic): boolean {
        const code = this.extractCode(diagnostic);
        return this.supportedCodes.includes(code);
    }

    provideFixes(diagnostic: Diagnostic, document: TextDocument): CodeAction[] {
        const fixes: CodeAction[] = [];

        // 从诊断消息中提取期望的类型
        const expectedType = this.extractExpectedType(diagnostic);
        if (!expectedType) {
            return fixes;
        }

        // 获取当前值的范围
        const valueRange = this.getValueRange(diagnostic, document);
        if (!valueRange) {
            return fixes;
        }

        // 获取当前值
        const currentValue = document.getText(valueRange).trim();

        // 根据期望类型创建修复
        const fix = this.createTypeFix(diagnostic, document, valueRange, currentValue, expectedType);
        if (fix) {
            fixes.push(fix);
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
     * 从诊断消息中提取期望的类型
     */
    private extractExpectedType(diagnostic: Diagnostic): string | undefined {
        // 匹配消息格式: Expected text, got number
        // 或: Expected  text
        const match = diagnostic.message.match(/Expected\s+(?:\s*)?(\w+)/i);
        if (match) {
            return this.normalizeTypeName(match[1]);
        }

        return undefined;
    }

    /**
     * 规范化类型名称
     */
    private normalizeTypeName(displayName: string): string {
        const mapping: Record<string, string> = {
            text: 'string',
            number: 'number',
            integer: 'integer',
            'true/false': 'boolean',
            object: 'object',
            list: 'array',
            null: 'null',
        };

        return mapping[displayName.toLowerCase()] || displayName.toLowerCase();
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
        const afterColon = lineText.substring(colonIndex + 1);
        const valueStart = colonIndex + 1 + (afterColon.length - afterColon.trimStart().length);
        const valueEnd = lineText.trimEnd().length;

        if (valueStart >= valueEnd) {
            return undefined;
        }

        return new Range(diagnostic.range.start.line, valueStart, diagnostic.range.start.line, valueEnd);
    }

    /**
     * 创建类型修复操作
     */
    private createTypeFix(
        diagnostic: Diagnostic,
        document: TextDocument,
        valueRange: Range,
        currentValue: string,
        expectedType: string,
    ): CodeAction | undefined {
        // 尝试转换值
        const convertedValue = this.convertValue(currentValue, expectedType);
        if (convertedValue === undefined) {
            return undefined;
        }

        const fix = new CodeAction(QUICK_FIX_MESSAGES.fixType(expectedType), CodeActionKind.QuickFix);

        fix.edit = new WorkspaceEdit();
        fix.edit.replace(document.uri, valueRange, convertedValue);
        fix.diagnostics = [diagnostic];
        fix.isPreferred = true;

        return fix;
    }

    /**
     * 转换值到目标类型
     */
    private convertValue(value: string, targetType: string): string | undefined {
        // 移除引号
        const unquoted = value.replace(/^["']|["']$/g, '');

        switch (targetType) {
            case 'string':
                // 转换为字符串
                if (!value.startsWith('"') && !value.startsWith("'")) {
                    return `"${unquoted}"`;
                }
                return value;

            case 'number':
            case 'integer':
                // 尝试转换为数字
                const num = parseFloat(unquoted);
                if (!isNaN(num)) {
                    return targetType === 'integer' ? String(Math.floor(num)) : String(num);
                }
                // 无法转换，返回默认值
                return '0';

            case 'boolean':
                // 转换为布尔值
                const lower = unquoted.toLowerCase();
                if (['true', 'yes', 'on', '1'].includes(lower)) {
                    return 'true';
                }
                if (['false', 'no', 'off', '0'].includes(lower)) {
                    return 'false';
                }
                return 'true';

            case 'array':
                // 转换为数组
                if (value.startsWith('[')) {
                    return value;
                }
                return `[${value}]`;

            case 'object':
                // 转换为对象
                if (value.startsWith('{')) {
                    return value;
                }
                return '{}';

            case 'null':
                return 'null';

            default:
                return undefined;
        }
    }
}
