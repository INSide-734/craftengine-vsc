import { CompletionItem, CancellationToken } from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { ICompletionStrategy, ICompletionContextInfo, ICompletionResult } from '../../core/interfaces/ICompletionStrategy';
import { ISchemaService, IJsonSchema } from '../../core/interfaces/ISchemaService';
import { IYamlPathParser } from '../../core/interfaces/IYamlPathParser';
import { IDelegateStrategyRegistry } from '../../core/interfaces/IDelegateStrategyRegistry';
import { ILogger } from '../../core/interfaces/ILogger';
import { IConfiguration } from '../../core/interfaces/IConfiguration';
import { IDataConfigLoader } from '../../core/interfaces/IDataConfigLoader';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { CompletionItemWithStrategy } from '../types/CompletionTypes';

// ============================================================================
// 常量定义
// ============================================================================

/** 委托策略提供者 ID */
const PROVIDER_IDS = {
    TEMPLATE_NAME: 'craftengine.templateName',
    TEMPLATE_PARAMETERS: 'craftengine.templateParameters',
} as const;

/** 硬编码默认顶级字段（配置加载失败时的回退值） */
const FALLBACK_TOP_LEVEL_FIELDS = [
    'items', 'templates', 'categories', 'events',
    'recipes', 'loot_tables', 'furniture', 'blocks',
    'emoji', 'equipments'
] as const;

// ============================================================================
// 类型定义
// ============================================================================

/** 补全上下文类型 */
type CompletionContextType = 'template' | 'arguments' | 'schema' | 'none';

/** 补全上下文解析结果 */
interface CompletionContextResult {
    /** 上下文类型 */
    type: CompletionContextType;
    /** 委托策略提供者 ID */
    providerId?: string;
    /** 对应的 Schema */
    schema?: IJsonSchema;
}

// ============================================================================
// Schema 感知补全策略
// ============================================================================

/**
 * Schema 感知补全策略
 * 
 * 作为补全系统的核心协调器，根据 JSON Schema 中的自定义标记（x-completion-provider）
 * 智能选择和委托给专门的子策略提供补全。
 * 
 * ## 工作流程
 * 
 * 1. **激活检查** (`shouldActivate`)
 *    - 验证文件类型和配置
 *    - 快速检测是否在模板相关上下文中
 * 
 * 2. **上下文解析** (`resolveCompletionContext`)
 *    - 解析当前 YAML 路径
 *    - 确定补全类型和对应的委托策略
 * 
 * 3. **策略委托** (`provideCompletionItems`)
 *    - 从注册表获取委托策略
 *    - 调用策略的补全方法
 * 
 * ## Schema 扩展属性
 * 
 * 使用 `x-completion-provider` 指定补全提供者：
 * 
 * ```json
 * {
 *   "properties": {
 *     "template": {
 *       "type": "string",
 *       "x-completion-provider": "craftengine.templateName"
 *     }
 *   }
 * }
 * ```
 * 
 * ## 支持的委托策略
 * 
 * - `craftengine.templateName`: 模板名称补全
 * - `craftengine.templateParameters`: 模板参数补全
 * - `craftengine.translationKey`: 翻译键补全
 * - `craftengine.filePath`: 文件路径补全
 */
export class SchemaAwareCompletionStrategy implements ICompletionStrategy {
    // ========================================================================
    // 策略元信息
    // ========================================================================

    /** 策略唯一标识 */
    readonly name = 'schema-aware';

    /** 策略优先级（从配置文件加载，默认 90） */
    readonly priority: number;

    /** 触发字符（空数组表示所有输入都可能触发） */
    readonly triggerCharacters: string[] = [];

    /** 模板上下文扫描的最大行数限制 */
    private static readonly MAX_TEMPLATE_SCAN_LINES = 50;

    // ========================================================================
    // 依赖服务
    // ========================================================================

    private readonly schemaService: ISchemaService;
    private readonly pathParser: IYamlPathParser;
    private readonly delegateRegistry: IDelegateStrategyRegistry;
    private readonly logger: ILogger;
    private readonly config: IConfiguration;

    /** 从配置加载的默认顶级字段列表 */
    private readonly defaultTopLevelFields: readonly string[];

    /** 缓存的顶级字段列表（从 Schema 加载） */
    private topLevelFieldsCache: Set<string> | null = null;

    /** 请求级别的 Schema 查询缓存，避免同一请求内重复查询 */
    private requestSchemaCache: Map<string, IJsonSchema | undefined> | null = null;

