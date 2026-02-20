import { calculateSimilarity } from '../../../core/utils';
import {
    MINIMESSAGE_UNCLOSED_TAG,
    MINIMESSAGE_INVALID_TAG,
    MINIMESSAGE_INVALID_COLOR,
    MINIMESSAGE_INVALID_HEX_COLOR,
    MINIMESSAGE_MISSING_ARGUMENT,
    MINIMESSAGE_INVALID_ARGUMENT,
    MINIMESSAGE_UNMATCHED_CLOSING,
    MINIMESSAGE_WRONG_CLOSING_ORDER,
    MINIMESSAGE_INVALID_CLICK_ACTION,
    MINIMESSAGE_INVALID_HOVER_ACTION,
} from '../../../core/constants/DiagnosticCodes';
import { MINIMESSAGE_MESSAGES } from '../../../core/constants/DiagnosticMessages';
import {
    type MiniMessageTag,
    type MiniMessageValidationError,
    type MiniMessageValidationResult,
    type IMiniMessageDataProvider,
} from './MiniMessageTypes';

/**
 * MiniMessage 解析与验证服务
 *
 * 纯领域逻辑，不依赖 VS Code API。
 * 负责解析 MiniMessage 标签并验证其正确性。
 */
export class MiniMessageParser {
    // 正则表达式
    private static readonly TAG_PATTERN = /<(!)?([a-z_#][a-z0-9_]*)(?::([^>]*))?(\/)?>/gi;
    private static readonly CLOSING_TAG_PATTERN = /<\/(!)?([a-z_#][a-z0-9_]*)>/gi;
    private static readonly HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

    constructor(private readonly dataProvider: IMiniMessageDataProvider) {}

    /**
     * 验证单行 MiniMessage 内容
     *
     * @param line 行文本
     * @param lineNum 行号
     * @returns 验证结果
     */
    validateLine(line: string, lineNum: number): MiniMessageValidationResult {
        const errors: MiniMessageValidationError[] = [];

        // 提取行中的所有标签
        const tags = this.extractTags(line, lineNum);

        // 验证每个标签
        for (const tag of tags) {
            errors.push(...this.validateTag(tag));
        }

        // 检查标签匹配
        errors.push(...this.checkTagMatching(tags));

        return { errors };
    }

    /**
     * 提取行中的所有标签
     */
    extractTags(line: string, lineNum: number): MiniMessageTag[] {
        const tags: MiniMessageTag[] = [];

        // 提取开始标签和自闭合标签
        let match: RegExpExecArray | null;
        MiniMessageParser.TAG_PATTERN.lastIndex = 0;

        while ((match = MiniMessageParser.TAG_PATTERN.exec(line)) !== null) {
            const isNegation = match[1] === '!';
            const tagName = match[2].toLowerCase();
            const args = match[3] ? match[3].split(':') : [];
            const isSelfClosing = match[4] === '/';

            tags.push({
                name: tagName,
                fullMatch: match[0],
                isClosing: false,
                isSelfClosing,
                isNegation,
                arguments: args,
                startLine: lineNum,
                startCharacter: match.index,
                endCharacter: match.index + match[0].length,
                startOffset: match.index,
                endOffset: match.index + match[0].length,
            });
        }

        // 提取关闭标签
        MiniMessageParser.CLOSING_TAG_PATTERN.lastIndex = 0;

        while ((match = MiniMessageParser.CLOSING_TAG_PATTERN.exec(line)) !== null) {
            const isNegation = match[1] === '!';
            const tagName = match[2].toLowerCase();

            tags.push({
                name: tagName,
                fullMatch: match[0],
                isClosing: true,
                isSelfClosing: false,
                isNegation,
                arguments: [],
                startLine: lineNum,
                startCharacter: match.index,
                endCharacter: match.index + match[0].length,
                startOffset: match.index,
                endOffset: match.index + match[0].length,
            });
        }

        // 按位置排序
        tags.sort((a, b) => a.startOffset - b.startOffset);

        return tags;
    }

    /**
     * 验证单个标签
     */
    private validateTag(tag: MiniMessageTag): MiniMessageValidationError[] {
        const errors: MiniMessageValidationError[] = [];

        if (tag.isClosing) {
            return errors;
        }

        // 检查十六进制颜色
        if (tag.name.startsWith('#')) {
            if (!MiniMessageParser.HEX_COLOR_PATTERN.test(tag.name)) {
                errors.push(
                    this.createError(
                        tag,
                        MINIMESSAGE_MESSAGES.invalidHexColor(tag.name),
                        MINIMESSAGE_INVALID_HEX_COLOR,
                    ),
                );
            }
            return errors;
        }

        // 检查标签是否有效
        if (!tag.isNegation && !this.dataProvider.isValidTag(tag.name)) {
            const suggestions = this.findSimilarTags(tag.name);
            errors.push(
                this.createError(tag, MINIMESSAGE_MESSAGES.invalidTag(tag.name, suggestions), MINIMESSAGE_INVALID_TAG),
            );
            return errors;
        }

        // 检查需要参数的标签
        if (!tag.isNegation && this.dataProvider.tagRequiresArguments(tag.name) && tag.arguments.length === 0) {
            errors.push(
                this.createError(
                    tag,
                    MINIMESSAGE_MESSAGES.missingArgument(tag.name, '<tag:argument>'),
                    MINIMESSAGE_MISSING_ARGUMENT,
                ),
            );
        }

        // 验证特定标签的参数
        errors.push(...this.validateTagArguments(tag));

        return errors;
    }

    /**
     * 验证标签参数
     */
    private validateTagArguments(tag: MiniMessageTag): MiniMessageValidationError[] {
        const errors: MiniMessageValidationError[] = [];

        switch (tag.name) {
            case 'color':
            case 'colour':
            case 'c':
                if (tag.arguments.length > 0 && !this.isValidColor(tag.arguments[0])) {
                    errors.push(
                        this.createError(
                            tag,
                            MINIMESSAGE_MESSAGES.invalidColor(tag.arguments[0]),
                            MINIMESSAGE_INVALID_COLOR,
                        ),
                    );
                }
                break;

            case 'click':
                if (tag.arguments.length > 0 && !this.dataProvider.isValidClickAction(tag.arguments[0])) {
                    errors.push(
                        this.createError(
                            tag,
                            MINIMESSAGE_MESSAGES.invalidClickAction(
                                tag.arguments[0],
                                this.dataProvider.getClickActions(),
                            ),
                            MINIMESSAGE_INVALID_CLICK_ACTION,
                        ),
                    );
                }
                if (tag.arguments.length < 2) {
                    errors.push(
                        this.createError(
                            tag,
                            MINIMESSAGE_MESSAGES.missingArgument('click', '<click:action:value>'),
                            MINIMESSAGE_MISSING_ARGUMENT,
                        ),
                    );
                }
                break;

            case 'hover':
                if (tag.arguments.length > 0 && !this.dataProvider.isValidHoverAction(tag.arguments[0])) {
                    errors.push(
                        this.createError(
                            tag,
                            MINIMESSAGE_MESSAGES.invalidHoverAction(
                                tag.arguments[0],
                                this.dataProvider.getHoverActions(),
                            ),
                            MINIMESSAGE_INVALID_HOVER_ACTION,
                        ),
                    );
                }
                if (tag.arguments.length < 2) {
                    errors.push(
                        this.createError(
                            tag,
                            MINIMESSAGE_MESSAGES.missingArgument('hover', '<hover:action:value>'),
                            MINIMESSAGE_MISSING_ARGUMENT,
                        ),
                    );
                }
                break;

            case 'gradient':
                if (tag.arguments.length < 2) {
                    errors.push(
                        this.createError(
                            tag,
                            MINIMESSAGE_MESSAGES.missingArgument('gradient', '<gradient:color1:color2>'),
                            MINIMESSAGE_MISSING_ARGUMENT,
                        ),
                    );
                }
                break;

            case 'score':
                if (tag.arguments.length < 2) {
                    errors.push(
                        this.createError(
                            tag,
                            MINIMESSAGE_MESSAGES.missingArgument('score', '<score:name:objective>'),
                            MINIMESSAGE_MISSING_ARGUMENT,
                        ),
                    );
                }
                break;

            case 'nbt':
            case 'data':
                if (tag.arguments.length < 3) {
                    errors.push(
                        this.createError(
                            tag,
                            MINIMESSAGE_MESSAGES.missingArgument('nbt', '<nbt:type:id:path>'),
                            MINIMESSAGE_MISSING_ARGUMENT,
                        ),
                    );
                } else if (!['block', 'entity', 'storage'].includes(tag.arguments[0])) {
                    errors.push(
                        this.createError(
                            tag,
                            MINIMESSAGE_MESSAGES.invalidArgument('NBT source type', ['block', 'entity', 'storage']),
                            MINIMESSAGE_INVALID_ARGUMENT,
                        ),
                    );
                }
                break;
        }

        return errors;
    }

    /**
     * 检查标签匹配
     */
    private checkTagMatching(tags: MiniMessageTag[]): MiniMessageValidationError[] {
        const errors: MiniMessageValidationError[] = [];
        const openTags: MiniMessageTag[] = [];

        for (const tag of tags) {
            if (tag.isClosing) {
                const matchIndex = this.findMatchingOpenTag(openTags, tag.name, tag.isNegation);
                const closingTagDisplay = tag.isNegation ? `</!${tag.name}>` : `</${tag.name}>`;

                if (matchIndex === -1) {
                    errors.push(
                        this.createError(
                            tag,
                            MINIMESSAGE_MESSAGES.unmatchedClosing(closingTagDisplay),
                            MINIMESSAGE_UNMATCHED_CLOSING,
                        ),
                    );
                } else if (matchIndex !== openTags.length - 1) {
                    const expectedTag = openTags[openTags.length - 1];
                    const expectedClosingDisplay = expectedTag.isNegation
                        ? `</!${expectedTag.name}>`
                        : `</${expectedTag.name}>`;
                    const expectedOpeningDisplay = expectedTag.isNegation
                        ? `<!${expectedTag.name}>`
                        : `<${expectedTag.name}>`;

                    errors.push({
                        codeInfo: MINIMESSAGE_WRONG_CLOSING_ORDER,
                        message: MINIMESSAGE_MESSAGES.wrongClosingOrder(expectedClosingDisplay, closingTagDisplay),
                        startLine: tag.startLine,
                        startCharacter: tag.startCharacter,
                        endLine: tag.startLine,
                        endCharacter: tag.endCharacter,
                        relatedInfo: [
                            {
                                message: `Opening tag '${expectedOpeningDisplay}' is here`,
                                startLine: expectedTag.startLine,
                                startCharacter: expectedTag.startCharacter,
                                endLine: expectedTag.startLine,
                                endCharacter: expectedTag.endCharacter,
                            },
                        ],
                    });
                    openTags.splice(matchIndex, 1);
                } else {
                    openTags.pop();
                }
            } else if (!tag.isSelfClosing && !this.dataProvider.isSelfClosingTag(tag.name)) {
                openTags.push(tag);
            }
        }

        // 检查未闭合的标签
        for (const unclosedTag of openTags) {
            const openingDisplay = unclosedTag.isNegation ? `<!${unclosedTag.name}>` : `<${unclosedTag.name}>`;
            const closingDisplay = unclosedTag.isNegation ? `</!${unclosedTag.name}>` : `</${unclosedTag.name}>`;
            const selfClosingDisplay = unclosedTag.isNegation ? `<!${unclosedTag.name}/>` : `<${unclosedTag.name}/>`;

            errors.push(
                this.createError(
                    unclosedTag,
                    MINIMESSAGE_MESSAGES.unclosedTag(openingDisplay, closingDisplay, selfClosingDisplay),
                    MINIMESSAGE_UNCLOSED_TAG,
                ),
            );
        }

        return errors;
    }

    /**
     * 查找匹配的开始标签
     */
    private findMatchingOpenTag(openTags: MiniMessageTag[], tagName: string, isNegation: boolean): number {
        for (let i = openTags.length - 1; i >= 0; i--) {
            const openTag = openTags[i];
            if (openTag.name === tagName) {
                if (isNegation && !openTag.isNegation) {
                    continue;
                }
                return i;
            }
        }
        return -1;
    }

    /**
     * 验证颜色值
     */
    private isValidColor(color: string): boolean {
        return (
            this.dataProvider.isValidColorName(color.toLowerCase()) || MiniMessageParser.HEX_COLOR_PATTERN.test(color)
        );
    }

    /**
     * 查找相似标签名
     */
    private findSimilarTags(tagName: string): string[] {
        const lowerTagName = tagName.toLowerCase();
        return [...this.dataProvider.getValidTagNames()]
            .filter((validTag) => calculateSimilarity(lowerTagName, validTag) > 0.6)
            .slice(0, 3);
    }

    /**
     * 创建验证错误
     */
    private createError(tag: MiniMessageTag, message: string, codeInfo: { code: string }): MiniMessageValidationError {
        return {
            codeInfo,
            message,
            startLine: tag.startLine,
            startCharacter: tag.startCharacter,
            endLine: tag.startLine,
            endCharacter: tag.endCharacter,
        };
    }
}
