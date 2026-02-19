/**
 * 翻译系统接口定义
 *
 * 提供翻译键、i18n 引用和 l10n 引用的类型定义
 */

/**
 * 翻译引用记录
 *
 * 记录 `<i18n:key>` 或 `<l10n:key>` 在文档中的出现位置
 */
export interface ITranslationReference {
    /** 引用的翻译键名 */
    readonly key: string;
    /** 引用类型 */
    readonly type: 'i18n' | 'l10n';
    /** 源文件路径 */
    readonly sourceFile: string;
    /** 行号（0-based） */
    readonly lineNumber: number;
    /** 起始列（0-based） */
    readonly column: number;
    /** 结束列（0-based） */
    readonly endColumn: number;
}

/**
 * 翻译键接口
 * 
 * 翻译键是用于标识翻译文本的唯一标识符，格式为：`^[a-z][a-z0-9._-]*$`
 * 
 * @example
 * ```yaml
 * translations:
 *   en:
 *     item.my_sword: "My Sword"
 *     message.welcome: "Welcome, {player}!"
 * ```
 */
export interface ITranslationKey {
    /**
     * 翻译键名称
     * 
     * 必须符合模式：`^[a-z][a-z0-9._-]*$`
     * 
     * @example "item.my_sword", "message.welcome", "lore.rarity.legendary"
     */
    readonly key: string;
    
    /**
     * 翻译键的完整路径（包含语言代码）
     * 
     * @example "en.item.my_sword", "zh_cn.message.welcome"
     */
    readonly fullPath: string;
    
    /**
     * 语言代码（ISO 639-1）
     * 
     * @example "en", "zh_cn", "ja", "ko"
     */
    readonly languageCode: string;
    
    /**
     * 翻译文本值（可选，用于显示）
     */
    readonly value?: string;
    
    /**
     * 源文件 URI
     */
    readonly sourceFile: string;
    
    /**
     * 定义位置（行号，0-based）
     */
    readonly lineNumber?: number;
}

/**
 * i18n 引用接口
 * 
 * i18n (Internationalization) 是服务器端翻译引用，格式为：`<i18n:translation_key>`
 * 服务器会根据玩家的语言环境解析为对应的翻译文本
 * 
 * @example "<i18n:item.my_sword>", "<i18n:message.welcome>"
 */
export interface II18nReference {
    /**
     * 引用的翻译键
     */
    readonly translationKey: string;
    
    /**
     * 完整的 i18n 标签字符串
     * 
     * @example "<i18n:item.my_sword>"
     */
    readonly tag: string;
    
    /**
     * 源文件 URI
     */
    readonly sourceFile: string;
    
    /**
     * 定义位置（行号，0-based）
     */
    readonly lineNumber?: number;
}

/**
 * l10n 引用接口
 * 
 * l10n (Localization) 是客户端翻译引用，格式为：`<l10n:translation_key>`
 * 文本会发送到客户端，由客户端根据玩家语言设置进行翻译
 * 
 * @example "<l10n:item.my_sword>", "<l10n:message.welcome>"
 */
export interface IL10nReference {
    /**
     * 引用的翻译键
     */
    readonly translationKey: string;
    
    /**
     * 完整的 l10n 标签字符串
     * 
     * @example "<l10n:item.my_sword>"
     */
    readonly tag: string;
    
    /**
     * 源文件 URI
     */
    readonly sourceFile: string;
    
    /**
     * 定义位置（行号，0-based）
     */
    readonly lineNumber?: number;
}

/**
 * 翻译仓储接口
 * 
 * 负责管理所有翻译键的存储和查询
 */
export interface ITranslationRepository {
    /**
     * 获取所有翻译键
     * 
     * @returns 所有翻译键的列表
     */
    getAllKeys(): Promise<ITranslationKey[]>;
    
    /**
     * 根据键名查找翻译键
     * 
     * @param key 翻译键名称
     * @returns 匹配的翻译键列表（可能在不同语言中存在）
     */
    getKeysByName(key: string): Promise<ITranslationKey[]>;
    
    /**
     * 根据语言代码获取翻译键
     * 
     * @param languageCode 语言代码
     * @returns 该语言的所有翻译键
     */
    getKeysByLanguage(languageCode: string): Promise<ITranslationKey[]>;
    
    /**
     * 搜索翻译键（支持前缀匹配）
     * 
     * @param prefix 搜索前缀
     * @returns 匹配的翻译键列表
     */
    searchKeys(prefix: string): Promise<ITranslationKey[]>;
    
    /**
     * 添加或更新翻译键
     * 
     * @param key 翻译键
     */
    addKey(key: ITranslationKey): Promise<void>;
    
    /**
     * 移除翻译键
     * 
     * @param fullPath 翻译键的完整路径
     */
    removeKey(fullPath: string): Promise<void>;
    
    /**
     * 清空所有翻译键
     */
    clearTranslationKeys(): Promise<void>;
    
    /**
     * 获取翻译键数量
     */
    translationKeyCount(): Promise<number>;
}


