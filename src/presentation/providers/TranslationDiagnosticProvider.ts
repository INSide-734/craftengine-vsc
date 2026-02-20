import { type TextDocument, type Diagnostic, Range, Position, DiagnosticRelatedInformation, Location } from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { type IDataStoreService } from '../../core/interfaces/IDataStoreService';
import { type ITranslationKey } from '../../core/interfaces/ITranslation';
import { type IEventBus } from '../../core/interfaces/IEventBus';
import { type ISchemaService } from '../../core/interfaces/ISchemaService';
import { type IYamlPathParser } from '../../core/interfaces/IYamlPathParser';
import { type IYamlParser } from '../../core/interfaces/IYamlParser';
import { type IDataConfigLoader } from '../../core/interfaces/IDataConfigLoader';
import { type IYamlNode } from '../../core/interfaces/IYamlDocument';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { YamlHelper } from '../../infrastructure/yaml/YamlHelper';
import { generateEventId } from '../../infrastructure/utils';
import {
    TRANSLATION_NOT_FOUND,
    TRANSLATION_EMPTY_VALUE,
    TRANSLATION_DUPLICATE_KEY,
    TRANSLATION_MISSING_LANGUAGE,
} from '../../core/constants/DiagnosticCodes';
import { REFERENCE_MESSAGES } from '../../core/constants/DiagnosticMessages';
import { BaseDiagnosticProvider } from './BaseDiagnosticProvider';
import { SchemaFieldIdentifier } from './helpers/SchemaFieldIdentifier';

/**
 * 翻译诊断提供者
 *
 * 检测翻译键相关的错误和警告：
 * - 未定义的翻译键引用
 * - 空的翻译值
 * - 缺失的常用语言翻译
 * - 无效的翻译键格式
 */
export class TranslationDiagnosticProvider extends BaseDiagnosticProvider {
    private readonly dataStoreService: IDataStoreService;
    private readonly eventBus: IEventBus;
    private readonly fieldIdentifier: SchemaFieldIdentifier;
    private readonly yamlParser: IYamlParser;

    /** 诊断源标识 */
    static readonly DIAGNOSTIC_SOURCE = 'CraftEngine Translation';

    /** 翻译键补全提供者标识 */
    private static readonly TRANSLATION_KEY_PROVIDER = 'craftengine.translationKey';

    // 常用语言代码（用于检测缺失的翻译，从配置加载）
    private readonly commonLanguages: readonly string[];

    // 正则表达式模式（用于内联翻译引用检测）
    private static readonly I18N_PATTERN = /<i18n:([a-z][a-z0-9._-]+)>/g;
    private static readonly L10N_PATTERN = /<l10n:([a-z][a-z0-9._-]+)>/g;

    constructor() {
        super(
            'craftengine-translation',
            'CraftEngine Translation',
            'translation-diagnostics.update',
            'TranslationDiagnosticProvider',
        );
        this.dataStoreService = ServiceContainer.getService<IDataStoreService>(SERVICE_TOKENS.DataStoreService);
        this.eventBus = ServiceContainer.getService<IEventBus>(SERVICE_TOKENS.EventBus);
        this.yamlParser = ServiceContainer.getService<IYamlParser>(SERVICE_TOKENS.YamlParser);
        const schemaService = ServiceContainer.getService<ISchemaService>(SERVICE_TOKENS.SchemaService);
        const yamlPathParser = ServiceContainer.getService<IYamlPathParser>(SERVICE_TOKENS.YamlPathParser);
        this.fieldIdentifier = new SchemaFieldIdentifier(schemaService, yamlPathParser);
        // 从 MiniMessage 常量配置加载常用语言列表
        const configLoader = ServiceContainer.getService<IDataConfigLoader>(SERVICE_TOKENS.DataConfigLoader);
        const miniMessageConfig = configLoader.getMiniMessageConstantsConfigSync();
        this.commonLanguages = miniMessageConfig?.commonLanguages ?? [
            'en',
            'zh_cn',
            'ja',
            'ko',
            'de',
            'fr',
            'es',
            'ru',
            'pt_br',
        ];
    }

    /**
     * 执行翻译诊断
     */
    protected async doUpdateDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
        // 并行执行三个检查
        const [schemaBasedDiagnostics, inlineDiagnostics, translationSectionDiagnostics] = await Promise.all([
            this.checkSchemaBasedTranslationReferences(document),
            this.checkInlineTranslationReferences(document),
            this.checkTranslationsSection(document),
        ]);

        const diagnostics = [...schemaBasedDiagnostics, ...inlineDiagnostics, ...translationSectionDiagnostics];

