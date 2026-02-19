import {
    CodeActionProvider,
    TextDocument,
    Range,
    CodeActionContext,
    CodeAction,
    CodeActionKind,
    WorkspaceEdit,
    Position,
    Diagnostic,
    DiagnosticSeverity
} from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { ITemplateService } from '../../core/interfaces/ITemplateService';
import { ILogger } from '../../core/interfaces/ILogger';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { TemplateDiagnosticProvider } from './TemplateDiagnosticProvider';
import { calculateSimilarity } from '../../infrastructure/utils';

/**
 * 模板代码操作提供者
 * 
 * 为诊断错误提供快速修复建议（Quick Fix）
 */
export class TemplateCodeActionProvider implements CodeActionProvider {
    private readonly templateService: ITemplateService;
    private readonly logger: ILogger;

    /** 提供的 CodeAction 类型 */
    static readonly providedCodeActionKinds = [
        CodeActionKind.QuickFix
    ];

    constructor() {
        this.templateService = ServiceContainer.getService<ITemplateService>(SERVICE_TOKENS.TemplateService);
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild('TemplateCodeActionProvider');
    }

    /**
     * 提供代码操作
     */
    async provideCodeActions(
        document: TextDocument,
        _range: Range,
        context: CodeActionContext
    ): Promise<CodeAction[]> {
        const actions: CodeAction[] = [];

        try {
            for (const diagnostic of context.diagnostics) {
                // 只处理模板相关的诊断（基于诊断源匹配）
                if (diagnostic.source !== TemplateDiagnosticProvider.DIAGNOSTIC_SOURCE && 
                    diagnostic.source !== 'CraftEngine Parser') {
                    continue;
                }

                // 根据错误代码生成相应的快速修复
                const fixActions = await this.createFixActionsForDiagnostic(
                    document,
                    diagnostic
                );
                actions.push(...fixActions);
            }

            // 仅在有 action 时记录，避免高频无意义日志
            if (actions.length > 0) {
                this.logger.debug('Code actions provided', {
                    document: document.fileName,
                    actionsCount: actions.length
                });
            }

        } catch (error) {
            this.logger.error('Error providing code actions', error as Error);
        }

        return actions;
    }

    /**
     * 为诊断创建修复操作
     */
    private async createFixActionsForDiagnostic(
        document: TextDocument,
        diagnostic: Diagnostic
    ): Promise<CodeAction[]> {
        const code = diagnostic.code;

        if (code === 'unknown_template') {
            return this.createUnknownTemplateActions(document, diagnostic);
        }

        if (code === 'missing_required_parameter') {
            return this.createMissingParameterActions(document, diagnostic);
        }

        if (code === 'syntax-error') {
            return this.createSyntaxErrorActions(document, diagnostic);
        }

        // 为未知错误提供通用操作
        return this.createGenericActions(document, diagnostic);
    }

    /**
     * 创建未知模板的修复操作
     */
    private async createUnknownTemplateActions(
        document: TextDocument,
        diagnostic: Diagnostic
    ): Promise<CodeAction[]> {
        const actions: CodeAction[] = [];
        const templateName = this.extractTemplateName(document, diagnostic.range);

        if (!templateName) {
            return actions;
        }

        // 1. 查找相似的模板名称
        try {
            const allTemplates = await this.templateService.searchTemplates({ 
                prefix: '', 
                limit: 1000,
                fuzzy: true
            });
            const similarTemplates = this.findSimilarTemplates(
                templateName, 
                allTemplates.map(m => m.template.name)
            );

            // 为每个相似模板创建替换操作
            for (const similarName of similarTemplates.slice(0, 5)) {
                const action = new CodeAction(
                    `Change '${templateName}' to '${similarName}'`,
                    CodeActionKind.QuickFix
                );

                action.diagnostics = [diagnostic];
                action.isPreferred = similarTemplates[0] === similarName;

                const edit = new WorkspaceEdit();
                edit.replace(document.uri, diagnostic.range, similarName);
                action.edit = edit;

                actions.push(action);
            }
        } catch (error) {
            this.logger.error('Error finding similar templates', error as Error);
        }

        // 2. 创建新模板的操作
        const createAction = new CodeAction(
            `Create template '${templateName}'`,
            CodeActionKind.QuickFix
        );
        createAction.diagnostics = [diagnostic];
        createAction.command = {
            title: 'Create new template',
            command: 'craftengine.createTemplateFromUsage',
            arguments: [templateName, document.uri, diagnostic.range]
        };
        actions.push(createAction);

        // 3. 忽略此警告
        const ignoreAction = new CodeAction(
            'Ignore this template warning',
            CodeActionKind.QuickFix
        );
        ignoreAction.diagnostics = [diagnostic];
        ignoreAction.command = {
            title: 'Add to ignore list',
            command: 'craftengine.ignoreTemplateWarning',
            arguments: [templateName]
        };
        actions.push(ignoreAction);

        return actions;
    }

