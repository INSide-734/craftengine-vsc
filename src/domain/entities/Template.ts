import { EditorUri, EditorPosition, createEditorUri, createEditorPosition } from '../../core/types/EditorTypes';
import {
    ITemplate,
    ITemplateParameter,
    ITemplateValidationResult,
    ITemplateValidationError
} from '../../core/interfaces/ITemplate';
import { TemplateValidationError } from '../../core/errors/ExtensionErrors';
import { deepFreeze } from '../../core/utils';

/**
 * 模板 JSON 序列化格式
 */
export interface TemplateJSON {
    id: string;
    name: string;
    parameters: readonly ITemplateParameter[];
    sourceFile: string;
    definitionPosition?: { line: number; character: number };
    createdAt: string;
    updatedAt: string;
    usageCount?: number;
    lastUsedAt?: string;
    content?: Record<string, unknown>;
}

/**
 * 模板实体实现
 * 
 * 表示一个模板的领域实体，包含模板的所有属性和行为。
 * 遵循领域驱动设计原则，实体是不可变的，所有属性为只读。
 * 
 * @remarks
 * 模板实体的关键特性：
 * - 不可变性：所有属性为只读，状态变更通过创建新实例实现
 * - 自我验证：构造时自动验证数据有效性
 * - 业务行为：封装参数验证、查询等业务逻辑
 * - 持久化无关：不包含任何持久化逻辑
 * 
 * @example
 * ```typescript
 * const template = new Template({
 *     id: 'tpl-001',
 *     name: 'user-profile',
 *     parameters: [
 *         { name: 'username', required: true },
 *         { name: 'email', required: true },
 *         { name: 'age', required: false }
 *     ],
 *     sourceFile: EditorUri.file('templates.yaml'),
 *     definitionPosition: new EditorPosition(10, 0)
 * });
 * 
 * // 验证参数
 * const validation = template.validateParameters({
 *     username: 'john',
 *     email: 'john@example.com'
 * });
 * 
 * if (!validation.isValid) {
 *     console.error('Missing required parameters:', validation.errors);
 * }
 * ```
 */
export class Template implements ITemplate {
    /** 模板的唯一标识符 */
    public readonly id: string;
    /** 模板名称，用于引用和搜索 */
    public readonly name: string;
    /** 模板参数列表（只读数组） */
    public readonly parameters: ReadonlyArray<ITemplateParameter>;
    /** 模板定义所在的源文件 URI */
    public readonly sourceFile: EditorUri;
    /** 模板在源文件中的定义位置 */
    public readonly definitionPosition?: EditorPosition;
    /** 模板创建时间 */
    public readonly createdAt: Date;
    /** 模板最后更新时间 */
    public readonly updatedAt: Date;
    /** 模板使用次数（用于统计和排序） */
    public readonly usageCount: number;
    /** 模板最后一次使用时间 */
    public readonly lastUsedAt?: Date;
    /** 模板内容（YAML 解析后的对象，不包含 template/arguments 等元数据） */
    public readonly content: Record<string, unknown>;
    
    /**
     * 构造模板实例
     * 
     * @param data - 模板数据对象
     * @param data.id - 模板的唯一标识符
     * @param data.name - 模板名称
     * @param data.parameters - 模板参数列表
     * @param data.sourceFile - 源文件 URI
     * @param data.definitionPosition - 定义位置（可选）
     * @param data.createdAt - 创建时间（可选，默认为当前时间）
     * @param data.updatedAt - 更新时间（可选，默认为当前时间）
     * @param data.usageCount - 使用次数（可选，默认为 0）
     * @param data.lastUsedAt - 最后使用时间（可选）
     * @param data.content - 模板内容（可选，默认为空对象）
     * 
     * @throws {Error} 如果数据验证失败
     * 
     * @example
     * ```typescript
     * const template = new Template({
     *     id: 'tpl-001',
     *     name: 'user-profile',
     *     parameters: [
     *         { name: 'username', required: true },
     *         { name: 'email', required: true }
     *     ],
     *     sourceFile: EditorUri.file('templates.yaml')
     * });
     * ```
     */
    constructor(data: {
        id: string;
        name: string;
        parameters: ITemplateParameter[];
        sourceFile: EditorUri;
        definitionPosition?: EditorPosition;
        createdAt?: Date;
        updatedAt?: Date;
        usageCount?: number;
        lastUsedAt?: Date;
        content?: Record<string, unknown>;
    }) {
        this.id = data.id;
        this.name = data.name;
        this.parameters = deepFreeze([...data.parameters]);
        this.sourceFile = data.sourceFile;
        this.definitionPosition = data.definitionPosition;
        this.createdAt = data.createdAt || new Date();
        this.updatedAt = data.updatedAt || new Date();
        this.usageCount = data.usageCount ?? 0;
        this.lastUsedAt = data.lastUsedAt;
        this.content = data.content ? deepFreeze({ ...data.content }) as Record<string, unknown> : {};
        
        this.validate();
    }
    
