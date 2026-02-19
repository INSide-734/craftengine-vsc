import { EditorUri, EditorTextDocument, EditorPosition, EditorRange } from '../types/EditorTypes';
import { ITemplate, ITemplateValidationResult } from './ITemplate';

/**
 * 模板解析结果
 * 
 * 表示从 YAML 文档中解析模板的结果，包含成功解析的模板列表和遇到的错误。
 * 
 * @remarks
 * 解析过程可能部分成功，即使存在错误也可能解析出一些有效的模板。
 * 
 * @example
 * ```typescript
 * const result = await templateService.parseDocument(document);
 * console.log(`Found ${result.templates.length} templates`);
 * if (result.errors.length > 0) {
 *     console.warn(`${result.errors.length} errors occurred`);
 * }
 * ```
 */
export interface ITemplateParseResult {
    /** 解析出的模板数组 */
    templates: ITemplate[];
    /** 解析过程中遇到的错误列表 */
    errors: ITemplateParseError[];
}

/**
 * 模板解析错误
 * 
 * 表示模板解析过程中遇到的错误或警告信息。
 * 
 * @remarks
 * 错误包含位置信息（如果可用），方便在编辑器中定位和显示。
 * 
 * @example
 * ```typescript
 * const error: ITemplateParseError = {
 *     message: 'Missing required parameter: name',
 *     range: new Range(5, 0, 5, 20),
 *     severity: 'error'
 * };
 * ```
 */
export interface ITemplateParseError {
    /** 错误描述消息 */
    message: string;
    /** 错误在文档中的位置范围（可选） */
    range?: EditorRange;
    /** 错误严重程度级别 */
    severity: 'error' | 'warning' | 'info';
}

/**
 * 模板匹配结果
 * 
 * 表示模板搜索或推荐的匹配结果，包含模板对象、匹配分数和匹配原因。
 * 
 * @remarks
 * - 分数范围通常为 0-100，数值越大表示匹配度越高
 * - 匹配原因用于向用户解释为什么推荐此模板
 * 
 * @example
 * ```typescript
 * const match: ITemplateMatch = {
 *     template: userProfileTemplate,
 *     score: 95,
 *     reason: 'Name prefix matched'
 * };
 * ```
 */
export interface ITemplateMatch {
    /** 匹配的模板对象 */
    template: ITemplate;
    /** 匹配分数（0-100），数值越大匹配度越高 */
    score: number;
    /** 匹配原因说明 */
    reason: string;
}

/**
 * 模板搜索选项
 * 
 * 配置模板搜索行为的选项，支持前缀匹配、模糊搜索和结果排序。
 * 
 * @example
 * ```typescript
 * const options: ITemplateSearchOptions = {
 *     prefix: 'user-',
 *     limit: 10,
 *     fuzzy: true,
 *     sortBy: 'relevance'
 * };
 * const matches = await templateService.searchTemplates(options);
 * ```
 */
export interface ITemplateSearchOptions {
    /** 搜索前缀，只匹配以此开头的模板名称 */
    prefix?: string;
    /** 返回结果的最大数量 */
    limit?: number;
    /** 是否启用模糊匹配（容错匹配） */
    fuzzy?: boolean;
    /** 排序方式：按相关性、名称或使用频率 */
    sortBy?: 'relevance' | 'name' | 'usage';
}

/**
 * 模板使用上下文
 * 
 * 描述模板使用时的上下文环境，包括文档、位置和缩进信息。
 * 用于智能推荐和验证模板的可用性。
 * 
 * @remarks
 * 上下文信息用于：
 * - 确定模板是否适用于当前位置
 * - 提供智能的模板推荐
 * - 验证模板使用的正确性
 * 
 * @example
 * ```typescript
 * const context: ITemplateUsageContext = {
 *     document: activeEditor.document,
 *     position: activeEditor.selection.active,
 *     lineText: document.lineAt(position.line).text,
 *     indentLevel: 2
 * };
 * const suggestions = await templateService.getTemplateSuggestions(context);
 * ```
 */
export interface ITemplateUsageContext {
    /** 当前编辑的文档对象 */
    document: EditorTextDocument;
    /** 光标所在位置 */
    position: EditorPosition;
    /** 当前行的文本内容 */
    lineText: string;
    /** 当前行的缩进级别（空格数或制表符数） */
    indentLevel: number;
}

/**
 * 模板服务接口
 * 
 * 提供模板相关的业务逻辑和操作，是模板管理的核心接口。
 * 
 * @remarks
 * 模板服务负责：
 * - 从 YAML 文档中解析和提取模板定义
 * - 搜索和匹配可用的模板
 * - 验证模板使用的正确性
 * - 提供智能的模板推荐
 * - 管理模板使用统计
 * 
 * 该服务是领域层的核心组件，遵循领域驱动设计原则。
 * 
 * @example
 * ```typescript
 * // 获取模板服务实例
 * const templateService = ServiceContainer.getService<ITemplateService>(
 *     SERVICE_TOKENS.TemplateService
 * );
 * 
 * // 解析文档中的模板
 * const result = await templateService.parseDocument(document);
 * console.log(`Found ${result.templates.length} templates`);
 * 
 * // 搜索模板
 * const matches = await templateService.searchTemplates({
 *     prefix: 'user-',
 *     limit: 10,
 *     sortBy: 'relevance'
 * });
 * 
 * // 验证模板使用
 * const validation = await templateService.validateTemplateUsage(
 *     'user-profile',
 *     { username: 'john', email: 'john@example.com' }
 * );
 * ```
 */
