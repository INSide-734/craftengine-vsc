import { Uri, TextDocument, Position, Range } from 'vscode';
import * as yaml from 'yaml';
import { 
    IYamlParser, 
    IYamlParseOptions, 
    IStreamParseOptions, 
    IIncrementalParseContext 
} from '../../core/interfaces/IYamlParser';
import {
    IYamlDocument,
    IYamlParseResult,
    IYamlParseError
} from '../../core/interfaces/IYamlDocument';
import { ILogger } from '../../core/interfaces/ILogger';
import { YamlDocument, buildNodeTree, PositionMap } from './YamlDocument';

/**
 * YAML 解析器实现
 * 
 * 提供完整的 YAML 文档解析功能，支持标准解析、流式解析、增量解析和位置追踪。
 * 基于 `yaml` 库实现，提供了增强的位置信息和错误处理。
 * 
 * @remarks
 * 解析器特性：
 * - **标准解析**：一次性解析完整的 YAML 文本
 * - **位置追踪**：精确追踪每个节点在文档中的位置（行号、列号、范围）
 * - **流式解析**：支持大文件的分块解析，避免内存溢出
 * - **增量解析**：文档变更时只重新解析变更部分
 * - **错误处理**：详细的错误信息和位置
 * - **AST 构建**：构建完整的节点树结构
 * 
 * 位置追踪原理：
 * 1. 使用 `yaml.parseDocument` 获取 AST（抽象语法树）
 * 2. 遍历 AST 节点提取每个节点的位置信息（range）
 * 3. 将位置信息转换为 VSCode 的 Position 和 Range
 * 4. 构建路径到位置的映射表（PositionMap）
 * 5. 在节点树构建时附加位置信息
 * 
 * @example
 * ```typescript
 * const parser = new YamlParser(logger);
 * 
 * // 基本解析
 * const result = await parser.parseText(yamlContent, uri);
 * if (result.success) {
 *     console.log('Root node:', result.root);
 * } else {
 *     console.error('Parse errors:', result.errors);
 * }
 * 
 * // 带位置信息的解析
 * const result = await parser.parseText(yamlContent, uri, {
 *     keepPosition: true,
 *     strict: false
 * });
 * 
 * // 访问节点位置
 * if (result.root?.position) {
 *     console.log(`Root at line ${result.root.position.start.line}`);
 * }
 * 
 * // 解析 TextDocument
 * const document = vscode.window.activeTextEditor?.document;
 * if (document) {
 *     const result = await parser.parseDocument(document);
 * }
 * 
 * // 流式解析大文件
 * for await (const partialResult of parser.parseStream(largeYamlText, uri)) {
 *     console.log('Parsed chunk:', partialResult);
 * }
 * ```
 */
export class YamlParser implements IYamlParser {
    /**
     * 构造 YAML 解析器实例
     * 
     * @param logger - 日志记录器（可选），用于记录解析过程和错误
     */
    constructor(private readonly logger?: ILogger) {}

    /**
     * 构建行偏移数组（不分割字符串）
     *
     * 扫描文本中的换行符位置，返回每行起始偏移量。
     * 正确处理 LF 和 CRLF 换行符。
     *
     * @param text - 原始文本
     * @returns 行偏移数组和行数
     */
    private buildLineOffsets(text: string): { offsets: Uint32Array; lineCount: number } {
        // 预扫描换行符数量
        let newlineCount = 0;
        for (let i = 0; i < text.length; i++) {
            if (text.charCodeAt(i) === 10) { // \n
                newlineCount++;
            }
        }

        const lineCount = newlineCount + 1;
        const offsets = new Uint32Array(lineCount + 1);
        offsets[0] = 0;

        let lineIndex = 1;
        for (let i = 0; i < text.length; i++) {
            if (text.charCodeAt(i) === 10) { // \n
                offsets[lineIndex++] = i + 1;
            }
        }
        offsets[lineCount] = text.length;

        return { offsets, lineCount };
    }

