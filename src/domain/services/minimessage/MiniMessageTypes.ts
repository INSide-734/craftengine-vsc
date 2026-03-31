/**
 * MiniMessage 标签信息
 */
export interface IMiniMessageTag {
    /** 标签名称 */
    name: string;
    /** 标签完整内容 */
    fullMatch: string;
    /** 是否是关闭标签 */
    isClosing: boolean;
    /** 是否是自闭合标签 (<tag/>) */
    isSelfClosing: boolean;
    /** 是否是否定标签 (<!tag>) */
    isNegation: boolean;
    /** 标签参数 */
    arguments: string[];
    /** 起始行号 */
    startLine: number;
    /** 起始列号 */
    startCharacter: number;
    /** 结束列号 */
    endCharacter: number;
    /** 标签在行中的起始偏移 */
    startOffset: number;
    /** 标签在行中的结束偏移 */
    endOffset: number;
}

/**
 * MiniMessage 验证错误
 */
export interface IMiniMessageValidationError {
    /** 诊断代码信息 */
    codeInfo: { code: string };
    /** 错误消息 */
    message: string;
    /** 起始行号 */
    startLine: number;
    /** 起始列号 */
    startCharacter: number;
    /** 结束行号 */
    endLine: number;
    /** 结束列号 */
    endCharacter: number;
    /** 关联信息 */
    relatedInfo?: Array<{
        message: string;
        startLine: number;
        startCharacter: number;
        endLine: number;
        endCharacter: number;
    }>;
}

/**
 * MiniMessage 验证结果
 */
export interface IMiniMessageValidationResult {
    /** 验证错误列表 */
    errors: IMiniMessageValidationError[];
}

/**
 * MiniMessage 数据提供者接口（用于解耦 MiniMessageDataLoader）
 */
export interface IMiniMessageDataProvider {
    ensureLoaded(): Promise<void>;
    isValidTag(name: string): boolean;
    tagRequiresArguments(name: string): boolean;
    isSelfClosingTag(name: string): boolean;
    isValidColorName(name: string): boolean;
    isValidClickAction(action: string): boolean;
    isValidHoverAction(action: string): boolean;
    getClickActions(): string[];
    getHoverActions(): string[];
    getValidTagNames(): Set<string> | string[];
}
