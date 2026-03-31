import { type TextDocument, CodeAction, CodeActionKind, WorkspaceEdit, Position, Range, type Diagnostic } from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { type IDataStoreService } from '../../core/interfaces/IDataStoreService';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { type IYamlPathParser } from '../../core/interfaces/IYamlPathParser';
import { TranslationDiagnosticProvider } from './TranslationDiagnosticProvider';
import { BaseCodeActionProvider } from './BaseCodeActionProvider';
import { calculateSimilarity } from '../../infrastructure/utils';
import {
    TRANSLATION_NOT_FOUND,
    TRANSLATION_EMPTY_VALUE,
    TRANSLATION_DUPLICATE_KEY,
    TRANSLATION_MISSING_LANGUAGE,
} from '../../core/constants/DiagnosticCodes';
import { extractDiagnosticCode } from './helpers';

/**
 * 翻译代码操作提供者
 *
 * 为翻译相关的诊断错误提供快速修复建议（Quick Fix）
 */
export class TranslationCodeActionProvider extends BaseCodeActionProvider {
    private readonly dataStoreService: IDataStoreService;
    private readonly yamlPathParser: IYamlPathParser;

    /** 提供的 CodeAction 类型 */
    static readonly providedCodeActionKinds = [CodeActionKind.QuickFix];

    protected readonly diagnosticSource = TranslationDiagnosticProvider.DIAGNOSTIC_SOURCE;

    constructor() {
        super('TranslationCodeActionProvider');
        this.dataStoreService = ServiceContainer.getService<IDataStoreService>(SERVICE_TOKENS.DataStoreService);
        this.yamlPathParser = ServiceContainer.getService<IYamlPathParser>(SERVICE_TOKENS.YamlPathParser);
    }

    /**
     * 根据诊断的错误代码分派不同的修复策略
     *
     * @param document 当前文档
     * @param diagnostic 需要修复的诊断信息
     * @returns 针对该诊断可用的代码操作集合
     */
    protected async createFixActions(document: TextDocument, diagnostic: Diagnostic): Promise<CodeAction[]> {
        const actions: CodeAction[] = [];

        // 提取诊断代码值
        const codeValue = extractDiagnosticCode(diagnostic);

        switch (codeValue) {
            case TRANSLATION_NOT_FOUND.code:
                actions.push(...(await this.createMissingKeyActions(document, diagnostic)));
                break;

            case TRANSLATION_EMPTY_VALUE.code:
                actions.push(...this.createEmptyValueActions(document, diagnostic));
                break;

            case TRANSLATION_DUPLICATE_KEY.code:
                actions.push(...this.createDuplicateKeyActions(document, diagnostic));
                break;

            case TRANSLATION_MISSING_LANGUAGE.code:
                actions.push(...(await this.createMissingLanguageActions(document, diagnostic)));
                break;

            default:
                break;
        }

        return actions;
    }