    /**
     * 获取行长度（不含换行符）
     */
    private getLineLength(text: string, offsets: Uint32Array, lineIndex: number, lineCount: number): number {
        if (lineIndex < 0 || lineIndex >= lineCount) {
            return 0;
        }
        const start = offsets[lineIndex];
        let end = offsets[lineIndex + 1];
        if (end > start && text.charCodeAt(end - 1) === 10) { end--; }
        if (end > start && text.charCodeAt(end - 1) === 13) { end--; }
        return end - start;
    }

    /**
     * 解析文本内容
     * 
     * 将 YAML 格式的文本解析为结构化的文档对象。
     * 支持位置追踪、严格模式和自定义错误处理。
     * 
     * @param text - YAML 格式的文本内容
     * @param sourceFile - 源文件的 URI，用于错误报告和引用
     * @param options - 解析选项
     * @param options.keepPosition - 是否保留节点位置信息（默认：false）
     * @param options.strict - 是否启用严格模式（默认：false）
     * @param options.onError - 错误回调函数
     * @returns 解析结果，包含根节点、错误列表和元数据
     * 
     * @remarks
     * 解析流程：
     * 1. 如果启用 keepPosition，使用 yaml.parseDocument 获取 AST
     * 2. 从 AST 提取位置信息构建 PositionMap
     * 3. 将 YAML 对象转换为 JavaScript 对象
     * 4. 构建节点树，附加位置信息
     * 5. 返回完整的解析结果
     * 
     * 位置信息格式：
     * - start: Position(line, character) - 节点起始位置
     * - end: Position(line, character) - 节点结束位置
     * - range: Range(start, end) - 节点范围
     * 
     * 错误处理：
     * - 语法错误会被捕获并添加到 errors 列表
     * - 如果提供 onError 回调，会同时调用回调
     * - AST 解析失败时会回退到简单的 parse 模式
     * 
     * @example
     * ```typescript
     * // 基本解析
     * const result = await parser.parseText('key: value', uri);
     * console.log(result.root?.value); // { key: 'value' }
     * 
     * // 带位置信息
     * const result = await parser.parseText(yamlText, uri, {
     *     keepPosition: true
     * });
     * 
     * const keyNode = result.root?.children?.get('key');
     * if (keyNode?.position) {
     *     console.log(`Key at line ${keyNode.position.start.line}`);
     * }
     * 
     * // 严格模式（检测重复键等）
     * const result = await parser.parseText(yamlText, uri, {
     *     strict: true,
     *     onError: (error) => {
     *         console.error('Parse error:', error.message);
     *     }
     * });
     * ```
     */
    async parseText(
        text: string,
        sourceFile: Uri,
        options: IYamlParseOptions = {}
    ): Promise<IYamlParseResult> {
        const startTime = Date.now();
        const errors: IYamlParseError[] = [];
        // 使用行偏移数组代替 text.split('\n')，避免大文件时的内存分配
        const { offsets: lineOffsets, lineCount: totalLines } = this.buildLineOffsets(text);

        try {
            let parsed: unknown;
            let positionMap: PositionMap | undefined;

            // 如果需要位置信息，使用 parseDocument 获取 AST
            if (options.keepPosition) {
                try {
                    const astDocument = yaml.parseDocument(text, {
                        strict: options.strict ?? false
                    });
                    parsed = astDocument.toJS();

                    // 从 AST 构建位置映射（使用行偏移数组）
                    positionMap = this.buildPositionMapFromOffsets(astDocument, text, lineOffsets, totalLines);
                } catch (astError) {
                    // 如果 parseDocument 失败，回退到 parse
                    this.logger?.warn('Failed to parse with Document API, falling back to parse', {
                        error: astError instanceof Error ? astError.message : String(astError)
                    });
                    const parseOptions: yaml.ParseOptions = {
                        strict: options.strict ?? false
                    };
                    parsed = yaml.parse(text, parseOptions);
                }
            } else {
                // 不需要位置信息，使用简单的 parse
                const parseOptions: yaml.ParseOptions = {
                    strict: options.strict ?? false
                };
                parsed = yaml.parse(text, parseOptions);
            }

            // 构建节点树（传入位置映射）
            const root = buildNodeTree(parsed, [], undefined, undefined, positionMap);

            const result: IYamlParseResult = {
                root,
                errors,
                success: true,
                metadata: {
                    sourceFile,
                    totalLines,
                    parsedAt: new Date()
                }
            };

            this.logger?.debug('YAML parsed successfully', {
                file: sourceFile.fsPath,
                lines: result.metadata.totalLines,
                duration: Date.now() - startTime
            });

            return result;

        } catch (error) {
            const parseError: IYamlParseError = {
                message: error instanceof Error ? error.message : String(error),
                severity: 'error',
                code: 'parse_error'
            };

            errors.push(parseError);
            
            if (options.onError) {
                options.onError(parseError);
            }

            this.logger?.error('YAML parsing failed', error as Error, {
                file: sourceFile.fsPath
            });

            return {
                root: null,
                errors,
                success: false,
                metadata: {
                    sourceFile,
                    totalLines,
                    parsedAt: new Date()
                }
            };
        }
    }

