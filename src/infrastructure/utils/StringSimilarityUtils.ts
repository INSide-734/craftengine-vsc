/**
 * 字符串相似度工具函数（向后兼容重导出）
 *
 * 实际实现已迁移至 Core 层，此处保留重导出以兼容现有导入路径。
 */
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
} from '../../core/utils/StringSimilarityUtils';

export type { IFindSimilarOptions, ISimilarityResult } from '../../core/utils/StringSimilarityUtils';