    /**
     * 构建针对缺失翻译键的修复动作
     *
     * @param document 当前文档
     * @param diagnostic 缺失键诊断
     * @returns 可添加缺失键或替换为相似键的操作列表
     */
    private async createMissingKeyActions(document: TextDocument, diagnostic: Diagnostic): Promise<CodeAction[]> {
        const actions: CodeAction[] = [];

        // 从诊断消息中提取翻译键名称
        const keyName = this.extractKeyNameFromDiagnostic(diagnostic);
        if (!keyName) {
            return actions;
        }

        const translationsPosition = this.findTranslationsSectionPosition(document);
        const preferredLanguages = await this.getPreferredLanguages(document);

        if (translationsPosition) {
            for (const language of preferredLanguages) {
                const insertInfo = this.getLanguageInsertInfo(document, translationsPosition, language);

                if (!insertInfo) {
                    continue;
                }

                const action = new CodeAction(
                    `Add '${keyName}' to '${language}' translations`,
                    CodeActionKind.QuickFix,
                );
                action.diagnostics = [diagnostic];
                action.isPreferred = language === preferredLanguages[0];

                const edit = new WorkspaceEdit();
                const newText = this.buildLanguageInsertText(
                    language,
                    keyName,
                    insertInfo.languageIndent,
                    insertInfo.needsLanguageHeader,
                );

                edit.insert(document.uri, insertInfo.insertPosition, newText);
                action.edit = edit;
                actions.push(action);
            }
        } else {
            // 如果没有 translations 部分，创建它
            const createSectionAction = new CodeAction(
                `Create translations section with key '${keyName}'`,
                CodeActionKind.QuickFix,
            );
            createSectionAction.diagnostics = [diagnostic];

            const sectionEdit = new WorkspaceEdit();
            const insertPosition = new Position(document.lineCount, 0);
            const fallbackLanguage = preferredLanguages[0] ?? 'en';
            const newText = this.buildTranslationsSectionText(fallbackLanguage, keyName, document.lineCount > 0);

            sectionEdit.insert(document.uri, insertPosition, newText);
            createSectionAction.edit = sectionEdit;
            actions.push(createSectionAction);
        }

        // 2. 查找相似的翻译键（如果存在）
        try {
            const allKeys = await this.dataStoreService.getAllTranslationKeys();
            const keyNames = [...new Set(allKeys.map((k: { key: string }) => k.key))];
            const similarKeys = this.findSimilarKeys(keyName, keyNames as string[]);

            for (const similarKey of similarKeys.slice(0, 3)) {
                const replaceAction = new CodeAction(`Replace with '${similarKey}'`, CodeActionKind.QuickFix);
                replaceAction.diagnostics = [diagnostic];

                const replaceEdit = new WorkspaceEdit();
                replaceEdit.replace(
                    document.uri,
                    diagnostic.range,
                    this.replaceKeyInReference(document.getText(diagnostic.range), keyName, similarKey),
                );
                replaceAction.edit = replaceEdit;

                actions.push(replaceAction);
            }
        } catch (error) {
            this.logger.debug('Error finding similar keys', { error });
        }

        return actions;
    }

    /**
     * 生成针对空翻译值的占位符填充操作
     *
     * @param document 当前文档
     * @param diagnostic 空值诊断
     * @returns 能填入占位符文本的代码操作
     */
    private createEmptyValueActions(document: TextDocument, diagnostic: Diagnostic): CodeAction[] {
        const actions: CodeAction[] = [];

        const keyName = this.extractKeyNameFromDiagnostic(diagnostic);
        if (!keyName) {
            return actions;
        }

        // 提供占位符值
        const fixAction = new CodeAction(`Add placeholder value for '${keyName}'`, CodeActionKind.QuickFix);
        fixAction.diagnostics = [diagnostic];
        fixAction.isPreferred = true;

        const edit = new WorkspaceEdit();
        const line = document.lineAt(diagnostic.range.start.line);
        const colonIndex = line.text.indexOf(':');

        if (colonIndex !== -1) {
            const valueStart = new Position(diagnostic.range.start.line, colonIndex + 1);
            const valueEnd = diagnostic.range.end;
            const valueRange = new Range(valueStart, valueEnd);

            edit.replace(document.uri, valueRange, ` "${keyName}"`);
            fixAction.edit = edit;
            actions.push(fixAction);
        }

        return actions;
    }

    /**
     * 构造用于删除重复翻译键的操作
     *
     * @param document 当前文档
     * @param diagnostic 重复键诊断
     * @returns 将冗余键删除的修复列表
     */
    private createDuplicateKeyActions(document: TextDocument, diagnostic: Diagnostic): CodeAction[] {
        const actions: CodeAction[] = [];

        // 删除当前重复的键
        const deleteAction = new CodeAction('Remove duplicate translation key', CodeActionKind.QuickFix);
        deleteAction.diagnostics = [diagnostic];
        deleteAction.isPreferred = true;

        const edit = new WorkspaceEdit();
        const lineRange = new Range(
            new Position(diagnostic.range.start.line, 0),
            new Position(diagnostic.range.start.line + 1, 0),
        );

        edit.delete(document.uri, lineRange);
        deleteAction.edit = edit;
        actions.push(deleteAction);

        return actions;
    }

