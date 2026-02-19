/**
 * 字符串工具函数
 *
 * 提供常用的字符串处理功能，包括转义、缩进计算、大小写不敏感比较等。
 */

/**
 * 转义正则表达式特殊字符
 *
 * 将字符串中的正则表达式特殊字符进行转义，使其可以安全用于正则表达式中。
 *
 * @param str - 需要转义的字符串
 * @returns 转义后的字符串
 *
 * @example
 * ```typescript
 * escapeRegExp('hello.world'); // 'hello\\.world'
 * escapeRegExp('[test]'); // '\\[test\\]'
 * ```
 */
export function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 获取字符串的缩进级别
 *
 * 计算字符串开头的空白字符数量（空格或制表符）。
 *
 * @param line - 要分析的行文本
 * @param tabSize - 制表符的等效空格数，默认为 2
 * @returns 缩进级别（空格数）
 *
 * @example
 * ```typescript
 * getIndentLevel('  hello'); // 2
 * getIndentLevel('\thello', 4); // 4
 * getIndentLevel('    hello'); // 4
 * ```
 */
export function getIndentLevel(line: string, tabSize: number = 2): number {
    let indent = 0;
    for (const char of line) {
        if (char === ' ') {
            indent++;
        } else if (char === '\t') {
            indent += tabSize;
        } else {
            break;
        }
    }
    return indent;
}

/**
 * 获取字符串开头的缩进字符
 *
 * 提取字符串开头的所有空白字符（空格和制表符）。
 *
 * @param line - 要分析的行文本
 * @returns 缩进字符串
 *
 * @example
 * ```typescript
 * getIndentString('  hello'); // '  '
 * getIndentString('\t\thello'); // '\t\t'
 * ```
 */
export function getIndentString(line: string): string {
    const match = line.match(/^[\s\t]*/);
    return match ? match[0] : '';
}

/**
 * 忽略大小写的前缀检查
 *
 * @param str - 要检查的字符串
 * @param prefix - 前缀字符串
 * @returns 是否以指定前缀开头（忽略大小写）
 *
 * @example
 * ```typescript
 * startsWithIgnoreCase('Hello World', 'hello'); // true
 * startsWithIgnoreCase('Hello World', 'HELLO'); // true
 * ```
 */
export function startsWithIgnoreCase(str: string, prefix: string): boolean {
    return str.toLowerCase().startsWith(prefix.toLowerCase());
}

/**
 * 忽略大小写的包含检查
 *
 * @param str - 要检查的字符串
 * @param search - 要搜索的子字符串
 * @returns 是否包含指定子字符串（忽略大小写）
 *
 * @example
 * ```typescript
 * includesIgnoreCase('Hello World', 'WORLD'); // true
 * includesIgnoreCase('Hello World', 'test'); // false
 * ```
 */
export function includesIgnoreCase(str: string, search: string): boolean {
    return str.toLowerCase().includes(search.toLowerCase());
}

/**
 * 安全的字符串修剪
 *
 * 安全地去除字符串两端的空白字符，处理 null 和 undefined。
 *
 * @param str - 要修剪的字符串（可能为 null 或 undefined）
 * @param defaultValue - 默认值，默认为空字符串
 * @returns 修剪后的字符串或默认值
 *
 * @example
 * ```typescript
 * safeTrim('  hello  '); // 'hello'
 * safeTrim(null); // ''
 * safeTrim(undefined, 'default'); // 'default'
 * ```
 */
export function safeTrim(str: string | null | undefined, defaultValue: string = ''): string {
    if (str === null || str === undefined) {
        return defaultValue;
    }
    return str.trim();
}

/**
 * 截断字符串
 *
 * 将字符串截断到指定长度，超出部分用省略号替换。
 *
 * @param str - 要截断的字符串
 * @param maxLength - 最大长度（包括省略号）
 * @param suffix - 省略号后缀，默认为 '...'
 * @returns 截断后的字符串
 *
 * @example
 * ```typescript
 * truncate('Hello World', 8); // 'Hello...'
 * truncate('Hi', 10); // 'Hi'
 * truncate('Hello World', 8, '…'); // 'Hello W…'
 * ```
 */
export function truncate(str: string, maxLength: number, suffix: string = '...'): string {
    if (str.length <= maxLength) {
        return str;
    }
    return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * 将字符串转换为 kebab-case
 *
 * @param str - 要转换的字符串
 * @returns kebab-case 格式的字符串
 *
 * @example
 * ```typescript
 * toKebabCase('helloWorld'); // 'hello-world'
 * toKebabCase('HelloWorld'); // 'hello-world'
 * toKebabCase('hello_world'); // 'hello-world'
 * ```
 */
export function toKebabCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
}

