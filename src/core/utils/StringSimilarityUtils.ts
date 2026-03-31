/**
 * 字符串相似度工具函数
 *
 * 提供字符串相似度计算和模糊匹配功能，包括 Levenshtein 距离、相似度计算、
 * 查找相似项等。用于诊断提示、代码补全建议等场景。
 */

/**
 * 计算 Levenshtein 编辑距离
 *
 * Levenshtein 距离是两个字符串之间的最小编辑操作次数，
 * 包括插入、删除和替换单个字符。
 *
 * @param s1 - 第一个字符串
 * @param s2 - 第二个字符串
 * @returns 编辑距离
 *
 * @remarks
 * 时间复杂度：O(m * n)，其中 m 和 n 分别为两个字符串的长度。
 * 空间复杂度：O(n)，使用滚动数组优化。
 *
 * @example
 * ```typescript
 * levenshteinDistance('kitten', 'sitting'); // 3
 * levenshteinDistance('hello', 'hallo'); // 1
 * levenshteinDistance('', 'abc'); // 3
 * ```
 */
export function levenshteinDistance(s1: string, s2: string): number {
    if (s1 === s2) {
        return 0;
    }

    if (s1.length === 0) {
        return s2.length;
    }

    if (s2.length === 0) {
        return s1.length;
    }

    // 使用滚动数组优化空间
    const costs: number[] = [];

    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else if (j > 0) {
                let newValue = costs[j - 1];
                if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                }
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) {
            costs[s2.length] = lastValue;
        }
    }

    return costs[s2.length];
}

/**
 * 计算两个字符串的相似度
 *
 * 基于 Levenshtein 距离计算相似度，返回 0-1 之间的值，
 * 1 表示完全相同，0 表示完全不同。
 *
 * @param s1 - 第一个字符串
 * @param s2 - 第二个字符串
 * @param caseSensitive - 是否区分大小写，默认为 false
 * @returns 相似度值（0-1）
 *
 * @example
 * ```typescript
 * calculateSimilarity('hello', 'hello'); // 1.0
 * calculateSimilarity('hello', 'hallo'); // 0.8
 * calculateSimilarity('abc', 'xyz'); // 0.0
 * calculateSimilarity('Hello', 'hello', false); // 1.0
 * ```
 */
export function calculateSimilarity(s1: string, s2: string, caseSensitive: boolean = false): number {
    if (!caseSensitive) {
        s1 = s1.toLowerCase();
        s2 = s2.toLowerCase();
    }

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) {
        return 1.0;
    }

    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
}

/**
 * 相似项搜索选项
 */
export interface IFindSimilarOptions {
    /** 最小相似度阈值，默认为 0.5 */
    threshold?: number;
    /** 返回的最大结果数，默认为 5 */
    maxResults?: number;
    /** 是否区分大小写，默认为 false */
    caseSensitive?: boolean;
}

/**
 * 相似项搜索结果
 */
export interface ISimilarityResult<T> {
    /** 原始项 */
    item: T;
    /** 用于比较的字符串 */
    value: string;
    /** 相似度分数 */
    similarity: number;
}

/**
 * 查找相似的字符串
 *
 * 在字符串数组中查找与目标字符串最相似的项。
 *
 * @param target - 目标字符串
 * @param candidates - 候选字符串数组
 * @param options - 搜索选项
 * @returns 按相似度降序排列的结果数组
 *
 * @example
 * ```typescript
 * const candidates = ['apple', 'banana', 'apricot', 'orange'];
 * findSimilarStrings('aple', candidates);
 * // [{ item: 'apple', value: 'apple', similarity: 0.8 }, ...]
 * ```
 */