    /**
     * 获取所有必需参数
     * 
     * @returns 必需参数的只读数组
     * 
     * @example
     * ```typescript
     * const required = template.getRequiredParameters();
     * console.log(`Template has ${required.length} required parameters`);
     * ```
     */
    getRequiredParameters(): ReadonlyArray<ITemplateParameter> {
        return this.parameters.filter(p => p.required);
    }
    
    /**
     * 获取所有可选参数
     * 
     * @returns 可选参数的只读数组
     * 
     * @example
     * ```typescript
     * const optional = template.getOptionalParameters();
     * console.log(`Template has ${optional.length} optional parameters`);
     * ```
     */
    getOptionalParameters(): ReadonlyArray<ITemplateParameter> {
        return this.parameters.filter(p => !p.required);
    }
    
    /**
     * 检查模板是否包含指定参数
     * 
     * @param name - 参数名称
     * @returns 如果包含该参数返回 true
     * 
     * @example
     * ```typescript
     * if (template.hasParameter('username')) {
     *     console.log('Template requires username');
     * }
     * ```
     */
    hasParameter(name: string): boolean {
        return this.parameters.some(p => p.name === name);
    }
    
    /**
     * 获取指定名称的参数
     * 
     * @param name - 参数名称
     * @returns 参数对象，如果不存在返回 undefined
     * 
     * @example
     * ```typescript
     * const usernameParam = template.getParameter('username');
     * if (usernameParam) {
     *     console.log(`Username is ${usernameParam.required ? 'required' : 'optional'}`);
     * }
     * ```
     */
    getParameter(name: string): ITemplateParameter | undefined {
        return this.parameters.find(p => p.name === name);
    }
    
