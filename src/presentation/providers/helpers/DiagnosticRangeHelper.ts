import { TextDocument, Range, Position } from 'vscode';
import { ILogger } from '../../../core/interfaces/ILogger';
import { IValidationError } from '../../../infrastructure/schema/SchemaValidator';

/**
 * 从文档范围中提取文本
 *
 * 通用方法，用于从诊断范围中提取引用的 ID（物品 ID、分类 ID 等）
 *
 * @param document 文档
 * @param range 范围
 * @returns 提取的文本，如果失败则返回 undefined
 */
export function extractTextFromRange(document: TextDocument, range: Range): string | undefined {
    try {
        return document.getText(range).trim() || undefined;
    } catch {
        return undefined;
    }
}

/**
 * 位置信息接口
 */
export interface IPositionInfo {
    /** 起始位置 */
    start: Position;
    /** 结束位置 */
    end: Position;
    /** 完整范围 */
    range: Range;
    /** 键名的范围（用于更精确的错误定位） */
    keyRange?: Range;
}

/**
 * 范围类型枚举
 */
export enum RangeType {
    /** 键名范围 */
    Key = 'key',
    /** 值范围 */
    Value = 'value',
    /** 完整范围（键+值） */
    Full = 'full',
    /** 第一行范围 */
    FirstLine = 'firstLine',
    /** Token 范围 */
    Token = 'token'
}

/**
 * 诊断范围辅助类
 *
 * 负责处理诊断错误的范围计算和精细化，
 * 根据不同的错误类型返回最合适的高亮范围。
 *
 * 支持 token 级别的精确范围计算：
 * - 键名错误只标记键名本身
 * - 值错误只标记值本身
 * - 字符串格式错误标记具体的错误字符
 * - 数组/对象错误标记开始符号
 *
 * @example
 * ```typescript
 * const helper = new DiagnosticRangeHelper(logger);
 * const range = helper.getErrorRange(error, document, positionMap);
 * ```
 */
export class DiagnosticRangeHelper {
    constructor(private readonly logger: ILogger) {}

