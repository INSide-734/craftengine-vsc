import { EditorPosition, EditorRange, EditorTextDocument } from '../types/EditorTypes';

/**
 * 位置信息接口
 *
 * 存储 YAML 节点在文档中的位置信息
 */
export interface IPositionInfo {
    /** 起始位置 */
    start: EditorPosition;
    /** 结束位置 */
    end: EditorPosition;
    /** 完整范围 */
    range: EditorRange;
    /** 键名的范围（用于更精确的错误定位） */
    keyRange?: EditorRange;
}

/**
 * 解析错误接口
 */
export interface IParseError {
    /** 错误消息 */
    message: string;
    /** 错误范围 */
    range: EditorRange;
    /** 错误严重程度 */
    severity: 'error' | 'warning';
    /** 错误代码 */
    code?: string;
}

/**
 * 已解析文档接口
 *
 * 表示一个已解析的 YAML 文档，包含：
 * - 解析后的 JavaScript 对象
 * - 位置映射（路径 -> 位置信息）
 * - 解析错误和警告
 * - 原始 AST（可选）
 *
 * 此接口用于在多个诊断提供者之间共享解析结果，
 * 避免重复解析同一文档。
 *
 * @example
 * ```typescript
 * const parsedDoc = await documentParseCache.getParsedDocument(document);
 * if (parsedDoc.success) {
 *     const data = parsedDoc.data;
 *     const position = parsedDoc.positionMap.get('items.my-item');
 * }
 * ```
 */
export interface IParsedDocument {
    /** 解析是否成功（无致命错误） */
    success: boolean;

    /** 解析后的 JavaScript 对象 */
    data?: unknown;

    /** 位置映射：YAML 路径 -> 位置信息 */
    positionMap: Map<string, IPositionInfo>;

    /** 解析错误列表 */
    errors: IParseError[];

    /** 解析警告列表 */
    warnings: IParseError[];

    /** 文档版本号（用于缓存验证） */
    version: number;

    /** 文档 URI */
    uri: string;

    /** 原始文本内容 */
    text: string;

    /** 文档行数组（用于快速行访问） */
    lines: string[];
}

/**
 * 文档解析缓存接口
 *
 * 提供文档解析结果的缓存服务，避免重复解析。
 *
 * @example
 * ```typescript
 * const cache = ServiceContainer.getService<IDocumentParseCache>(
 *     SERVICE_TOKENS.DocumentParseCache
 * );
 *
 * // 获取解析结果（自动缓存）
 * const parsed = await cache.getParsedDocument(document);
 *
 * // 清除特定文档的缓存
 * cache.clearCache(document.uri);
 * ```
 */
export interface IDocumentParseCache {
    /**
     * 获取文档的解析结果
     *
     * 如果缓存中存在且版本匹配，直接返回缓存结果；
     * 否则重新解析并缓存。
     *
     * @param document 要解析的文档
     * @returns 解析结果
     */
    getParsedDocument(document: EditorTextDocument): Promise<IParsedDocument>;

    /**
     * 清除特定文档的缓存
     *
     * @param uri 文档 URI
     */
    clearCache(uri: string): void;

    /**
     * 清除所有缓存
     */
    clearAllCaches(): void;

    /**
     * 获取缓存统计信息
     */
    getStats(): {
        /** 缓存条目数 */
        size: number;
        /** 缓存命中次数 */
        hits: number;
        /** 缓存未命中次数 */
        misses: number;
        /** 命中率 */
        hitRate: number;
    };
}
