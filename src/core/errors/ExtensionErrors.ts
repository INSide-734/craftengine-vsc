/**
 * 基础扩展错误类
 *
 * 所有扩展自定义错误的基类，提供统一的错误结构和上下文信息。
 * 继承自原生 Error 类，增加了错误代码、时间戳和上下文数据。
 *
 * @remarks
 * **核心特性**：
 *
 * 1. **错误代码**：每个错误都有唯一的错误代码，便于分类和处理
 * 2. **时间戳**：记录错误发生的精确时间
 * 3. **上下文信息**：携带错误发生时的相关数据，便于调试
 * 4. **堆栈跟踪**：保留完整的调用堆栈信息
 *
 * **错误代码约定**：
 * - `CONFIGURATION_ERROR`: 配置相关错误
 * - `TEMPLATE_*`: 模板相关错误
 * - `DEPENDENCY_INJECTION_ERROR`: 依赖注入错误
 * - `FILE_OPERATION_ERROR`: 文件操作错误
 * - `INITIALIZATION_ERROR`: 初始化错误
 *
 * **使用场景**：
 * - 领域层业务规则违反
 * - 技术层操作失败
 * - 配置验证失败
 * - 资源访问错误
 *
 * @example
 * ```typescript
 * // 创建自定义错误类
 * export class CustomError extends ExtensionError {
 *     constructor(message: string, context?: Record<string, unknown>) {
 *         super(message, 'CUSTOM_ERROR', context);
 *     }
 * }
 *
 * // 抛出错误
 * throw new CustomError('Operation failed', {
 *     operation: 'loadTemplate',
 *     templateId: '123'
 * });
 *
 * // 捕获和处理
 * try {
 *     // 操作...
 * } catch (error) {
 *     if (error instanceof ExtensionError) {
 *         console.error(`Error ${error.code}:`, error.message);
 *         console.error('Context:', error.context);
 *         console.error('Timestamp:', error.timestamp);
 *     }
 * }
 * ```
 */
export abstract class ExtensionError extends Error {
    /** 错误代码，用于分类和识别错误类型 */
    public readonly code: string;
    /** 错误发生的时间戳 */
    public readonly timestamp: Date;
    /** 错误上下文信息，包含相关的调试数据 */
    public readonly context?: Record<string, unknown>;

    /**
     * 构造扩展错误实例
     *
     * @param message - 错误消息，描述错误的原因
     * @param code - 错误代码，唯一标识错误类型
     * @param context - 上下文信息，包含错误发生时的相关数据
     *
     * @remarks
     * 构造函数会自动：
     * - 设置错误名称为类名
     * - 记录当前时间戳
     * - 捕获调用堆栈
     */
    constructor(message: string, code: string, context?: Record<string, unknown>) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.timestamp = new Date();
        this.context = context;

