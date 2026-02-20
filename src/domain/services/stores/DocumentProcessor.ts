import { type EditorUri } from '../../../core/types/EditorTypes';
import { type ITranslationKey } from '../../../core/interfaces/ITranslation';
import { type IItemId, type ItemType } from '../../../core/interfaces/IItemId';
import { type ICategory } from '../../../core/interfaces/ICategory';
import { type ILogger } from '../../../core/interfaces/ILogger';
import { type ISchemaConfig } from '../../../core/types/ConfigTypes';
import { type TemplateStore } from './TemplateStore';
import { type TranslationStore } from './TranslationStore';
import { type TranslationReferenceStore } from './TranslationReferenceStore';
import { type ItemStore } from './ItemStore';
import { type CategoryStore } from './CategoryStore';
import { type TemplateParserService } from '../template/TemplateParserService';
import * as yaml from 'yaml';

/** 默认 section 键名（配置加载失败时的回退值） */
const DEFAULT_SECTIONS = {
    templateKey: 'templates',
    itemsKey: 'items',
    blocksKey: 'blocks',
    furnitureKey: 'furniture',
    categoriesKey: 'categories',
};

/** 默认正则模式（配置加载失败时的回退值） */
const DEFAULT_PATTERNS = {
    namespacedId: '^[a-z][a-z0-9_-]*:[a-z][a-z0-9_/-]*$',
    i18nReference: '<i18n:([a-z][a-z0-9._-]+)>',
    l10nReference: '<l10n:([a-z][a-z0-9._-]+)>',
};

/**
 * 文档处理器
 *
 * 负责从 YAML 文档中提取模板、翻译键、物品 ID 和分类。
 * 模板解析委托给 TemplateParserService 处理。
 */
export class DocumentProcessor {
    /** 模板键名 */
    private readonly templateKey: string;
    /** 物品定义键名 */
    private readonly itemsKey: string;
    /** 方块定义键名 */
    private readonly blocksKey: string;
    /** 家具定义键名 */
    private readonly furnitureKey: string;
    /** 分类定义键名 */
    private readonly categoriesKey: string;

    /** 命名空间 ID 正则表达式 */
    private readonly namespacedIdPattern: RegExp;
    /** i18n 引用正则 */
    private readonly i18nPattern: RegExp;
    /** l10n 引用正则 */
    private readonly l10nPattern: RegExp;

    constructor(
        private readonly logger: ILogger,
        private readonly templateStore: TemplateStore,
        private readonly translationStore: TranslationStore,
        private readonly itemStore: ItemStore,
        private readonly categoryStore: CategoryStore,
        private readonly templateParser?: TemplateParserService,
        private readonly translationReferenceStore?: TranslationReferenceStore,
        schemaConfig?: ISchemaConfig,
    ) {
        // 从配置加载 section 键名和正则模式
        const sections = schemaConfig?.documentSections ?? DEFAULT_SECTIONS;
        this.templateKey = sections.templateKey;
        this.itemsKey = sections.itemsKey;
        this.blocksKey = sections.blocksKey;
        this.furnitureKey = sections.furnitureKey;
        this.categoriesKey = sections.categoriesKey;

        const patterns = schemaConfig?.documentPatterns ?? DEFAULT_PATTERNS;
        this.namespacedIdPattern = new RegExp(patterns.namespacedId);
        this.i18nPattern = new RegExp(patterns.i18nReference, 'g');
        this.l10nPattern = new RegExp(patterns.l10nReference, 'g');
    }

