import {
    ReferenceProvider,
    TextDocument,
    Position,
    Location,
    Range,
    CancellationToken,
    ReferenceContext,
    Uri
} from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { ILogger } from '../../core/interfaces/ILogger';
import { IConfiguration } from '../../core/interfaces/IConfiguration';
import { IDataStoreService } from '../../core/interfaces/IDataStoreService';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { PerformanceMonitor } from '../../infrastructure/performance/PerformanceMonitor';
import { YamlHelper } from '../../infrastructure/yaml/YamlHelper';

/**
 * 翻译引用提供者
 * 
 * 提供查找翻译键所有引用的功能，包括:
 * - 翻译定义位置（translations 部分）
 * - i18n 引用位置（<i18n:key>）
 * - l10n 引用位置（<l10n:key>）
 * 
 * 支持从定义处或引用处查找所有相关位置
 */
export class TranslationReferenceProvider implements ReferenceProvider {
    private readonly logger: ILogger;
    private readonly configuration: IConfiguration;
    private readonly performanceMonitor: PerformanceMonitor;
    private readonly dataStoreService: IDataStoreService;

    // 正则表达式模式
    private static readonly I18N_PATTERN = /<i18n:([a-z][a-z0-9._-]+)>/g;
    private static readonly L10N_PATTERN = /<l10n:([a-z][a-z0-9._-]+)>/g;
    private static readonly TRANSLATION_KEY_PATTERN = /^(\s*)([a-z][a-z0-9._-]+)\s*:/;