export function findSimilarStrings(
    target: string,
    candidates: string[],
    options: IFindSimilarOptions = {},
): ISimilarityResult<string>[] {
    const { threshold = 0.5, maxResults = 5, caseSensitive = false } = options;

    const results: ISimilarityResult<string>[] = [];

    for (const candidate of candidates) {
        const similarity = calculateSimilarity(target, candidate, caseSensitive);
        if (similarity >= threshold) {
            results.push({
                item: candidate,
                value: candidate,
                similarity,
            });
        }
    }

    // 按相似度降序排序
    results.sort((a, b) => b.similarity - a.similarity);

    // 限制结果数量
    return results.slice(0, maxResults);
}

/**
 * 查找相似的项（泛型版本）
 *
 * 在项数组中查找与目标字符串最相似的项，支持自定义值提取函数。
 *
 * @param target - 目标字符串
 * @param candidates - 候选项数组
 * @param valueExtractor - 从候选项中提取用于比较的字符串的函数
 * @param options - 搜索选项
 * @returns 按相似度降序排列的结果数组
 *
 * @example
 * ```typescript
 * interface Item { id: string; name: string; }
 * const items: Item[] = [
 *   { id: '1', name: 'apple' },
 *   { id: '2', name: 'banana' }
 * ];
 * findSimilarItems('aple', items, item => item.name);
 * // [{ item: { id: '1', name: 'apple' }, value: 'apple', similarity: 0.8 }]
 * ```
 */
export function findSimilarItems<T>(
    target: string,
    candidates: T[],
    valueExtractor: (item: T) => string,
    options: IFindSimilarOptions = {},
): ISimilarityResult<T>[] {
    const { threshold = 0.5, maxResults = 5, caseSensitive = false } = options;

    const results: ISimilarityResult<T>[] = [];

    for (const candidate of candidates) {
        const value = valueExtractor(candidate);
        const similarity = calculateSimilarity(target, value, caseSensitive);
        if (similarity >= threshold) {
            results.push({
                item: candidate,
                value,
                similarity,
            });
        }
    }

    // 按相似度降序排序
    results.sort((a, b) => b.similarity - a.similarity);

    // 限制结果数量
    return results.slice(0, maxResults);
}

/**
 * 获取最佳匹配
 *
 * 在候选项中查找与目标字符串最相似的单个项。
 *
 * @param target - 目标字符串
 * @param candidates - 候选字符串数组
 * @param options - 搜索选项
 * @returns 最佳匹配结果，如果没有满足阈值的匹配则返回 null
 *
 * @example
 * ```typescript
 * const candidates = ['apple', 'banana', 'orange'];
 * getBestMatch('aple', candidates); // { item: 'apple', similarity: 0.8 }
 * getBestMatch('xyz', candidates); // null
 * ```
 */
export function getBestMatch(
    target: string,
    candidates: string[],
    options: Omit<IFindSimilarOptions, 'maxResults'> = {},
): ISimilarityResult<string> | null {
    const results = findSimilarStrings(target, candidates, {
        ...options,
        maxResults: 1,
    });
    return results.length > 0 ? results[0] : null;
}

/**
 * 计算前缀匹配分数
 *
 * 基于前缀匹配的相似度计算，适用于自动补全场景。
 *
 * @param input - 用户输入
 * @param candidate - 候选字符串
 * @param caseSensitive - 是否区分大小写
 * @returns 匹配分数（0-1）
 *
 * @example
 * ```typescript
 * prefixMatchScore('app', 'apple'); // 1.0 (完全前缀匹配)
 * prefixMatchScore('apl', 'apple'); // 0.0 (不是前缀)
 * ```
 */
export function prefixMatchScore(input: string, candidate: string, caseSensitive: boolean = false): number {
    if (!input) {
        return 1.0;
    }

    const normalizedInput = caseSensitive ? input : input.toLowerCase();
    const normalizedCandidate = caseSensitive ? candidate : candidate.toLowerCase();

    if (normalizedCandidate.startsWith(normalizedInput)) {
        // 完全前缀匹配，分数为 1.0
        return 1.0;
    }

    // 检查是否是子序列匹配
    if (isSubsequence(normalizedInput, normalizedCandidate)) {
        // 子序列匹配，分数基于匹配字符的比例
        return normalizedInput.length / normalizedCandidate.length;
    }

    return 0;
}