    /**
     * 生成缺失语言条目的补全操作
     *
     * @param document 当前文档
     * @param diagnostic 缺失语言诊断
     * @returns 针对每种缺失语言的插入动作
     */
    private async createMissingLanguageActions(document: TextDocument, diagnostic: Diagnostic): Promise<CodeAction[]> {
        const actions: CodeAction[] = [];

        // 从诊断消息中提取缺失的语言
        const message = diagnostic.message;
        const languagesMatch = message.match(/languages: (.+)$/);
        if (!languagesMatch) {
            return actions;
        }

        const missingLanguages = languagesMatch[1].split(', ').map((l) => l.trim());
        const keyName = this.extractKeyNameFromDiagnostic(diagnostic);

        if (!keyName || missingLanguages.length === 0) {
            return actions;
        }

        const translationsPosition = this.findTranslationsSectionPosition(document);
        if (!translationsPosition) {
            return actions;
        }

        // 为每个缺失的语言创建添加操作
        for (const language of missingLanguages) {
            const insertInfo = this.getLanguageInsertInfo(document, translationsPosition, language);

            if (!insertInfo) {
                continue;
            }

            const addAction = new CodeAction(
                `Add translation for '${keyName}' in '${language}'`,
                CodeActionKind.QuickFix,
            );
            addAction.diagnostics = [diagnostic];

            const edit = new WorkspaceEdit();
            const newText = this.buildLanguageInsertText(
                language,
                keyName,
                insertInfo.languageIndent,
                insertInfo.needsLanguageHeader,
            );
            edit.insert(document.uri, insertInfo.insertPosition, newText);
            addAction.edit = edit;
            actions.push(addAction);
        }

        return actions;
    }

    /**
     * 从诊断消息字符串中解析出翻译键名
     *
     * @param diagnostic 包含键名的诊断
     * @returns 匹配到的键名，若解析失败则返回 null
     */
    private extractKeyNameFromDiagnostic(diagnostic: Diagnostic): string | null {
        const message = diagnostic.message;
        const match = message.match(/'([a-z][a-z0-9._-]+)'/);
        return match ? match[1] : null;
    }

