import { TextDocument, Position, Range } from 'vscode';
import { StringUtils } from './StringUtils';

/**
 * 文档处理工具类
 * 
 * 提供与 VS Code 文档操作相关的通用功能。
 */
export class DocumentUtils {
    /**
     * 分析插入上下文
     * 
     * @param document - 文档对象
     * @param position - 位置
     * @returns 插入上下文信息
     */
    static analyzeInsertionContext(document: TextDocument, position: Position) {
        const currentLine = document.lineAt(position.line);
        const lineText = currentLine.text;
        const linePrefix = lineText.substring(0, position.character);
        
        // 获取基础缩进
        const baseIndent = StringUtils.getIndentString(lineText);
        
        // 检测插入模式
        let mode = 'direct';
        
        if (linePrefix.match(/^\s*-\s*/)) {
            mode = 'array';
        } else if (linePrefix.match(/^\s+template:/)) {
            mode = 'nested';
        }
        
        return {
            mode,
            baseIndent,
            lineText,
            linePrefix,
            currentLine
        };
    }

    /**
     * 计算替换范围
     * 
     * @param document - 文档对象
     * @param position - 位置
     * @param context - 上下文信息（可选）
     * @returns 替换范围
     */
    static calculateReplacementRange(document: TextDocument, position: Position): Range {
        const currentLine = document.lineAt(position.line);
        const lineText = currentLine.text;
        
        // 查找 "template:" 的位置
        const templateIndex = lineText.lastIndexOf('template:');
        
        if (templateIndex === -1) {
            // 如果找不到 template:，从当前位置开始替换
            return new Range(position, currentLine.range.end);
        }
        
        // 从 "template:" 后面开始替换
        const startPos = new Position(position.line, templateIndex + 'template:'.length);
        
        // 跳过空格
        let endColumn = startPos.character;
        while (endColumn < lineText.length && lineText[endColumn] === ' ') {
            endColumn++;
        }
        
        const replaceStart = new Position(position.line, endColumn);
        const replaceEnd = currentLine.range.end;
        
        return new Range(replaceStart, replaceEnd);
    }

    /**
     * 获取当前行的缩进级别
     * 
     * @param document - 文档对象
     * @param position - 位置
     * @returns 缩进级别
     */
    static getIndentLevel(document: TextDocument, position: Position): number {
        if (position.line >= document.lineCount) {
            return 0;
        }
        
        const line = document.lineAt(position.line);
        return StringUtils.getIndentLevel(line.text);
    }

    /**
     * 检查光标是否在指定文本范围内
     * 
     * @param lineText - 行文本
     * @param position - 光标位置
     * @param targetText - 目标文本
     * @returns 如果光标在目标文本范围内则返回 true
     */
    static isCursorInText(lineText: string, position: Position, targetText: string): boolean {
        if (!lineText || !targetText) {
            return false;
        }
        
        const textStart = lineText.indexOf(targetText);
        if (textStart === -1) {
            return false;
        }
        
        const textEnd = textStart + targetText.length;
        return position.character >= textStart && position.character <= textEnd;
    }

    /**
     * 获取文档指定行的文本内容
     * 
     * @param document - 文档对象
     * @param lineNumber - 行号
     * @returns 行文本内容，如果行号无效则返回空字符串
     */
    static getLineText(document: TextDocument, lineNumber: number): string {
        if (lineNumber < 0 || lineNumber >= document.lineCount) {
            return '';
        }
        
        return document.lineAt(lineNumber).text;
    }

    /**
     * 检查文档中是否存在指定的模式
     * 
     * @param document - 文档对象
     * @param pattern - 要查找的模式（正则表达式）
     * @param startLine - 开始搜索的行号（可选，默认为 0）
     * @param endLine - 结束搜索的行号（可选，默认为最后一行）
     * @returns 如果找到模式则返回 true
     */
    static containsPattern(
        document: TextDocument, 
        pattern: RegExp, 
        startLine: number = 0, 
        endLine?: number
    ): boolean {
        const actualEndLine = endLine ?? document.lineCount - 1;
        
        for (let i = startLine; i <= actualEndLine && i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            if (pattern.test(lineText)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * 在文档中查找模式的所有匹配位置
     * 
     * @param document - 文档对象
     * @param pattern - 要查找的模式（正则表达式）
     * @returns 匹配位置的数组
     */
    static findPatternPositions(document: TextDocument, pattern: RegExp): Position[] {
        const positions: Position[] = [];
        
        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            const matches = lineText.matchAll(new RegExp(pattern, 'g'));
            
            for (const match of matches) {
                if (match.index !== undefined) {
                    positions.push(new Position(i, match.index));
                }
            }
        }
        
        return positions;
    }

    /**
     * 获取文档的分割行数组
     * 
     * @param document - 文档对象
     * @returns 文档的所有行组成的数组
     */
    static getDocumentLines(document: TextDocument): string[] {
        const lines: string[] = [];
        
        for (let i = 0; i < document.lineCount; i++) {
            lines.push(document.lineAt(i).text);
        }
        
        return lines;
    }
}
