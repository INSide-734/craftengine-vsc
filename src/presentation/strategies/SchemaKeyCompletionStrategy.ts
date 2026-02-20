import { CompletionItem, CompletionItemKind, type CancellationToken, SnippetString } from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import {
    type ICompletionStrategy,
    type ICompletionContextInfo,
    type ICompletionResult,
} from '../../core/interfaces/ICompletionStrategy';
import { type ISchemaService, type IJsonSchema } from '../../core/interfaces/ISchemaService';
import { type IYamlPathParser } from '../../core/interfaces/IYamlPathParser';
import { type ILogger } from '../../core/interfaces/ILogger';
import { type IConfiguration } from '../../core/interfaces/IConfiguration';
import { type IDataConfigLoader } from '../../core/interfaces/IDataConfigLoader';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { VersionConditionHelper } from './helpers/VersionConditionHelper';
import { SchemaKeyDocumentationBuilder } from './helpers/SchemaKeyDocumentationBuilder';

/**
 * Schema 键名补全策略
 *
 * 基于 JSON Schema 为 YAML 文件提供键名自动补全功能。
 * 根据当前光标位置的 YAML 路径，查询 Schema 中定义的可用属性，
 * 并生成相应的补全建议。
 *
 * ## 功能特性
 * - 支持固定属性（properties）和模式属性（patternProperties）的补全
 * - 自动过滤已存在的键，避免重复
 * - 根据 Schema 类型生成智能代码片段（对象、数组、枚举等）
 * - 支持必需属性标记和弃用属性标记
 * - 提供丰富的文档提示（类型、描述、示例等）
 *
 * ## 优先级
 * 优先级为 85，仅次于 SchemaAwareCompletionStrategy（90）
 *
 * @example
 * // 在 YAML 文件中输入时触发补全
 * items:
 *   minecraft:diamond:
 *     | <- 此处触发，显示该位置可用的 Schema 属性
 */
export class SchemaKeyCompletionStrategy implements ICompletionStrategy {
    readonly name = 'schema-key';
    readonly priority: number;
    readonly triggerCharacters: string[] = [' ', '\n', ':', '$'];

    /** 扫描已存在键时的最大行数限制 */
    private static readonly MAX_SCAN_LINES = 100;

    private readonly schemaService: ISchemaService;
    private readonly pathParser: IYamlPathParser;
    private readonly logger: ILogger;
    private readonly config: IConfiguration;
    private readonly versionHelper: VersionConditionHelper;
    private readonly docBuilder: SchemaKeyDocumentationBuilder;

    constructor() {
        this.schemaService = ServiceContainer.getService<ISchemaService>(SERVICE_TOKENS.SchemaService);
        this.pathParser = ServiceContainer.getService<IYamlPathParser>(SERVICE_TOKENS.YamlPathParser);
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild('SchemaKeyCompletion');
        this.config = ServiceContainer.getService<IConfiguration>(SERVICE_TOKENS.Configuration);
        this.versionHelper = new VersionConditionHelper();
        this.docBuilder = new SchemaKeyDocumentationBuilder(this.config);

        // 从配置文件加载优先级
        const configLoader = ServiceContainer.getService<IDataConfigLoader>(SERVICE_TOKENS.DataConfigLoader);
        this.priority = configLoader.getCompletionPrioritySync('schemaKey', false);
    }

