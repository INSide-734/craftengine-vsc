import {
    type CodeActionProvider,
    type TextDocument,
    type Range,
    type CodeActionContext,
    type CodeAction,
    CodeActionKind,
    type Diagnostic,
} from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { type ILogger } from '../../core/interfaces/ILogger';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';

/**
 * 代码操作提供者基类
 *
 * 封装所有 CodeActionProvider 的公共逻辑：
 * - 按诊断源过滤诊断
 * - 为每个匹配的诊断调用子类的修复方法
 * - 统一的日志记录和异常处理
 */
export abstract class BaseCodeActionProvider implements CodeActionProvider {
    protected readonly logger: ILogger;

    /** 提供的 CodeAction 类型 */
    static readonly providedCodeActionKinds = [CodeActionKind.QuickFix];

    /**
     * @param loggerName 日志子组件名称
     */
    constructor(loggerName: string) {
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild(loggerName);
    }

    /** 诊断源标识，用于过滤诊断 */
    protected abstract readonly diagnosticSource: string;

    /**
     * 提供代码操作
     *
     * @param document 当前文档
     * @param _range 选择范围（未使用）
     * @param context 代码操作上下文，包含诊断信息
     * @returns 代码操作数组
     */
    async provideCodeActions(document: TextDocument, _range: Range, context: CodeActionContext): Promise<CodeAction[]> {
        const actions: CodeAction[] = [];

        try {
            for (const diagnostic of context.diagnostics) {
                if (diagnostic.source !== this.diagnosticSource) {
                    continue;
                }

                const fixActions = await this.createFixActions(document, diagnostic);
                actions.push(...fixActions);
            }

            this.logger.debug('Code actions provided', {
                document: document.fileName,
                actionsCount: actions.length,
            });
        } catch (error) {
            this.logger.error('Error providing code actions', error as Error);
        }

        return actions;
    }

    /**
     * 为单个诊断创建修复操作（子类实现）
     *
     * @param document 当前文档
     * @param diagnostic 需要修复的诊断信息
     * @returns 针对该诊断可用的代码操作集合
     */
    protected abstract createFixActions(document: TextDocument, diagnostic: Diagnostic): Promise<CodeAction[]>;
}
