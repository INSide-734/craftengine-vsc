/**
 * 模板展开器接口
 *
 * 负责将含有模板引用的配置展开为完整配置，用于 Schema 验证。
 *
 * @remarks
 * 模板展开的主要场景：
 * - 在 Schema 验证前展开模板，确保验证完整的配置
 * - 处理模板继承和参数替换
 * - 检测循环引用和错误
 *
 * @example
 * ```typescript
 * const expander = container.resolve<ITemplateExpander>(SERVICE_TOKENS.TemplateExpander);
 *
 * const result = await expander.expandDocument(yamlContent);
 * if (result.success) {
 *     // 使用展开后的数据进行验证
 *     const validationResult = await schemaValidator.validate(result.expanded);
 * } else {
 *     // 处理展开错误
 *     console.error('Template expansion errors:', result.errors);
 * }
 * ```
 */

/**
 * 位置映射信息
 *
 * 记录展开后数据路径与原始来源的映射关系
 */
export interface IPositionMapping {
    /** 原始文件中的路径 */
    originalPath: string;

    /** 来源类型：直接定义或模板继承 */
    source: 'direct' | 'template';

    /** 如果来自模板，记录模板名称 */
    templateName?: string;

    /** 如果来自模板，记录模板文件位置 */
    templateUri?: string;
}

/**
 * 模板展开错误类型
 */
export type TemplateExpansionErrorType =
    | 'template_not_found' // 模板未找到
    | 'circular_reference' // 循环引用
    | 'parameter_missing' // 必需参数缺失
    | 'file_read_error' // 文件读取错误
    | 'max_depth_exceeded'; // 超过最大嵌套深度

/**
 * 模板展开错误
 */
export interface IExpansionError {
    /** 错误发生的路径 */
    path: string;

    /** 错误消息 */
    message: string;

    /** 错误类型 */
    type: TemplateExpansionErrorType;

    /** 相关的模板名称 */
    templateName?: string;
}

/**
 * 模板展开结果
 */
export interface ITemplateExpansionResult {
    /** 展开后的数据 */
    expanded: unknown;

    /** 展开是否成功 */
    success: boolean;

    /** 位置映射：展开后路径 -> 原始位置信息 */
    positionMap: Map<string, IPositionMapping>;

    /** 展开过程中的错误 */
    errors: IExpansionError[];

    /** 展开过程中使用的模板列表 */
    usedTemplates: string[];
}

/**
 * 模板展开器接口
 */
export interface ITemplateExpander {
    /**
     * 展开文档中的所有模板引用
     *
     * @param content - YAML 文档内容
     * @returns 展开结果，包含展开后的数据、位置映射和错误信息
     *
     * @remarks
     * 展开过程：
     * 1. 解析 YAML 文档
     * 2. 递归遍历，查找 template 字段
     * 3. 获取并合并模板内容
     * 4. 替换参数占位符 (${param} 和 ${param:-default})
     * 5. 返回展开后的数据和位置映射
     *
     * @example
     * ```typescript
     * const result = await expander.expandDocument(yamlContent);
     *
     * if (result.success) {
     *     console.log('Expanded data:', result.expanded);
     *     console.log('Used templates:', result.usedTemplates);
     * } else {
     *     for (const error of result.errors) {
     *         console.error(`${error.type}: ${error.message} at ${error.path}`);
     *     }
     * }
     * ```
     */
    expandDocument(content: string): Promise<ITemplateExpansionResult>;

    /**
     * 展开单个对象
     *
     * @param obj - 要展开的对象
     * @param context - 展开上下文信息
     * @returns 展开结果
     *
     * @remarks
     * 用于展开已解析的对象，而不是 YAML 字符串。
     */
    expandObject(obj: unknown, context?: IExpansionContext): Promise<ITemplateExpansionResult>;
}

/**
 * 展开上下文
 */
export interface IExpansionContext {
    /** 当前路径 */
    path?: string[];

    /** 已访问的模板（用于循环检测） */
    visited?: Set<string>;

    /** 最大嵌套深度 */
    maxDepth?: number;

    /** 当前深度 */
    currentDepth?: number;
}
