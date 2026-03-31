import { type Diagnostic } from 'vscode';

/**
 * 诊断代码辅助函数
 *
 * 提供从 VS Code Diagnostic 对象中提取诊断代码的工具函数
 */

/**
 * 从诊断对象中提取代码值
 *
 * 支持两种格式：
 * 1. 字符串格式: diagnostic.code = 'CE4002'
 * 2. 对象格式: diagnostic.code = { value: 'CE4002', target: Uri }
 *
 * @param diagnostic VS Code 诊断对象
 * @returns 诊断代码字符串，如果无法提取则返回 undefined
 */
export function extractDiagnosticCode(diagnostic: Diagnostic): string | undefined {
    const code = diagnostic.code;

    // 字符串格式
    if (typeof code === 'string') {
        return code;
    }

    // 数字格式
    if (typeof code === 'number') {
        return String(code);
    }

    // 对象格式 { value: string | number, target: Uri }
    if (typeof code === 'object' && code !== null && 'value' in code) {
        return String(code.value);
    }

    return undefined;
}

/**
 * 检查诊断代码是否匹配指定的代码
 *
 * @param diagnostic VS Code 诊断对象
 * @param expectedCode 期望的诊断代码
 * @returns 如果匹配返回 true，否则返回 false
 */
export function isDiagnosticCode(diagnostic: Diagnostic, expectedCode: string): boolean {
    return extractDiagnosticCode(diagnostic) === expectedCode;
}