    /**
     * 解析 VSCode 文档
     */
    async parseDocument(
        document: TextDocument,
        options: IYamlParseOptions = {}
    ): Promise<IYamlParseResult> {
        return this.parseText(document.getText(), document.uri, options);
    }

    /**
     * 流式解析文本内容
     */
    async *parseStream(
        text: string,
        sourceFile: Uri,
        options: IStreamParseOptions = {}
    ): AsyncIterableIterator<IYamlParseResult> {
        const chunkSize = options.chunkSize || 1024 * 10; // 默认 10KB
        const totalLength = text.length;
        let processed = 0;

        // 对于流式解析，我们采用分块解析策略
        // 由于 YAML 是结构化格式，我们需要找到合适的断点
        const lines = text.split('\n');
        const totalLines = lines.length;
        const linesPerChunk = Math.max(1, Math.floor(totalLines / (totalLength / chunkSize)));

        let currentChunk: string[] = [];
        let lineIndex = 0;

        while (lineIndex < totalLines) {
            // 收集一个块的行
            const chunkEnd = Math.min(lineIndex + linesPerChunk, totalLines);
            currentChunk.push(...lines.slice(lineIndex, chunkEnd));
            
            processed += lines.slice(lineIndex, chunkEnd).join('\n').length;
            lineIndex = chunkEnd;

            // 尝试解析当前块
            const chunkText = currentChunk.join('\n');
            
            try {
                // 尝试解析（可能不完整）
                const partialResult = await this.parseText(chunkText, sourceFile, {
                    ...options,
                    strict: false // 流式解析时允许不完整
                });

                // 报告进度
                if (options.onProgress) {
                    options.onProgress({
                        processed,
                        total: totalLength,
                        percentage: (processed / totalLength) * 100
                    });
                }

                yield partialResult;

            } catch (error) {
                // 如果解析失败，继续下一个块
                this.logger?.warn('Stream parsing chunk failed', {
                    chunk: lineIndex,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        // 最后解析完整文档
        const finalResult = await this.parseText(text, sourceFile, options);
        yield finalResult;
    }

    /**
     * 增量解析文档
     *
     * 当文档版本未变时返回缓存结果，否则执行全量解析。
     *
     * @remarks
     * 当前实现不做真正的局部解析，仅利用版本号避免重复解析。
     * 未来可在此基础上实现基于顶层键的局部解析优化。
     */
    async parseIncremental(
        document: TextDocument,
        context: IIncrementalParseContext,
        options: IYamlParseOptions = {}
    ): Promise<IYamlParseResult> {
        // 版本未变，返回缓存结果
        if (document.version === context.lastVersion && context.lastResult) {
            return context.lastResult;
        }

        return this.parseDocument(document, options);
    }

    /**
     * 创建 YAML 文档对象
     */
    createDocument(
        parseResult: IYamlParseResult,
        content: string
    ): IYamlDocument {
        return new YamlDocument(parseResult.metadata.sourceFile, content, parseResult);
    }

    /**
     * 从 YAML AST 文档构建位置映射（使用行偏移数组，避免 split）
     *
     * @param astDocument YAML AST 文档
     * @param text 原始文本
     * @param offsets 行偏移数组
     * @param lineCount 总行数
     * @returns 位置映射
     */
    private buildPositionMapFromOffsets(
        astDocument: yaml.Document,
        text: string,
        offsets: Uint32Array,
        lineCount: number
    ): PositionMap {
        const positionMap: PositionMap = new Map();

        if (!astDocument.contents) {
            return positionMap;
        }

        const getLineStartOffset = (lineIndex: number): number => {
            return lineIndex < offsets.length ? offsets[lineIndex] : offsets[offsets.length - 1];
        };

        const convertRange = (range: [number, number, number, number]): {
            start: Position;
            end: Position;
            range: Range;
        } => {
            const startLine = Math.max(0, range[0] - 1);
            const endLine = Math.max(0, range[1] - 1);

            const lineStartOffset = getLineStartOffset(startLine);
            const lineEndOffset = getLineStartOffset(endLine);

            let startChar = 0;
            let endChar = 0;

            if (startLine < lineCount) {
                startChar = Math.max(0, range[2] - lineStartOffset);
            }

            if (endLine < lineCount) {
                endChar = Math.max(0, range[3] - lineEndOffset);
            } else if (endLine >= lineCount) {
                endChar = this.getLineLength(text, offsets, lineCount - 1, lineCount);
            }

            const start = new Position(startLine, startChar);
            const end = new Position(endLine, endChar);
            const rangeObj = new Range(start, end);

            return { start, end, range: rangeObj };
        };

        const getNodeValue = (node: yaml.Node): string | number | undefined => {
            if (yaml.isScalar(node)) {
                const value = node.value;
                if (typeof value === 'string' || typeof value === 'number') {
                    return value;
                }
            }
            return undefined;
        };

        const visitNode = (astNode: yaml.Node, path: (string | number)[] = []): void => {
            if (!astNode || !astNode.range) {
                return;
            }

            const range = astNode.range;
            const pathKey = path.length > 0 ? path.join('.') : 'root';

            const rangeArray = Array.isArray(range)
                ? range
                : [range[0], range[1], range[2], range[3] as number];

            if (rangeArray.length >= 4 &&
                typeof rangeArray[0] === 'number' &&
                typeof rangeArray[1] === 'number' &&
                typeof rangeArray[2] === 'number' &&
                typeof rangeArray[3] === 'number') {
                const position = convertRange([
                    rangeArray[0],
                    rangeArray[1],
                    rangeArray[2],
                    rangeArray[3]
                ]);
                positionMap.set(pathKey, position);
            }

            if (yaml.isMap(astNode)) {
                const mapNode = astNode as yaml.YAMLMap;
                mapNode.items.forEach((item) => {
                    if (item && item.key && item.value) {
                        const keyValue = getNodeValue(item.key as yaml.Node);
                        if (keyValue !== undefined) {
                            visitNode(item.value as yaml.Node, [...path, keyValue]);
                        }
                    }
                });
            } else if (yaml.isSeq(astNode)) {
                const seqNode = astNode as yaml.YAMLSeq;
                seqNode.items.forEach((item, index) => {
                    if (item) {
                        visitNode(item as yaml.Node, [...path, index]);
                    }
                });
            }
        };

        visitNode(astDocument.contents, []);

        return positionMap;
    }
}

