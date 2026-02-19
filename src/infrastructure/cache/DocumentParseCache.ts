import { Position, Range, TextDocument } from 'vscode';
import * as yaml from 'yaml';
import {
    IParsedDocument,
    IDocumentParseCache,
    IPositionInfo,
    IParseError
} from '../../core/interfaces/IParsedDocument';
import { ILogger } from '../../core/interfaces/ILogger';
import { IPerformanceMonitor } from '../../core/interfaces/IPerformanceMonitor';
import { LRUCache } from '../utils/LRUCache';

/**
 * 文档解析缓存服务
 *
 * 提供 YAML 文档解析结果的缓存，避免多个诊断提供者重复解析同一文档。
 *
 * 特性：
 * - 基于文档版本号的缓存验证
 * - LRU 淘汰策略（可配置容量）
 * - 缓存命中率统计
 * - 性能监控集成
 *
 * @example
 * ```typescript
 * const cache = new DocumentParseCache(logger, performanceMonitor);
 * const parsed = await cache.getParsedDocument(document);
 * ```
 */
export class DocumentParseCache implements IDocumentParseCache {
    /** 默认缓存容量 */
    private static readonly DEFAULT_CAPACITY = 50;

    /**
     * 从性能配置获取缓存容量
     *
     * @param config 缓存配置
     * @returns 缓存容量
     */
    static capacityFromConfig(config?: { capacity: number }): number {
        return config?.capacity ?? DocumentParseCache.DEFAULT_CAPACITY;
    }

    /** 缓存存储（使用 LRUCache 自动管理淘汰） */
    private readonly cache: LRUCache<string, IParsedDocument>;

    /** 缓存容量 */
    private readonly capacity: number;

    /** 缓存命中次数 */
    private hits = 0;

    /** 缓存未命中次数 */
    private misses = 0;

    constructor(
        private readonly logger: ILogger,
        private readonly performanceMonitor?: IPerformanceMonitor,
        capacity?: number
    ) {
        this.capacity = capacity ?? DocumentParseCache.DEFAULT_CAPACITY;
        this.cache = new LRUCache<string, IParsedDocument>(this.capacity);
        this.logger.debug('DocumentParseCache initialized', { capacity: this.capacity });
    }

    /**
     * 获取文档的解析结果
     */
    async getParsedDocument(document: TextDocument): Promise<IParsedDocument> {
        const timer = this.performanceMonitor?.startTimer('document-parse-cache.get');
        const uri = document.uri.toString();

        try {
            // 检查缓存（LRUCache.get 自动更新访问顺序）
            const cached = this.cache.get(uri);
            if (cached && cached.version === document.version) {
                this.hits++;
                this.logger.debug('Document parse cache hit', {
                    uri,
                    version: document.version
                });
                timer?.stop({ success: 'true', fromCache: 'true' });
                return cached;
            }

            // 缓存未命中，重新解析
            this.misses++;
            this.logger.debug('Document parse cache miss', {
                uri,
                version: document.version,
                cachedVersion: cached?.version
            });

            const parsed = await this.parseDocument(document);

            // 存入缓存
            this.setCache(uri, parsed);

            timer?.stop({ success: 'true', fromCache: 'false' });
            return parsed;

        } catch (error) {
            this.logger.error('Failed to get parsed document', error as Error, { uri });
            timer?.stop({ success: 'false', error: (error as Error).message });

            // 返回一个空的解析结果
            return this.createEmptyParsedDocument(document);
        }
    }

    /**
     * 清除特定文档的缓存
     */
    clearCache(uri: string): void {
        if (this.cache.delete(uri)) {
            this.logger.debug('Document parse cache cleared', { uri });
        }
    }

    /**
     * 清除所有缓存
     */
    clearAllCaches(): void {
        const size = this.cache.size();
        this.cache.clear();
        this.logger.debug('All document parse caches cleared', { clearedCount: size });
    }

