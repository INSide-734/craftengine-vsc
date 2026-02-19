import { CompletionItem, CompletionItemKind, MarkdownString, CancellationToken } from 'vscode';
import { IDataStoreService } from '../../../../core/interfaces/IDataStoreService';
import { ITranslationKey } from '../../../../core/interfaces/ITranslation';
import { ILogger } from '../../../../core/interfaces/ILogger';
import { CompletionItemWithStrategy } from '../../../types/CompletionTypes';
import {
    TranslationMode,
    TranslationValidationStatus,
    PATTERNS,
    COMMON_LANGUAGES
} from './types';

/**
 * 翻译键补全处理器
 * 
 * 负责处理翻译键相关的所有补全：
 * - i18n/l10n 标签参数补全
 * - 纯翻译键补全
 * - 翻译键解析和验证
 */
export class TranslationHandler {
    constructor(
        private readonly dataStoreService: IDataStoreService,
        private readonly logger: ILogger,
        private readonly strategyName: string
    ) {}
    
    // ==================== 翻译键补全 ====================
    
    /**
     * 提供翻译键补全（用于 i18n/l10n 标签参数）
     */
    async provideTranslationKeyCompletions(linePrefix: string): Promise<CompletionItem[]> {
        const match = linePrefix.match(PATTERNS.TRANSLATION_TAG);
        if (!match) {
            return [];
        }
        
        const tagType = match[1].toLowerCase() as 'i18n' | 'l10n';
        const prefix = match[2] || '';
        
        return this.searchAndCreateItems(prefix, tagType);
    }
    
    /**
     * 提供纯翻译键补全（用于 translation-only 模式）
     */
    async providePureTranslationKeyCompletions(
        linePrefix: string,
        mode: TranslationMode
    ): Promise<CompletionItem[]> {
        const trimmedPrefix = linePrefix.trim();
        const match = trimmedPrefix.match(PATTERNS.PURE_TRANSLATION_KEY);
        const prefix = match ? match[1] : '';
        
        return this.searchAndCreateItems(prefix, mode);
    }
    
    /**
     * 搜索翻译键并创建补全项
     */
    private async searchAndCreateItems(
        prefix: string,
        mode: TranslationMode
    ): Promise<CompletionItem[]> {
        try {
            const translationKeys = await this.dataStoreService.searchTranslationKeys(prefix);
            
            if (translationKeys.length === 0) {
                return [];
            }
            
            return translationKeys.map((key: ITranslationKey) => 
                this.createCompletionItem(key, mode)
            );
            
        } catch (error) {
            this.logger.error('Failed to search translation keys', error as Error);
            return [];
        }
    }
    
    /**
     * 创建翻译键补全项
     */
    private createCompletionItem(
        translationKey: ITranslationKey,
        mode: TranslationMode
    ): CompletionItem {
        const isTagMode = mode === 'i18n' || mode === 'l10n';
        const insertText = isTagMode ? `${translationKey.key}>` : translationKey.key;
        const detail = mode === 'i18n' 
            ? '🌐 Server-side translation' 
            : mode === 'l10n' 
                ? '🌍 Client-side translation' 
                : '🔑 Translation Key';
        
        const item = new CompletionItem(translationKey.key, CompletionItemKind.Value);
        item.insertText = insertText;
        item.detail = detail;
        item.sortText = translationKey.key;
        item.filterText = translationKey.key;
        
        if (translationKey.value) {
            const md = new MarkdownString();
            md.isTrusted = true;
            md.appendMarkdown(`## 🔑 \`${translationKey.key}\`\n\n`);
            md.appendMarkdown(`**Language:** \`${translationKey.languageCode}\`\n\n`);
            md.appendMarkdown(`**Value:** ${translationKey.value}\n\n`);
            if (isTagMode) {
                md.appendMarkdown(`---\n\n### Usage\n\n`);
                md.appendCodeblock(`<${mode}:${translationKey.key}>`, 'yaml');
            }
            item.documentation = md;
        }
        
        (item as CompletionItemWithStrategy)._strategy = this.strategyName;
        (item as CompletionItemWithStrategy)._translationKey = translationKey.key;
        
        return item;
    }
    
    // ==================== 翻译键解析 ====================
    
    /**
     * 解析翻译键补全项（提供详细信息）
     */
    async resolveTranslationKeyItem(
        item: CompletionItem,
        keyName: string,
        token?: CancellationToken
    ): Promise<CompletionItem> {
        if (token?.isCancellationRequested) {
            return item;
        }
        
        try {
            const keys = await this.dataStoreService.getTranslationKeysByName(keyName);
            
            if (token?.isCancellationRequested) {
                return item;
            }
            
            if (keys.length === 0) {
                item.documentation = this.buildNotFoundDocumentation(keyName);
                item.detail = `${item.detail} ⚠️ Not found`;
                return item;
            }
            
            const validationStatus = this.validateTranslationKey(keys);
            item.documentation = this.buildDetailedDocumentation(keyName, keys, validationStatus);
            
            const issueCount = validationStatus.errors.length + validationStatus.warnings.length;
            if (issueCount > 0) {
                item.detail = `${item.detail} ⚠️ ${issueCount} issue(s)`;
            }
            
            return item;
            
        } catch (error) {
            this.logger.error('Failed to resolve translation key item', error as Error);
            return item;
        }
    }
    
