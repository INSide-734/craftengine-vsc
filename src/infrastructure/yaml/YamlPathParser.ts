import { TextDocument, Position } from 'vscode';
import * as yaml from 'yaml';
import { IYamlPathParser } from '../../core/interfaces/IYamlPathParser';
import { ILogger } from '../../core/interfaces/ILogger';
import { LRUCache } from '../utils/LRUCache';

/**
 * AST 缓存条目
 */
interface IASTCacheEntry {
    /** 解析后的 YAML 文档 */
    doc: yaml.Document.Parsed;
    /** 文档版本 */
    version: number;
}

/**
 * 路径缓存条目
 */
interface IPathCacheEntry {
    /** 解析后的路径 */
    path: string[];
    /** 文档版本 */
    version: number;
}

/**
 * YAML 路径解析器实现
 * 
 * 根据文档位置（光标位置）解析出从根节点到该位置的完整路径。
 * 支持两种解析模式，自动选择最佳方案。
 * 
 * @remarks
 * **两种解析模式**：
 * 
 * 1. **AST 精确解析（推荐）**
 *    - 使用 yaml 库的 parseDocument API 获取抽象语法树
 *    - 通过节点的 range 信息精确定位
 *    - 能正确处理复杂的 YAML 结构
 *    - 支持数组、嵌套对象、锚点等特殊语法
 *    - 性能较好，准确性高
 * 
 * 2. **基于缩进的简单解析（回退）**
 *    - 通过分析行的缩进级别确定层次
 *    - 从光标位置向上遍历查找父级键
 *    - 作为 AST 解析失败时的备选方案
 *    - 可能在复杂结构中不够准确
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

    /** AST 缓存（按文档 URI） */
    private readonly astCache: LRUCache<string, IASTCacheEntry>;
    /** 路径缓存（按 uri:version:line:character） */
    private readonly pathCache: LRUCache<string, IPathCacheEntry>;

    /**
     * 构造 YAML 路径解析器实例
     *
     * @param logger - 日志记录器（可选），用于记录解析过程和调试信息
     */
    constructor(
        private readonly logger?: ILogger,
        cacheConfig?: { astCacheSize?: number; pathCacheSize?: number }
    ) {
        this.astCache = new LRUCache<string, IASTCacheEntry>(
            cacheConfig?.astCacheSize ?? YamlPathParser.DEFAULT_AST_CACHE_SIZE
        );
        this.pathCache = new LRUCache<string, IPathCacheEntry>(
            cacheConfig?.pathCacheSize ?? YamlPathParser.DEFAULT_PATH_CACHE_SIZE
        );
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
     * 1. 首先尝试 AST 精确解析（parsePathWithAST）
     * 2. 如果 AST 解析成功且返回非空路径，使用该结果
     * 3. 如果 AST 解析失败或返回空路径，回退到缩进解析（parsePathByIndent）
     * 4. 记录使用的解析方法和结果
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
        const cachedPath = this.pathCache.get(cacheKey);
        if (cachedPath && cachedPath.version === document.version) {
            return cachedPath.path;
        }

        // 尝试 AST 精确解析
        let result: string[] | undefined;
        try {
            result = this.parsePathWithAST(document, position);
            if (result && result.length > 0) {
                // 缓存结果
                this.pathCache.set(cacheKey, { path: result, version: document.version });
                return result;
            }
        } catch (astError) {
            // AST 解析失败是常见情况（如文档格式不完整），静默回退
        }

        // 回退到基于缩进的解析
        result = this.parsePathByIndent(document, position);

        // 缓存结果
        this.pathCache.set(cacheKey, { path: result, version: document.version });

        return result;
    }
    
    /**
     * 使用 YAML AST 精确解析路径
     * 
     * 提供更准确的路径解析，能正确处理：
     * - 复杂的嵌套结构
     * - 数组项
     * - 多行字符串
     * - 锚点和别名
     * 
     * @remarks
     * 当光标在空行或 AST 无法精确定位的区域时，会结合基于缩进的解析
     * 来确定更准确的父路径。
     */
    private parsePathWithAST(document: TextDocument, position: Position): string[] | undefined {
        try {
            const text = document.getText();
            const offset = document.offsetAt(position);
            const uri = document.uri.toString();

            // 检查 AST 缓存
            let doc: yaml.Document.Parsed;
            const cachedAST = this.astCache.get(uri);
            if (cachedAST && cachedAST.version === document.version) {
                doc = cachedAST.doc;
            } else {
                // 解析 YAML 文档
                doc = yaml.parseDocument(text, {
                    strict: false,
                    uniqueKeys: false  // 允许重复键（在编辑时可能出现）
                });

                // 缓存 AST
                this.astCache.set(uri, { doc, version: document.version });
            }

            if (!doc.contents) {
                return undefined;
            }

            // 从 AST 中查找光标位置对应的路径
            const astPath = this.findPathInAST(doc.contents, offset, []);

            // 检查当前行是否是空行或只有空格（这种情况 AST 无法精确定位）
            const currentLine = document.lineAt(position.line);
            const trimmedLine = currentLine.text.trim();

            if (!trimmedLine || !trimmedLine.includes(':')) {
                // 当前行没有内容或没有键值对，需要根据缩进确定更精确的路径
                const indentPath = this.parsePathByIndent(document, position);

                // 如果基于缩进的解析返回了更深的路径，使用它
                if (indentPath.length > (astPath?.length || 0)) {
                    this.logger?.debug('Using indent-based path for empty/incomplete line', {
                        astPath,
                        indentPath,
                        line: position.line,
                        trimmedLine
                    });
                    return indentPath;
                }
            }
            
            return astPath;
            
        } catch (error) {
            this.logger?.debug('AST parsing error', {
                error: (error as Error).message
            });
            return undefined;
        }
    }
    
    /**
     * 在 AST 中查找光标位置对应的路径
     * 
     * 递归遍历 AST 节点，查找包含目标偏移量的节点
     * 
     * @remarks
     * 对于补全键名场景，当光标在某个 Map 节点内部（但不在任何键或值的具体范围内）时，
     * 需要确定光标属于哪个父级节点，以便提供正确的补全建议。
     */
    private findPathInAST(
        node: yaml.ParsedNode | null,
        targetOffset: number,
        currentPath: string[]
    ): string[] | undefined {
        if (!node || !node.range) {
            return undefined;
        }
        
        const [start, , end] = node.range;
        
        // 检查目标偏移量是否在当前节点范围内
        if (targetOffset < start || targetOffset > end) {
            return undefined;
        }
        
        // 处理 Map 节点
        if (yaml.isMap(node)) {
            // 首先检查是否在某个键值对的完整范围内（从键开始到值结束）
            for (const item of node.items) {
                if (!item || !item.key) {
                    continue;
                }
                
                // 获取键名
                const keyValue = this.getNodeValue(item.key);
                if (keyValue === undefined) {
                    continue;
                }
                
                // 获取键的范围
                const keyRange = item.key.range;
                if (!keyRange) {
                    continue;
                }
                
                const [keyStart, , keyEnd] = keyRange;
                
                // 检查是否在键的位置（补全键名场景）
                if (targetOffset >= keyStart && targetOffset <= keyEnd) {
                    // 键位置查找是高频操作，不记录日志
                    return currentPath; // 在键位置，返回父路径
                }
                
                // 检查是否在值的范围内
                if (item.value) {
                    const valueRange = item.value.range;
                    if (valueRange) {
                        const [valueStart, , valueEnd] = valueRange;
                        
                        if (targetOffset >= valueStart && targetOffset <= valueEnd) {
                            // 递归查找子路径
                            const subPath = this.findPathInAST(
                                item.value as yaml.ParsedNode,
                                targetOffset,
                                [...currentPath, String(keyValue)]
                            );
                            
                            if (subPath) {
                                return subPath;
                            }
                            
                            // 如果没有子路径，返回当前路径（包含此键）
                            return [...currentPath, String(keyValue)];
                        }
                    }
                }
            }
            
            // 光标不在任何键值范围内，返回当前路径
            return currentPath.length > 0 ? currentPath : undefined;
        }
        
        // 处理 Seq 节点（数组）
        if (yaml.isSeq(node)) {
            for (let i = 0; i < node.items.length; i++) {
                const item = node.items[i];
                if (!item) {
                    continue;
                }
                
                const subPath = this.findPathInAST(
                    item as yaml.ParsedNode,
                    targetOffset,
                    [...currentPath, String(i)]
                );
                
                if (subPath) {
                    return subPath;
                }
            }
        }
        
        // 对于标量节点，返回当前路径
        return currentPath.length > 0 ? currentPath : undefined;
    }
    
    /**
     * 从 AST 节点获取值
     */
    private getNodeValue(node: yaml.ParsedNode): string | number | undefined {
        if (yaml.isScalar(node)) {
            const value = node.value;
            if (typeof value === 'string' || typeof value === 'number') {
                return value;
            }
        }
        return undefined;
    }
    
    /**
     * 基于缩进的简单路径解析（回退方法）
     * 
     * 从当前位置向上遍历，识别每一层的键名，构建路径数组
     * 
     * @remarks
     * 对于空行，使用光标的列位置作为期望的缩进级别，
     * 因为空行本身没有字符，无法通过行内容判断缩进。
     */
    private parsePathByIndent(document: TextDocument, position: Position): string[] {
        const path: string[] = [];
        
        try {
            const currentLine = document.lineAt(position.line);
            const trimmedLine = currentLine.text.trim();
            
            // 计算当前缩进级别
            // 对于空行，使用光标的列位置作为期望的缩进级别
            let currentIndent: number;
            if (!trimmedLine) {
                // 空行：使用光标位置作为缩进，或者向上查找最近非空行的子级缩进
                currentIndent = position.character > 0 
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
                method: 'indent'
            });
            
        } catch (error) {
            this.logger?.error('Failed to parse YAML path by indent', error as Error, {
                position: `${position.line}:${position.character}`
            });
        }
        
        return path;
    }
    
    /**
     * 获取缩进级别
     * 
     * @param line 行文本
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
            const arrayItemMatch = trimmed.match(/^-\s+([a-zA-Z0-9_$:#\/\-\.>=<~]+):/);
            if (arrayItemMatch) {
                return arrayItemMatch[1];
            }
            return undefined;
        }
        
        // 提取键名: "key:" 或 "key: value"（支持版本条件格式如 $$>=1.21.4, $$1.20.1~1.21.3#section）
        const keyMatch = trimmed.match(/^([a-zA-Z0-9_$:#\/\-\.>=<~]+):/);
        if (keyMatch) {
            return keyMatch[1];
        }
        
        return undefined;
    }
    
    /**
     * 判断是否为数组项
     * 
     * @param line 行文本
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