    /**
     * 获取缓存统计信息
     */
    getStats(): {
        size: number;
        hits: number;
        misses: number;
        hitRate: number;
    } {
        const total = this.hits + this.misses;
        return {
            size: this.cache.size(),
            hits: this.hits,
            misses: this.misses,
            hitRate: total > 0 ? this.hits / total : 0
        };
    }

    // ==================== 私有方法 ====================

    /**
     * 解析文档
     */
    private async parseDocument(document: TextDocument): Promise<IParsedDocument> {
        const timer = this.performanceMonitor?.startTimer('document-parse-cache.parse');
        const text = document.getText();
        const lines = text.split('\n');
        const errors: IParseError[] = [];
        const warnings: IParseError[] = [];

        try {
            // 使用 yaml 库解析
            const astDocument = yaml.parseDocument(text, {
                strict: false,
                prettyErrors: true
            });

            // 处理解析错误
            if (astDocument.errors && astDocument.errors.length > 0) {
                for (const error of astDocument.errors) {
                    errors.push(this.createParseError(error, document, 'error'));
                }
            }

            // 处理解析警告
            if (astDocument.warnings && astDocument.warnings.length > 0) {
                for (const warning of astDocument.warnings) {
                    warnings.push(this.createParseError(warning, document, 'warning'));
                }
            }

            // 如果有致命错误，返回失败结果
            if (errors.length > 0) {
                timer?.stop({ success: 'true', hasErrors: 'true' });
                return {
                    success: false,
                    data: undefined,
                    positionMap: new Map(),
                    errors,
                    warnings,
                    version: document.version,
                    uri: document.uri.toString(),
                    text,
                    lines
                };
            }

            // 转换为 JavaScript 对象
            const data = astDocument.toJS();

            // 构建位置映射
            const positionMap = this.buildPositionMap(astDocument, document);

            timer?.stop({ success: 'true', hasErrors: 'false' });
            return {
                success: true,
                data,
                positionMap,
                errors,
                warnings,
                version: document.version,
                uri: document.uri.toString(),
                text,
                lines
            };

        } catch (error) {
            this.logger.error('YAML parse error', error as Error);
            timer?.stop({ success: 'false', error: (error as Error).message });

            errors.push({
                message: `YAML parse error: ${(error as Error).message}`,
                range: new Range(0, 0, 0, 1),
                severity: 'error',
                code: 'yaml_parse_error'
            });

            return {
                success: false,
                data: undefined,
                positionMap: new Map(),
                errors,
                warnings,
                version: document.version,
                uri: document.uri.toString(),
                text,
                lines
            };
        }
    }

    /**
     * 构建位置映射
     */
    private buildPositionMap(
        astDocument: yaml.Document.Parsed,
        document: TextDocument
    ): Map<string, IPositionInfo> {
        const positionMap = new Map<string, IPositionInfo>();

        const visitNode = (node: yaml.Node | null, path: string[] = [], keyNode?: yaml.Node): void => {
            if (!node || !node.range) {
                return;
            }

            const pathKey = path.join('.');
            const [startOffset, endOffset] = node.range;

            try {
                const startPos = document.positionAt(startOffset);
                const endPos = document.positionAt(endOffset);
                const range = new Range(startPos, endPos);

                // 计算键名的范围
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
                this.logger.debug('Position out of range', { path: pathKey });
            }

            // 递归处理子节点
            if (yaml.isMap(node)) {
                for (const item of node.items) {
                    if (item.key && yaml.isScalar(item.key)) {
                        // 使用原始文本获取键名，避免数字格式化问题
                        let key: string;
                        if (item.key.range) {
                            const [keyStart, keyEnd] = item.key.range;
                            key = document.getText(new Range(
                                document.positionAt(keyStart),
                                document.positionAt(keyEnd)
                            ));
                        } else {
                            key = String(item.key.value);
                        }
                        const currentPath = [...path, key];

                        if (item.value) {
                            visitNode(item.value as yaml.Node, currentPath, item.key as yaml.Node);
                        } else if (item.key.range) {
                            // 处理空值
                            this.addEmptyValuePosition(
                                positionMap,
                                document,
                                item.key as yaml.Scalar,
                                currentPath
                            );
                        }
                    }
                }
            } else if (yaml.isSeq(node)) {
                node.items.forEach((item, index) => {
                    if (item) {
                        visitNode(item as yaml.Node, [...path, String(index)]);
                    }
                });
            }
        };

        visitNode(astDocument.contents as yaml.Node, []);

        return positionMap;
    }

