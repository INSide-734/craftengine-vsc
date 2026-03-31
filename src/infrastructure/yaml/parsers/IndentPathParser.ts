import { type TextDocument, type Position } from 'vscode';
import { type ILogger } from '../../../core/interfaces/ILogger';

/**
 * 基于缩进的路径解析器
 *
 * 通过分析行的缩进级别确定层次，从光标位置向上遍历查找父级键。
 * 作为 AST 解析失败时的备选方案。
 *
 * @remarks
 * **解析特点**：
 * - 基于缩进级别判断层次关系
 * - 向上遍历查找父级键名
 * - 简单快速，但可能在复杂结构中不够准确
 *
 * **适用场景**：
 * - AST 解析失败时的回退方案
 * - 不完整的 YAML 文档
 * - 编辑过程中的临时状态
 *
 * **限制**：
 * - 可能在复杂结构中不够准确
 * - 不支持锚点和别名
 * - 对多行字符串的处理有限
 *
 * @example
 * ```typescript
 * const parser = new IndentPathParser(logger);
 *
 * // 解析路径
 * const path = parser.parsePathByIndent(document, position);
 * console.log(path); // ['items', 'my-item', 'template']
 * ```
 */
export class IndentPathParser {
    /**
     * 构造基于缩进的路径解析器实例
     *
     * @param logger - 日志记录器（可选）
     */
    constructor(private readonly logger: ILogger | undefined) {}

    /**
     * 基于缩进的简单路径解析
     *
     * 从当前位置向上遍历，识别每一层的键名，构建路径数组
     *
     * @param document - VSCode 文档对象
     * @param position - 光标位置
     * @returns 路径数组
     *
     * @remarks
     * 对于空行，使用光标的列位置作为期望的缩进级别，
     * 因为空行本身没有字符，无法通过行内容判断缩进。
     */
    parsePathByIndent(document: TextDocument, position: Position): string[] {
        const path: string[] = [];

        try {
            const currentLine = document.lineAt(position.line);
            const trimmedLine = currentLine.text.trim();

            // 计算当前缩进级别
            // 对于空行，使用光标的列位置作为期望的缩进级别
            let currentIndent: number;
            if (!trimmedLine) {
                // 空行：使用光标位置作为缩进，或者向上查找最近非空行的子级缩进
                currentIndent =
                    position.character > 0
                        ? position.character
                        : this.findExpectedIndentFromContext(document, position.line);
            } else {
                currentIndent = this.getIndentLevel(currentLine.text);
            }

            // 提取当前行的键名
            const currentKey = this.extractKeyName(currentLine.text);
            if (currentKey) {
                path.unshift(currentKey);
            }

            // 向上遍历，查找父级键
            let targetIndent = currentIndent;

            for (let lineNum = position.line - 1; lineNum >= 0; lineNum--) {
                const line = document.lineAt(lineNum);
                const lineText = line.text;
                const trimmed = lineText.trim();

                // 跳过空行和注释
                if (!trimmed || trimmed.startsWith('#')) {
                    continue;
                }

                const lineIndent = this.getIndentLevel(lineText);

                // 如果是数组项（以 - 开头），需要特殊处理
                if (this.isArrayItem(lineText)) {
                    // 数组项的实际缩进是 - 之后的位置
                    const arrayIndent = lineIndent + 2; // "- " 占 2 个字符

                    if (arrayIndent === targetIndent) {
                        // 这是当前层级的数组项，继续向上找数组的键名
                        targetIndent = lineIndent;
                        continue;
                    }
                }

                // 如果缩进小于目标缩进，说明找到了父级
                if (lineIndent < targetIndent) {
                    const keyName = this.extractKeyName(lineText);
                    if (keyName) {
                        path.unshift(keyName);
                        targetIndent = lineIndent;
                    }
                }
            }

            this.logger?.debug('Parsed YAML path by indent', {
                position: `${position.line}:${position.character}`,
                path,
                pathString: path.join('.'),
                method: 'indent',
            });
        } catch (error) {
            this.logger?.error('Failed to parse YAML path by indent', error as Error, {
                position: `${position.line}:${position.character}`,
            });
        }

        return path;
    }

    /**
     * 获取缩进级别
     *
     * @param line - 行文本
     * @returns 缩进级别（前导空格数）
     */
    getIndentLevel(line: string): number {
        const match = line.match(/^(\s*)/);
        return match ? match[1].length : 0;
    }

    /**
     * 提取键名
     *
     * 从行文本中提取 YAML 键名
     *
     * @param line - 行文本
     * @returns 键名，如果无法提取则返回 undefined
     *
     * @example
     * "  template: value" -> "template"
     * "  my-item:" -> "my-item"
     * "  - item" -> undefined (数组项没有键名)
     */
    extractKeyName(line: string): string | undefined {
        const trimmed = line.trim();

        // 跳过注释和空行
        if (!trimmed || trimmed.startsWith('#')) {
            return undefined;
        }

        // 跳过数组项标记
        if (trimmed.startsWith('-')) {
            // 检查 "- key: value" 格式（支持版本条件格式如 $$>=1.21.4）
            const arrayItemMatch = trimmed.match(/^-\s+([a-zA-Z0-9_$:#\/\-.>=<~]+):/);
            if (arrayItemMatch) {
                return arrayItemMatch[1];
            }
            return undefined;
        }

        // 提取键名: "key:" 或 "key: value"（支持版本条件格式如 $$>=1.21.4, $$1.20.1~1.21.3#section）
        const keyMatch = trimmed.match(/^([a-zA-Z0-9_$:#\/\-.>=<~]+):/);
        if (keyMatch) {
            return keyMatch[1];
        }

        return undefined;
    }

    /**
     * 判断是否为数组项
     *
     * @param line - 行文本
     * @returns 如果是数组项返回 true
     */
    private isArrayItem(line: string): boolean {
        const trimmed = line.trim();
        return trimmed.startsWith('-');
    }

    /**
     * 从上下文推断期望的缩进级别
     *
     * 当光标在空行且列位置为 0 时，向上查找最近的非空行，
     * 返回该行的子级缩进（+2）作为期望的缩进。
     *
     * @param document - 文档对象
     * @param lineNum - 当前行号
     * @returns 期望的缩进级别
     */
    private findExpectedIndentFromContext(document: TextDocument, lineNum: number): number {
        // 向上查找最近的非空行
        for (let i = lineNum - 1; i >= 0; i--) {
            const lineText = document.lineAt(i).text;
            const trimmed = lineText.trim();

            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            const indent = this.getIndentLevel(lineText);

            // 如果上一个非空行以冒号结尾（是一个键），返回子级缩进
            if (trimmed.endsWith(':')) {
                return indent + 2;
            }

            // 否则返回相同的缩进级别（同级）
            return indent;
        }

        // 如果找不到非空行，返回 0
        return 0;
    }
}
