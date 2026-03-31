import { type TextDocument, type Position } from 'vscode';
import * as yaml from 'yaml';
import { type ILogger } from '../../../core/interfaces/ILogger';
import { type PathParserCache } from './PathParserCache';

/**
 * AST 精确路径解析器
 *
 * 使用 yaml 库的 parseDocument API 获取抽象语法树，
 * 通过节点的 range 信息精确定位光标位置对应的路径。
 *
 * @remarks
 * **解析特点**：
 * - 使用 AST 节点的 range 信息精确定位
 * - 能正确处理复杂的 YAML 结构
 * - 支持数组、嵌套对象、锚点等特殊语法
 * - 性能较好，准确性高
 *
 * **适用场景**：
 * - 标准 YAML 文档
 * - 复杂嵌套结构
 * - 需要高精度定位的场景
 *
 * @example
 * ```typescript
 * const parser = new AstPathParser(logger, cache);
 *
 * // 解析路径
 * const path = parser.parsePathWithAST(document, position);
 * console.log(path); // ['items', 'my-item', 'template']
 * ```
 */
export class AstPathParser {
    /**
     * 构造 AST 路径解析器实例
     *
     * @param logger - 日志记录器（可选）
     * @param cache - 缓存管理器
     */
    constructor(
        private readonly logger: ILogger | undefined,
        private readonly cache: PathParserCache,
    ) {}

    /**
     * 使用 YAML AST 精确解析路径
     *
     * 提供更准确的路径解析，能正确处理：
     * - 复杂的嵌套结构
     * - 数组项
     * - 多行字符串
     * - 锚点和别名
     *
     * @param document - VSCode 文档对象
     * @param position - 光标位置
     * @returns 路径数组，如果解析失败则返回 undefined
     *
     * @remarks
     * 当光标在空行或 AST 无法精确定位的区域时，返回 undefined，
     * 调用方应回退到基于缩进的解析。
     */
    parsePathWithAST(document: TextDocument, position: Position): string[] | undefined {
        try {
            const text = document.getText();
            const offset = document.offsetAt(position);
            const uri = document.uri.toString();

            // 检查 AST 缓存
            let doc: yaml.Document.Parsed;
            const cachedAST = this.cache.getAST(uri, document.version);
            if (cachedAST) {
                doc = cachedAST;
            } else {
                // 解析 YAML 文档
                doc = yaml.parseDocument(text, {
                    strict: false,
                    uniqueKeys: false, // 允许重复键（在编辑时可能出现）
                });

                // 缓存 AST
                this.cache.setAST(uri, doc, document.version);
            }

            if (!doc.contents) {
                return undefined;
            }

            // 从 AST 中查找光标位置对应的路径
            const astPath = this.findPathInAST(doc.contents, offset, []);

            return astPath;
        } catch (error) {
            this.logger?.debug('AST parsing error', {
                error: (error as Error).message,
            });
            return undefined;
        }
    }

    /**
     * 在 AST 中查找光标位置对应的路径
     *
     * 递归遍历 AST 节点，查找包含目标偏移量的节点
     *
     * @param node - YAML AST 节点
     * @param targetOffset - 目标偏移量
     * @param currentPath - 当前路径
     * @returns 路径数组，如果未找到则返回 undefined
     *
     * @remarks
     * 对于补全键名场景，当光标在某个 Map 节点内部（但不在任何键或值的具体范围内）时，
     * 需要确定光标属于哪个父级节点，以便提供正确的补全建议。
     */
    private findPathInAST(
        node: yaml.ParsedNode | null,
        targetOffset: number,
        currentPath: string[],
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
                            const subPath = this.findPathInAST(item.value as yaml.ParsedNode, targetOffset, [
                                ...currentPath,
                                String(keyValue),
                            ]);

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

                const subPath = this.findPathInAST(item as yaml.ParsedNode, targetOffset, [...currentPath, String(i)]);

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
     *
     * @param node - YAML AST 节点
     * @returns 节点值（字符串或数字），如果无法获取则返回 undefined
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
}
