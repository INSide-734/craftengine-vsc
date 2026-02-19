import { EditorTextDocument, EditorPosition, EditorCompletionItem, EditorCompletionContext, EditorCancellationToken } from '../types/EditorTypes';
import { IJsonSchema } from './ISchemaService';

/**
 * 补全上下文信息
 */
export interface ICompletionContextInfo {
    /** 文档 */
    document: EditorTextDocument;
    /** 光标位置 */
    position: EditorPosition;
    /** 当前行文本 */
    lineText: string;
    /** 光标前的文本 */
    linePrefix: string;
    /** 光标后的文本 */
    lineSuffix: string;
    /** 缩进级别 */
    indentLevel: number;
    /** 触发字符 */
    triggerCharacter?: string;
    /** VSCode 补全上下文 */
    vscodeContext?: EditorCompletionContext;
    /** Schema 信息（可选，由 SchemaAwareCompletionStrategy 提供） */
    schema?: IJsonSchema;
}

/**
 * 补全结果
 */
export interface ICompletionResult {
    /** 补全项列表 */
    items: EditorCompletionItem[];
    /** 是否完整 */
    isIncomplete: boolean;
    /** 补全类型 */
    completionType: string;
    /** 优先级（用于多个补全策略时排序） */
    priority?: number;
}

/**
 * 补全策略接口
 * 
 * 每种补全类型（模板、变量、函数等）都应实现此接口
 */
export interface ICompletionStrategy {
    /**
     * 策略名称
     */
    readonly name: string;
    
    /**
     * 策略优先级（0-100，数值越大优先级越高）
     */
    readonly priority: number;
    
    /**
     * 触发字符列表
     */
    readonly triggerCharacters: string[];
    
    /**
     * 判断是否应该激活此补全策略
     * 
     * @param context 补全上下文
     * @returns 是否应该激活
     */
    shouldActivate(context: ICompletionContextInfo): boolean | Promise<boolean>;
    
    /**
     * 提供补全项
     * 
     * @param context 补全上下文
     * @param token 取消令牌
     * @returns 补全结果
     */
    provideCompletionItems(
        context: ICompletionContextInfo,
        token?: EditorCancellationToken
    ): Promise<ICompletionResult | undefined>;

    /**
     * 解析补全项（可选）
     *
     * @param item 补全项
     * @param token 取消令牌
     * @returns 解析后的补全项
     */
    resolveCompletionItem?(
        item: EditorCompletionItem,
        token?: EditorCancellationToken
    ): Promise<EditorCompletionItem | undefined>;
}

/**
 * 补全提供者管理器接口
 */
export interface ICompletionManager {
    /**
     * 注册补全策略
     * 
     * @param strategy 补全策略
     */
    registerStrategy(strategy: ICompletionStrategy): void;
    
    /**
     * 取消注册补全策略
     * 
     * @param strategyName 策略名称
     */
    unregisterStrategy(strategyName: string): void;
    
    /**
     * 获取所有注册的策略
     */
    getStrategies(): ICompletionStrategy[];
    
    /**
     * 根据上下文获取激活的策略
     * 
     * @param context 补全上下文
     * @returns 激活的策略列表（按优先级排序）
     */
    getActiveStrategies(context: ICompletionContextInfo): Promise<ICompletionStrategy[]>;
    
    /**
     * 获取所有触发字符
     */
    getAllTriggerCharacters(): string[];
}
