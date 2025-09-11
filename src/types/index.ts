import { Uri, Position } from 'vscode';

/**
 * 代表一个解析出的 CraftEngine 模板
 */
export interface Template {
    name: string;
    parameters: string[]; // 所有参数（包括必需和可选）
    requiredParameters: string[]; // 必需参数（没有默认值的参数）
    optionalParameters: string[]; // 可选参数（有默认值的参数）
    sourceFile: Uri; // 模板来源文件
    definitionPosition?: Position; // 模板定义在文件中的位置
}