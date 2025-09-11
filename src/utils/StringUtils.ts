/**
 * 字符串处理工具类
 * 
 * 提供通用的字符串处理功能，包括缩进计算、正则表达式转义等。
 */
export class StringUtils {
    /**
     * 计算文本行的缩进级别
     * 
     * @param text - 要计算缩进的文本行
     * @returns 缩进级别（空格或制表符的数量）
     */
    static getIndentLevel(text: string): number {
        if (!text) {
            return 0;
        }
        
        const match = text.match(/^(\s*)/);
        return match ? match[1].length : 0;
    }

    /**
     * 转义正则表达式中的特殊字符
     * 
     * @param string - 需要转义的字符串
     * @returns 转义后的字符串
     */
    static escapeRegExp(string: string): string {
        if (!string) {
            return '';
        }
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 检查字符串是否以指定前缀开头（忽略大小写）
     * 
     * @param str - 要检查的字符串
     * @param prefix - 前缀字符串
     * @returns 如果以前缀开头则返回 true
     */
    static startsWithIgnoreCase(str: string, prefix: string): boolean {
        if (!str || !prefix) {
            return false;
        }
        return str.toLowerCase().startsWith(prefix.toLowerCase());
    }

    /**
     * 检查字符串是否包含指定子字符串（忽略大小写）
     * 
     * @param str - 要检查的字符串
     * @param substring - 子字符串
     * @returns 如果包含子字符串则返回 true
     */
    static includesIgnoreCase(str: string, substring: string): boolean {
        if (!str || !substring) {
            return false;
        }
        return str.toLowerCase().includes(substring.toLowerCase());
    }

    /**
     * 提取字符串前面的缩进字符
     * 
     * @param text - 文本行
     * @returns 缩进字符串
     */
    static getIndentString(text: string): string {
        if (!text) {
            return '';
        }
        
        const match = text.match(/^(\s*)/);
        return match ? match[1] : '';
    }

    /**
     * 移除字符串前后的空白字符
     * 
     * @param str - 要处理的字符串
     * @returns 处理后的字符串
     */
    static safeTrim(str: string | null | undefined): string {
        return str?.trim() || '';
    }
}