    // ==================== 验证和文档构建 ====================
    
    /**
     * 验证翻译键状态
     */
    private validateTranslationKey(keys: ITranslationKey[]): TranslationValidationStatus {
        const status: TranslationValidationStatus = {
            hasErrors: false,
            hasWarnings: false,
            errors: [],
            warnings: [],
            missingLanguages: []
        };
        
        if (keys.length === 0) {
            status.hasErrors = true;
            status.errors.push('Translation key not found in any language');
            return status;
        }
        
        const availableLanguages = new Set<string>();
        const emptyValueLanguages: string[] = [];
        
        for (const key of keys) {
            availableLanguages.add(key.languageCode);
            if (!key.value || key.value.trim() === '') {
                emptyValueLanguages.push(key.languageCode);
            }
        }
        
        if (emptyValueLanguages.length > 0) {
            status.hasWarnings = true;
            status.warnings.push(
                `${emptyValueLanguages.length} language(s) have empty values: ${emptyValueLanguages.join(', ')}`
            );
        }
        
        const missingLanguages = COMMON_LANGUAGES.filter(lang => !availableLanguages.has(lang));
        status.missingLanguages = missingLanguages;
        
        if (missingLanguages.length > 0 && missingLanguages.length <= 3) {
            status.hasWarnings = true;
            status.warnings.push(
                `Missing translations for common languages: ${missingLanguages.join(', ')}`
            );
        } else if (missingLanguages.length > 5) {
            status.hasErrors = true;
            status.errors.push(
                `Missing translations for ${missingLanguages.length} common languages`
            );
        }
        
        return status;
    }
    
    /**
     * 构建详细翻译文档
     */
    private buildDetailedDocumentation(
        keyName: string,
        keys: ITranslationKey[],
        validationStatus: TranslationValidationStatus
    ): MarkdownString {
        const md = new MarkdownString();
        md.isTrusted = true;
        
        md.appendMarkdown(`## 🔑 Translation Key: \`${keyName}\`\n\n`);
        
        if (validationStatus.hasErrors) {
            md.appendMarkdown('### ❌ Errors\n\n');
            validationStatus.errors.forEach(e => md.appendMarkdown(`- ${e}\n`));
            md.appendMarkdown('\n');
        }
        
        if (validationStatus.hasWarnings) {
            md.appendMarkdown('### ⚠️ Warnings\n\n');
            validationStatus.warnings.forEach(w => md.appendMarkdown(`- ${w}\n`));
            md.appendMarkdown('\n');
        }
        
        if (validationStatus.missingLanguages.length > 0) {
            md.appendMarkdown('### 💡 Missing Translations\n\n');
            validationStatus.missingLanguages.forEach(l => md.appendMarkdown(`- \`${l}\`\n`));
            md.appendMarkdown('\n');
        }
        
        md.appendMarkdown('### 🌍 Available Translations\n\n');
        const sortedKeys = [...keys].sort((a, b) => a.languageCode.localeCompare(b.languageCode));
        for (const key of sortedKeys) {
            const isEmpty = !key.value || key.value.trim() === '';
            const icon = isEmpty ? '⚠️' : '✅';
            md.appendMarkdown(`${icon} **\`${key.languageCode}\`**: ${key.value || '(empty)'}\n`);
        }
        
        md.appendMarkdown('\n---\n\n### 📋 Usage\n\n');
        md.appendCodeblock(
            `# i18n (server-side)\nitem-name: "<i18n:${keyName}>"\n\n# l10n (client-side)\nitem-name: "<l10n:${keyName}>"`,
            'yaml'
        );
        
        return md;
    }
    
    /**
     * 构建未找到翻译键的文档
     */
    private buildNotFoundDocumentation(keyName: string): MarkdownString {
        const md = new MarkdownString();
        md.isTrusted = true;
        
        md.appendMarkdown(`## ⚠️ Translation Key Not Found: \`${keyName}\`\n\n`);
        md.appendMarkdown('This translation key does not exist in any translation files.\n\n');
        md.appendMarkdown('### 💡 Suggestions\n\n');
        md.appendMarkdown('1. **Create the translation key** in your translation files\n');
        md.appendMarkdown('2. **Check for typos** in the key name\n');
        md.appendMarkdown('3. **Verify the key exists** in the correct language files\n\n');
        md.appendMarkdown('### 📋 Example\n\n');
        md.appendCodeblock(
            `translations:\n  en:\n    ${keyName}: "Your translation here"`,
            'yaml'
        );
        
        return md;
    }
}

