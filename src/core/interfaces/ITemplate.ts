import { EditorUri, EditorPosition } from '../types/EditorTypes';

/**
 * 模板参数接口
 * 
 * 定义模板中使用的参数的元数据。
 * 参数用于模板的动态内容替换和验证。
 * 
 * @remarks
 * **参数设计原则**：
 * 
 * 1. **命名规范**：使用 camelCase 或 snake_case
 * 2. **类型声明**：明确参数类型便于验证
 * 3. **默认值**：为可选参数提供合理默认值
 * 4. **描述信息**：提供清晰的参数说明
 * 
 * **参数验证**：
 * - required=true 的参数必须提供
 * - 类型检查确保数据正确性
 * - 默认值在未提供时使用
 * 
 * @example
 * ```typescript
 * // 必需参数
 * const userIdParam: ITemplateParameter = {
 *     name: 'userId',
 *     required: true,
 *     type: 'string',
 *     description: '用户唯一标识符'
 * };
 * 
 * // 可选参数带默认值
 * const roleParam: ITemplateParameter = {
 *     name: 'role',
 *     required: false,
 *     defaultValue: 'user',
 *     type: 'string',
 *     description: '用户角色，默认为普通用户'
 * };
 * 
 * // 复杂类型参数
 * const configParam: ITemplateParameter = {
 *     name: 'config',
 *     required: false,
 *     defaultValue: { debug: false, verbose: false },
 *     type: 'object',
 *     description: '配置选项对象'
 * };
 * ```
 */
/** 模板参数值类型 - 支持的参数默认值类型 */
export type TemplateParameterValue = string | number | boolean | null | undefined | 
    TemplateParameterValue[] | { [key: string]: TemplateParameterValue };

export interface ITemplateParameter {
    /** 参数名称 - 参数的唯一标识符 */
    name: string;
    
    /** 是否必需 - true表示使用模板时必须提供此参数 */
    required: boolean;
    
    /** 默认值 - 参数未提供时使用的默认值（可选参数应设置默认值） */
    defaultValue?: TemplateParameterValue;
    
    /** 参数类型 - 参数的数据类型（如 'string', 'number', 'boolean', 'object', 'array'） */
    type?: string;
    
    /** 参数描述 - 参数的用途和说明，用于文档和提示 */
    description?: string;
}

/**
 * 模板实体接口
 * 
 * 表示一个 YAML 模板的领域实体，包含模板的所有属性和业务行为。
 * 遵循不可变性原则，所有属性为只读。
 * 
 * @remarks
 * **设计原则**：
 * 
 * 1. **不可变性**：所有属性为 readonly，状态变更通过创建新实例实现
 * 2. **自包含**：包含模板的所有元数据和业务逻辑
 * 3. **自我验证**：提供参数验证方法
 * 4. **业务行为**：封装模板相关的业务操作
 * 
 * **属性说明**：
 * - **id**: 全局唯一标识符（UUID）
 * - **name**: 模板名称（在文件内唯一）
 * - **parameters**: 模板参数定义列表
 * - **content**: 模板的实际 YAML 内容（用于模板展开验证）
 * - **sourceFile**: 模板定义所在的文件URI
 * - **definitionPosition**: 模板在文件中的位置（用于跳转定义）
 * - **createdAt/updatedAt**: 时间戳用于追踪和缓存
 * - **usageCount/lastUsedAt**: 使用统计用于排序和推荐
 * 
 * **使用场景**：
 * - 模板补全：提供可用模板列表
 * - 参数验证：验证模板使用是否正确
 * - 定义跳转：跳转到模板定义位置
 * - 使用统计：追踪模板流行度
 * 
 * @example
 * ```typescript
 * // 访问模板属性
 * console.log(`Template: ${template.name}`);
 * console.log(`Source: ${template.sourceFile.fsPath}`);
 * console.log(`Used ${template.usageCount} times`);
 * 
 * // 查询参数
 * const requiredParams = template.getRequiredParameters();
 * console.log(`Required parameters: ${requiredParams.map(p => p.name).join(', ')}`);
 * 
 * // 验证参数
 * const result = template.validateParameters({
 *     userId: '123',
 *     role: 'admin'
 * });
 * 
 * if (!result.isValid) {
 *     result.errors.forEach(err => console.error(err.message));
 * }
 * 
 * // 记录使用
 * const updatedTemplate = template.recordUsage();
 * console.log(`Usage count: ${updatedTemplate.usageCount}`);
 * ```
 */