    /**
     * 获取错误范围
     *
     * 根据错误类型返回更精确的范围：
     * - required: 只标记父对象的键名
     * - type: 只标记值的第一行
     * - enum: 只标记值本身
     * - additionalProperties: 只标记未知属性的键名
     * - 其他: 智能缩小范围
     */
    getErrorRange(
        error: IValidationError,
        document: TextDocument,
        positionMap?: Map<string, IPositionInfo>
    ): Range {
        // 尝试从位置映射中获取精确位置
        if (error.path && positionMap) {
            // Ajv 返回的路径格式是 /items/my-item，需要转换为 items.my-item
            let normalizedPath = error.path
                .replace(/^\//, '')  // 移除开头的 /
                .replace(/\//g, '.'); // 将 / 替换为 .

            // 修复路径中可能被错误格式化的版本号
            normalizedPath = this.fixVersionNumbersInPath(normalizedPath);

            this.logger.debug('Finding position for error', {
                originalPath: error.path,
                normalizedPath,
                errorCode: error.code,
                availablePaths: Array.from(positionMap.keys()).slice(0, 10)
            });

            // 直接查找路径
            let position = positionMap.get(normalizedPath);
            if (position) {
                this.logger.debug('Found exact position', { path: normalizedPath });
                return this.refineErrorRange(error, position, document);
            }

            // 尝试模糊匹配（对于路径中包含特殊字符的情况）
            position = this.findFuzzyPosition(normalizedPath, positionMap);
            if (position) {
                this.logger.debug('Found fuzzy position', { path: normalizedPath });
                return this.refineErrorRange(error, position, document);
            }

            // 尝试查找父路径（用于 required 错误，错误路径指向父对象）
            const pathParts = normalizedPath.split('.');
            while (pathParts.length > 0) {
                const parentPath = pathParts.join('.');
                position = positionMap.get(parentPath);
                if (position) {
                    this.logger.debug('Found parent position', {
                        path: normalizedPath,
                        parentPath
                    });
                    return this.refineErrorRange(error, position, document);
                }
                pathParts.pop();
            }

            this.logger.warn('No position found for error path', {
                path: error.path,
                normalizedPath,
                message: error.message
            });
        }

        // 回退到文档开始位置
        return new Range(0, 0, 0, 1);
    }

    /**
     * 扩展诊断范围以提供更好的可读性
     *
     * 当原始范围太小时，扩展到：
     * 1. 当前位置所在的单词/键名
     * 2. 如果无法找到单词，则扩展到整行非空白内容
     */
    expandDiagnosticRange(document: TextDocument, startPos: Position): Range {
        const line = document.lineAt(startPos.line);
        const lineText = line.text;

        // 尝试找到当前位置所在的单词/键名（包括冒号前的键名）
        const wordRange = document.getWordRangeAtPosition(startPos, /[\w\-._]+:?/);
        if (wordRange && !wordRange.isEmpty) {
            return wordRange;
        }

        // 如果找不到单词，扩展到该行的非空白内容
        const trimmedStart = lineText.search(/\S/);
        const trimmedEnd = lineText.search(/\S\s*$/);

        if (trimmedStart !== -1 && trimmedEnd !== -1) {
            return new Range(
                startPos.line,
                trimmedStart,
                startPos.line,
                trimmedEnd + 1
            );
        }

        // 兜底：返回从起始位置到行尾
        return new Range(startPos, line.range.end);
    }

    /**
     * 模糊查找位置
     *
     * 当路径中包含特殊字符（如 $, #, :）时，可能无法精确匹配
     * 尝试通过部分匹配来查找位置
     */
    private findFuzzyPosition(
        targetPath: string,
        positionMap: Map<string, IPositionInfo>
    ): IPositionInfo | undefined {
        const pathParts = targetPath.split('.');

        for (const [key, value] of positionMap.entries()) {
            const keyParts = key.split('.');

            // 路径长度必须相同
            if (keyParts.length !== pathParts.length) {
                continue;
            }

            // 检查是否所有部分都匹配（考虑特殊字符）
            let matches = true;
            for (let i = 0; i < pathParts.length; i++) {
                if (this.hasSpecialChars(pathParts[i])) {
                    if (!keyParts[i].includes(pathParts[i]) && !pathParts[i].includes(keyParts[i])) {
                        matches = false;
                        break;
                    }
                } else if (pathParts[i] !== keyParts[i]) {
                    matches = false;
                    break;
                }
            }

            if (matches) {
                return value;
            }
        }

        return undefined;
    }

    /**
     * 检查字符串是否包含特殊字符
     */
    private hasSpecialChars(str: string): boolean {
        return /[$#:~>=<]/.test(str);
    }

    /**
     * 修复路径中被错误格式化的版本号
     *
     * YAML 解析时，类似 1.21.3 的版本号可能被解析为浮点数，
     * 转换为字符串时变成 01.21.3 或 1.213。
     */
    private fixVersionNumbersInPath(path: string): string {
        return path.replace(/(\$\$|>=|<=|<|=|~)0*(\d+)\.0*(\d+)\.0*(\d+)/g, '$1$2.$3.$4');
    }

    /**
     * 精细化错误范围
     *
     * 根据错误类型和上下文，返回更精确的范围
     */
    private refineErrorRange(
        error: IValidationError,
        position: IPositionInfo,
        document: TextDocument
    ): Range {
        switch (error.code) {
            case 'required':
                // 必需字段错误：只标记父对象的键名
                if (position.keyRange) {
                    return position.keyRange;
                }
                return this.getFirstLineRange(position.range, document);

            case 'additionalProperties':
                // 未知属性：只标记键名
                if (position.keyRange) {
                    return position.keyRange;
                }
                return this.getFirstLineRange(position.range, document);

            case 'type':
            case 'enum':
            case 'pattern':
            case 'format':
                // 值错误：只标记值的第一行（不包括整个对象/数组）
                return this.getValueRange(position.range, document);

            case 'minLength':
            case 'maxLength':
            case 'minimum':
            case 'maximum':
                // 约束错误：标记值本身
                return this.getValueRange(position.range, document);

            default:
                // 默认：使用第一行范围
                return this.getFirstLineRange(position.range, document);
        }
    }

    /**
     * 获取范围的第一行
     *
     * 对于多行内容，只返回第一行的范围
     */
    private getFirstLineRange(range: Range, document: TextDocument): Range {
        if (range.start.line === range.end.line) {
            return range;
        }

        const firstLine = document.lineAt(range.start.line);
        const lineEnd = firstLine.range.end;

        return new Range(range.start, lineEnd);
    }

    /**
     * 获取值的范围
     *
     * 智能识别值的类型并返回合适的范围：
     * - 简单值（字符串、数字、布尔）：完整范围
     * - 对象/数组：只标记开始符号或第一行
     */
    private getValueRange(range: Range, document: TextDocument): Range {
        const startLine = document.lineAt(range.start.line);
        const text = startLine.text.substring(range.start.character);

        // 检查是否是对象或数组的开始
        const trimmed = text.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            const startChar = text.indexOf(trimmed[0]) + range.start.character;
            return new Range(
                range.start.line,
                startChar,
                range.start.line,
                startChar + 1
            );
        }

        // 检查是否是 YAML 多行对象（冒号后换行）
        if (trimmed === '' || text.includes(':')) {
            const colonIndex = text.indexOf(':');
            if (colonIndex !== -1) {
                return new Range(
                    range.start.line,
                    range.start.character + colonIndex,
                    range.start.line,
                    range.start.character + colonIndex + 1
                );
            }
            return this.getFirstLineRange(range, document);
        }

        // 简单值：标记值本身，但限制在当前行
        return this.getFirstLineRange(range, document);
    }

    // ========================================================================
    // 新增：Token 级别精确范围方法
    // ========================================================================

    /**
     * 获取 YAML 键的精确范围
     *
     * @param document 文档
     * @param path YAML 路径
     * @param positionMap 位置映射
     * @returns 键名的精确范围
     */
    getKeyRange(
        document: TextDocument,
        path: string,
        positionMap: Map<string, IPositionInfo>
    ): Range | undefined {
        const position = positionMap.get(path);
        if (!position) {
            return undefined;
        }

        // 优先使用 keyRange
        if (position.keyRange) {
            return position.keyRange;
        }

        // 尝试从行内容提取键名范围
        return this.extractKeyRangeFromLine(document, position.range.start);
    }

    /**
     * 获取 YAML 值的精确范围
     *
     * @param document 文档
     * @param path YAML 路径
     * @param positionMap 位置映射
     * @returns 值的精确范围
     */
    getValueRangeByPath(
        document: TextDocument,
        path: string,
        positionMap: Map<string, IPositionInfo>
    ): Range | undefined {
        const position = positionMap.get(path);
        if (!position) {
            return undefined;
        }

        return this.getValueRange(position.range, document);
    }

    /**
     * 获取字符串中特定子串的范围
     *
     * @param document 文档
     * @param baseRange 基础范围
     * @param substring 要查找的子串
     * @returns 子串的范围，如果未找到则返回 undefined
     */
    getSubstringRange(
        document: TextDocument,
        baseRange: Range,
        substring: string
    ): Range | undefined {
        const text = document.getText(baseRange);
        const index = text.indexOf(substring);

        if (index === -1) {
            return undefined;
        }

        // 计算子串的起始位置
        const startOffset = document.offsetAt(baseRange.start) + index;
        const endOffset = startOffset + substring.length;

        return new Range(
            document.positionAt(startOffset),
            document.positionAt(endOffset)
        );
    }

    /**
     * 扩展范围到完整的 token
     *
     * @param document 文档
     * @param position 位置
     * @returns 包含该位置的完整 token 范围
     */
    expandToToken(document: TextDocument, position: Position): Range {
        // 尝试多种 token 模式
        const patterns = [
            /[\w\-._]+/,           // 标识符
            /"[^"]*"/,             // 双引号字符串
            /'[^']*'/,             // 单引号字符串
            /\$\$[^\s:]+/,         // 版本条件
            /\$[a-zA-Z_][a-zA-Z0-9_]*/, // 模板参数
            /[^\s:,\[\]{}]+/       // 通用 token
        ];

        for (const pattern of patterns) {
            const range = document.getWordRangeAtPosition(position, pattern);
            if (range && !range.isEmpty) {
                return range;
            }
        }

        // 回退到单字符范围
        return new Range(position, position.translate(0, 1));
    }

