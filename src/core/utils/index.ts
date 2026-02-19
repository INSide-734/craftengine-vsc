/**
 * 核心工具模块
 *
 * 提供可被 Domain 层直接使用的工具函数，避免 Domain → Infrastructure 依赖。
 */

export { generateEventId, generateRandomId } from './IdGenerator';
export { AsyncInitializer, createAsyncInitializer } from './AsyncInitializer';
export { deepFreeze } from './deepFreeze';

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
    escapeRegExp,
    safeRegExp
} from './StringSimilarityUtils';

export type {
    FindSimilarOptions,
    SimilarityResult
} from './StringSimilarityUtils';

// LRU 缓存
export { LRUCache } from './LRUCache';

// 防抖工具
export { Debouncer } from './Debouncer';