    /**
     * 判断是否应该激活此策略
     *
     * 激活条件：
     * 1. 配置中启用了 schema 键补全
     * 2. 当前文档是 YAML 文件
     * 3. 光标不在值部分（冒号后有内容）
     * 4. 光标不在注释中
     * 5. 光标在新行开始、冒号后或列表项处
     * 6. 当前路径有对应的 Schema 定义
     *
     * @param context 补全上下文信息
     * @returns 是否激活此策略
     */
    shouldActivate(context: ICompletionContextInfo): boolean {
        try {
            // 检查配置开关
            if (!this.config.get('completion.schemaKeys.enabled', true)) {
                this.logger.debug('Schema key completion disabled by config');
                return false;
            }
            // 只处理 YAML 文件
            if (context.document.languageId !== 'yaml') {
                return false;
            }

            const linePrefix = context.linePrefix.trim();

            // 光标在值部分（冒号后有内容）时不激活
            const colonIndex = linePrefix.lastIndexOf(':');
            if (colonIndex >= 0 && linePrefix.slice(colonIndex + 1).trim().length > 0) {
                this.logger.debug('Schema key completion skipped: cursor after value', {
                    linePrefix,
                    colonIndex,
                });
                return false;
            }
            // 光标在注释中时不激活
            if (linePrefix.indexOf('#') >= 0) {
                return false;
            }

            // 只在新行、冒号后、列表项或版本条件开始处提供键名补全
            const isVersionConditionStart = linePrefix === '$$' || linePrefix.startsWith('$$');
            if (linePrefix !== '' && !linePrefix.endsWith(':') && linePrefix !== '-' && !isVersionConditionStart) {
                this.logger.debug('Schema key completion skipped: not at key position', {
                    linePrefix,
                    rawLinePrefix: context.linePrefix,
                });
                return false;
            }

            // 检查当前路径是否有 Schema 定义
            const currentPath = this.pathParser.parsePath(context.document, context.position);
            const hasSchema = this.schemaService.hasSchemaForPath(currentPath);

            this.logger.debug('Schema key completion activation check', {
                currentPath,
                hasSchema,
                position: `${context.position.line}:${context.position.character}`,
            });

            return hasSchema;
        } catch (error) {
            this.logger.error('Error in shouldActivate', error as Error);
            return false;
        }
    }

    /**
     * 提供补全项
     *
     * 工作流程：
     * 1. 解析当前 YAML 路径
     * 2. 从 Schema 获取可用属性
     * 3. 获取当前层级已存在的键
     * 4. 分离固定属性和模式属性，决定是否显示模式属性
     * 5. 过滤已存在的键
     * 6. 为每个属性创建补全项
     *
     * @param context 补全上下文信息
     * @param token 取消令牌
     * @returns 补全结果
     */
    async provideCompletionItems(
        context: ICompletionContextInfo,
        token?: CancellationToken,
    ): Promise<ICompletionResult | undefined> {
        try {
            if (token?.isCancellationRequested) {
                return undefined;
            }

            // 解析当前 YAML 路径并获取可用属性
            const currentPath = this.pathParser.parsePath(context.document, context.position);
            const availableProperties = await this.schemaService.getAvailableProperties(currentPath);

            if (availableProperties.length === 0) {
                return undefined;
            }

            // 获取当前层级已存在的键，用于过滤重复
            const existingKeys = this.getExistingKeysAtCurrentLevel(context);
            const linePrefix = context.linePrefix.trimStart();

            // 过滤属性
            const filteredProperties = this.filterAvailableProperties(
                availableProperties,
                existingKeys,
                linePrefix,
                currentPath,
                context,
            );

            if (filteredProperties.length === 0) {
                return undefined;
            }

            // 创建补全项
            const items: CompletionItem[] = [];
            for (const prop of filteredProperties) {
                if (token?.isCancellationRequested) {
                    break;
                }
                const propItems = await this.createCompletionItem(prop, linePrefix);
                if (propItems) {
                    items.push(...propItems);
                }
            }

            return { items, isIncomplete: false, completionType: this.name, priority: this.priority };
        } catch (error) {
            this.logger.error('Error providing schema key completion', error as Error);
            // 主逻辑失败时尝试降级补全
            return this.provideFallbackCompletions(context, token).catch(() => undefined);
        }
    }

