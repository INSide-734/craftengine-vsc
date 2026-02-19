import { 
    CompletionItem, 
    CompletionList, 
    TextDocument, 
    Position, 
    Hover,
    Location,
    CancellationToken,
    CompletionContext
} from 'vscode';

/**
 * 补全上下文信息
 */
export interface ICompletionContext {
    /** 是否应该触发补全 */
    shouldTrigger: boolean;
    /** 触发类型 */
    triggerType: 'direct' | 'array' | 'none';
    /** 输入前缀 */
    inputPrefix: string;
    /** 缩进级别 */
    indentLevel: number;
}

/**
 * 模板补全提供者接口
 */
export interface ITemplateCompletionProvider {
    /**
     * 提供补全建议
     */
    provideCompletionItems(
        document: TextDocument,
        position: Position,
        token?: CancellationToken,
        context?: CompletionContext
    ): Promise<CompletionList | CompletionItem[] | undefined>;
    
    /**
     * 解析补全项
     */
    resolveCompletionItem(
        item: CompletionItem,
        token?: CancellationToken
    ): Promise<CompletionItem | undefined>;
}

/**
 * 模板悬停提供者接口
 */
export interface ITemplateHoverProvider {
    /**
     * 提供悬停信息
     */
    provideHover(
        document: TextDocument,
        position: Position,
        token?: CancellationToken
    ): Promise<Hover | undefined>;
}

/**
 * 模板定义提供者接口
 */
export interface ITemplateDefinitionProvider {
    /**
     * 提供定义位置
     */
    provideDefinition(
        document: TextDocument,
        position: Position,
        token?: CancellationToken
    ): Promise<Location | Location[] | undefined>;
}

/**
 * 诊断信息
 */
export interface ITemplateDiagnostic {
    /** 诊断消息 */
    message: string;
    /** 严重级别 */
    severity: 'error' | 'warning' | 'info' | 'hint';
    /** 位置范围 */
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    /** 错误代码 */
    code?: string;
    /** 相关信息 */
    relatedInformation?: Array<{
        location: {
            uri: string;
            range: {
                start: { line: number; character: number };
                end: { line: number; character: number };
            };
        };
        message: string;
    }>;
}

/**
 * 模板诊断提供者接口
 */
export interface ITemplateDiagnosticProvider {
    /**
     * 提供诊断信息
     */
    provideDiagnostics(document: TextDocument): Promise<ITemplateDiagnostic[]>;
    
    /**
     * 更新文档的诊断信息
     */
    updateDiagnostics(document: TextDocument): Promise<void>;
    
    /**
     * 清除文档的诊断信息
     */
    clearDiagnostics(documentUri: string): void;
}