    constructor() {
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger)
            .createChild('TranslationReferenceProvider');
        this.configuration = ServiceContainer.getService<IConfiguration>(SERVICE_TOKENS.Configuration);
        this.performanceMonitor = ServiceContainer.getService<PerformanceMonitor>(
            SERVICE_TOKENS.PerformanceMonitor
        );
        this.dataStoreService = ServiceContainer.getService<IDataStoreService>(
            SERVICE_TOKENS.DataStoreService
        );
    }
    
    async provideReferences(
        document: TextDocument,
        position: Position,
        context: ReferenceContext,
        token?: CancellationToken
    ): Promise<Location[] | undefined> {
        const timer = this.performanceMonitor.startTimer('translation-references.provide');
        
        try {
            // 检查功能是否启用
            if (!this.configuration.get('references.enabled', true)) {
                return undefined;
            }
            
            if (token?.isCancellationRequested) {
                return undefined;
            }
            
            this.logger.debug('Providing translation references', {
                file: document.fileName,
                line: position.line,
                character: position.character,
                includeDeclaration: context.includeDeclaration
            });
            
            // 获取光标位置的翻译键信息
            const translationInfo = this.getTranslationKeyAtPosition(document, position);
            if (!translationInfo) {
                this.logger.debug('No translation key found at position');
                return undefined;
            }
            
            this.logger.debug('Translation key detected for references', {
                translationKey: translationInfo.key,
                type: translationInfo.type
            });
            
            // 搜索所有引用
            const locations = await this.findAllReferences(
                translationInfo.key,
                context.includeDeclaration
            );

            if (locations.length === 0) {
                this.logger.debug('No references found', {
                    translationKey: translationInfo.key
                });
                return undefined;
            }

            this.logger.debug('Translation references found', {
                translationKey: translationInfo.key,
                count: locations.length
            });

            return locations;
            
        } catch (error) {
            this.logger.error('Error providing translation references', error as Error, {
                file: document.fileName,
                position: { line: position.line, character: position.character }
            });
            return undefined;
        } finally {
            timer.stop({ 
                document: document.fileName 
            });
        }
    }
    
    /**
     * 获取光标位置的翻译键信息
     */
    private getTranslationKeyAtPosition(
        document: TextDocument, 
        position: Position
    ): { key: string; type: 'definition' | 'i18n' | 'l10n' } | undefined {
        const line = document.lineAt(position);
        const lineText = line.text;
        
        // 检查光标是否在注释中
        if (YamlHelper.isInComment(lineText, position.character)) {
            return undefined;
        }
        
        // 检查是否在翻译定义上（translations 部分的键名）
        const definitionMatch = this.getTranslationDefinitionAtPosition(document, position);
        if (definitionMatch) {
            return definitionMatch;
        }
        
        // 检查 i18n 引用
        const i18nMatch = this.findTranslationReferenceAtPosition(
            lineText, 
            position, 
            TranslationReferenceProvider.I18N_PATTERN,
            'i18n'
        );
        if (i18nMatch) {
            return i18nMatch;
        }
        
        // 检查 l10n 引用
        const l10nMatch = this.findTranslationReferenceAtPosition(
            lineText, 
            position, 
            TranslationReferenceProvider.L10N_PATTERN,
            'l10n'
        );
        if (l10nMatch) {
            return l10nMatch;
        }
        
        return undefined;
    }
    
    /**
     * 获取翻译定义位置的键名（在 translations 部分）
     */
    private getTranslationDefinitionAtPosition(
        document: TextDocument,
        position: Position
    ): { key: string; type: 'definition' } | undefined {
        const line = document.lineAt(position);
        const lineText = line.text;
        
        // 检查当前行是否是翻译键定义
        const match = lineText.match(TranslationReferenceProvider.TRANSLATION_KEY_PATTERN);
        if (!match) {
            return undefined;
        }
        
        const indent = match[1].length;
        const keyName = match[2];
        const keyStart = indent;
        const keyEnd = indent + keyName.length;
        
        // 检查光标是否在键名上
        if (position.character < keyStart || position.character > keyEnd) {
            return undefined;
        }
        
        // 验证是否在 translations 部分
        if (!this.isInTranslationsSection(document, position.line)) {
            return undefined;
        }
        
        return { key: keyName, type: 'definition' };
    }
    
    /**
     * 检查是否在 translations 部分
     */
    private isInTranslationsSection(document: TextDocument, lineNumber: number): boolean {
        // 向上查找 translations: 或类似的顶级键
        for (let i = lineNumber - 1; i >= 0; i--) {
            const line = document.lineAt(i);
            const text = line.text.trim();
            
            // 如果遇到其他顶级键，则不在 translations 部分
            if (text.match(/^[a-z][a-z0-9_-]+:/) && 
                !text.match(/^([a-z]{2}(_[a-z]{2})?):/)) {
                if (text.startsWith('translations:') || 
                    text.startsWith('i18n:') || 
                    text.startsWith('l10n:') ||
                    text.startsWith('translation:') ||
                    text.startsWith('localization:') ||
                    text.startsWith('internationalization:')) {
                    return true;
                }
                return false;
            }
        }
        
        return false;
    }
    
    /**
     * 在行中查找翻译引用
     */
    private findTranslationReferenceAtPosition(
        lineText: string,
        position: Position,
        pattern: RegExp,
        type: 'i18n' | 'l10n'
    ): { key: string; type: 'i18n' | 'l10n' } | undefined {
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
                return { key: keyName, type };
            }
        }
        
        return undefined;
    }
    
    /**
     * 查找翻译键的所有引用（基于内存索引）
     */
    private async findAllReferences(
        keyName: string,
        includeDeclaration: boolean
    ): Promise<Location[]> {
        const locations: Location[] = [];

        // 从 TranslationReferenceStore 获取引用位置（i18n/l10n 使用处）
        const refs = this.dataStoreService.getTranslationReferences(keyName);
        for (const ref of refs) {
            const uri = Uri.file(ref.sourceFile);
            const range = new Range(ref.lineNumber, ref.column, ref.lineNumber, ref.endColumn);
            locations.push(new Location(uri, range));
        }

        // 从 TranslationStore 获取定义位置
        if (includeDeclaration) {
            const definitions = await this.dataStoreService.getTranslationKeysByName(keyName);
            for (const def of definitions) {
                if (def.lineNumber !== undefined) {
                    const uri = Uri.file(def.sourceFile);
                    const line = def.lineNumber;
                    const range = new Range(line, 0, line, def.key.length);
                    locations.push(new Location(uri, range));
                }
            }
        }

        // 按文件名和行号排序，定义优先
        return locations.sort((a, b) => {
            const fileCompare = a.uri.fsPath.localeCompare(b.uri.fsPath);
            if (fileCompare !== 0) {
                return fileCompare;
            }
            return a.range.start.line - b.range.start.line;
        });
    }
}

