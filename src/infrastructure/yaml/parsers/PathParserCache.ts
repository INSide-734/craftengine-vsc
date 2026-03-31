import type * as yaml from 'yaml';
import { LRUCache } from '../../utils/LRUCache';

/**
 * AST 缓存条目
 */
export interface IASTCacheEntry {
    /** 解析后的 YAML 文档 */
    doc: yaml.Document.Parsed;
    /** 文档版本 */
    version: number;
}

/**
 * 路径缓存条目
 */
export interface IPathCacheEntry {
    /** 解析后的路径 */
    path: string[];
    /** 文档版本 */
    version: number;
}

/**
 * 路径解析器缓存管理
 *
 * 负责管理 AST 缓存和路径缓存，使用 LRU 淘汰策略。
 *
 * @remarks
 * **缓存策略**：
 * - AST 缓存：按文档 URI 缓存解析后的 YAML 文档
 * - 路径缓存：按 uri:version:line 缓存解析后的路径
 * - 使用 LRU 淘汰策略，自动清理最少使用的缓存项
 *
 * **缓存键格式**：
 * - AST 缓存键：文档 URI 字符串
 * - 路径缓存键：`${uri}:${version}:${line}`
 *
 * @example
 * ```typescript
 * const cache = new PathParserCache(20, 100);
 *
 * // 缓存 AST
 * cache.setAST(uri, doc, version);
 *
 * // 获取 AST
 * const ast = cache.getAST(uri, version);
 *
 * // 缓存路径
 * cache.setPath(cacheKey, path, version);
 *
 * // 获取路径
 * const path = cache.getPath(cacheKey, version);
 * ```
 */
export class PathParserCache {
    /** AST 缓存（按文档 URI） */
    private readonly astCache: LRUCache<string, IASTCacheEntry>;
    /** 路径缓存（按 uri:version:line:character） */
    private readonly pathCache: LRUCache<string, IPathCacheEntry>;

    /**
     * 构造缓存管理器实例
     *
     * @param astCacheSize - AST 缓存容量
     * @param pathCacheSize - 路径缓存容量
     */
    constructor(astCacheSize: number, pathCacheSize: number) {
        this.astCache = new LRUCache<string, IASTCacheEntry>(astCacheSize);
        this.pathCache = new LRUCache<string, IPathCacheEntry>(pathCacheSize);
    }

    /**
     * 获取 AST 缓存
     *
     * @param uri - 文档 URI 字符串
     * @param version - 文档版本
     * @returns AST 文档，如果缓存不存在或版本不匹配则返回 undefined
     */
    getAST(uri: string, version: number): yaml.Document.Parsed | undefined {
        const cached = this.astCache.get(uri);
        if (cached && cached.version === version) {
            return cached.doc;
        }
        return undefined;
    }

    /**
     * 设置 AST 缓存
     *
     * @param uri - 文档 URI 字符串
     * @param doc - 解析后的 YAML 文档
     * @param version - 文档版本
     */
    setAST(uri: string, doc: yaml.Document.Parsed, version: number): void {
        this.astCache.set(uri, { doc, version });
    }

    /**
     * 获取路径缓存
     *
     * @param cacheKey - 缓存键（格式：uri:version:line）
     * @param version - 文档版本
     * @returns 路径数组，如果缓存不存在或版本不匹配则返回 undefined
     */
    getPath(cacheKey: string, version: number): string[] | undefined {
        const cached = this.pathCache.get(cacheKey);
        if (cached && cached.version === version) {
            return cached.path;
        }
        return undefined;
    }

    /**
     * 设置路径缓存
     *
     * @param cacheKey - 缓存键（格式：uri:version:line）
     * @param path - 路径数组
     * @param version - 文档版本
     */
    setPath(cacheKey: string, path: string[], version: number): void {
        this.pathCache.set(cacheKey, { path, version });
    }

    /**
     * 清空所有缓存
     */
    clear(): void {
        this.astCache.clear();
        this.pathCache.clear();
    }
}