export interface ITemplateService {
    /**
     * 解析文档中的模板
     * 
     * 从 TextDocument 对象中解析所有模板定义，包括模板名称、参数和内容。
     * 
     * @param document - VSCode 文档对象
     * @returns 解析结果，包含模板列表和错误信息
     * 
     * @example
     * ```typescript
     * const result = await templateService.parseDocument(document);
     * for (const template of result.templates) {
     *     console.log(`Template: ${template.name}`);
     * }
     * ```
     */
    parseDocument(document: EditorTextDocument): Promise<ITemplateParseResult>;
    
    /**
     * 解析文本中的模板
     * 
     * 从纯文本内容中解析模板定义，支持批量处理和离线解析场景。
     * 
     * @param text - YAML 格式的文本内容
     * @param sourceFile - 源文件的 URI（用于错误报告和引用）
     * @returns 解析结果，包含模板列表和错误信息
     * 
     * @example
     * ```typescript
     * const yamlText = await fs.readFile('templates.yaml', 'utf-8');
     * const result = await templateService.parseText(yamlText, uri);
     * ```
     */
    parseText(text: string, sourceFile: EditorUri): Promise<ITemplateParseResult>;
    
    /**
     * 搜索模板
     * 
     * 根据给定的搜索选项查找匹配的模板，支持前缀匹配、模糊搜索和结果排序。
     * 
     * @param options - 搜索选项配置
     * @returns 匹配的模板列表，按相关性排序
     * 
     * @remarks
     * 搜索算法考虑多个因素：
     * - 名称匹配度
     * - 使用频率
     * - 上下文相关性
     * 
     * @example
     * ```typescript
     * const matches = await templateService.searchTemplates({
     *     prefix: 'user-',
     *     limit: 5,
     *     fuzzy: true,
     *     sortBy: 'relevance'
     * });
     * ```
     */
    searchTemplates(options: ITemplateSearchOptions): Promise<ITemplateMatch[]>;
    
    /**
     * 验证模板使用
     * 
     * 验证模板是否正确使用，检查必需参数是否提供、参数类型是否正确等。
     * 
     * @param templateName - 模板名称
     * @param parameters - 提供的参数
     * @returns 验证结果，包含是否有效和错误信息
     * 
     * @example
     * ```typescript
     * const result = await templateService.validateTemplateUsage(
     *     'user-profile',
     *     { username: 'john', email: 'john@example.com' }
     * );
     * if (!result.isValid) {
     *     console.error('Validation errors:', result.errors);
     * }
     * ```
     */
    validateTemplateUsage(
        templateName: string,
        parameters: Record<string, unknown>
    ): Promise<ITemplateValidationResult>;
    
    /**
     * 获取模板建议
     * 
     * 根据当前上下文（文档位置、缩进级别等）智能推荐适合的模板。
     * 
     * @param context - 模板使用上下文
     * @returns 推荐的模板列表，按推荐度排序
     * 
     * @remarks
     * 推荐算法会考虑：
     * - 当前文档结构
     * - 缩进级别
     * - 历史使用记录
     * - 模板的适用场景
     * 
     * @example
     * ```typescript
     * const suggestions = await templateService.getTemplateSuggestions({
     *     document: editor.document,
     *     position: editor.selection.active,
     *     lineText: currentLine,
     *     indentLevel: 2
     * });
     * ```
     */
    getTemplateSuggestions(context: ITemplateUsageContext): Promise<ITemplateMatch[]>;
    
    /**
     * 检查模板是否在指定位置可用
     * 
     * 判断特定模板是否适用于当前的文档位置和上下文。
     * 
     * @param templateName - 模板名称
     * @param context - 模板使用上下文
     * @returns 如果模板可用返回 true
     * 
     * @example
     * ```typescript
     * const isAvailable = await templateService.isTemplateAvailableAt(
     *     'user-profile',
     *     context
     * );
     * if (isAvailable) {
     *     // 显示模板补全项
     * }
     * ```
     */
    isTemplateAvailableAt(
        templateName: string, 
        context: ITemplateUsageContext
    ): Promise<boolean>;
    
    /**
     * 获取模板的参数建议
     * 
     * 返回模板还需要的参数列表，排除已提供的参数。
     * 
     * @param templateName - 模板名称
     * @param existingParameters - 已提供的参数名称列表
     * @returns 需要的参数名称列表
     * 
     * @example
     * ```typescript
     * const suggestions = await templateService.getParameterSuggestions(
     *     'user-profile',
     *     ['username'] // 已有参数
     * );
     * console.log('Missing parameters:', suggestions); // ['email', 'age', ...]
     * ```
     */
    getParameterSuggestions(
        templateName: string, 
        existingParameters: string[]
    ): Promise<string[]>;
    
    /**
     * 记录模板使用
     * 
     * 记录模板的使用统计，用于推荐算法和使用分析。
     * 
     * @param templateName - 使用的模板名称
     * @returns 如果成功记录返回 true
     * 
     * @remarks
     * 使用统计用于：
     * - 改进模板推荐算法
     * - 分析模板使用趋势
     * - 优化模板排序
     * 
     * @example
     * ```typescript
     * await templateService.recordTemplateUsage('user-profile');
     * ```
     */
    recordTemplateUsage(templateName: string): Promise<boolean>;
}