export interface ITemplate {
    /** 模板唯一标识 - UUID格式的全局唯一ID */
    readonly id: string;
    
    /** 模板名称 - 模板的标识名称，在文件内应唯一 */
    readonly name: string;
    
    /** 模板参数 - 模板定义的参数列表（只读数组） */
    readonly parameters: ReadonlyArray<ITemplateParameter>;
    
    /** 来源文件 - 模板定义所在的文件URI */
    readonly sourceFile: EditorUri;
    
    /** 定义位置 - 模板在文件中的位置（用于"跳转到定义"功能） */
    readonly definitionPosition?: EditorPosition;
    
    /** 创建时间 - 模板首次创建的时间戳 */
    readonly createdAt: Date;
    
    /** 最后更新时间 - 模板最近一次修改的时间戳 */
    readonly updatedAt: Date;
    
    /** 使用次数 - 模板被引用的总次数（用于流行度排序） */
    readonly usageCount: number;
    
    /** 最后使用时间 - 模板最近一次被使用的时间戳（可选） */
    readonly lastUsedAt?: Date;
    
    /** 
     * 模板内容 - 模板的实际 YAML 内容（解析后的对象）
     * 
     * @remarks
     * 存储模板定义的实际内容，用于模板展开验证。
     * 不包含 `template` 和 `arguments` 等元数据键。
     */
    readonly content: Record<string, unknown>;
    
    /**
     * 获取必需参数
     * 
     * @returns 所有 required=true 的参数数组
     * 
     * @remarks
     * - 返回只读数组
     * - 结果已过滤，只包含必需参数
     * - 用于验证和文档生成
     * 
     * @example
     * ```typescript
     * const required = template.getRequiredParameters();
     * console.log(`Must provide: ${required.map(p => p.name).join(', ')}`);
     * 
     * // 检查是否所有必需参数都提供了
     * const providedParams = { userId: '123' };
     * const missingParams = required.filter(p => !(p.name in providedParams));
     * if (missingParams.length > 0) {
     *     console.error('Missing required parameters:', missingParams.map(p => p.name));
     * }
     * ```
     */
    getRequiredParameters(): ReadonlyArray<ITemplateParameter>;
    
    /**
     * 获取可选参数
     * 
     * @returns 所有 required=false 的参数数组
     * 
     * @remarks
     * - 返回只读数组
     * - 结果已过滤，只包含可选参数
     * - 可选参数通常有默认值
     * 
     * @example
     * ```typescript
     * const optional = template.getOptionalParameters();
     * console.log(`Optional: ${optional.map(p => p.name).join(', ')}`);
     * 
     * // 显示默认值
     * optional.forEach(param => {
     *     console.log(`${param.name}: ${param.defaultValue ?? 'no default'}`);
     * });
     * ```
     */
    getOptionalParameters(): ReadonlyArray<ITemplateParameter>;
    
    /**
     * 检查参数是否存在
     * 
     * @param name - 参数名称
     * @returns 如果参数存在返回 true，否则返回 false
     * 
     * @remarks
     * 用于快速检查参数是否在模板中定义
     * 
     * @example
     * ```typescript
     * if (template.hasParameter('userId')) {
     *     const param = template.getParameter('userId');
     *     console.log(`Found parameter: ${param.name}`);
     * }
     * 
     * // 条件验证
     * const paramsToCheck = ['userId', 'role', 'email'];
     * const existingParams = paramsToCheck.filter(name => template.hasParameter(name));
     * ```
     */
    hasParameter(name: string): boolean;
    
    /**
     * 获取参数
     * 
     * @param name - 参数名称
     * @returns 参数对象，如果不存在返回 undefined
     * 
     * @remarks
     * - 按名称精确匹配
     * - 不存在时返回 undefined
     * - 用于获取参数详细信息
     * 
     * @example
     * ```typescript
     * const param = template.getParameter('userId');
     * if (param) {
     *     console.log(`Type: ${param.type}`);
     *     console.log(`Required: ${param.required}`);
     *     console.log(`Default: ${param.defaultValue}`);
     *     console.log(`Description: ${param.description}`);
     * }
     * 
     * // 安全访问
     * const userIdType = template.getParameter('userId')?.type ?? 'unknown';
     * ```
     */
    getParameter(name: string): ITemplateParameter | undefined;
    