    /**
     * 添加空值的位置信息
     */
    private addEmptyValuePosition(
        positionMap: Map<string, IPositionInfo>,
        document: TextDocument,
        keyNode: yaml.Scalar,
        path: string[]
    ): void {
        if (!keyNode.range) {
            return;
        }

        try {
            const [keyStart, keyEnd] = keyNode.range;
            const keyStartPos = document.positionAt(keyStart);
            const keyEndPos = document.positionAt(keyEnd);
            const keyRange = new Range(keyStartPos, keyEndPos);

            // 查找冒号位置
            const line = document.lineAt(keyEndPos.line);
            const lineText = line.text;
            const colonIndex = lineText.indexOf(':', keyEndPos.character);

            let colonRange: Range;
            if (colonIndex !== -1) {
                const colonPos = new Position(keyEndPos.line, colonIndex);
                const colonEndPos = new Position(keyEndPos.line, colonIndex + 1);
                colonRange = new Range(colonPos, colonEndPos);
            } else {
                colonRange = new Range(keyEndPos, new Position(keyEndPos.line, keyEndPos.character + 1));
            }

            const pathKey = path.join('.');
            positionMap.set(pathKey, {
                start: colonRange.start,
                end: colonRange.end,
                range: colonRange,
                keyRange
            });
        } catch (error) {
            this.logger.debug('Failed to add empty value position', { path: path.join('.') });
        }
    }

    /**
     * 创建解析错误
     */
    private createParseError(
        error: yaml.YAMLError | yaml.YAMLWarning,
        document: TextDocument,
        severity: 'error' | 'warning'
    ): IParseError {
        let range: Range;

        if (error.pos && error.pos.length === 2) {
            const [startOffset, endOffset] = error.pos;
            const startPos = document.positionAt(startOffset);
            const endPos = document.positionAt(endOffset);

            // 如果范围太小，扩展到有意义的范围
            const rangeLength = endOffset - startOffset;
            if (rangeLength <= 1) {
                range = this.expandRange(document, startPos);
            } else {
                range = new Range(startPos, endPos);
            }
        } else {
            range = new Range(0, 0, 0, 1);
        }

        return {
            message: error.message,
            range,
            severity,
            code: severity === 'error' ? 'yaml_syntax_error' : 'yaml_warning'
        };
    }

    /**
     * 扩展范围
     */
    private expandRange(document: TextDocument, startPos: Position): Range {
        const line = document.lineAt(startPos.line);
        const lineText = line.text;

        // 尝试找到当前位置所在的单词
        const wordRange = document.getWordRangeAtPosition(startPos, /[\w\-._]+:?/);
        if (wordRange && !wordRange.isEmpty) {
            return wordRange;
        }

        // 扩展到该行的非空白内容
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

        return new Range(startPos, line.range.end);
    }

    /**
     * 创建空的解析结果
     */
    private createEmptyParsedDocument(document: TextDocument): IParsedDocument {
        const text = document.getText();
        return {
            success: false,
            data: undefined,
            positionMap: new Map(),
            errors: [],
            warnings: [],
            version: document.version,
            uri: document.uri.toString(),
            text,
            lines: text.split('\n')
        };
    }

    /**
     * 设置缓存（LRUCache 自动处理淘汰）
     */
    private setCache(uri: string, parsed: IParsedDocument): void {
        this.cache.set(uri, parsed);
    }
}
