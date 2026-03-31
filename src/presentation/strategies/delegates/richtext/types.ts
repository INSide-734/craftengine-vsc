import { type CompletionItem } from 'vscode';
import { type ITranslationKey } from '../../../../core/interfaces/ITranslation';

/**
 * 富文本补全上下文类型
 */
export type RichTextCompletionType =
    | 'tag' // 标签名称补全
    | 'closing-tag' // 关闭标签补全
    | 'hex-color' // 十六进制颜色补全
    | 'tag-argument' // 标签参数补全
    | 'translation-key' // 翻译键补全（i18n/l10n 标签参数）
    | 'pure-translation' // 纯翻译键补全（非 MiniMessage 上下文）
    | 'none'; // 无匹配

/**
 * 翻译键验证状态
 */
export interface ITranslationValidationStatus {
    /** 是否有错误 */
    hasErrors: boolean;
    /** 是否有警告 */
    hasWarnings: boolean;
    /** 错误列表 */
    errors: string[];
    /** 警告列表 */
    warnings: string[];
    /** 缺失的常用语言 */
    missingLanguages: string[];
}

/**
 * 翻译补全模式
 */
export type TranslationMode = 'key' | 'i18n' | 'l10n';

/**
 * 补全项创建器接口
 */
export interface ICompletionItemCreator {
    /**
     * 创建翻译键补全项
     */
    createTranslationItem(key: ITranslationKey, mode: TranslationMode): CompletionItem;
}

/**
 * 正则表达式模式集合（默认值，可被配置覆盖）
 */
export let PATTERNS = {
    /** 匹配标签开始：<tagName */
    TAG_START: /<([a-z_]*)$/i,

    /** 匹配标签参数：<tag:arg */
    TAG_ARGUMENT: /<([a-z_]+):([^>]*)$/i,

    /** 匹配关闭标签：</tagName */
    CLOSING_TAG: /<\/([a-z_]*)$/i,

    /** 匹配十六进制颜色：<#hex */
    HEX_COLOR: /<#([0-9a-f]*)$/i,

    /** 匹配翻译标签：<i18n:key 或 <l10n:key */
    TRANSLATION_TAG: /<(i18n|l10n):([a-z0-9._-]*)$/i,

    /** 匹配纯翻译键（用于 translation-only 模式） */
    PURE_TRANSLATION_KEY: /^([a-z][a-z0-9._-]*)$/,
};

/** 常用语言代码（用于检测缺失的翻译，默认值可被配置覆盖） */
export let COMMON_LANGUAGES: readonly string[] = ['en', 'zh_cn', 'ja', 'ko', 'de', 'fr', 'es', 'ru', 'pt_br'];

/** 配置键到 PATTERNS 字段的映射 */
const PATTERN_KEY_MAP: Record<string, keyof typeof PATTERNS> = {
    completionTagStart: 'TAG_START',
    completionTagArgument: 'TAG_ARGUMENT',
    completionClosingTag: 'CLOSING_TAG',
    completionHexColor: 'HEX_COLOR',
    completionTranslationTag: 'TRANSLATION_TAG',
    pureTranslationKey: 'PURE_TRANSLATION_KEY',
};

/**
 * 从配置初始化 PATTERNS 和 COMMON_LANGUAGES
 *
 * @param patterns - 正则模式配置（键名 -> 正则字符串）
 * @param commonLanguages - 常用语言代码列表
 */
export function initializeMiniMessagePatterns(patterns: Record<string, string>, commonLanguages: string[]): void {
    // 从配置构建正则表达式
    const newPatterns = { ...PATTERNS };
    for (const [configKey, patternField] of Object.entries(PATTERN_KEY_MAP)) {
        if (patterns[configKey]) {
            newPatterns[patternField] = new RegExp(patterns[configKey], 'i');
        }
    }
    PATTERNS = newPatterns;

    // 更新常用语言列表
    if (commonLanguages.length > 0) {
        COMMON_LANGUAGES = commonLanguages;
    }
}
