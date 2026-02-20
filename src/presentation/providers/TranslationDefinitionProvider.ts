import {
    type DefinitionProvider,
    type TextDocument,
    Position,
    type Definition,
    type LocationLink,
    Location,
    Range,
    type CancellationToken,
    Uri,
    workspace,
    commands,
} from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { type ITranslationKey } from '../../core/interfaces/ITranslation';
import { type IDataStoreService } from '../../core/interfaces/IDataStoreService';
import { type ILogger } from '../../core/interfaces/ILogger';
import { type IConfiguration } from '../../core/interfaces/IConfiguration';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { type PerformanceMonitor } from '../../infrastructure/performance/PerformanceMonitor';
import { YamlHelper } from '../../infrastructure/yaml/YamlHelper';

/**
 * 翻译定义跳转提供者
 *
 * 提供从翻译键引用位置（i18n/l10n）跳转到翻译定义的功能
 * 支持:
 * - <i18n:translation_key> 格式的引用
 * - <l10n:translation_key> 格式的引用
 */
export class TranslationDefinitionProvider implements DefinitionProvider {
    private readonly dataStoreService: IDataStoreService;
    private readonly logger: ILogger;
    private readonly configuration: IConfiguration;
    private readonly performanceMonitor: PerformanceMonitor;

    // 正则表达式模式
    private static readonly I18N_PATTERN = /<i18n:([a-z][a-z0-9._-]+)>/g;
    private static readonly L10N_PATTERN = /<l10n:([a-z][a-z0-9._-]+)>/g;

    constructor() {
        this.dataStoreService = ServiceContainer.getService<IDataStoreService>(SERVICE_TOKENS.DataStoreService);
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild(
            'TranslationDefinitionProvider',
        );
        this.configuration = ServiceContainer.getService<IConfiguration>(SERVICE_TOKENS.Configuration);
        this.performanceMonitor = ServiceContainer.getService<PerformanceMonitor>(SERVICE_TOKENS.PerformanceMonitor);
    }

    async provideDefinition(
        document: TextDocument,
        position: Position,
        token?: CancellationToken,
    ): Promise<Definition | LocationLink[] | undefined> {
        const timer = this.performanceMonitor.startTimer('translation-definition.provide');

        try {
            // 检查功能是否启用
            if (!this.configuration.get('definition.enabled', true)) {
                return undefined;
            }

            if (token?.isCancellationRequested) {
                return undefined;
            }

            this.logger.debug('Providing translation definition', {
                file: document.fileName,
                line: position.line,
                character: position.character,
            });

            // 获取光标位置的翻译键信息
            const translationInfo = this.getTranslationKeyAtPosition(document, position);
            if (!translationInfo) {
                this.logger.debug('No translation key found at position');
                return undefined;
            }

            this.logger.debug('Translation key detected for definition', {
                translationKey: translationInfo.key,
                type: translationInfo.type,
                range: translationInfo.range,
            });

            // 搜索翻译定义
            const definitions = await this.findTranslationDefinitions(translationInfo.key, translationInfo.range);

            if (definitions.length === 0) {
                this.logger.debug('Translation definition not found', {
                    translationKey: translationInfo.key,
                });
                return undefined;
            }

            this.logger.debug('Translation definitions found', {
                translationKey: translationInfo.key,
                count: definitions.length,
            });

            // 使用 Peek 视图直接在编辑器中显示定义列表和代码片段
            // 而不是使用左侧面板或跳转到文件
            const locations = definitions.map((def) => new Location(def.targetUri, def.targetRange));

            // 调用 VSCode 的 peekLocations 命令在编辑器内显示 peek 视图
            await commands.executeCommand(
                'editor.action.peekLocations',
                document.uri,
                position,
                locations,
                'peek', // 使用 peek 模式，在编辑器内显示
            );

            // 返回 undefined 以避免 VSCode 的默认定义跳转行为
            return undefined;
        } catch (error) {
            this.logger.error('Error providing translation definition', error as Error, {
                file: document.fileName,
                position: { line: position.line, character: position.character },
            });
            return undefined;
        } finally {
            timer.stop({
                document: document.fileName,
            });
        }
    }

    /**
     * 获取光标位置的翻译键信息
     */
    private getTranslationKeyAtPosition(
        document: TextDocument,
        position: Position,
    ): { key: string; type: 'i18n' | 'l10n'; range: Range } | undefined {
        const line = document.lineAt(position);
        const lineText = line.text;

        // 检查光标是否在注释中
        if (YamlHelper.isInComment(lineText, position.character)) {
            return undefined;
        }

        // 检查 i18n 引用
        const i18nMatch = this.findTranslationReferenceAtPosition(
            lineText,
            position,
            TranslationDefinitionProvider.I18N_PATTERN,
            'i18n',
        );
        if (i18nMatch) {
            return i18nMatch;
        }

        // 检查 l10n 引用
        const l10nMatch = this.findTranslationReferenceAtPosition(
            lineText,
            position,
            TranslationDefinitionProvider.L10N_PATTERN,
            'l10n',
        );
        if (l10nMatch) {
            return l10nMatch;
        }

        return undefined;
    }