/**
 * 检查是否为子序列
 *
 * 检查 needle 是否为 haystack 的子序列（字符顺序保持但不需要连续）。
 *
 * @param needle - 要查找的子序列
 * @param haystack - 被搜索的字符串
 * @returns 是否为子序列
 *
 * @example
 * ```typescript
 * isSubsequence('ace', 'abcde'); // true
 * isSubsequence('aec', 'abcde'); // false
 * ```
 */
export function isSubsequence(needle: string, haystack: string): boolean {
    let needleIndex = 0;

    for (let i = 0; i < haystack.length && needleIndex < needle.length; i++) {
        if (haystack[i] === needle[needleIndex]) {
            needleIndex++;
        }
    }

    return needleIndex === needle.length;
}

/**
 * 计算综合匹配分数
 *
 * 综合考虑前缀匹配和相似度的匹配分数，适用于智能补全排序。
 *
 * @param input - 用户输入
 * @param candidate - 候选字符串
 * @param prefixWeight - 前缀匹配权重，默认为 0.6
 * @param similarityWeight - 相似度权重，默认为 0.4
 * @returns 综合匹配分数（0-1）
 *
 * @example
 * ```typescript
 * calculateMatchScore('app', 'apple'); // 高分（前缀匹配）
 * calculateMatchScore('aple', 'apple'); // 中分（相似度匹配）
 * ```
 */
export function calculateMatchScore(
    input: string,
    candidate: string,
    prefixWeight: number = 0.6,
    similarityWeight: number = 0.4,
): number {
    const prefix = prefixMatchScore(input, candidate);
    const similarity = calculateSimilarity(input, candidate);

    return prefix * prefixWeight + similarity * similarityWeight;
}

/**
 * 转义正则表达式特殊字符
 *
 * 将字符串中的正则特殊字符转义，使其可安全用于 `new RegExp()` 构造。
 *
 * @param str - 需要转义的字符串
 * @returns 转义后的字符串
 *
 * @example
 * ```typescript
 * escapeRegExp('hello.world'); // 'hello\\.world'
 * escapeRegExp('a+b*c'); // 'a\\+b\\*c'
 * ```
 */
export function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 安全地创建正则表达式
 *
 * 对输入进行长度限制，防止 ReDoS 攻击。如果输入不是合法正则，
 * 则回退为字面量匹配。
 *
 * @param pattern - 正则模式字符串
 * @param flags - 正则标志
 * @param maxLength - 最大允许长度，默认 200
 * @returns 安全的 RegExp 实例
 */
export function safeRegExp(pattern: string, flags?: string, maxLength: number = 200): RegExp {
    // 限制模式长度，防止灾难性回溯
    const truncated = pattern.length > maxLength ? pattern.slice(0, maxLength) : pattern;
    try {
        return new RegExp(truncated, flags);
    } catch {
        // 无效正则，回退为字面量匹配
        return new RegExp(escapeRegExp(truncated), flags);
    }
}

/**
 * 按匹配分数过滤和排序候选项
 *
 * @param input - 用户输入
 * @param candidates - 候选字符串数组
 * @param minScore - 最小分数阈值，默认为 0.3
 * @returns 过滤并排序后的候选项数组
 *
 * @example
 * ```typescript
 * filterAndSort('app', ['apple', 'banana', 'application', 'orange']);
 * // ['apple', 'application']
 * ```
 */
export function filterAndSort(input: string, candidates: string[], minScore: number = 0.3): string[] {
    if (!input) {
        return [...candidates];
    }

    const scored = candidates
        .map((candidate) => ({
            candidate,
            score: calculateMatchScore(input, candidate),
        }))
        .filter((item) => item.score >= minScore)
        .sort((a, b) => b.score - a.score);

    return scored.map((item) => item.candidate);
}
