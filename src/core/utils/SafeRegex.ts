import { LRUCache } from './LRUCache';

/** 安全正则编译缓存 */
const regexCache = new LRUCache<string, RegExp | null>(200);

/**
 * 安全编译正则表达式（带长度限制、嵌套量词检测和缓存）
 *
 * 用于编译来自 Schema patternProperties 等外部来源的正则表达式。
 * 不安全的模式返回 null 而非回退，避免错误匹配。
 *
 * @param pattern - 正则表达式模式字符串
 * @param maxLength - 最大允许长度，默认 200
 * @returns 编译后的 RegExp，如果不安全则返回 null
 */
export function safeCompileRegex(pattern: string, maxLength: number = 200): RegExp | null {
    const cached = regexCache.get(pattern);
    if (cached !== undefined) {
        return cached;
    }

    // 长度限制，防止过长的正则表达式
    if (pattern.length > maxLength) {
        regexCache.set(pattern, null);
        return null;
    }

    // 检测嵌套量词（ReDoS 常见模式）
    // 例如: (a+)+, (a*)*, (a+|b+)+ 等
    if (/(\+|\*|\{)\s*\)(\+|\*|\{|\?)/.test(pattern)) {
        regexCache.set(pattern, null);
        return null;
    }

    try {
        const regex = new RegExp(pattern);
        regexCache.set(pattern, regex);
        return regex;
    } catch {
        regexCache.set(pattern, null);
        return null;
    }
}

/**
 * 清除安全正则缓存
 *
 * 主要用于测试场景。
 */
export function clearSafeRegexCache(): void {
    regexCache.clear();
}