    /**
     * 过滤可用属性
     *
     * 根据模式属性类型、版本条件、已存在键等条件过滤
     */
    private filterAvailableProperties(
        availableProperties: Array<{ key: string; schema: IJsonSchema }>,
        existingKeys: string[],
        linePrefix: string,
        currentPath: string[],
        context: ICompletionContextInfo,
    ): Array<{ key: string; schema: IJsonSchema }> {
        const isPatternProp = (key: string) => key.startsWith('[') && key.endsWith(']');

        const isVersionConditionProp = (prop: { key: string; schema: IJsonSchema }) => {
            if (!isPatternProp(prop.key)) {
                return false;
            }
            const completionKey = prop.schema['x-completion-key'] as string | undefined;
            return completionKey === 'craftengine.versionCondition';
        };

        const isTypingVersionCondition = linePrefix.includes('$$') || linePrefix.endsWith('$');
        const fixedCount = availableProperties.filter((p) => !isPatternProp(p.key)).length;
        const patternCount = availableProperties.length - fixedCount;

        const shouldShowPatternProps = this.shouldShowPatternProperties(currentPath, fixedCount, patternCount, context);

        return availableProperties.filter((prop) => {
            if (isVersionConditionProp(prop)) {
                return isTypingVersionCondition;
            }
            if (isPatternProp(prop.key)) {
                return shouldShowPatternProps;
            }
            return !existingKeys.includes(prop.key);
        });
    }

    /**
     * 创建单个补全项
     *
     * @param prop 属性信息，包含键名和 Schema 定义
     * @param linePrefix 用户已输入的行前缀
     * @returns 补全项数组（版本条件会返回多个），失败时返回 undefined
     */
    private async createCompletionItem(
        prop: { key: string; schema: IJsonSchema },
        linePrefix?: string,
    ): Promise<CompletionItem[] | undefined> {
        try {
            // 判断是否为模式属性
            const isPattern = prop.key.startsWith('[') && prop.key.endsWith(']');
            const pattern = isPattern ? (prop.schema['x-pattern'] as string) || prop.key.slice(1, -1) : null;
            const analysis = pattern ? this.docBuilder.analyzePattern(pattern, prop.schema) : null;

            // 如果是版本条件模式，生成版本条件补全项
            if (analysis?.isVersionCondition || analysis?.completionKey === 'craftengine.versionCondition') {
                return await this.createVersionConditionCompletionItems(prop.schema, linePrefix);
            }

            // 确定显示标签
            const label = isPattern ? this.docBuilder.getPatternLabel(analysis!) : prop.key;
            const item = new CompletionItem(label, this.getCompletionItemKind(prop.schema));

            // 设置插入文本（代码片段）
            item.insertText = isPattern
                ? this.docBuilder.generatePatternSnippet(analysis!)
                : this.createInsertText(prop.key, prop.schema);

            // 设置详情和文档
            item.detail = this.docBuilder.getTypeDescription(prop.schema);
            item.documentation = this.docBuilder.createDocumentation(prop.schema, isPattern);

            // 设置排序（必需属性优先）和过滤文本
            const priority = this.docBuilder.calculatePriority(prop.schema);
            item.sortText = priority.toString().padStart(3, '0') + label;
            item.filterText = label;

            // 标记必需属性
            if (prop.schema.required || prop.schema['x-isRequired']) {
                item.label = `${label} ✨`;
            }
            // 标记弃用属性
            if (prop.schema.deprecated) {
                item.tags = [1]; // CompletionItemTag.Deprecated
            }

            return [item];
        } catch (error) {
            this.logger.error('Error creating completion item', error as Error, { key: prop.key });
            return undefined;
        }
    }

