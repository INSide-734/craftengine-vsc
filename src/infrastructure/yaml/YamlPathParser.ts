import { type TextDocument, type Position } from 'vscode';
import { type IYamlPathParser } from '../../core/interfaces/IYamlPathParser';
import { type ILogger } from '../../core/interfaces/ILogger';
import { AstPathParser, IndentPathParser, PathParserCache } from './parsers';

/**
 * YAML 路径解析器（协调器）
 *
 * 根据文档位置（光标位置）解析出从根节点到该位置的完整路径。
 * 协调 AST 解析器和缩进解析器，自动选择最佳解析策略。
 *
 * @remarks
 * **解析策略**：
 *
 * 1. **AST 精确解析（优先）**
 *    - 使用 AstPathParser 进行精确解析
 *    - 能正确处理复杂的 YAML 结构
 *    - 支持数组、嵌套对象、锚点等特殊语法
 *
 * 2. **基于缩进的解析（回退）**
 *    - 使用 IndentPathParser 作为备选方案
 *    - 当 AST 解析失败或返回空路径时使用
 *    - 适用于不完整的 YAML 文档
 *
 * **路径表示**：
 * - 路径是一个字符串数组，从根节点到目标节点
 * - 对象键使用字符串表示
 * - 数组索引使用数字表示
 * - 空数组表示根级别
 *
 * **应用场景**：
 * - 智能补全：确定当前位置可用的补全项
 * - 悬停提示：查找光标位置对应的 Schema 信息
 * - 定义跳转：定位模板或变量的定义位置
 * - 语法验证：验证当前路径的合法性
 *
 * @example
 * ```typescript
 * const parser = new YamlPathParser(logger);
 *
 * // 假设 YAML 文档内容：
 * // items:
 * //   my-item:
 * //     template: user-profile
 * //     parameters:
 * //       - name: username
 *
 * // 光标在 "template: user-profile" 这行
 * const path1 = parser.parsePath(document, new Position(2, 10));
 * console.log(path1); // ['items', 'my-item', 'template']
 *
 * // 光标在 "name: username" 这行
 * const path2 = parser.parsePath(document, new Position(4, 10));
 * console.log(path2); // ['items', 'my-item', 'parameters', 0, 'name']
 *
 * // 光标在根级别
 * const path3 = parser.parsePath(document, new Position(0, 0));
 * console.log(path3); // []
 * ```
 */
export class YamlPathParser implements IYamlPathParser {
    /** AST 缓存容量（默认值） */
    private static readonly DEFAULT_AST_CACHE_SIZE = 20;
    /** 路径缓存容量（默认值） */
    private static readonly DEFAULT_PATH_CACHE_SIZE = 100;

    /** 缓存管理器 */
    private readonly cache: PathParserCache;
    /** AST 路径解析器 */
    private readonly astParser: AstPathParser;
    /** 缩进路径解析器 */
    private readonly indentParser: IndentPathParser;

    /**
     * 构造 YAML 路径解析器实例
     *
     * @param logger - 日志记录器（可选），用于记录解析过程和调试信息
     * @param cacheConfig - 缓存配置（可选）
     */
    constructor(
        private readonly logger?: ILogger,
        cacheConfig?: { astCacheSize?: number; pathCacheSize?: number },
    ) {
        // 初始化缓存管理器
        this.cache = new PathParserCache(
            cacheConfig?.astCacheSize ?? YamlPathParser.DEFAULT_AST_CACHE_SIZE,
            cacheConfig?.pathCacheSize ?? YamlPathParser.DEFAULT_PATH_CACHE_SIZE,
        );

        // 初始化解析器
        this.astParser = new AstPathParser(logger, this.cache);
        this.indentParser = new IndentPathParser(logger);
    }

    /**
     * 解析 YAML 路径
     *
     * 根据文档和位置解析出完整的路径数组。
     * 优先使用 AST 精确解析，失败时自动回退到基于缩进的解析。
     *
     * @param document - VSCode 文档对象
     * @param position - 光标位置
     * @returns 路径数组，从根节点到当前位置的完整路径
     *
     * @remarks
     * 解析流程：
     * 1. 检查路径缓存
     * 2. 尝试 AST 精确解析（parsePathWithAST）
     * 3. 如果 AST 解析成功且返回非空路径，使用该结果
     * 4. 如果 AST 解析失败或返回空路径，回退到缩进解析（parsePathByIndent）
     * 5. 缓存结果并返回
     *
     * 路径格式：
     * - 空数组 `[]`：表示根级别
     * - 字符串元素：对象的键名，如 `['items', 'my-item']`
     * - 数字元素：数组的索引，如 `['items', 0]`
     * - 混合路径：`['items', 'my-item', 'parameters', 0, 'name']`
     *
     * @example
     * ```typescript
     * // YAML 文档：
     * // templates:
     * //   user-profile:
     * //     name: User Profile Template
     * //     parameters:
     * //       - username
     * //       - email
     *
     * // 光标在 "name: User Profile Template"
     * const path = parser.parsePath(document, position);
     * // 返回: ['templates', 'user-profile', 'name']
     *
     * // 光标在第一个参数 "username"
     * const path2 = parser.parsePath(document, position2);
     * // 返回: ['templates', 'user-profile', 'parameters', 0]
     * ```
     */
    parsePath(document: TextDocument, position: Position): string[] {
        // 生成缓存键（移除 character，同一行共享缓存）
        const cacheKey = `${document.uri.toString()}:${document.version}:${position.line}`;

        // 检查路径缓存
        const cachedPath = this.cache.getPath(cacheKey, document.version);
        if (cachedPath) {
            return cachedPath;
        }

        // 尝试 AST 精确解析
        let result: string[] | undefined;
        let astParsed = false;
        try {
            result = this.astParser.parsePathWithAST(document, position);
            astParsed = true;
            if (result && result.length > 0) {
                // 缓存结果
                this.cache.setPath(cacheKey, result, document.version);
                return result;
            }
        } catch {
            // AST 解析失败是常见情况（如文档格式不完整），静默回退
        }

        // 检查当前行是否是空行或只有空格（这种情况 AST 无法精确定位）
        const currentLine = document.lineAt(position.line);
        const trimmedLine = currentLine.text.trim();

        if (!trimmedLine || !trimmedLine.includes(':')) {
            // 当前行没有内容或没有键值对，需要根据缩进确定更精确的路径
            const indentPath = this.indentParser.parsePathByIndent(document, position);

            // 如果基于缩进的解析返回了更深的路径，使用它
            if (indentPath.length > (result?.length || 0)) {
                this.logger?.debug('Using indent-based path for empty/incomplete line', {
                    astPath: result,
                    indentPath,
                    line: position.line,
                    trimmedLine,
                });
                result = indentPath;
            }
        }

        // 如果 AST 解析没有结果或返回空数组，回退到基于缩进的解析
        if (!astParsed || !result || result.length === 0) {
            result = this.indentParser.parsePathByIndent(document, position);
        }

        // 缓存结果
        this.cache.setPath(cacheKey, result, document.version);

        return result;
    }

    /**
     * 获取缩进级别
     *
     * @param line - 行文本
     * @returns 缩进级别（前导空格数）
     */
    getIndentLevel(line: string): number {
        return this.indentParser.getIndentLevel(line);
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
        return this.indentParser.extractKeyName(line);
    }
}
