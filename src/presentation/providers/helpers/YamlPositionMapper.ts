import { TextDocument, Range, Position } from 'vscode';
import { ILogger } from '../../../core/interfaces/ILogger';
import * as yaml from 'yaml';

/**
 * 位置信息接口
 *
 * 用于存储 YAML 节点在文档中的位置信息
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
 * YAML 位置映射器
 *
 * 负责构建 YAML 文档中路径到位置信息的映射，
 * 用于将验证错误精确定位到文档中的具体位置。
 *
 * @example
 * ```typescript
 * const mapper = new YamlPositionMapper(logger);
 * const positionMap = mapper.buildPositionMap(astDocument, document);
 * const position = positionMap.get('items.my-item.name');
 * ```
 */
export class YamlPositionMapper {
    constructor(private readonly logger: ILogger) {}

    /**
     * 构建位置映射（路径 -> 位置信息）
     *
     * @param astDocument YAML AST 文档
     * @param document VSCode 文本文档
     * @returns 路径到位置信息的映射
     */
    buildPositionMap(
        astDocument: yaml.Document.Parsed,
        document: TextDocument
    ): Map<string, IPositionInfo> {
        const positionMap = new Map<string, IPositionInfo>();

        this.visitNode(astDocument.contents as yaml.Node, [], positionMap, document);

        return positionMap;
    }

    /**
     * 递归访问 YAML 节点并构建位置映射
     */
    private visitNode(
        node: yaml.Node | null,
        path: string[],
        positionMap: Map<string, IPositionInfo>,
        document: TextDocument,
        keyNode?: yaml.Node
    ): void {
        if (!node || !node.range) {
            return;
        }

        const pathKey = path.join('.');
        const [startOffset, endOffset] = node.range;

        try {
            const startPos = document.positionAt(startOffset);
            const endPos = document.positionAt(endOffset);
            const range = new Range(startPos, endPos);

            // 计算键名的范围（如果有）
            let keyRange: Range | undefined;
            if (keyNode && keyNode.range) {
                const [keyStart, keyEnd] = keyNode.range;
                const keyStartPos = document.positionAt(keyStart);
                const keyEndPos = document.positionAt(keyEnd);
                keyRange = new Range(keyStartPos, keyEndPos);
            }

            positionMap.set(pathKey, {
                start: startPos,
                end: endPos,
                range,
                keyRange
            });
        } catch (error) {
            // 位置超出范围时忽略
            this.logger.debug('Position out of range', { path: pathKey, error });
        }

        // 递归处理子节点
        if (yaml.isMap(node)) {
            this.visitMapNode(node, path, positionMap, document);
        } else if (yaml.isSeq(node)) {
            this.visitSeqNode(node, path, positionMap, document);
        }
    }

    /**
     * 处理 Map 类型节点
     */
    private visitMapNode(
        node: yaml.YAMLMap,
        path: string[],
        positionMap: Map<string, IPositionInfo>,
        document: TextDocument
    ): void {
        for (const item of node.items) {
            if (item.key && yaml.isScalar(item.key)) {
                // 使用原始文本而不是解析后的值，避免数字格式化问题
                // 例如：1.21.3 被解析为数字后可能变成 1.213
                const key = this.extractKeyText(item.key, document);
                const currentPath = [...path, key];

                if (item.value) {
                    // 有值：正常处理
                    this.visitNode(
                        item.value as yaml.Node,
                        currentPath,
                        positionMap,
                        document,
                        item.key as yaml.Node
                    );
                } else if (item.key.range) {
                    // 无值（null/空）：也要添加到位置映射，使用键的位置
                    this.addEmptyValuePosition(item.key, currentPath, positionMap, document);
                }
            }
        }
    }

    /**
     * 处理 Seq 类型节点
     */
    private visitSeqNode(
        node: yaml.YAMLSeq,
        path: string[],
        positionMap: Map<string, IPositionInfo>,
        document: TextDocument
    ): void {
        node.items.forEach((item, index) => {
            if (item) {
                this.visitNode(
                    item as yaml.Node,
                    [...path, String(index)],
                    positionMap,
                    document
                );
            }
        });
    }

    /**
     * 从 Scalar 节点提取键名文本
     */
    private extractKeyText(keyNode: yaml.Scalar, document: TextDocument): string {
        if (keyNode.range) {
            const [keyStart, keyEnd] = keyNode.range;
            return document.getText(new Range(
                document.positionAt(keyStart),
                document.positionAt(keyEnd)
            ));
        }
        return String(keyNode.value);
    }

    /**
     * 为空值添加位置映射
     *
     * 当 YAML 键没有值时（如 `key:` 后面为空），
     * 仍然需要记录其位置以便进行诊断。
     */
    private addEmptyValuePosition(
        keyNode: yaml.Scalar,
        currentPath: string[],
        positionMap: Map<string, IPositionInfo>,
        document: TextDocument
    ): void {
        if (!keyNode.range) {
            return;
        }

        const [keyStart, keyEnd] = keyNode.range;

        try {
            const keyStartPos = document.positionAt(keyStart);
            const keyEndPos = document.positionAt(keyEnd);
            const keyRange = new Range(keyStartPos, keyEndPos);

            // 查找冒号的位置（键名后面的冒号）
            const line = document.lineAt(keyEndPos.line);
            const lineText = line.text;
            const colonIndex = lineText.indexOf(':', keyEndPos.character);

            let colonRange: Range;
            if (colonIndex !== -1) {
                // 找到冒号，标记冒号位置
                const colonPos = new Position(keyEndPos.line, colonIndex);
                const colonEndPos = new Position(keyEndPos.line, colonIndex + 1);
                colonRange = new Range(colonPos, colonEndPos);
            } else {
                // 没找到冒号，使用键名末尾
                colonRange = new Range(keyEndPos, new Position(keyEndPos.line, keyEndPos.character + 1));
            }

            const pathKey = currentPath.join('.');
            positionMap.set(pathKey, {
                start: colonRange.start,
                end: colonRange.end,
                range: colonRange,
                keyRange
            });

            this.logger.debug('Added empty value to position map', {
                path: pathKey,
                line: colonRange.start.line + 1,
                character: colonRange.start.character
            });
        } catch (error) {
            this.logger.debug('Failed to add empty value position', {
                path: currentPath.join('.'),
                error
            });
        }
    }
}