    /**
     * 创建版本条件补全项
     *
     * 委托给 VersionConditionHelper 生成补全项
     *
     * 根据 Schema 描述自动判断是否需要标识符后缀：
     * - 包含 "section" 关键词时，表示这是顶层版本条件分组，需要标识符
     * - 否则为普通版本条件块或值，不需要标识符
     *
     * @param schema Schema 定义
     * @param linePrefix 用户已输入的行前缀，用于判断是否已输入 $$
     * @returns 版本条件补全项数组
     */
    private async createVersionConditionCompletionItems(
        schema: IJsonSchema,
        linePrefix?: string,
    ): Promise<CompletionItem[]> {
        // 根据 Schema 描述判断是否需要标识符后缀
        // "section" 关键词表示这是顶层版本条件分组（如 $$>=1.21.4#my_section:）
        const description = (schema.description as string) || '';
        const includeIdentifierSuffix = description.toLowerCase().includes('section');

        // 检查是否需要包含 default 键（通常值选择场景不需要）
        const includeDefault = !description.toLowerCase().includes('value');

        return this.versionHelper.createCompletionItems({
            isKeyPosition: true,
            includeDefault,
            includeIdentifierSuffix,
            maxVersions: 8,
            linePrefix: linePrefix || '',
        });
    }

    /**
     * 根据 Schema 类型创建插入文本
     *
     * - object: 添加冒号和缩进换行
     * - array: 添加冒号和列表项
     * - enum: 创建枚举选择片段
     * - 其他: 添加冒号和光标占位符
     *
     * @param key 键名
     * @param schema Schema 定义
     * @returns 代码片段
     */
    private createInsertText(key: string, schema: IJsonSchema): SnippetString {
        if (schema.type === 'object') {
            return new SnippetString(`${key}:\n  $0`);
        }
        if (schema.type === 'array') {
            return new SnippetString(`${key}:\n  - $0`);
        }
        const enumValues = schema.enum;
        if (enumValues && enumValues.length > 0) {
            return this.docBuilder.createEnumSnippet(key, enumValues);
        }
        return new SnippetString(`${key}: $0`);
    }

    /**
     * 根据 Schema 类型获取补全项图标类型
     *
     * @param schema Schema 定义
     * @returns VSCode 补全项类型
     */
    private getCompletionItemKind(schema: IJsonSchema): CompletionItemKind {
        if (schema.enum) {
            return CompletionItemKind.Enum;
        }
        switch (schema.type) {
            case 'object':
                return CompletionItemKind.Class;
            case 'array':
                return CompletionItemKind.Value;
            case 'string':
                return CompletionItemKind.Text;
            case 'number':
            case 'integer':
            case 'boolean':
                return CompletionItemKind.Value;
            default:
                return CompletionItemKind.Property;
        }
    }

    /**
     * 判断是否应该显示模式属性（patternProperties）
     *
     * 模式属性只在以下条件都满足时显示：
     * 1. 存在模式属性
     * 2. 当前层级没有固定属性（纯动态键对象）
     * 3. 路径深度为 1（在顶级 section 的直接子级）
     * 4. 缩进级别与路径深度匹配（验证解析准确性）
     *
     * 这样可以避免模式属性在不应该出现的位置显示，
     * 例如 namespace:name 格式只应该在 items 下直接显示，
     * 而不应该在 items.namespace:name 内部显示。
     *
     * @param currentPath 当前 YAML 路径
     * @param fixedPropertiesCount 固定属性数量
     * @param patternPropertiesCount 模式属性数量
     * @param context 补全上下文
     * @returns 是否显示模式属性
     */
    private shouldShowPatternProperties(
        currentPath: string[],
        fixedPropertiesCount: number,
        patternPropertiesCount: number,
        context: ICompletionContextInfo,
    ): boolean {
        // 无模式属性、有固定属性、或路径过深时不显示
        if (patternPropertiesCount === 0 || fixedPropertiesCount > 0 || currentPath.length > 1) {
            return false;
        }

        // 通过缩进级别验证路径解析的准确性
        const currentIndent = this.pathParser.getIndentLevel(context.linePrefix);
        const expectedMaxIndent = (currentPath.length + 1) * 2;
        return currentIndent < expectedMaxIndent;
    }

