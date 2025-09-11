import { Position, Range } from 'vscode';
import { Template } from '../types';
import { StringUtils } from './StringUtils';

/**
 * 模板相关的工具函数
 * 
 * 提供模板处理相关的通用功能，包括模板名称匹配、位置查找等。
 */
export class TemplateUtils {
    /**
     * 模板名称匹配的正则表达式模式
     */
    static readonly TEMPLATE_PATTERN = /template:\s*([^#\s]+)/;

    /**
     * 从文本行中提取模板名称
     * 
     * @param lineText - 文本行内容
     * @returns 模板名称，如果没有找到则返回 null
     */
    static extractTemplateName(lineText: string): string | null {
        if (!lineText) {
            return null;
        }
        
        // 首先尝试直接模式：template: templateName
        const directMatch = lineText.match(this.TEMPLATE_PATTERN);
        if (directMatch) {
            return directMatch[1];
        }
        
        // 然后尝试数组模式：  - templateName
        const arrayMatch = lineText.match(/^\s*-\s+([^#\s]+)/);
        if (arrayMatch) {
            return arrayMatch[1];
        }
        
        return null;
    }

    /**
     * 检查光标位置是否在模板名称范围内
     * 
     * @param lineText - 文本行内容
     * @param position - 光标位置
     * @param templateName - 模板名称
     * @returns 如果光标在模板名称范围内则返回 true
     */
    static isCursorOnTemplateName(lineText: string, position: Position, templateName: string): boolean {
        if (!lineText || !templateName) {
            return false;
        }
        
        const templateNameStart = lineText.indexOf(templateName);
        if (templateNameStart === -1) {
            return false;
        }
        
        const templateNameEnd = templateNameStart + templateName.length;
        return position.character >= templateNameStart && position.character <= templateNameEnd;
    }

    /**
     * 在文件行中查找模板定义的位置
     * 
     * @param lines - 文件的所有行
     * @param templateName - 模板名称
     * @returns 模板定义的位置，如果找不到则返回 undefined
     */
    static findTemplatePosition(lines: string[], templateName: string): Position | undefined {
        if (!lines || !templateName) {
            return undefined;
        }

        // 预编译正则表达式以提高性能
        const escapedName = StringUtils.escapeRegExp(templateName);
        const templatePattern = new RegExp(`^\\s*${escapedName}\\s*:`);
        
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            
            if (templatePattern.test(line)) {
                const templateIndex = line.indexOf(templateName);
                return new Position(lineIndex, templateIndex);
            }
        }
        
        return undefined;
    }

    /**
     * 查找配置项开始行
     * 
     * @param lines - 文档行数组
     * @param configKey - 配置项键名
     * @returns 配置项开始行号，如果找不到则返回 -1
     */
    static findConfigStartLine(lines: string[], configKey: string): number {
        if (!lines || !configKey) {
            return -1;
        }
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim().startsWith(`${configKey}:`)) {
                return i;
            }
        }
        return -1;
    }

    /**
     * 在配置项范围内查找指定键的行
     * 
     * @param lines - 文档行数组
     * @param configStartLine - 配置项开始行
     * @param keyName - 要查找的键名
     * @returns 键的行号，如果找不到则返回 -1
     */
    static findKeyLineInConfig(lines: string[], configStartLine: number, keyName: string): number {
        if (!lines || configStartLine < 0 || configStartLine >= lines.length || !keyName) {
            return -1;
        }
        
        const startIndent = StringUtils.getIndentLevel(lines[configStartLine]);
        
        for (let i = configStartLine + 1; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // 如果遇到同级或更高级的键，停止搜索
            if (trimmedLine && StringUtils.getIndentLevel(line) <= startIndent) {
                break;
            }
            
            if (trimmedLine.startsWith(`${keyName}:`)) {
                return i;
            }
        }
        
        return -1;
    }

    /**
     * 查找配置项的结束行
     * 
     * @param lines - 文档行数组
     * @param startLine - 配置项开始行
     * @returns 配置项结束行
     */
    static findConfigEndLine(lines: string[], startLine: number): number {
        if (!lines || startLine < 0 || startLine >= lines.length) {
            return lines ? lines.length - 1 : 0;
        }
        
        const startIndent = StringUtils.getIndentLevel(lines[startLine]);
        
        for (let i = startLine + 1; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            if (trimmedLine && StringUtils.getIndentLevel(line) <= startIndent) {
                return i;
            }
        }
        
        return lines.length - 1;
    }

    /**
     * 在行中查找模板名称的位置范围
     * 
     * @param line - 文本行
     * @param templateNames - 模板名称列表
     * @param lineNumber - 行号
     * @returns 模板名称的位置范围
     */
    static findTemplateNameRange(line: string, templateNames: string[], lineNumber: number): Range | null {
        if (!line || !templateNames || templateNames.length === 0) {
            return null;
        }
        
        // 查找第一个模板名称的位置
        for (const templateName of templateNames) {
            const templateNameIndex = line.indexOf(templateName);
            if (templateNameIndex !== -1) {
                // 检查模板名称是否在正确的位置（在 template: 后面）
                const beforeTemplateName = line.substring(0, templateNameIndex);
                
                // 检查是否在 template: 后面，或者是在列表项中（以 - 开头）
                if (beforeTemplateName.includes('template:') || beforeTemplateName.trim().endsWith('-')) {
                    const startPosition = new Position(lineNumber, templateNameIndex);
                    const endPosition = new Position(lineNumber, templateNameIndex + templateName.length);
                    return new Range(startPosition, endPosition);
                }
            }
        }
        return null;
    }

    /**
     * 检查是否是合法的模板名称
     * 
     * 根据 CraftEngine 的命名约定，模板名称必须包含冒号。
     * 
     * @param key - 要检查的键名
     * @returns 如果是合法的模板名称则返回 true，否则返回 false
     */
    static isValidTemplateName(key: string): boolean {
        return typeof key === 'string' && key.includes(':') && key.length > 1;
    }

    /**
     * 计算模板匹配分数
     * 
     * @param template - 模板对象
     * @param inputPrefix - 输入前缀
     * @returns 匹配分数，分数越高匹配度越好
     */
    static calculateMatchScore(template: Template, inputPrefix: string): number {
        if (!template || !template.name || !inputPrefix) {
            return 0;
        }
        
        const name = template.name.toLowerCase();
        const input = inputPrefix.toLowerCase();
        
        if (name === input) {
            return 1000; // 完全匹配
        }
        
        if (name.startsWith(input)) {
            return 800 + (100 - input.length); // 前缀匹配，越短的输入分数越高
        }
        
        if (name.includes(input)) {
            return 600; // 包含匹配
        }
        
        // 模糊匹配（检查是否包含输入的所有字符，按顺序）
        let inputIndex = 0;
        for (let i = 0; i < name.length && inputIndex < input.length; i++) {
            if (name[i] === input[inputIndex]) {
                inputIndex++;
            }
        }
        
        if (inputIndex === input.length) {
            return 400; // 模糊匹配
        }
        
        return 0; // 不匹配
    }

    /**
     * 过滤和排序模板
     * 
     * @param templates - 模板数组
     * @param inputPrefix - 输入前缀
     * @returns 过滤和排序后的模板数组
     */
    static filterAndSortTemplates(templates: Template[], inputPrefix: string): Template[] {
        if (!templates || templates.length === 0) {
            return [];
        }
        
        if (!inputPrefix) {
            // 没有输入前缀时，按使用频率和字母顺序排序
            return templates.sort((a, b) => {
                // 优先显示参数较少的模板（通常更常用）
                const paramDiff = a.parameters.length - b.parameters.length;
                if (paramDiff !== 0) {
                    return paramDiff;
                }
                // 然后按字母顺序
                return a.name.localeCompare(b.name);
            });
        }
        
        // 有输入前缀时，进行智能匹配
        const scored = templates.map(template => ({
            template,
            score: this.calculateMatchScore(template, inputPrefix)
        })).filter(item => item.score > 0);
        
        // 按分数排序（分数高的在前）
        scored.sort((a, b) => b.score - a.score);
        
        return scored.map(item => item.template);
    }
}