    /**
     * 创建缺少参数的修复操作
     */
    private createMissingParameterActions(
        document: TextDocument,
        diagnostic: Diagnostic
    ): CodeAction[] {
        const actions: CodeAction[] = [];

        // 从错误消息中提取参数名称
        const paramMatch = diagnostic.message.match(/Missing required parameter: (\w+)/);
        if (!paramMatch) {
            return actions;
        }

        const paramName = paramMatch[1];

        // 1. 添加缺失的参数
        const addAction = new CodeAction(
            `Add required parameter '${paramName}'`,
            CodeActionKind.QuickFix
        );
        addAction.diagnostics = [diagnostic];
        addAction.isPreferred = true;

        const edit = new WorkspaceEdit();
        const insertPosition = this.findArgumentsInsertPosition(document, diagnostic.range);
        if (insertPosition) {
            const indent = this.getIndentation(document, insertPosition.line);
            const paramText = `${indent}${paramName}: \${1:value}\n`;
            edit.insert(document.uri, insertPosition, paramText);
            addAction.edit = edit;
            actions.push(addAction);
        }

        return actions;
    }


    /**
     * 创建语法错误的修复操作
     */
    private createSyntaxErrorActions(
        _document: TextDocument,
        diagnostic: Diagnostic
    ): CodeAction[] {
        const actions: CodeAction[] = [];

        // 1. 格式化文档
        const formatAction = new CodeAction(
            'Format YAML document',
            CodeActionKind.QuickFix
        );
        formatAction.diagnostics = [diagnostic];
        formatAction.command = {
            title: 'Format document',
            command: 'editor.action.formatDocument'
        };
        actions.push(formatAction);

        return actions;
    }

    /**
     * 创建通用修复操作
     */
    private createGenericActions(
        _document: TextDocument,
        diagnostic: Diagnostic
    ): CodeAction[] {
        const actions: CodeAction[] = [];

        // 如果是警告级别，提供忽略选项
        if (diagnostic.severity === DiagnosticSeverity.Warning) {
            const ignoreAction = new CodeAction(
                'Ignore this warning',
                CodeActionKind.QuickFix
            );
            ignoreAction.diagnostics = [diagnostic];
            ignoreAction.command = {
                title: 'Ignore warning',
                command: 'craftengine.ignoreWarning',
                arguments: [diagnostic]
            };
            actions.push(ignoreAction);
        }

        return actions;
    }

    // ========== 辅助方法 ==========

    /**
     * 从范围中提取模板名称
     */
    private extractTemplateName(document: TextDocument, range: Range): string | undefined {
        try {
            return document.getText(range).trim();
        } catch {
            return undefined;
        }
    }

    /**
     * 查找相似的模板名称
     */
    private findSimilarTemplates(target: string, templates: string[]): string[] {
        const similarities = templates
            .map(name => ({
                name,
                score: calculateSimilarity(target, name)
            }))
            .filter(item => item.score > 0.5)
            .sort((a, b) => b.score - a.score);

        return similarities.map(item => item.name);
    }

    /**
     * 查找 arguments 块的插入位置
     */
    private findArgumentsInsertPosition(document: TextDocument, range: Range): Position | undefined {
        const line = range.start.line;
        const text = document.getText();
        const lines = text.split('\n');

        // 查找 arguments: 行
        for (let i = line + 1; i < Math.min(line + 10, lines.length); i++) {
            if (lines[i].trim() === 'arguments:') {
                return new Position(i + 1, 0);
            }
        }

        // 如果没有找到 arguments 块，在模板定义后插入
        return new Position(line + 1, 0);
    }

    /**
     * 获取行的缩进
     */
    private getIndentation(document: TextDocument, line: number): string {
        const lineText = document.lineAt(line).text;
        const match = lineText.match(/^(\s*)/);
        return match ? match[1] + '  ' : '  ';
    }
}