    /**
     * 获取当前层级已存在的键
     *
     * 向上和向下扫描同缩进级别的行，提取已定义的键名
     * 用于过滤补全项中已存在的键
     *
     * @remarks
     * 扫描范围限制为 MAX_SCAN_LINES 行，避免大文件性能问题
     *
     * @param context 补全上下文
     * @returns 已存在的键名数组
     */
    private getExistingKeysAtCurrentLevel(context: ICompletionContextInfo): string[] {
        const existingKeys = new Set<string>();

        try {
            const currentIndent = this.pathParser.getIndentLevel(context.document.lineAt(context.position.line).text);
            // 向上和向下扫描（限制扫描范围）
            this.scanKeys(context, currentIndent, -1, existingKeys);
            this.scanKeys(context, currentIndent, 1, existingKeys);
        } catch (error) {
            this.logger.error('Failed to get existing keys', error as Error);
        }

        return Array.from(existingKeys);
    }

    /**
     * 扫描指定方向的同级键
     *
     * 从当前行开始，沿指定方向遍历文档，
     * 收集相同缩进级别的键名
     *
     * @remarks
     * 扫描范围限制为 MAX_SCAN_LINES 行，避免大文件性能问题
     *
     * @param context 补全上下文
     * @param targetIndent 目标缩进级别
     * @param direction 扫描方向：-1 向上，1 向下
     * @param keys 收集键名的 Set
     */
    private scanKeys(
        context: ICompletionContextInfo,
        targetIndent: number,
        direction: -1 | 1,
        keys: Set<string>,
    ): void {
        const startLine = context.position.line + direction;
        const endLine = direction < 0 ? 0 : context.document.lineCount - 1;

        // 限制扫描范围
        const maxLines = SchemaKeyCompletionStrategy.MAX_SCAN_LINES;
        let scannedLines = 0;

        for (let i = startLine; direction < 0 ? i >= endLine : i <= endLine; i += direction) {
            // 检查是否超过扫描限制
            if (++scannedLines > maxLines) {
                break;
            }

            const lineText = context.document.lineAt(i).text;
            const trimmed = lineText.trim();

            // 跳过空行和注释
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            const indent = this.pathParser.getIndentLevel(lineText);
            // 缩进小于目标级别，说明已到达父级或其他块
            if (indent < targetIndent) {
                break;
            }

            // 提取相同缩进级别的键
            if (indent === targetIndent) {
                const key = this.pathParser.extractKeyName(lineText);
                if (key) {
                    keys.add(key);
                }
            }
        }
    }

    /**
     * 提供降级补全
     *
     * 当主要补全逻辑失败时，提供简化的补全建议：
     * - 不过滤已存在的键
     * - 限制返回数量（最多 20 个）
     * - 使用简单的插入文本
     * - 标记为不完整结果
     *
     * @param context 补全上下文
     * @param token 取消令牌
     * @returns 降级补全结果
     */
    private async provideFallbackCompletions(
        context: ICompletionContextInfo,
        token?: CancellationToken,
    ): Promise<ICompletionResult | undefined> {
        if (token?.isCancellationRequested) {
            return undefined;
        }

        // 尝试解析路径，失败则使用空路径
        let currentPath: string[] = [];
        try {
            currentPath = this.pathParser.parsePath(context.document, context.position);
        } catch {
            /* 忽略解析错误 */
        }

        const availableProperties = await this.schemaService.getAvailableProperties(currentPath);
        if (availableProperties.length === 0) {
            return undefined;
        }

        // 创建简化的补全项
        const items = availableProperties.slice(0, 20).map((prop) => {
            const item = new CompletionItem(prop.key, CompletionItemKind.Property);
            item.insertText = `${prop.key}: `;
            item.detail = 'Schema property (fallback)';
            return item;
        });

        return {
            items,
            isIncomplete: true,
            completionType: `${this.name}-fallback`,
            priority: this.priority - 10,
        };
    }
}