    /**
     * 验证参数集合
     * 
     * @param params - 要验证的参数对象（键值对）
     * @returns 验证结果，包含错误和警告信息
     * 
     * @remarks
     * **验证规则**：
     * 1. 检查所有必需参数是否提供
     * 2. 检查参数类型是否匹配
     * 3. 检查参数值是否有效
     * 4. 生成改进建议（警告）
     * 
     * **验证类型**：
     * - **错误**：违反必需规则，导致验证失败
     * - **警告**：不影响使用，但建议改进
     * 
     * @example
     * ```typescript
     * // 验证参数
     * const result = template.validateParameters({
     *     userId: '123',
     *     role: 'admin',
     *     extra: 'value' // 未定义的参数
     * });
     * 
     * if (!result.isValid) {
     *     console.error('Validation failed:');
     *     result.errors.forEach(err => {
     *         console.error(`  - ${err.message} (${err.type})`);
     *     });
     * }
     * 
     * if (result.warnings.length > 0) {
     *     console.warn('Validation warnings:');
     *     result.warnings.forEach(warn => {
     *         console.warn(`  - ${warn.message}`);
     *         if (warn.suggestion) {
     *             console.warn(`    Suggestion: ${warn.suggestion}`);
     *         }
     *     });
     * }
     * 
     * // 完整示例
     * const params = getUserInput();
     * const validation = template.validateParameters(params);
     * 
     * if (validation.isValid) {
     *     await applyTemplate(template, params);
     * } else {
     *     showValidationErrors(validation.errors);
     * }
     * ```
     */
    validateParameters(params: TemplateParameterRecord): ITemplateValidationResult;
    
    /**
     * 记录使用
     * 
     * @returns 新的模板实例，usageCount +1 且 lastUsedAt 已更新
     * 
     * @remarks
     * - 遵循不可变性原则，返回新实例
     * - 原实例不受影响
     * - usageCount 递增 1
     * - lastUsedAt 设置为当前时间
     * - 用于追踪模板流行度
     * 
     * @example
     * ```typescript
     * // 记录模板使用
     * const updatedTemplate = template.recordUsage();
     * await repository.update(updatedTemplate);
     * 
     * console.log(`Old count: ${template.usageCount}`);
     * console.log(`New count: ${updatedTemplate.usageCount}`);
     * 
     * // 应用模板时自动记录
     * async function applyTemplate(template: ITemplate, params: TemplateParameterRecord) {
     *     // 应用模板逻辑...
     *     
     *     // 记录使用
     *     const updated = template.recordUsage();
     *     await repository.update(updated);
     *     
     *     // 发布事件
     *     await eventBus.publish('template.used', {
     *         id: generateId(),
     *         type: 'template.used',
     *         timestamp: new Date(),
     *         template: updated
     *     });
     * }
     * ```
     */
    recordUsage(): ITemplate;
}

/** 模板参数记录类型 - 用于验证参数时传入的参数对象 */
export type TemplateParameterRecord = Record<string, TemplateParameterValue>;

/**
 * 模板验证结果
 * 
 * 模板参数验证的结果对象，包含验证状态、错误和警告信息。
 * 
 * @remarks
 * **验证状态**：
 * - `isValid=true`: 所有必需验证通过，可以安全使用模板
 * - `isValid=false`: 存在错误，不应使用模板
 * 
 * **错误 vs 警告**：
 * - **错误**：阻断性问题，必须解决
 * - **警告**：建议性问题，可以忽略
 * 
 * @example
 * ```typescript
 * const result: ITemplateValidationResult = {
 *     isValid: false,
 *     errors: [
 *         {
 *             parameter: 'userId',
 *             message: 'Required parameter "userId" is missing',
 *             type: 'missing'
 *         }
 *     ],
 *     warnings: [
 *         {
 *             parameter: 'role',
 *             message: 'Parameter "role" is using default value',
 *             type: 'unused_default',
 *             suggestion: 'Consider specifying role explicitly'
 *         }
 *     ]
 * };
 * 
 * // 使用结果
 * if (!result.isValid) {
 *     throw new Error(`Validation failed: ${result.errors[0].message}`);
 * }
 * ```
 */