    /**
     * 处理 YAML 文档，提取模板、翻译键和物品 ID
     */
    async processDocument(sourceFile: EditorUri, content: string): Promise<void> {
        try {
            const parsed = yaml.parse(content);

            if (!parsed || typeof parsed !== 'object') {
                return;
            }

            const lines = content.split('\n');

            // 提取模板、物品和分类
            for (const topLevelKey in parsed) {
                // 提取模板
                if (topLevelKey.startsWith(this.templateKey)) {
                    const templatesNode = parsed[topLevelKey];
                    if (templatesNode && typeof templatesNode === 'object' && !Array.isArray(templatesNode)) {
                        await this.extractTemplates(templatesNode, lines, sourceFile);
                    }
                }

                // 提取物品 ID
                if (topLevelKey.startsWith(this.itemsKey)) {
                    const itemsNode = parsed[topLevelKey];
                    if (itemsNode && typeof itemsNode === 'object' && !Array.isArray(itemsNode)) {
                        await this.extractItems(itemsNode, lines, sourceFile, 'item');
                    }
                }

                // 提取方块 ID
                if (topLevelKey.startsWith(this.blocksKey)) {
                    const blocksNode = parsed[topLevelKey];
                    if (blocksNode && typeof blocksNode === 'object' && !Array.isArray(blocksNode)) {
                        await this.extractItems(blocksNode, lines, sourceFile, 'block');
                    }
                }

                // 提取家具 ID
                if (topLevelKey.startsWith(this.furnitureKey)) {
                    const furnitureNode = parsed[topLevelKey];
                    if (furnitureNode && typeof furnitureNode === 'object' && !Array.isArray(furnitureNode)) {
                        await this.extractItems(furnitureNode, lines, sourceFile, 'furniture');
                    }
                }

                // 提取分类
                if (topLevelKey.startsWith(this.categoriesKey)) {
                    const categoriesNode = parsed[topLevelKey];
                    if (categoriesNode && typeof categoriesNode === 'object' && !Array.isArray(categoriesNode)) {
                        await this.extractCategories(categoriesNode, lines, sourceFile);
                    }
                }
            }

            // 提取翻译键
            const translations =
                parsed.translations ||
                parsed.translation ||
                parsed.i18n ||
                parsed.internationalization ||
                parsed.l10n ||
                parsed.localization;

            if (translations && typeof translations === 'object') {
                await this.extractTranslations(sourceFile, translations, lines);
            }

            // 提取 i18n/l10n 引用
            if (this.translationReferenceStore) {
                this.extractTranslationReferences(sourceFile, lines);
            }
        } catch (error) {
            this.logger.warn('Failed to parse document', {
                file: sourceFile.fsPath,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * 从节点中提取模板
     *
     * 委托给 TemplateParserService 处理模板创建
     */
    private async extractTemplates(
        templatesNode: Record<string, unknown>,
        lines: string[],
        sourceFile: EditorUri,
    ): Promise<void> {
        for (const templateKey in templatesNode) {
            // 有效模板名必须包含冒号
            if (!templateKey.includes(':')) {
                continue;
            }

            try {
                const definition = templatesNode[templateKey];
                const template = this.templateParser
                    ? this.templateParser.createTemplate(templateKey, definition, lines, sourceFile)
                    : null;

                if (template) {
                    await this.templateStore.addWithoutEvent(template);
                }
            } catch (error) {
                this.logger.debug('Error parsing template', {
                    templateKey,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }

    /**
     * 从节点中提取物品 ID
     *
     * @param itemsNode - 物品定义节点
     * @param lines - 文档行内容
     * @param sourceFile - 源文件路径
     * @param type - 物品类型（item/block/furniture）
     */
    private async extractItems(
        itemsNode: Record<string, unknown>,
        lines: string[],
        sourceFile: EditorUri,
        type: ItemType = 'item',
    ): Promise<void> {
        for (const itemKey in itemsNode) {
            // 验证物品 ID 格式（命名空间:物品名）
            if (!this.namespacedIdPattern.test(itemKey)) {
                continue;
            }

            try {
                const definition = itemsNode[itemKey];
                const item = this.createItemId(itemKey, definition, lines, sourceFile, type);

                if (item) {
                    this.itemStore.addWithoutLog(item);
                }
            } catch (error) {
                this.logger.debug('Error parsing item', {
                    itemKey,
                    type,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }

    /**
     * 创建物品 ID 信息
     *
     * @param id - 完整物品 ID
     * @param definition - 物品定义对象
     * @param lines - 文档行内容
     * @param sourceFile - 源文件路径
     * @param type - 物品类型（item/block/furniture）
     */
    private createItemId(
        id: string,
        definition: unknown,
        lines: string[],
        sourceFile: EditorUri,
        type: ItemType = 'item',
    ): IItemId | null {
        // 解析命名空间和名称
        const colonIndex = id.indexOf(':');
        if (colonIndex === -1) {
            return null;
        }

        const namespace = id.substring(0, colonIndex);
        const name = id.substring(colonIndex + 1);

        // 提取材质信息
        let material: string | undefined;
        if (definition && typeof definition === 'object' && !Array.isArray(definition)) {
            const defObj = definition as Record<string, unknown>;
            if (typeof defObj.material === 'string') {
                material = defObj.material;
            }
        }

        // 查找行号
        const lineNumber = this.findLineNumber(lines, id);

        return {
            id,
            namespace,
            name,
            type,
            material,
            sourceFile: sourceFile.fsPath,
            lineNumber,
        };
    }

    /**
     * 提取翻译键
     */
    private async extractTranslations(
        sourceFile: EditorUri,
        translations: Record<string, unknown>,
        lines: string[],
    ): Promise<void> {
        for (const [languageCode, languageTranslations] of Object.entries(translations)) {
            if (!/^[a-z]{2}(_[a-z]{2})?$/i.test(languageCode)) {
                continue;
            }

            if (!languageTranslations || typeof languageTranslations !== 'object') {
                continue;
            }

            for (const [key, value] of Object.entries(languageTranslations as Record<string, unknown>)) {
                if (!/^[a-z][a-z0-9._-]*$/i.test(key)) {
                    continue;
                }

                const normalizedLangCode = languageCode.toLowerCase();

                const translationKey: ITranslationKey = {
                    key,
                    fullPath: `${normalizedLangCode}.${key}`,
                    languageCode: normalizedLangCode,
                    value: typeof value === 'string' ? value : undefined,
                    sourceFile: sourceFile.fsPath,
                    lineNumber: this.findLineNumber(lines, key),
                };

                await this.translationStore.addWithoutLog(translationKey);
            }
        }
    }

    /**
     * 从节点中提取分类
     */
    private async extractCategories(
        categoriesNode: Record<string, unknown>,
        lines: string[],
        sourceFile: EditorUri,
    ): Promise<void> {
        for (const categoryKey in categoriesNode) {
            // 验证分类 ID 格式（命名空间:分类名）
            if (!this.namespacedIdPattern.test(categoryKey)) {
                continue;
            }

            try {
                const definition = categoriesNode[categoryKey];
                const category = this.createCategory(categoryKey, definition, lines, sourceFile);

                if (category) {
                    await this.categoryStore.addCategory(category);
                }
            } catch (error) {
                this.logger.debug('Error parsing category', {
                    categoryKey,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }

    /**
     * 创建分类信息
     */
    private createCategory(id: string, definition: unknown, lines: string[], sourceFile: EditorUri): ICategory | null {
        // 解析命名空间和名称
        const colonIndex = id.indexOf(':');
        if (colonIndex === -1) {
            return null;
        }

        const namespace = id.substring(0, colonIndex);
        const name = id.substring(colonIndex + 1);

        // 提取分类属性
        let displayName: string | undefined;
        let description: string[] | undefined;
        let icon: string | undefined;
        let hidden: boolean | undefined;
        let priority: number | undefined;

        if (definition && typeof definition === 'object' && !Array.isArray(definition)) {
            const defObj = definition as Record<string, unknown>;

            if (typeof defObj.name === 'string') {
                displayName = defObj.name;
            }

            if (Array.isArray(defObj.lore)) {
                description = defObj.lore.filter((item): item is string => typeof item === 'string');
            }

            if (typeof defObj.icon === 'string') {
                icon = defObj.icon;
            }

            if (typeof defObj.hidden === 'boolean') {
                hidden = defObj.hidden;
            }

            if (typeof defObj.priority === 'number') {
                priority = defObj.priority;
            }
        }

        // 查找行号
        const lineNumber = this.findLineNumber(lines, id);

        return {
            id: `#${id}`, // 添加 # 前缀
            namespace,
            name,
            displayName,
            description,
            icon,
            hidden,
            priority,
            sourceFile: sourceFile.fsPath,
            lineNumber,
        };
    }

    /**
     * 查找行号
     */
    private findLineNumber(lines: string[], searchKey: string): number | undefined {
        const escapedKey = searchKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`^\\s*${escapedKey}\\s*:`);

        for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) {
                return i;
            }
        }
        return undefined;
    }

    /**
     * 从文档所有行中提取 i18n/l10n 引用
     */
    private extractTranslationReferences(sourceFile: EditorUri, lines: string[]): void {
        const filePath = sourceFile.fsPath;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            this.extractRefsFromLine(filePath, line, i, this.i18nPattern, 'i18n');
            this.extractRefsFromLine(filePath, line, i, this.l10nPattern, 'l10n');
        }
    }

    /**
     * 从单行中提取指定模式的翻译引用
     */
    private extractRefsFromLine(
        sourceFile: string,
        lineText: string,
        lineNumber: number,
        pattern: RegExp,
        type: 'i18n' | 'l10n',
    ): void {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(lineText)) !== null) {
            const key = match[1];
            const column = match.index;
            const endColumn = column + match[0].length;

            this.translationReferenceStore!.addReference({
                key,
                type,
                sourceFile,
                lineNumber,
                column,
                endColumn,
            });
        }
    }
}
