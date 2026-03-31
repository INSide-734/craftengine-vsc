/**
 * 工具类模块
 *
 * 提供项目通用的工具函数和类，包括：
 * - 字符串处理
 * - 对象操作
 * - 字符串相似度计算
 * - 缓存管理
 * - ID 生成
 * - 异步操作工具
 *
 * @module infrastructure/utils
 *
 * @example
 * ```typescript
 * import {
 *     // 字符串工具
 *     escapeRegExp,
 *     getIndentLevel,
 *     truncate,
 *
 *     // 对象工具
 *     getNestedValue,
 *     deepMerge,
 *
 *     // 相似度工具
 *     calculateSimilarity,
 *     findSimilarStrings,
 *
 *     // 缓存工具
 *     LRUCache,
 *     TTLCache,
 *
 *     // ID 生成
 *     generateEventId,
 *     generateUUID,
 *
 *     // 异步工具
 *     Debouncer,
 *     delay,
 *     retry
 * } from './infrastructure/utils';
 * ```
 */

// 字符串工具
export {
    escapeRegExp,
    getIndentLevel,
    getIndentString,
    startsWithIgnoreCase,
    includesIgnoreCase,
    safeTrim,
    truncate,
    toKebabCase,
    toCamelCase,
    toPascalCase,
    isBlank,
    isNotBlank,
    repeat,
    createIndent,
    removeQuotes,
    countOccurrences,
    getRelativePath,
    extractCompletionPrefix,
} from './StringUtils';

// 对象工具
export {
    getNestedValue,
    setNestedValue,
    deleteNestedValue,
    hasNestedPath,
    deepClone,
    deepMerge,
    isPlainObject,
    pick,
    omit,
    isEmpty,
    getAllPaths,
    unflatten,
    flatten,
} from './ObjectUtils';

// 字符串相似度工具
export {
    levenshteinDistance,
    calculateSimilarity,
    findSimilarStrings,
    findSimilarItems,
    getBestMatch,
    prefixMatchScore,
    isSubsequence,
    calculateMatchScore,
    filterAndSort,
} from './StringSimilarityUtils';

export type { IFindSimilarOptions, ISimilarityResult } from './StringSimilarityUtils';

// 缓存工具
export { LRUCache, TTLCache, StatsCache, getOrSet, getOrSetSync } from './CacheUtils';

export type { ICacheStats } from './CacheUtils';

// ID 生成工具
export {
    generateEventId,
    generateRandomId,
    generateUUID,
    generateShortId,
    generateTimestampId,
    generateSequenceId,
    IdGenerator,
    UniqueIdGenerator,
    getCurrentTimestamp,
    calculateUptime,
    formatDuration,
} from './IdGenerator';

// 异步工具
export {
    Debouncer,
    Throttler,
    delay,
    withTimeout,
    retry,
    ConcurrencyLimiter,
    batchAsync,
    debounce,
    throttle,
    createAsyncInitializer,
} from './AsyncUtils';

export type { IRetryOptions, IAsyncInitializer } from './AsyncUtils';