    /**
     * 从行内容提取键名范围
     */
    private extractKeyRangeFromLine(document: TextDocument, position: Position): Range | undefined {
        const line = document.lineAt(position.line);
        const lineText = line.text;

        // 查找冒号位置
        const colonIndex = lineText.indexOf(':');
        if (colonIndex === -1) {
            return undefined;
        }

        // 提取键名部分（冒号前的非空白内容）
        const keyPart = lineText.substring(0, colonIndex);
        const keyMatch = keyPart.match(/^\s*(\S+)\s*$/);

        if (!keyMatch) {
            return undefined;
        }

        const keyStart = keyPart.indexOf(keyMatch[1]);
        const keyEnd = keyStart + keyMatch[1].length;

        return new Range(
            position.line,
            keyStart,
            position.line,
            keyEnd
        );
    }

    /**
     * 获取指定范围类型的范围
     *
     * @param document 文档
     * @param path YAML 路径
     * @param positionMap 位置映射
     * @param rangeType 范围类型
     * @returns 指定类型的范围
     */
    getRangeByType(
        document: TextDocument,
        path: string,
        positionMap: Map<string, IPositionInfo>,
        rangeType: RangeType
    ): Range | undefined {
        const position = positionMap.get(path);
        if (!position) {
            return undefined;
        }

        switch (rangeType) {
            case RangeType.Key:
                return position.keyRange ?? this.extractKeyRangeFromLine(document, position.range.start);

            case RangeType.Value:
                return this.getValueRange(position.range, document);

            case RangeType.Full:
                return position.range;

            case RangeType.FirstLine:
                return this.getFirstLineRange(position.range, document);

            case RangeType.Token:
                return this.expandToToken(document, position.range.start);

            default:
                return position.range;
        }
    }

    /**
     * 获取错误的最佳范围类型
     *
     * 根据错误代码返回最适合的范围类型
     *
     * @param errorCode 错误代码
     * @returns 推荐的范围类型
     */
    getBestRangeType(errorCode: string): RangeType {
        switch (errorCode) {
            // 键名相关错误
            case 'required':
            case 'additionalProperties':
            case 'unknown_property':
                return RangeType.Key;

            // 值相关错误
            case 'type':
            case 'enum':
            case 'pattern':
            case 'format':
            case 'minLength':
            case 'maxLength':
            case 'minimum':
            case 'maximum':
                return RangeType.Value;

            // 引用错误 - 标记整个值
            case 'unknown_template':
            case 'template_not_found':
            case 'unknown_translation_key':
            case 'unknown_category':
            case 'file_not_found':
            case 'item_not_found':
                return RangeType.Value;

            // 默认使用第一行
            default:
                return RangeType.FirstLine;
        }
    }
}