export interface ITemplateValidationResult {
    /** 是否有效 - true表示验证通过，false表示有错误 */
    isValid: boolean;
    
    /** 错误信息 - 阻断性验证错误列表 */
    errors: ITemplateValidationError[];
    
    /** 警告信息 - 建议性验证警告列表 */
    warnings: ITemplateValidationWarning[];
}

/**
 * 模板验证错误
 * 
 * 表示模板参数验证过程中发现的错误。
 * 错误是阻断性的，必须修复才能使用模板。
 * 
 * @remarks
 * **错误类型说明**：
 * - `missing`: 缺少必需参数
 * - `invalid_type`: 参数类型不匹配
 * - `invalid_value`: 参数值不符合要求
 * - `syntax_error`: 参数格式语法错误
 * 
 * @example
 * ```typescript
 * // 缺少必需参数
 * const missingError: ITemplateValidationError = {
 *     parameter: 'userId',
 *     message: 'Required parameter "userId" is missing',
 *     type: 'missing'
 * };
 * 
 * // 类型错误
 * const typeError: ITemplateValidationError = {
 *     parameter: 'age',
 *     message: 'Parameter "age" must be a number, got string',
 *     type: 'invalid_type',
 *     line: 10,
 *     column: 12
 * };
 * 
 * // 值错误
 * const valueError: ITemplateValidationError = {
 *     parameter: 'role',
 *     message: 'Parameter "role" must be one of: admin, user, guest',
 *     type: 'invalid_value'
 * };
 * ```
 */
export interface ITemplateValidationError {
    /** 参数名 - 出错的参数名称（可选，某些错误可能不关联特定参数） */
    parameter?: string;
    
    /** 错误消息 - 人类可读的错误描述 */
    message: string;
    
    /** 错误类型 - 错误的分类标识 */
    type: 'missing' | 'invalid_type' | 'invalid_value' | 'syntax_error';
    
    /** 行号 - 错误在文件中的行号（可选，用于定位） */
    line?: number;
    
    /** 列号 - 错误在文件中的列号（可选，用于定位） */
    column?: number;
}

/**
 * 模板验证警告
 * 
 * 表示模板参数验证过程中发现的警告。
 * 警告是建议性的，不影响模板使用，但建议关注。
 * 
 * @remarks
 * **警告类型说明**：
 * - `unused_default`: 参数使用默认值，建议显式指定
 * - `deprecated`: 参数已弃用，建议使用替代方案
 * - `suggestion`: 改进建议
 * - `optional`: 可选参数相关提示
 * 
 * @example
 * ```typescript
 * // 未使用默认值警告
 * const defaultWarning: ITemplateValidationWarning = {
 *     parameter: 'role',
 *     message: 'Using default value "user" for parameter "role"',
 *     type: 'unused_default',
 *     suggestion: 'Consider specifying role explicitly for clarity'
 * };
 * 
 * // 弃用警告
 * const deprecatedWarning: ITemplateValidationWarning = {
 *     parameter: 'oldField',
 *     message: 'Parameter "oldField" is deprecated',
 *     type: 'deprecated',
 *     suggestion: 'Use "newField" instead'
 * };
 * 
 * // 改进建议
 * const suggestionWarning: ITemplateValidationWarning = {
 *     parameter: 'email',
 *     message: 'Email format could be validated',
 *     type: 'suggestion',
 *     suggestion: 'Add email validation pattern'
 * };
 * ```
 */
export interface ITemplateValidationWarning {
    /** 参数名 - 警告相关的参数名称（可选） */
    parameter?: string;
    
    /** 警告消息 - 人类可读的警告描述 */
    message: string;
    
    /** 警告类型 - 警告的分类标识 */
    type: 'unused_default' | 'deprecated' | 'suggestion' | 'optional';
    
    /** 建议 - 改进建议或替代方案（可选） */
    suggestion?: string;
}