        // 发布诊断更新事件
        await this.eventBus.publish('translation.diagnostics.updated', {
            id: generateEventId('trans-diag'),
            type: 'translation.diagnostics.updated',
            timestamp: new Date(),
            source: 'TranslationDiagnosticProvider',
            uri: document.uri,
            diagnosticCount: diagnostics.length,
        });

        return diagnostics;
    }

    /**
     * 基于 Schema 检查翻译键引用
     */
    private async checkSchemaBasedTranslationReferences(document: TextDocument): Promise<Diagnostic[]> {
        const diagnostics: Diagnostic[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const extracted = this.extractTranslationValueFromLine(lines[lineNum], lineNum);
            if (!extracted) {
                continue;
            }

            // 基于 Schema 检查此位置是否期望翻译键
            const position = new Position(lineNum, extracted.colonIndex + 1);
            const isTranslationField = await this.fieldIdentifier.isFieldOfType(
                document,
                position,
                TranslationDiagnosticProvider.TRANSLATION_KEY_PROVIDER,
            );
            if (!isTranslationField) {
                continue;
            }

            // 验证翻译键是否存在
            const keys = await this.dataStoreService.getTranslationKeysByName(extracted.cleanValue);

            if (keys.length === 0) {
                const diagnostic = this.createDiagnostic(
                    extracted.range,
                    REFERENCE_MESSAGES.translationNotFound(extracted.cleanValue),
                    TRANSLATION_NOT_FOUND,
                );
                if (diagnostic) {
                    diagnostic.relatedInformation = [
                        new DiagnosticRelatedInformation(
                            new Location(document.uri, extracted.range),
                            'Create this translation key in the translations section',
                        ),
                    ];
                    diagnostics.push(diagnostic);
                }
            } else {
                const emptyLanguages = keys.filter((k: ITranslationKey) => !k.value || k.value.trim() === '');
                if (emptyLanguages.length > 0) {
                    const langCodes = emptyLanguages.map((l: ITranslationKey) => l.languageCode);
                    const diagnostic = this.createDiagnostic(
                        extracted.range,
                        REFERENCE_MESSAGES.translationEmptyValue(extracted.cleanValue, langCodes),
                        TRANSLATION_EMPTY_VALUE,
                    );
                    if (diagnostic) {
                        diagnostics.push(diagnostic);
                    }
                }
            }
        }

        return diagnostics;
    }

    /**
     * 从行中提取翻译键值信息
     *
     * @returns 提取结果，如果行不包含有效翻译键则返回 undefined
     */
    private extractTranslationValueFromLine(
        line: string,
        lineNum: number,
    ): { cleanValue: string; range: Range; colonIndex: number } | undefined {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) {
            return undefined;
        }

        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) {
            return undefined;
        }

        const value = line.substring(colonIndex + 1).trim();
        if (!value) {
            return undefined;
        }

        if (YamlHelper.isInComment(line, colonIndex + 1)) {
            return undefined;
        }

        const cleanValue = value.replace(/^["']|["']$/g, '');
        const translationKeyPattern = /^[a-z][a-z0-9._-]*$/i;
        if (!translationKeyPattern.test(cleanValue)) {
            return undefined;
        }

        const valueStart =
            colonIndex +
            1 +
            (line.substring(colonIndex + 1).length - line.substring(colonIndex + 1).trimStart().length);
        const valueEnd = valueStart + value.length;
        const range = new Range(lineNum, valueStart, lineNum, valueEnd);

        return { cleanValue, range, colonIndex };
    }

    /**
     * 检查内联翻译键引用（i18n 和 l10n 标记）
     */
    private async checkInlineTranslationReferences(document: TextDocument): Promise<Diagnostic[]> {
        const diagnostics: Diagnostic[] = [];
        const text = document.getText();

        // 检查 i18n 引用
        const i18nDiags = await this.checkInlinePattern(TranslationDiagnosticProvider.I18N_PATTERN, text, document);
        diagnostics.push(...i18nDiags);

        // 检查 l10n 引用
        const l10nDiags = await this.checkInlinePattern(TranslationDiagnosticProvider.L10N_PATTERN, text, document);
        diagnostics.push(...l10nDiags);

        return diagnostics;
    }

    /**
     * 检查内联翻译模式
     */
    private async checkInlinePattern(pattern: RegExp, text: string, document: TextDocument): Promise<Diagnostic[]> {
        const diagnostics: Diagnostic[] = [];
        pattern.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
            const keyName = match[1];
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const range = new Range(startPos, endPos);

            const keys = await this.dataStoreService.getTranslationKeysByName(keyName);

            if (keys.length === 0) {
                const diagnostic = this.createDiagnostic(
                    range,
                    REFERENCE_MESSAGES.translationNotFound(keyName),
                    TRANSLATION_NOT_FOUND,
                );
                if (diagnostic) {
                    diagnostic.relatedInformation = [
                        new DiagnosticRelatedInformation(
                            new Location(document.uri, range),
                            'Create this translation key in the translations section',
                        ),
                    ];
                    diagnostics.push(diagnostic);
                }
            } else {
                const emptyLanguages = keys.filter((k: ITranslationKey) => !k.value || k.value.trim() === '');
                if (emptyLanguages.length > 0) {
                    const langCodes = emptyLanguages.map((l: ITranslationKey) => l.languageCode);
                    const diagnostic = this.createDiagnostic(
                        range,
                        REFERENCE_MESSAGES.translationEmptyValue(keyName, langCodes),
                        TRANSLATION_EMPTY_VALUE,
                    );
                    if (diagnostic) {
                        diagnostics.push(diagnostic);
                    }
                }
            }
        }

        return diagnostics;
    }

    /**
     * 检查 translations 部分的错误（基于 YAML AST 解析）
     */
    private async checkTranslationsSection(document: TextDocument): Promise<Diagnostic[]> {
        const diagnostics: Diagnostic[] = [];

        try {
            const parseResult = await this.yamlParser.parseDocument(document);
            if (!parseResult.success || !parseResult.root) {
                return diagnostics;
            }

            const translationsNode = parseResult.root.children?.get('translations');
            if (!translationsNode || translationsNode.type !== 'object' || !translationsNode.children) {
                return diagnostics;
            }

            // 收集翻译键并生成重复/空值诊断
            const { translationKeys, keyDiagnostics } = this.collectTranslationKeys(translationsNode);
            diagnostics.push(...keyDiagnostics);

            // 检查缺失的常用语言翻译
            const missingLanguages = this.checkMissingLanguages(translationKeys);
            for (const missing of missingLanguages) {
                const range = translationsNode.position?.range ?? new Range(0, 0, 0, 0);
                const diagnostic = this.createDiagnostic(
                    range,
                    REFERENCE_MESSAGES.translationMissingLanguage(missing.key, missing.languages),
                    TRANSLATION_MISSING_LANGUAGE,
                );
                if (diagnostic) {
                    diagnostics.push(diagnostic);
                }
            }
        } catch (error) {
            this.logger.error('Failed to check translations section', error as Error);
        }

        return diagnostics;
    }

    /**
     * 从 translations AST 节点收集翻译键，同时生成重复键和空值诊断
     */
    private collectTranslationKeys(translationsNode: IYamlNode): {
        translationKeys: Map<string, { languages: Set<string> }>;
        keyDiagnostics: Diagnostic[];
    } {
        const translationKeys = new Map<string, { languages: Set<string> }>();
        const keyDiagnostics: Diagnostic[] = [];

        for (const [langKey, langNode] of translationsNode.children!) {
            const currentLanguage = String(langKey);
            if (langNode.type !== 'object' || !langNode.children) {
                continue;
            }

            for (const [keyName, keyNode] of langNode.children) {
                const key = String(keyName);
                const value = keyNode.value !== null && keyNode.value !== undefined ? String(keyNode.value).trim() : '';

                const existing = translationKeys.get(key);
                if (!existing) {
                    translationKeys.set(key, { languages: new Set([currentLanguage]) });
                } else if (existing.languages.has(currentLanguage)) {
                    if (keyNode.position) {
                        const diagnostic = this.createDiagnostic(
                            keyNode.position.range,
                            REFERENCE_MESSAGES.translationDuplicateKey(key, currentLanguage),
                            TRANSLATION_DUPLICATE_KEY,
                        );
                        if (diagnostic) {
                            keyDiagnostics.push(diagnostic);
                        }
                    }
                } else {
                    existing.languages.add(currentLanguage);
                }

                if (!value && keyNode.position) {
                    const diagnostic = this.createDiagnostic(
                        keyNode.position.range,
                        REFERENCE_MESSAGES.translationEmptyValue(key, [currentLanguage]),
                        TRANSLATION_EMPTY_VALUE,
                    );
                    if (diagnostic) {
                        keyDiagnostics.push(diagnostic);
                    }
                }
            }
        }

        return { translationKeys, keyDiagnostics };
    }

    /**
     * 检查缺失的常用语言翻译
     */
    private checkMissingLanguages(
        translationKeys: Map<string, { languages: Set<string> }>,
    ): Array<{ key: string; languages: string[] }> {
        const missing: Array<{ key: string; languages: string[] }> = [];

        for (const [keyName, keyInfo] of translationKeys.entries()) {
            const missingLanguages = this.commonLanguages.filter((lang) => !keyInfo.languages.has(lang));

            if (missingLanguages.length > 0) {
                missing.push({ key: keyName, languages: missingLanguages });
            }
        }

        return missing;
    }
}