    constructor() {
        this.schemaService = ServiceContainer.getService<ISchemaService>(SERVICE_TOKENS.SchemaService);
        this.pathParser = ServiceContainer.getService<IYamlPathParser>(SERVICE_TOKENS.YamlPathParser);
        this.delegateRegistry = ServiceContainer.getService<IDelegateStrategyRegistry>(SERVICE_TOKENS.DelegateStrategyRegistry);
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger)
            .createChild('SchemaAwareCompletionStrategy');
        this.config = ServiceContainer.getService<IConfiguration>(SERVICE_TOKENS.Configuration);

        // 从配置文件加载优先级
        const configLoader = ServiceContainer.getService<IDataConfigLoader>(SERVICE_TOKENS.DataConfigLoader);
        this.priority = configLoader.getCompletionPrioritySync('schemaAware', false);

        // 从配置加载默认顶级字段
        const schemaConfig = configLoader.getSchemaConfigSync();
        this.defaultTopLevelFields = schemaConfig?.defaultTopLevelFields ?? FALLBACK_TOP_LEVEL_FIELDS;

        // 注意：不在构造函数中初始化缓存，因为 SchemaService 可能还未完全初始化
        // 缓存会在第一次使用 isTopLevelField() 时延迟初始化
    }
    
    /**
     * 初始化顶级字段缓存
     * 
     * 从 Schema 异步加载顶级字段并缓存，用于快速同步检查
     * 
     * @remarks
     * 这是一个延迟初始化方法，只在需要时才调用 SchemaService。
     * 如果 SchemaService 尚未初始化，会使用默认字段作为回退。
     */
    private async initializeTopLevelFieldsCache(): Promise<void> {
        // 避免重复初始化
        if (this.topLevelFieldsCache !== null) {
            return;
        }
        
        try {
            const fields = await this.schemaService.getTopLevelFields();
            this.topLevelFieldsCache = new Set(fields);
            this.logger.debug('Top-level fields cache initialized', {
                fieldsCount: fields.length,
                fields: fields.slice(0, 10) // 只记录前10个
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // 如果是未初始化错误，记录为 debug 级别（正常情况）
            if (errorMessage.includes('not initialized')) {
                this.logger.debug('SchemaService not yet initialized, using default fields', {
                    error: errorMessage
                });
            } else {
                // 其他错误记录为 warn
                this.logger.warn('Failed to load top-level fields from schema, using defaults', {
                    error: errorMessage
                });
            }
            
            // 使用默认值作为回退
            this.topLevelFieldsCache = new Set(this.defaultTopLevelFields);
        }
    }
    
    // ========================================================================
    // ICompletionStrategy 接口实现
    // ========================================================================
    
    /**
     * 判断是否应该激活此策略
     * 
     * 执行快速同步检查，确定当前位置是否可能需要 Schema 驱动的补全。
     * 为了性能考虑，此方法必须保持同步且快速。
     */
    shouldActivate(context: ICompletionContextInfo): boolean {
        try {
            // 前置条件检查
            if (!this.isSchemaCompletionEnabled()) {
                return false;
            }
            
            if (context.document.languageId !== 'yaml') {
                return false;
            }
            
            const linePrefix = context.linePrefix.trim();
            
            // 检查 template 字段上下文
            if (this.isTemplateFieldContext(linePrefix)) {
                this.logActivation('template context', context);
                return true;
            }
            
            // 检查 arguments 字段上下文
            if (this.isArgumentsFieldContext(linePrefix)) {
                this.logActivation('arguments context', context);
                return true;
            }
            
            // 检查是否在模板参数块内（需要向上扫描）
            if (this.isPotentialParameterContext(context, linePrefix)) {
                this.logActivation('potential parameter context', context);
                return true;
            }
            
            // 通用值位置检查（支持所有 x-completion-provider 定义的补全）
            if (this.isValuePositionWithSchema(context, linePrefix)) {
                this.logActivation('value position with schema', context);
                return true;
            }
            
            return false;
            
        } catch (error) {
            this.logger.error('Error checking schema-aware activation', error as Error);
            return false;
        }
    }
    
    /**
     * 提供补全项
     *
     * 解析当前补全上下文，并委托给对应的子策略处理。
     */
    async provideCompletionItems(
        context: ICompletionContextInfo,
        token?: CancellationToken
    ): Promise<ICompletionResult | undefined> {
        // 初始化请求级 Schema 缓存
        this.requestSchemaCache = new Map();

        try {
            if (token?.isCancellationRequested) {
                return undefined;
            }

            // 解析补全上下文，确定策略和 Schema
            const completionContext = await this.resolveCompletionContext(context);

            if (completionContext.type === 'none' || !completionContext.providerId) {
                return undefined;
            }

            // 获取并执行委托策略
            return await this.executeDelegateStrategy(
                completionContext.providerId,
                context,
                completionContext.schema,
                token
            );

        } catch (error) {
            this.logger.error('Error providing schema-aware completions', error as Error);
            return undefined;
        } finally {
            // 清理请求级缓存
            this.requestSchemaCache = null;
        }
    }
    
    /**
     * 解析补全项的详细信息
     * 
     * 将解析请求委托给创建该补全项的子策略处理。
     */
    async resolveCompletionItem(
        item: CompletionItem,
        token?: CancellationToken
    ): Promise<CompletionItem | undefined> {
        try {
            if (token?.isCancellationRequested) {
                return item;
            }
            
            // 从补全项获取原始提供者 ID
            const providerId = (item as CompletionItemWithStrategy)._schemaProviderId;
            
            if (!providerId) {
                this.logger.debug('No provider ID found on completion item, returning as-is');
                return item;
            }
            
            // 获取委托策略并解析
            const delegateStrategy = this.delegateRegistry.getStrategy(providerId);
            
            if (!delegateStrategy?.resolveCompletionItem) {
                return item;
            }
            
            this.logger.debug('Resolving completion item via delegate strategy', {
                providerId,
                strategyName: delegateStrategy.name,
                itemLabel: this.getItemLabel(item)
            });
            
            const resolvedItem = await delegateStrategy.resolveCompletionItem(item, token);
            return resolvedItem || item;
            
        } catch (error) {
            this.logger.error('Error resolving schema-aware completion item', error as Error, {
                providerId: (item as CompletionItemWithStrategy)._schemaProviderId,
                itemLabel: this.getItemLabel(item)
            });
            return item;
        }
    }
    
    // ========================================================================
    // 上下文检测方法
    // ========================================================================
    
    /**
     * 检查是否启用了 Schema 驱动补全
     */
    private isSchemaCompletionEnabled(): boolean {
        const enabled = this.config.get('schema.customCompletion.enabled', true);
        if (!enabled) {
            this.logger.debug('Schema-driven completion disabled');
        }
        return enabled;
    }
    
    /**
     * 检查是否在指定字段的值位置
     * 
     * 只有当 `fieldName:` 后面需要输入值时才返回 true，
     * 排除用户正在输入该键名的情况。
     * 
     * @param linePrefix - 光标前的行文本
     * @param fieldName - 要检查的字段名
     */
    private isFieldValueContext(linePrefix: string, fieldName: string): boolean {
        // 情况1: 已经有 fieldName: 且在值位置
        if (linePrefix.includes(`${fieldName}:`)) {
            return true;
        }
        
        // 情况2: 检查是否在值位置输入 fieldName（而不是键名位置）
        if (linePrefix.includes(fieldName)) {
            const colonIndex = linePrefix.lastIndexOf(':');
            // 必须有冒号，说明在值位置
            if (colonIndex === -1) {
                return false;
            }
            // 确保 fieldName 是在冒号后面
            const afterColon = linePrefix.substring(colonIndex + 1);
            return afterColon.includes(fieldName);
        }
        
        return false;
    }
    
    /**
     * 检查是否在 template 字段上下文（值位置）
     */
    private isTemplateFieldContext(linePrefix: string): boolean {
        return this.isFieldValueContext(linePrefix, 'template');
    }
    
    /**
     * 检查是否在 arguments 字段上下文（值位置）
     */
    private isArgumentsFieldContext(linePrefix: string): boolean {
        return this.isFieldValueContext(linePrefix, 'arguments');
    }
    
    /**
     * 检查是否可能在模板参数块内
     * 
     * 通过缩进和向上扫描检测是否在 arguments 块的子字段中
     */
    private isPotentialParameterContext(context: ICompletionContextInfo, linePrefix: string): boolean {
        // 必须有缩进且看起来像键名或键值对
        if (context.indentLevel <= 0 || !linePrefix.match(/^\s*[a-zA-Z_-]*:?\s*$/)) {
            return false;
        }
        
        return this.scanForTemplateContext(context);
    }
    
    /**
     * 检查是否在值位置且有对应的 Schema
     */
    private isValuePositionWithSchema(context: ICompletionContextInfo, linePrefix: string): boolean {
        if (!this.isInValuePosition(linePrefix)) {
            return false;
        }
        
        const currentPath = this.pathParser.parsePath(context.document, context.position);
        return currentPath.length > 0 && this.schemaService.hasSchemaForPath(currentPath);
    }
    
    /**
     * 检查是否在 YAML 值位置（冒号后）
     */
    private isInValuePosition(linePrefix: string): boolean {
        const trimmed = linePrefix.trim();
        const colonIndex = trimmed.lastIndexOf(':');
        
        if (colonIndex === -1) {
            return false;
        }
        
        // 排除注释
        const afterColon = trimmed.substring(colonIndex + 1).trim();
        return !afterColon.startsWith('#');
    }
    
    // ========================================================================
    // 上下文解析方法
    // ========================================================================
    
    /**
     * 解析补全上下文
     * 
     * 确定当前位置的补全类型、对应的委托策略和 Schema 信息
     */
    private async resolveCompletionContext(context: ICompletionContextInfo): Promise<CompletionContextResult> {
        const linePrefix = context.linePrefix.trim();
        const path = this.pathParser.parsePath(context.document, context.position);
        
        // 检查 template 字段
        if (this.isTemplateFieldContext(linePrefix)) {
            return this.createContextResult('template', PROVIDER_IDS.TEMPLATE_NAME, path);
        }
        
        // 检查 arguments 字段或模板上下文
        if (this.isArgumentsFieldContext(linePrefix) || this.checkForTemplateContext(context)) {
            return this.createContextResult('arguments', PROVIDER_IDS.TEMPLATE_PARAMETERS, path);
        }
        
        // 尝试从 Schema 获取补全提供者
        return await this.resolveSchemaBasedContext(path);
    }
    
    /**
     * 创建上下文结果（带 Schema 查询缓存）
     */
    private async createContextResult(
        type: CompletionContextType,
        providerId: string,
        path: string[]
    ): Promise<CompletionContextResult> {
        let schema: IJsonSchema | undefined;

        if (path.length > 0) {
            schema = await this.getCachedSchemaForPath(path);
        }

        this.logger.debug(`Using ${type} completion`, {
            hasSchema: !!schema,
            completionMode: schema?.['x-completion-mode']
        });

        return { type, providerId, schema };
    }

    /**
     * 获取 Schema（带请求级缓存）
     *
     * 避免同一补全请求内重复查询相同路径的 Schema
     */
    private async getCachedSchemaForPath(path: string[]): Promise<IJsonSchema | undefined> {
        const cacheKey = path.join('.');

        // 检查请求级缓存
        if (this.requestSchemaCache?.has(cacheKey)) {
            return this.requestSchemaCache.get(cacheKey);
        }

        // 查询 Schema
        const schema = await this.schemaService.getSchemaForPath(path);

        // 存入请求级缓存
        this.requestSchemaCache?.set(cacheKey, schema);

        return schema;
    }
    
    /**
     * 从 Schema 解析补全上下文
     */
    private async resolveSchemaBasedContext(path: string[]): Promise<CompletionContextResult> {
        if (path.length === 0) {
            this.logger.debug('No YAML path found, skipping completion');
            return { type: 'none' };
        }

        const schema = await this.getCachedSchemaForPath(path);

        if (!schema) {
            this.logger.debug('No schema found for path', { path: path.join('.') });
            return { type: 'none' };
        }

        const providerId = this.schemaService.getCustomProperty(schema, 'completion-provider') as string | undefined;

        if (!providerId) {
            this.logger.debug('No completion provider in schema', { path: path.join('.') });
            return { type: 'none' };
        }

        return { type: 'schema', providerId, schema };
    }
    
    // ========================================================================
    // 委托策略执行
    // ========================================================================
    
    /**
     * 执行委托策略
     */
    private async executeDelegateStrategy(
        providerId: string,
        context: ICompletionContextInfo,
        schema: IJsonSchema | undefined,
        token?: CancellationToken
    ): Promise<ICompletionResult | undefined> {
        const delegateStrategy = this.delegateRegistry.getStrategy(providerId);
        
        if (!delegateStrategy) {
            this.logMissingStrategy(providerId, context.linePrefix);
            return undefined;
        }
        
        this.logger.debug('Delegating to strategy', {
            providerId,
            strategyName: delegateStrategy.name,
            hasSchema: !!schema,
            completionMode: schema?.['x-completion-mode']
        });
        
        // 创建增强上下文并执行
        const enhancedContext: ICompletionContextInfo = {
            ...context,
            schema: schema || context.schema
        };
        
        const result = await delegateStrategy.provideCompletionItems(enhancedContext, token);
        
        if (result) {
            this.markCompletionItems(result.items, providerId);
            this.logCompletionResult(providerId, result.items);
        }
        
        return result;
    }
    
    /**
     * 标记补全项的来源信息
     * 
     * 添加元数据以支持 resolveCompletionItem 找到正确的委托策略
     */
    private markCompletionItems(items: CompletionItem[], providerId: string): void {
        items.forEach(item => {
            (item as CompletionItemWithStrategy)._schemaProviderId = providerId;
            (item as CompletionItemWithStrategy)._strategy = this.name;
        });
    }
    
    // ========================================================================
    // 模板上下文扫描
    // ========================================================================
    
    /**
     * 检查是否在模板相关的上下文中
     * 
     * 向上扫描文档，查找 template 或 arguments 字段
     */
    private checkForTemplateContext(context: ICompletionContextInfo): boolean {
        return this.scanForTemplateContext(context);
    }
    
    /**
     * 扫描模板上下文
     *
     * 向上扫描文档，查找是否在 template 或 arguments 字段的范围内
     *
     * @remarks
     * 扫描范围限制为 MAX_TEMPLATE_SCAN_LINES 行，避免大文件性能问题
     *
     * @param context - 补全上下文
     */
    private scanForTemplateContext(context: ICompletionContextInfo): boolean {
        const { document, position } = context;

        // 限制扫描范围
        const maxLines = SchemaAwareCompletionStrategy.MAX_TEMPLATE_SCAN_LINES;
        let scannedLines = 0;

        for (let lineNum = position.line - 1; lineNum >= 0; lineNum--) {
            // 检查是否超过扫描限制
            if (++scannedLines > maxLines) {
                break;
            }

            const line = document.lineAt(lineNum);
            const trimmed = line.text.trim();

            // 跳过空行和注释
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            // 找到 template 或 arguments 字段
            if (trimmed.startsWith('template:') || trimmed.startsWith('arguments:')) {
                return true;
            }

            // 检查是否遇到了更高级别的字段边界
            const lineIndent = this.getIndentLevel(line.text);
            if (lineIndent <= context.indentLevel && trimmed.match(/^[a-zA-Z_-]+:/)) {
                const fieldMatch = trimmed.match(/^([a-zA-Z_-]+):/);

                // 如果是顶级字段，继续查找（可能在其内部）
                if (fieldMatch && this.isTopLevelField(fieldMatch[1])) {
                    continue;
                }

                // 遇到其他字段边界，停止搜索
                break;
            }
        }

        return false;
    }
    
    /**
     * 检查是否为顶级字段
     * 
     * 使用从 Schema 加载的缓存进行快速同步检查，
     * 如果缓存尚未初始化则触发延迟初始化并使用默认值作为回退
     */
    private isTopLevelField(fieldName: string): boolean {
        // 如果缓存未初始化，触发延迟初始化（异步，不阻塞）
        if (this.topLevelFieldsCache === null) {
            // 触发初始化，但不等待结果
            this.initializeTopLevelFieldsCache().catch(error => {
                this.logger.debug('Cache initialization failed in background', {
                    error: error instanceof Error ? error.message : String(error)
                });
            });
            
            // 在初始化完成前使用默认值
            return this.defaultTopLevelFields.includes(fieldName);
        }
        
        return this.topLevelFieldsCache.has(fieldName);
    }
    
    // ========================================================================
    // 工具方法
    // ========================================================================
    
    /**
     * 获取行的缩进级别（空格数）
     */
    private getIndentLevel(line: string): number {
        const match = line.match(/^(\s*)/);
        return match ? match[1].length : 0;
    }
    
    /**
     * 获取补全项的标签文本
     */
    private getItemLabel(item: CompletionItem): string {
        return typeof item.label === 'string' ? item.label : item.label.label;
    }
    
    // ========================================================================
    // 日志方法
    // ========================================================================
    
    /**
     * 记录策略激活日志
     */
    private logActivation(reason: string, context: ICompletionContextInfo): void {
        this.logger.debug(`Schema-aware completion activated for ${reason}`, {
            linePrefix: context.linePrefix.trim(),
            position: `${context.position.line}:${context.position.character}`,
            indentLevel: context.indentLevel
        });
    }
    
    /**
     * 记录缺失策略警告
     */
    private logMissingStrategy(providerId: string, linePrefix: string): void {
        const debugEnabled = this.config.get('schema.customCompletion.debug', false);
        
        if (debugEnabled) {
            this.logger.warn('Delegate strategy not found', {
                providerId,
                registeredProviders: this.delegateRegistry.listProviders(),
                linePrefix
            });
        }
    }
    
    /**
     * 记录补全结果日志
     */
    private logCompletionResult(providerId: string, items: CompletionItem[]): void {
        this.logger.debug('Delegate strategy provided completions', {
            providerId,
            itemCount: items.length,
            completionItems: items.slice(0, 5).map(i => this.getItemLabel(i))
        });
    }
}

