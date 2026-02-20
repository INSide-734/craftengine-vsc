import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { type IDiagnosticIgnoreParser } from '../../core/interfaces/IDiagnosticProvider';

/**
 * 忽略文件名称列表（按优先级排序，靠前的优先级更高）
 * .craftignore 为项目专用忽略文件，.gitignore 作为低优先级回退
 */
const IGNORE_FILE_NAMES = ['.craftignore', '.gitignore'] as const;

/** 缓存条目 */
interface IgnoreCacheEntry {
    /** 规则列表 */
    rules: IgnoreRule[];
    /** 各忽略文件的修改时间（key 为文件名） */
    mtimes: Map<string, number>;
}

/** 解析后的忽略规则 */
interface IgnoreRule {
    /** 原始模式字符串 */
    pattern: string;
    /** 编译后的正则表达式 */
    regex: RegExp;
    /** 是否为否定规则（以 ! 开头） */
    negated: boolean;
    /** 是否仅匹配目录（以 / 结尾） */
    directoryOnly: boolean;
}

/**
 * 诊断忽略解析器
 *
 * 解析工作区中的 .craftignore 和 .gitignore 文件，判断特定文件是否应该跳过诊断检查。
 * .craftignore 规则优先级高于 .gitignore（.craftignore 的规则在后面，可覆盖 .gitignore）。
 * 支持 gitignore 风格的模式语法：
 * - `#` 开头为注释
 * - `!` 开头为否定规则（重新包含已忽略的文件）
 * - `*` 匹配任意字符（不含路径分隔符）
 * - `**` 匹配任意层级目录
 * - `?` 匹配单个字符
 * - `/` 结尾表示仅匹配目录
 * - 以 `/` 开头表示相对于 .craftignore 所在目录的路径
 */
export class DiagnosticIgnoreParser implements IDiagnosticIgnoreParser {
    /** 每个工作区文件夹的规则缓存（key 为文件夹 fsPath） */
    private readonly cache = new Map<string, IgnoreCacheEntry>();

    /**
     * 检查文件是否应该被忽略
     *
     * @param uri 文件 URI
     * @returns 如果文件应该被忽略返回 true，否则返回 false
     */
    isFileIgnored(uri: vscode.Uri): boolean {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder) {
            return false;
        }

        const rules = this.getRulesForFolder(workspaceFolder.uri.fsPath);
        if (rules.length === 0) {
            return false;
        }