/**
 * 将字符串转换为 camelCase
 *
 * @param str - 要转换的字符串
 * @returns camelCase 格式的字符串
 *
 * @example
 * ```typescript
 * toCamelCase('hello-world'); // 'helloWorld'
 * toCamelCase('hello_world'); // 'helloWorld'
 * toCamelCase('Hello World'); // 'helloWorld'
 * ```
 */
export function toCamelCase(str: string): string {
    return str
        .replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '')
        .replace(/^[A-Z]/, char => char.toLowerCase());
}

/**
 * 将字符串转换为 PascalCase
 *
 * @param str - 要转换的字符串
 * @returns PascalCase 格式的字符串
 *
 * @example
 * ```typescript
 * toPascalCase('hello-world'); // 'HelloWorld'
 * toPascalCase('hello_world'); // 'HelloWorld'
 * ```
 */
export function toPascalCase(str: string): string {
    const camel = toCamelCase(str);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * 检查字符串是否为空或仅包含空白字符
 *
 * @param str - 要检查的字符串
 * @returns 是否为空或仅包含空白字符
 *
 * @example
 * ```typescript
 * isBlank(''); // true
 * isBlank('   '); // true
 * isBlank(null); // true
 * isBlank('hello'); // false
 * ```
 */
export function isBlank(str: string | null | undefined): boolean {
    return str === null || str === undefined || str.trim().length === 0;
}

/**
 * 检查字符串是否不为空且包含非空白字符
 *
 * @param str - 要检查的字符串
 * @returns 是否不为空且包含非空白字符
 */
export function isNotBlank(str: string | null | undefined): str is string {
    return !isBlank(str);
}

/**
 * 重复字符串指定次数
 *
 * @param str - 要重复的字符串
 * @param count - 重复次数
 * @returns 重复后的字符串
 *
 * @example
 * ```typescript
 * repeat('ab', 3); // 'ababab'
 * repeat(' ', 4); // '    '
 * ```
 */
export function repeat(str: string, count: number): string {
    if (count < 0) {
        return '';
    }
    return str.repeat(count);
}

/**
 * 生成指定长度的缩进字符串
 *
 * @param level - 缩进级别
 * @param indentChar - 缩进字符，默认为两个空格
 * @returns 缩进字符串
 *
 * @example
 * ```typescript
 * createIndent(2); // '    '
 * createIndent(1, '\t'); // '\t'
 * ```
 */
export function createIndent(level: number, indentChar: string = '  '): string {
    return repeat(indentChar, level);
}

/**
 * 移除字符串中的引号（单引号或双引号）
 *
 * @param str - 要处理的字符串
 * @returns 移除引号后的字符串
 *
 * @example
 * ```typescript
 * removeQuotes('"hello"'); // 'hello'
 * removeQuotes("'world'"); // 'world'
 * removeQuotes('hello'); // 'hello'
 * ```
 */
export function removeQuotes(str: string): string {
    const trimmed = str.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

/**
 * 简化文件路径显示
 *
 * 保留路径的最后几级目录，前面用省略号替代。
 *
 * @param absolutePath - 绝对路径
 * @param maxParts - 保留的最大路径段数，默认为 3
 * @returns 简化后的路径
 *
 * @example
 * ```typescript
 * getRelativePath('/home/user/project/src/file.ts'); // '.../project/src/file.ts'
 * getRelativePath('src/file.ts'); // 'src/file.ts'
 * ```
 */
export function getRelativePath(absolutePath: string, maxParts: number = 3): string {
    const parts = absolutePath.split(/[/\\]/);
    return parts.length > maxParts ? '...' + parts.slice(-maxParts).join('/') : parts.join('/');
}

/**
 * 从行前缀中提取补全前缀
 *
 * 使用正则表达式从光标前的文本中提取当前正在输入的标识符。
 *
 * @param linePrefix - 光标前的行文本
 * @param pattern - 匹配模式，默认为标识符字符
 * @returns 提取的前缀字符串
 *
 * @example
 * ```typescript
 * extractCompletionPrefix('  template: my-tem'); // 'my-tem'
 * extractCompletionPrefix('  id: ns:item', /[a-zA-Z0-9_:/-]+$/); // 'ns:item'
 * ```
 */
export function extractCompletionPrefix(linePrefix: string, pattern: RegExp = /[a-zA-Z0-9_-]+$/): string {
    const match = linePrefix.match(pattern);
    return match ? match[0] : '';
}

/**
 * 统计子字符串出现次数
 *
 * @param str - 要搜索的字符串
 * @param search - 要统计的子字符串
 * @returns 出现次数
 *
 * @example
 * ```typescript
 * countOccurrences('hello world', 'l'); // 3
 * countOccurrences('aaa', 'aa'); // 2 (重叠计数)
 * ```
 */
export function countOccurrences(str: string, search: string): number {
    if (search.length === 0) {
        return 0;
    }
    let count = 0;
    let pos = 0;
    while ((pos = str.indexOf(search, pos)) !== -1) {
        count++;
        pos += 1; // 允许重叠
    }
    return count;
}