        // 确保错误堆栈正确显示
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * 配置相关错误
 *
 * 表示配置加载、验证或使用过程中发生的错误。
 *
 * @remarks
 * **常见场景**：
 * - 配置文件格式错误
 * - 必需的配置项缺失
 * - 配置值类型不匹配
 * - 配置验证失败
 *
 * @example
 * ```typescript
 * // 配置值无效
 * throw new ConfigurationError('Invalid log level', {
 *     key: 'logging.level',
 *     value: 'INVALID',
 *     expectedValues: ['DEBUG', 'INFO', 'WARN', 'ERROR']
 * });
 *
 * // 必需配置缺失
 * throw new ConfigurationError('Required configuration missing', {
 *     key: 'templates.directory'
 * });
 * ```
 */
export class ConfigurationError extends ExtensionError {
    /**
     * 构造配置错误实例
     *
     * @param message - 错误消息
     * @param context - 上下文信息，通常包含配置键和值
     */
    constructor(message: string, context?: Record<string, unknown>) {
        super(message, 'CONFIGURATION_ERROR', context);
    }
}

/**
 * 模板相关错误
 *
 * 模板操作相关错误的基类，所有模板错误都继承自此类。
 *
 * @remarks
 * 此类是抽象的错误基类，具体的模板错误应使用子类：
 * - TemplateParseError: 模板解析错误
 * - TemplateValidationError: 模板验证错误
 * - TemplateNotFoundError: 模板未找到错误
 *
 * @example
 * ```typescript
 * // 自定义模板错误
 * export class TemplateRenderError extends TemplateError {
 *     constructor(message: string, context?: Record<string, unknown>) {
 *         super(message, 'TEMPLATE_RENDER_ERROR', context);
 *     }
 * }
 * ```
 */
export class TemplateError extends ExtensionError {
    /**
     * 构造模板错误实例
     *
     * @param message - 错误消息
     * @param code - 具体的模板错误代码
     * @param context - 上下文信息
     */
    constructor(message: string, code: string, context?: Record<string, unknown>) {
        super(message, code, context);
    }
}

/**
 * 模板解析错误
 *
 * 在解析模板定义时发生的错误，通常是由于模板格式不正确。
 *
 * @remarks
 * **常见原因**：
 * - YAML 语法错误
 * - 模板结构不符合规范
 * - 必需字段缺失
 * - 字段类型不匹配
 *
 * @example
 * ```typescript
 * throw new TemplateParseError('Invalid template structure', {
 *     templateName: 'user-profile',
 *     field: 'parameters',
 *     expected: 'array',
 *     actual: 'string',
 *     line: 15
 * });
 * ```
 */
export class TemplateParseError extends TemplateError {
    /**
     * 构造模板解析错误实例
     *
     * @param message - 错误消息，描述解析失败的原因
     * @param context - 上下文信息，通常包含模板名称、字段、位置等
     */
    constructor(message: string, context?: Record<string, unknown>) {
        super(message, 'TEMPLATE_PARSE_ERROR', context);
    }
}

/**
 * 模板验证错误
 *
 * 在验证模板数据时发生的错误，模板虽然可以解析，但不符合业务规则。
 *
 * @remarks
 * **常见场景**：
 * - 参数定义不完整
 * - 参数引用不存在
 * - 模板名称冲突
 * - 循环依赖检测
 *
 * @example
 * ```typescript
 * throw new TemplateValidationError('Template parameter not defined', {
 *     templateName: 'user-profile',
 *     parameterName: 'userId',
 *     referencedIn: 'content',
 *     validationRule: 'all-parameters-must-be-defined'
 * });
 * ```
 */
export class TemplateValidationError extends TemplateError {
    /**
     * 构造模板验证错误实例
     *
     * @param message - 错误消息，描述验证失败的原因
     * @param context - 上下文信息，包含验证规则和失败详情
     */
    constructor(message: string, context?: Record<string, unknown>) {
        super(message, 'TEMPLATE_VALIDATION_ERROR', context);
    }
}

/**
 * 模板未找到错误
 *
 * 尝试访问不存在的模板时抛出的错误。
 *
 * @remarks
 * **触发条件**：
 * - 引用的模板不存在
 * - 模板已被删除
 * - 模板名称拼写错误
 * - 模板文件未加载
 *
 * @example
 * ```typescript
 * // 简单使用
 * throw new TemplateNotFoundError('user-profile');
 *
 * // 带上下文
 * throw new TemplateNotFoundError('user-profile', {
 *     requestedBy: 'admin-dashboard',
 *     availableTemplates: ['admin-profile', 'guest-profile'],
 *     searchPath: '/templates'
 * });
 * ```
 */
export class TemplateNotFoundError extends TemplateError {
    /**
     * 构造模板未找到错误实例
     *
     * @param templateName - 未找到的模板名称
     * @param context - 额外的上下文信息
     *
     * @remarks
     * 错误消息会自动包含模板名称，格式为 "Template '{templateName}' not found"。
     * 上下文会自动包含 templateName 字段。
     */
    constructor(templateName: string, context?: Record<string, unknown>) {
        super(`Template '${templateName}' not found`, 'TEMPLATE_NOT_FOUND', {
            templateName,
            ...context,
        });
    }
}

/**
 * 依赖注入相关错误
 *
 * 依赖注入系统操作失败时的基类错误。
 *
 * @remarks
 * **子类错误**：
 * - ServiceNotRegisteredError: 服务未注册
 * - CircularDependencyError: 循环依赖
 *
 * @example
 * ```typescript
 * throw new DependencyInjectionError('Failed to resolve service', {
 *     serviceName: 'TemplateService',
 *     reason: 'Constructor parameter type mismatch'
 * });
 * ```
 */
export class DependencyInjectionError extends ExtensionError {
    /**
     * 构造依赖注入错误实例
     *
     * @param message - 错误消息
     * @param context - 上下文信息
     */
    constructor(message: string, context?: Record<string, unknown>) {
        super(message, 'DEPENDENCY_INJECTION_ERROR', context);
    }
}

/**
 * 服务未注册错误
 *
 * 尝试解析未在容器中注册的服务时抛出的错误。
 *
 * @remarks
 * **常见原因**：
 * - 忘记注册服务
 * - 服务令牌拼写错误
 * - 条件注册未满足
 * - 服务初始化顺序问题
 *
 * @example
 * ```typescript
 * throw new ServiceNotRegisteredError('TemplateService', {
 *     token: SERVICE_TOKENS.TemplateService,
 *     requestedBy: 'ExtensionService',
 *     registeredServices: ['Logger', 'Configuration', 'EventBus']
 * });
 * ```
 */
export class ServiceNotRegisteredError extends DependencyInjectionError {
    /**
     * 构造服务未注册错误实例
     *
     * @param serviceName - 未注册的服务名称
     * @param context - 额外的上下文信息
     *
     * @remarks
     * 错误消息会自动包含服务名称。
     * 上下文会自动包含 serviceName 字段。
     */
    constructor(serviceName: string, context?: Record<string, unknown>) {
        super(`Service '${serviceName}' is not registered`, {
            serviceName,
            ...context,
        });
    }
}

/**
 * 循环依赖错误
 *
 * 检测到服务之间存在循环依赖时抛出的错误。
 *
 * @remarks
 * **示例场景**：
 * ```
 * ServiceA -> ServiceB -> ServiceC -> ServiceA
 * ```
 *
 * **解决方案**：
 * - 重新设计服务边界
 * - 使用事件总线解耦
 * - 提取共享依赖到新服务
 * - 使用延迟注入（Lazy）
 *
 * @example
 * ```typescript
 * throw new CircularDependencyError(
 *     ['TemplateService', 'ValidationService', 'TemplateService'],
 *     {
 *         detectedAt: 'TemplateService.constructor',
 *         suggestion: 'Use event bus for validation notifications'
 *     }
 * );
 * ```
 */
export class CircularDependencyError extends DependencyInjectionError {
    /**
     * 构造循环依赖错误实例
     *
     * @param dependencyChain - 依赖链数组，显示循环路径
     * @param context - 额外的上下文信息
     *
     * @remarks
     * 错误消息会自动格式化依赖链，例如：
     * "Circular dependency detected: ServiceA -> ServiceB -> ServiceA"
     *
     * 上下文会自动包含 dependencyChain 字段。
     */
    constructor(dependencyChain: string[], context?: Record<string, unknown>) {
        super(`Circular dependency detected: ${dependencyChain.join(' -> ')}`, {
            dependencyChain,
            ...context,
        });
    }
}

/**
 * 文件操作错误
 *
 * 文件系统操作失败时抛出的错误。
 *
 * @remarks
 * **常见操作**：
 * - read: 读取文件
 * - write: 写入文件
 * - delete: 删除文件
 * - watch: 监视文件变更
 * - exists: 检查文件存在性
 *
 * **常见原因**：
 * - 文件不存在
 * - 权限不足
 * - 文件被占用
 * - 路径无效
 *
 * @example
 * ```typescript
 * throw new FileOperationError(
 *     'Failed to read template file',
 *     '/path/to/templates/user-profile.yaml',
 *     'read',
 *     {
 *         error: originalError.message,
 *         permissions: '0644',
 *         exists: true
 *     }
 * );
 * ```
 */
export class FileOperationError extends ExtensionError {
    /**
     * 构造文件操作错误实例
     *
     * @param message - 错误消息
     * @param filePath - 操作失败的文件路径
     * @param operation - 失败的操作类型（read/write/delete等）
     * @param context - 额外的上下文信息
     *
     * @remarks
     * 上下文会自动包含 filePath 和 operation 字段。
     */
    constructor(message: string, filePath: string, operation: string, context?: Record<string, unknown>) {
        super(message, 'FILE_OPERATION_ERROR', {
            filePath,
            operation,
            ...context,
        });
    }
}

/**
 * 初始化错误
 *
 * 组件或服务初始化失败时抛出的错误。
 *
 * @remarks
 * **常见场景**：
 * - 扩展激活失败
 * - 服务容器初始化失败
 * - 配置加载失败
 * - 依赖服务不可用
 *
 * **最佳实践**：
 * - 提供详细的失败原因
 * - 包含组件名称
 * - 记录初始化步骤
 * - 提供恢复建议
 *
 * @example
 * ```typescript
 * throw new InitializationError(
 *     'Failed to initialize Schema service',
 *     'SchemaService',
 *     {
 *         step: 'loadRootSchema',
 *         reason: 'Schema file not found',
 *         schemaPath: '/schemas/craftengine.schema.json',
 *         suggestion: 'Ensure schema files are included in extension package'
 *     }
 * );
 * ```
 */
export class InitializationError extends ExtensionError {
    /**
     * 构造初始化错误实例
     *
     * @param message - 错误消息，描述初始化失败的原因
     * @param component - 初始化失败的组件名称
     * @param context - 额外的上下文信息
     *
     * @remarks
     * 上下文会自动包含 component 字段。
     * 建议在 context 中包含：
     * - step: 失败的初始化步骤
     * - reason: 失败的具体原因
     * - suggestion: 恢复建议
     */
    constructor(message: string, component: string, context?: Record<string, unknown>) {
        super(message, 'INITIALIZATION_ERROR', {
            component,
            ...context,
        });
    }
}

/**
 * 服务未初始化错误
 *
 * 在服务未完成初始化就被调用时抛出。
 *
 * @example
 * ```typescript
 * throw new ServiceNotInitializedError('SchemaService');
 * ```
 */
export class ServiceNotInitializedError extends ExtensionError {
    constructor(serviceName: string, context?: Record<string, unknown>) {
        super(`${serviceName} not initialized. Call initialize() first.`, 'SERVICE_NOT_INITIALIZED', {
            serviceName,
            ...context,
        });
    }
}

/**
 * 模型生成错误
 *
 * 模型生成过程中发生的错误。
 */
export class ModelGenerationError extends ExtensionError {
    constructor(message: string, context?: Record<string, unknown>) {
        super(message, 'MODEL_GENERATION_ERROR', context);
    }
}

/**
 * 无效物品模型错误
 *
 * 物品模型类型无效时抛出。
 */
export class InvalidItemModelError extends ExtensionError {
    constructor(modelType: string, context?: Record<string, unknown>) {
        super(`Invalid item model type: ${modelType}`, 'INVALID_ITEM_MODEL', {
            modelType,
            ...context,
        });
    }
}

/**
 * Schema 未找到错误
 *
 * Schema 文件不存在时抛出。
 */
export class SchemaNotFoundError extends ExtensionError {
    constructor(filename: string, context?: Record<string, unknown>) {
        super(`Schema file not found: ${filename}`, 'SCHEMA_NOT_FOUND', {
            filename,
            ...context,
        });
    }
}