    /**
     * 在行中查找翻译引用
     */
    private findTranslationReferenceAtPosition(
        lineText: string,
        position: Position,
        pattern: RegExp,
        type: 'i18n' | 'l10n',
    ): { key: string; type: 'i18n' | 'l10n'; range: Range } | undefined {
        // 重置正则表达式的 lastIndex
        pattern.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = pattern.exec(lineText)) !== null) {
            // 检查匹配是否在注释中
            if (YamlHelper.isMatchInComment(lineText, match, 1)) {
                continue;
            }

            const fullMatch = match[0];
            const keyName = match[1];
            const startPos = match.index;
            const endPos = startPos + fullMatch.length;

            // 检查光标是否在翻译引用范围内
            if (position.character >= startPos && position.character <= endPos) {
                // 计算翻译键的精确范围（不包括 <i18n: 或 <l10n: 前缀和 > 后缀）
                const keyStartPos = startPos + (type === 'i18n' ? 6 : 6); // "<i18n:" 或 "<l10n:" 长度都是 6
                const keyEndPos = endPos - 1; // 减去 ">" 的长度

                const range = new Range(position.line, keyStartPos, position.line, keyEndPos);

                return { key: keyName, type, range };
            }
        }

        return undefined;
    }

    /**
     * 查找翻译定义位置
     */
    private async findTranslationDefinitions(keyName: string, originRange: Range): Promise<LocationLink[]> {
        const definitions: LocationLink[] = [];

        // 从仓储获取翻译键
        const keys = await this.dataStoreService.getTranslationKeysByName(keyName);

        if (keys.length === 0) {
            // 如果仓储中没有，尝试在工作区文件中搜索
            const workspaceDefinitions = await this.searchInWorkspace(keyName, originRange);
            return workspaceDefinitions;
        }

        // 按语言代码分组，优先显示常用语言
        const sortedKeys = this.sortByLanguagePriority(keys);

        for (const key of sortedKeys) {
            const definition = await this.createLocationLink(key, originRange);
            if (definition) {
                definitions.push(definition);
            }
        }

        return definitions;
    }

    /**
     * 按语言优先级排序
     */
    private sortByLanguagePriority(keys: ITranslationKey[]): ITranslationKey[] {
        const languagePriority: Record<string, number> = {
            en: 0,
            zh_cn: 1,
            ja: 2,
            ko: 3,
        };

        return [...keys].sort((a, b) => {
            const priorityA = languagePriority[a.languageCode] ?? 100;
            const priorityB = languagePriority[b.languageCode] ?? 100;
            return priorityA - priorityB;
        });
    }

    /**
     * 创建 LocationLink
     */
    private async createLocationLink(key: ITranslationKey, originRange: Range): Promise<LocationLink | undefined> {
        try {
            const targetUri = Uri.file(key.sourceFile);

            // 获取精确的行号
            const lineNumber = key.lineNumber ?? 0;

            // 尝试获取更精确的位置
            const preciseLocation = await this.findPreciseLocation(targetUri, key.key, key.languageCode, lineNumber);

            const targetPosition = preciseLocation?.position ?? new Position(lineNumber, 0);
            const targetRange = preciseLocation?.range ?? new Range(targetPosition, targetPosition);

            return {
                originSelectionRange: originRange,
                targetUri,
                targetRange,
                targetSelectionRange: targetRange,
            };
        } catch (error) {
            this.logger.warn('Failed to create location link', {
                key: key.key,
                file: key.sourceFile,
                error: error instanceof Error ? error.message : String(error),
            });
            return undefined;
        }
    }

    /**
     * 查找翻译键在文件中的精确位置
     */
    private async findPreciseLocation(
        uri: Uri,
        keyName: string,
        languageCode: string,
        estimatedLine: number,
    ): Promise<{ position: Position; range: Range } | undefined> {
        try {
            const document = await workspace.openTextDocument(uri);
            const searchPattern = new RegExp(`^(\\s*)${this.escapeRegex(keyName)}\\s*:`);

            // 首先在估计的行号附近搜索
            const searchRange = 50; // 在估计位置前后 50 行搜索
            const startLine = Math.max(0, estimatedLine - searchRange);
            const endLine = Math.min(document.lineCount - 1, estimatedLine + searchRange);

            // 先检查是否在正确的语言区域内
            let inCorrectLanguage = false;
            let currentLanguage: string | null = null;

            for (let i = startLine; i <= endLine; i++) {
                const line = document.lineAt(i);
                const text = line.text;

                // 检查是否是语言代码行
                const languageMatch = text.match(/^(\s*)([a-z][a-z0-9_-]+):\s*$/);
                if (languageMatch) {
                    currentLanguage = languageMatch[2];
                    inCorrectLanguage = currentLanguage === languageCode;
                    continue;
                }

                // 如果在正确的语言区域内，检查是否匹配翻译键
                if (inCorrectLanguage && searchPattern.test(text)) {
                    const match = text.match(searchPattern);
                    if (match) {
                        const keyStartIndex = match[1].length; // 跳过缩进
                        const keyEndIndex = keyStartIndex + keyName.length;

                        const startPos = new Position(i, keyStartIndex);
                        const endPos = new Position(i, keyEndIndex);

                        return {
                            position: startPos,
                            range: new Range(startPos, endPos),
                        };
                    }
                }
            }

            // 如果没找到，扩大搜索范围
            return this.searchEntireDocument(document, keyName, languageCode);
        } catch (error) {
            this.logger.debug('Failed to find precise location', {
                uri: uri.fsPath,
                keyName,
                error: error instanceof Error ? error.message : String(error),
            });
            return undefined;
        }
    }

    /**
     * 在整个文档中搜索翻译键
     */
    private async searchEntireDocument(
        document: TextDocument,
        keyName: string,
        languageCode: string,
    ): Promise<{ position: Position; range: Range } | undefined> {
        const searchPattern = new RegExp(`^(\\s*)${this.escapeRegex(keyName)}\\s*:`);
        let inTranslations = false;
        let currentLanguage: string | null = null;

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const text = line.text;
            const trimmed = text.trim();

            // 检查是否进入 translations 部分
            if (trimmed.startsWith('translations:') || trimmed.startsWith('i18n:') || trimmed.startsWith('l10n:')) {
                inTranslations = true;
                continue;
            }

            if (!inTranslations) {
                continue;
            }

            // 检查是否是语言代码行
            const languageMatch = trimmed.match(/^([a-z][a-z0-9_-]+):\s*$/);
            if (languageMatch) {
                currentLanguage = languageMatch[1];
                continue;
            }

            // 如果在目标语言区域内，检查翻译键
            if (currentLanguage === languageCode && searchPattern.test(text)) {
                const match = text.match(searchPattern);
                if (match) {
                    const keyStartIndex = match[1].length;
                    const keyEndIndex = keyStartIndex + keyName.length;

                    const startPos = new Position(i, keyStartIndex);
                    const endPos = new Position(i, keyEndIndex);

                    return {
                        position: startPos,
                        range: new Range(startPos, endPos),
                    };
                }
            }

            // 检查是否退出 translations 部分
            if (
                trimmed.match(/^[a-z][a-z0-9_-]+:/) &&
                !trimmed.startsWith('translations') &&
                !trimmed.match(/^[a-z]{2}(_[a-z]{2})?:/)
            ) {
                inTranslations = false;
                currentLanguage = null;
            }
        }

        return undefined;
    }

    /**
     * 在工作区中搜索翻译定义
     */
    private async searchInWorkspace(keyName: string, originRange: Range): Promise<LocationLink[]> {
        const definitions: LocationLink[] = [];

        try {
            // 搜索所有 YAML 文件
            const yamlFiles = await workspace.findFiles('**/*.{yaml,yml}', '**/node_modules/**');

            for (const fileUri of yamlFiles) {
                const document = await workspace.openTextDocument(fileUri);
                const location = await this.findTranslationKeyInDocument(document, keyName);

                if (location) {
                    definitions.push({
                        originSelectionRange: originRange,
                        targetUri: fileUri,
                        targetRange: location.range,
                        targetSelectionRange: location.range,
                    });
                }
            }
        } catch (error) {
            this.logger.warn('Error searching workspace for translation', {
                keyName,
                error: error instanceof Error ? error.message : String(error),
            });
        }

        return definitions;
    }

    /**
     * 在文档中查找翻译键（任意语言）
     */
    private async findTranslationKeyInDocument(
        document: TextDocument,
        keyName: string,
    ): Promise<{ position: Position; range: Range } | undefined> {
        const searchPattern = new RegExp(`^(\\s*)${this.escapeRegex(keyName)}\\s*:`);
        let inTranslations = false;

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const text = line.text;
            const trimmed = text.trim();

            // 检查是否进入 translations 部分
            if (trimmed.startsWith('translations:') || trimmed.startsWith('i18n:') || trimmed.startsWith('l10n:')) {
                inTranslations = true;
                continue;
            }

            if (!inTranslations) {
                continue;
            }

            // 检查翻译键
            if (searchPattern.test(text)) {
                const match = text.match(searchPattern);
                if (match) {
                    const keyStartIndex = match[1].length;
                    const keyEndIndex = keyStartIndex + keyName.length;

                    const startPos = new Position(i, keyStartIndex);
                    const endPos = new Position(i, keyEndIndex);

                    return {
                        position: startPos,
                        range: new Range(startPos, endPos),
                    };
                }
            }
        }

        return undefined;
    }

    /**
     * 转义正则表达式特殊字符
     */
    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