    /**
     * 验证提供的参数是否满足模板要求
     * 
     * 检查所有必需参数是否都已提供。此方法实现模板的核心业务规则。
     * 
     * @param params - 要验证的参数对象
     * @returns 验证结果，包含是否有效、错误列表和警告列表
     * 
     * @remarks
     * 当前实现只检查必需参数的存在性，不验证参数类型和值的正确性。
     * 未来版本可能会增加类型验证、值范围验证等功能。
     * 
     * @example
     * ```typescript
     * const validation = template.validateParameters({
     *     username: 'john',
     *     email: 'john@example.com'
     * });
     * 
     * if (!validation.isValid) {
     *     for (const error of validation.errors) {
     *         console.error(`Error: ${error.message}`);
     *     }
     * }
     * ```
     */
    validateParameters(params: Record<string, unknown>): ITemplateValidationResult {
        const errors: ITemplateValidationError[] = [];
        
        // 只检查必需参数是否存在
        for (const param of this.getRequiredParameters()) {
            if (!(param.name in params)) {
                errors.push({
                    parameter: param.name,
                    message: `Missing required parameter: ${param.name}`,
                    type: 'missing'
                });
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings: []
        };
    }
    
    /**
     * 记录模板使用（返回新的模板实例）
     * 
     * 由于模板实体是不可变的，此方法返回一个新的模板实例，
     * 其使用次数加1，最后使用时间更新为当前时间。
     * 
     * @returns 新的模板实例，使用统计已更新
     * 
     * @remarks
     * 遵循不可变对象模式，原实例保持不变。
     * 
     * @example
     * ```typescript
     * const oldTemplate = template;
     * const newTemplate = template.recordUsage();
     * 
     * console.log(oldTemplate.usageCount); // 输出: 5
     * console.log(newTemplate.usageCount); // 输出: 6
     * console.log(oldTemplate === newTemplate); // 输出: false
     * ```
     */
    recordUsage(): Template {
        return new Template({
            id: this.id,
            name: this.name,
            parameters: [...this.parameters],
            sourceFile: this.sourceFile,
            definitionPosition: this.definitionPosition,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            usageCount: this.usageCount + 1,
            lastUsedAt: new Date(),
            content: { ...this.content }
        });
    }
    
    /**
     * 创建模板的副本，用于更新
     */
    update(changes: {
        parameters?: ITemplateParameter[];
        definitionPosition?: EditorPosition;
        content?: Record<string, unknown>;
    }): Template {
        return new Template({
            id: this.id,
            name: this.name,
            parameters: changes.parameters || [...this.parameters],
            sourceFile: this.sourceFile,
            definitionPosition: changes.definitionPosition ?? this.definitionPosition,
            createdAt: this.createdAt,
            updatedAt: new Date(),
            usageCount: this.usageCount,
            lastUsedAt: this.lastUsedAt,
            content: changes.content ?? { ...this.content }
        });
    }
    
    /**
     * 检查两个模板是否相等
     */
    equals(other: Template): boolean {
        return this.id === other.id &&
               this.name === other.name &&
               this.sourceFile.toString() === other.sourceFile.toString() &&
               this.parametersEqual(other.parameters);
    }
    
    /**
     * 获取模板的哈希码
     */
    getHashCode(): string {
        const paramHash = this.parameters
            .map(p => `${p.name}:${p.required}:${p.type || 'any'}`)
            .join('|');
        
        return `${this.name}#${paramHash}#${this.sourceFile.fsPath}`;
    }
    
    /**
     * 转换为JSON表示
     */
    toJSON(): TemplateJSON {
        return {
            id: this.id,
            name: this.name,
            parameters: this.parameters,
            sourceFile: this.sourceFile.toString(),
            definitionPosition: this.definitionPosition,
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString(),
            usageCount: this.usageCount,
            lastUsedAt: this.lastUsedAt?.toISOString(),
            content: this.content
        };
    }
    
    /**
     * 从JSON数据创建模板
     */
    static fromJSON(data: TemplateJSON): Template {
        return new Template({
            id: data.id,
            name: data.name,
            parameters: [...data.parameters],
            sourceFile: createEditorUri(data.sourceFile),
            definitionPosition: data.definitionPosition ?
                createEditorPosition(data.definitionPosition.line, data.definitionPosition.character) :
                undefined,
            createdAt: new Date(data.createdAt),
            updatedAt: new Date(data.updatedAt),
            usageCount: data.usageCount ?? 0,
            lastUsedAt: data.lastUsedAt ? new Date(data.lastUsedAt) : undefined,
            content: data.content ?? {}
        });
    }
    
    /**
     * 安全地创建模板，失败时返回错误而非抛出异常
     */
    static createSafe(data: {
        id: string;
        name: string;
        parameters: ITemplateParameter[];
        sourceFile: EditorUri;
        definitionPosition?: EditorPosition;
        createdAt?: Date;
        updatedAt?: Date;
        usageCount?: number;
        lastUsedAt?: Date;
        content?: Record<string, unknown>;
    }): { success: true; template: Template } | { success: false; error: string } {
        try {
            const template = new Template(data);
            return { success: true, template };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    
    /**
     * 验证模板数据的完整性
     */
    private validate(): void {
        // 验证 ID
        if (!this.id || typeof this.id !== 'string' || this.id.trim() === '') {
            throw new TemplateValidationError(`Template validation failed: ID cannot be empty (template: ${this.name || 'unknown'})`);
        }
        
        // 验证名称
        if (!this.name || typeof this.name !== 'string' || this.name.trim() === '') {
            throw new TemplateValidationError(`Template validation failed: name cannot be empty (ID: ${this.id})`);
        }
        
        // 验证源文件
        if (!this.sourceFile) {
            throw new TemplateValidationError(`Template validation failed: must have a source file (template: ${this.name})`);
        }
        
        // 验证参数名称唯一性和类型
        const paramNames = new Set<string>();
        for (let i = 0; i < this.parameters.length; i++) {
            const param = this.parameters[i];
            
            // 类型检查：确保 param 是对象且有 name 属性
            if (!param || typeof param !== 'object') {
                throw new TemplateValidationError(
                    `Template validation failed: parameter at index ${i} must be an object (template: ${this.name})`
                );
            }
            
            // 类型检查：确保 param.name 是字符串
            if (!param.name || typeof param.name !== 'string') {
                throw new TemplateValidationError(
                    `Template validation failed: parameter at index ${i} has invalid name type ` +
                    `(expected string, got ${typeof param.name}, template: ${this.name})`
                );
            }
            
            const trimmedName = param.name.trim();
            if (!trimmedName) {
                throw new TemplateValidationError(
                    `Template validation failed: parameter at index ${i} has empty name (template: ${this.name})`
                );
            }
            
            if (paramNames.has(trimmedName)) {
                throw new TemplateValidationError(
                    `Template validation failed: duplicate parameter name "${trimmedName}" (template: ${this.name})`
                );
            }
            paramNames.add(trimmedName);
        }
    }
    
    
    /**
     * 比较参数数组是否相等
     */
    private parametersEqual(otherParams: ReadonlyArray<ITemplateParameter>): boolean {
        if (this.parameters.length !== otherParams.length) {
            return false;
        }
        
        for (let i = 0; i < this.parameters.length; i++) {
            const param1 = this.parameters[i];
            const param2 = otherParams[i];
            
            if (param1.name !== param2.name ||
                param1.required !== param2.required ||
                param1.type !== param2.type ||
                JSON.stringify(param1.defaultValue) !== JSON.stringify(param2.defaultValue)) {
                return false;
            }
        }
        
        return true;
    }
}