        // 计算相对于工作区根目录的路径，统一使用正斜杠
        const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath).replace(/\\/g, '/');

        return this.matchRules(relativePath, rules);
    }

    /**
     * 清除缓存，强制下次重新读取 .craftignore 文件
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * 获取指定工作区文件夹的忽略规则（带缓存）
     *
     * 按优先级从低到高加载：.gitignore → .craftignore
     * .craftignore 的规则排在后面，因此可以覆盖 .gitignore 的规则。
     *
     * @param folderPath 工作区文件夹路径
     * @returns 解析后的忽略规则列表
     */
    private getRulesForFolder(folderPath: string): IgnoreRule[] {
        // 收集各忽略文件的 mtime，用于缓存校验
        const currentMtimes = new Map<string, number>();
        for (const fileName of IGNORE_FILE_NAMES) {
            const filePath = path.join(folderPath, fileName);
            try {
                const stat = fs.statSync(filePath);
                currentMtimes.set(fileName, stat.mtimeMs);
            } catch {
                // 文件不存在，跳过
            }
        }

        // 没有任何忽略文件
        if (currentMtimes.size === 0) {
            this.cache.delete(folderPath);
            return [];
        }

        // 检查缓存是否仍然有效
        const cached = this.cache.get(folderPath);
        if (cached && this.isCacheValid(cached.mtimes, currentMtimes)) {
            return cached.rules;
        }

        // 按优先级从低到高加载规则（.gitignore 先，.craftignore 后）
        const allRules: IgnoreRule[] = [];
        for (const fileName of [...IGNORE_FILE_NAMES].reverse()) {
            if (currentMtimes.has(fileName)) {
                const filePath = path.join(folderPath, fileName);
                const rules = this.parseIgnoreFile(filePath);
                allRules.push(...rules);
            }
        }

        this.cache.set(folderPath, { rules: allRules, mtimes: currentMtimes });
        return allRules;
    }

    /**
     * 检查缓存的 mtime 映射是否与当前一致
     */
    private isCacheValid(cached: Map<string, number>, current: Map<string, number>): boolean {
        if (cached.size !== current.size) {
            return false;
        }
        for (const [key, value] of cached) {
            if (current.get(key) !== value) {
                return false;
            }
        }
        return true;
    }

    /**
     * 解析 .craftignore 文件内容
     *
     * @param filePath .craftignore 文件路径
     * @returns 解析后的规则列表
     */
    private parseIgnoreFile(filePath: string): IgnoreRule[] {
        let content: string;
        try {
            content = fs.readFileSync(filePath, 'utf-8');
        } catch {
            return [];
        }

        const rules: IgnoreRule[] = [];

        for (const rawLine of content.split(/\r?\n/)) {
            const line = rawLine.trim();

            // 跳过空行和注释
            if (line === '' || line.startsWith('#')) {
                continue;
            }

            const rule = this.parseLine(line);
            if (rule) {
                rules.push(rule);
            }
        }

        return rules;
    }

    /**
     * 解析单行忽略规则
     *
     * @param line 去除首尾空白后的行内容
     * @returns 解析后的规则，如果无法解析则返回 undefined
     */
    private parseLine(line: string): IgnoreRule | undefined {
        let pattern = line;
        let negated = false;
        let directoryOnly = false;

        // 处理否定规则
        if (pattern.startsWith('!')) {
            negated = true;
            pattern = pattern.slice(1);
        }

        // 处理目录标记
        if (pattern.endsWith('/')) {
            directoryOnly = true;
            pattern = pattern.slice(0, -1);
        }

        if (pattern === '') {
            return undefined;
        }

        // 去除开头的斜杠（表示相对于根目录，但我们的相对路径已经是相对于根目录的）
        const anchored = pattern.startsWith('/');
        if (anchored) {
            pattern = pattern.slice(1);
        }

        const regex = this.patternToRegex(pattern, anchored);

        return { pattern: line, regex, negated, directoryOnly };
    }

    /**
     * 将 gitignore 风格的模式转换为正则表达式
     *
     * @param pattern 模式字符串
     * @param anchored 是否锚定到根目录
     * @returns 编译后的正则表达式
     */
    private patternToRegex(pattern: string, anchored: boolean): RegExp {
        let regexStr = '';

        // 如果模式中不包含斜杠且未锚定，则匹配任意目录层级下的文件名
        const containsSlash = pattern.includes('/');
        if (!containsSlash && !anchored) {
            regexStr += '(?:^|.*/)';
        } else {
            regexStr += '^';
        }

        let i = 0;
        while (i < pattern.length) {
            const char = pattern[i];

            if (char === '*') {
                if (pattern[i + 1] === '*') {
                    // ** 匹配
                    if (pattern[i + 2] === '/') {
                        // **/ 匹配零个或多个目录
                        regexStr += '(?:.*/)?';
                        i += 3;
                    } else {
                        // ** 在末尾，匹配所有内容
                        regexStr += '.*';
                        i += 2;
                    }
                } else {
                    // * 匹配除路径分隔符外的任意字符
                    regexStr += '[^/]*';
                    i += 1;
                }
            } else if (char === '?') {
                // ? 匹配单个非分隔符字符
                regexStr += '[^/]';
                i += 1;
            } else if (char === '[') {
                // 字符类，直接传递到正则
                const closeBracket = pattern.indexOf(']', i + 1);
                if (closeBracket !== -1) {
                    regexStr += pattern.slice(i, closeBracket + 1);
                    i = closeBracket + 1;
                } else {
                    regexStr += '\\[';
                    i += 1;
                }
            } else {
                // 转义正则特殊字符
                regexStr += this.escapeRegexChar(char);
                i += 1;
            }
        }

        regexStr += '$';

        return new RegExp(regexStr);
    }

    /**
     * 转义正则表达式特殊字符
     */
    private escapeRegexChar(char: string): string {
        if ('.+^${}()|\\'.includes(char)) {
            return '\\' + char;
        }
        return char;
    }

    /**
     * 使用规则列表匹配文件路径
     *
     * 按照 gitignore 语义：后面的规则覆盖前面的规则，
     * 最终结果由最后一个匹配的规则决定。
     *
     * @param relativePath 相对于工作区根目录的文件路径（正斜杠分隔）
     * @param rules 忽略规则列表
     * @returns 是否应该忽略
     */
    private matchRules(relativePath: string, rules: IgnoreRule[]): boolean {
        let ignored = false;

        for (const rule of rules) {
            // 目录规则不匹配文件（这里我们只处理文件诊断，跳过 directoryOnly 规则）
            if (rule.directoryOnly) {
                continue;
            }

            if (rule.regex.test(relativePath)) {
                ignored = !rule.negated;
            }
        }

        return ignored;
    }
}