    /**
     * 定位 `translations:` 行所在的位置
     *
     * @param document 当前文档
     * @returns 若存在则返回位置，否则返回 null
     */
    private findTranslationsSectionPosition(document: TextDocument): Position | null {
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            if (line.text.trim().startsWith('translations:')) {
                return line.range.start;
            }
        }
        return null;
    }

    /**
     * 获取当前文档优先使用的语言列表
     *
     * 优先顺序：文档内声明的语言 → 工作区内出现过的语言 → 'en'
     *
     * @param document 当前处理的文本文档
     * @returns 按优先顺序排列的语言代码
     */
    private async getPreferredLanguages(document: TextDocument): Promise<string[]> {
        const documentLanguages = this.getDocumentLanguages(document);
        if (documentLanguages.length > 0) {
            return documentLanguages;
        }

        const workspaceLanguages = await this.getWorkspaceLanguages();
        if (workspaceLanguages.length > 0) {
            return workspaceLanguages;
        }

        return ['en'];
    }

    /**
     * 解析文档中的 `translations` 段落，提取已存在的语言代码
     *
     * @param document 当前处理的文本文档
     * @returns 文档中声明的语言代码数组
     */
    private getDocumentLanguages(document: TextDocument): string[] {
        const translationsPosition = this.findTranslationsSectionPosition(document);
        if (!translationsPosition) {
            return [];
        }

        const translationsIndent = this.yamlPathParser.getIndentLevel(document.lineAt(translationsPosition.line).text);
        const languageIndent = translationsIndent + 2;
        const languages = new Set<string>();

        for (let i = translationsPosition.line + 1; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const trimmed = line.text.trim();

            if (!trimmed.length) {
                continue;
            }

            const indent = this.yamlPathParser.getIndentLevel(line.text);

            if (indent <= translationsIndent && !trimmed.startsWith('#')) {
                break;
            }

            if (indent === languageIndent) {
                const match = trimmed.match(/^([a-z0-9_]+):/i);
                if (match) {
                    languages.add(match[1]);
                }
            }
        }

        return Array.from(languages);
    }

    /**
     * 从翻译仓储中读取工作区出现过的所有语言代码
     *
     * @returns 去重后的语言代码列表，加载失败时返回空数组
     */
    private async getWorkspaceLanguages(): Promise<string[]> {
        try {
            const allKeys = await this.dataStoreService.getAllTranslationKeys();
            const languageSet = new Set(allKeys.map((key: { languageCode: string }) => key.languageCode));
            return Array.from(languageSet) as string[];
        } catch (error) {
            this.logger.warn('Failed to load workspace languages', { error });
            return [];
        }
    }

    /**
     * 计算指定语言的插入点及缩进等信息
     *
     * @param document 当前文档
     * @param translationsPosition `translations:` 行的位置
     * @param languageCode 目标语言代码
     * @returns 插入位置信息，若无法确定则返回 null
     */
    private getLanguageInsertInfo(
        document: TextDocument,
        translationsPosition: Position,
        languageCode: string,
    ): { insertPosition: Position; languageIndent: number; needsLanguageHeader: boolean } | null {
        const translationsLine = document.lineAt(translationsPosition.line);
        const translationsIndent = this.yamlPathParser.getIndentLevel(translationsLine.text);
        const languageIndent = translationsIndent + 2;

        let lastLineWithinSection = translationsPosition.line;

        for (let i = translationsPosition.line + 1; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const trimmed = line.text.trim();
            const indent = this.yamlPathParser.getIndentLevel(line.text);

            if (!trimmed.length) {
                lastLineWithinSection = i;
                continue;
            }

            if (indent <= translationsIndent && !trimmed.startsWith('#')) {
                break;
            }

            lastLineWithinSection = i;

            if (indent === languageIndent) {
                const match = trimmed.match(/^([a-z0-9_]+):/i);
                if (match && match[1] === languageCode) {
                    let insertionLine = i + 1;
                    for (let j = i + 1; j < document.lineCount; j++) {
                        const childLine = document.lineAt(j);
                        const childTrimmed = childLine.text.trim();
                        const childIndent = this.yamlPathParser.getIndentLevel(childLine.text);

                        if (!childTrimmed.length) {
                            insertionLine = j + 1;
                            continue;
                        }

                        if (childIndent <= languageIndent && !childTrimmed.startsWith('#')) {
                            break;
                        }

                        insertionLine = j + 1;
                    }

                    return {
                        insertPosition: new Position(insertionLine, 0),
                        languageIndent,
                        needsLanguageHeader: false,
                    };
                }
            }
        }

        const insertLine = lastLineWithinSection + 1;
        return {
            insertPosition: new Position(insertLine, 0),
            languageIndent,
            needsLanguageHeader: true,
        };
    }

    /**
     * 构造插入到语言块中的文本
     *
     * @param language 目标语言代码
     * @param keyName 需要添加的翻译键
     * @param languageIndent 语言块的缩进级别
     * @param includeLanguageHeader 是否需要包含语言头
     * @returns 适配缩进的 YAML 字符串
     */
    private buildLanguageInsertText(
        language: string,
        keyName: string,
        languageIndent: number,
        includeLanguageHeader: boolean,
    ): string {
        const languageIndentText = ' '.repeat(languageIndent);
        const keyIndentText = ' '.repeat(languageIndent + 2);

        if (includeLanguageHeader) {
            return `${languageIndentText}${language}:\n${keyIndentText}${keyName}: "${keyName}"\n`;
        }

        return `${keyIndentText}${keyName}: "${keyName}"\n`;
    }

    /**
     * 创建完整的 `translations` 片段文本
     *
     * @param language 首个语言代码
     * @param keyName 需要写入的翻译键
     * @param needsLeadingNewline 是否在片段前插入空行
     * @returns 带缩进的 YAML 字符串
     */
    private buildTranslationsSectionText(language: string, keyName: string, needsLeadingNewline: boolean): string {
        const prefix = needsLeadingNewline ? '\n' : '';
        return `${prefix}translations:\n  ${language}:\n    ${keyName}: "${keyName}"\n`;
    }

    /**
     * 基于相似度寻找与目标键最接近的其他键
     *
     * @param targetKey 当前缺失的键名
     * @param allKeys 全量键名集合
     * @returns 按相似度降序排序后的键名
     */
    private findSimilarKeys(targetKey: string, allKeys: string[]): string[] {
        const similarities: Array<{ key: string; score: number }> = [];

        for (const key of allKeys) {
            const score = calculateSimilarity(targetKey, key);
            if (score > 0.5) {
                similarities.push({ key, score });
            }
        }

        return similarities.sort((a, b) => b.score - a.score).map((item) => item.key);
    }

    /**
     * 将引用字符串中的旧键名替换为新键名
     *
     * @param reference 原始引用文本
     * @param oldKey 需要被替换的键
     * @param newKey 替换后的键
     * @returns 替换完成后的字符串
     */
    private replaceKeyInReference(reference: string, oldKey: string, newKey: string): string {
        return reference.replace(oldKey, newKey);
    }
}
