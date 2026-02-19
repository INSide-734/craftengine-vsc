import {
    CodeActionProvider,
    TextDocument,
    Range,
    CodeActionContext,
    CancellationToken,
    CodeAction,
    CodeActionKind,
    Diagnostic,
    WorkspaceEdit,
    Disposable
} from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { ILogger } from '../../core/interfaces/ILogger';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { MiniMessageDataLoader } from '../../infrastructure/schema/data-loaders';

// ============================================================================
// Constants
// ============================================================================

/**
 * MiniMessage diagnostic error codes
 */
const DiagnosticCodes = {
    UNCLOSED_TAG: 'minimessage_unclosed_tag',
    INVALID_TAG: 'minimessage_invalid_tag',
    INVALID_COLOR: 'minimessage_invalid_color',
    INVALID_HEX_COLOR: 'minimessage_invalid_hex_color',
    MISSING_ARGUMENT: 'minimessage_missing_argument',
    INVALID_ARGUMENT: 'minimessage_invalid_argument',
    UNMATCHED_CLOSING_TAG: 'minimessage_unmatched_closing_tag',
    WRONG_CLOSING_ORDER: 'minimessage_wrong_closing_order',
    INVALID_CLICK_ACTION: 'minimessage_invalid_click_action',
    INVALID_HOVER_ACTION: 'minimessage_invalid_hover_action'
} as const;

// ============================================================================
// MiniMessage 快速修复提供者
// ============================================================================

/**
 * MiniMessage 快速修复提供者
 * 
 * 为 MiniMessage 诊断错误提供快速修复和重构操作：
 * - 自动关闭未闭合的标签
 * - 修复无效的标签名称
 * - 修复无效的颜色值
 * - 添加缺失的参数
 * - 删除无效的标签
 */
export class MiniMessageCodeActionProvider implements CodeActionProvider, Disposable {
    private readonly logger: ILogger;
    private readonly dataLoader: MiniMessageDataLoader;
    
    /** Supported CodeAction types */
    static readonly providedCodeActionKinds = [
        CodeActionKind.QuickFix,
        CodeActionKind.Refactor
    ];
    
    constructor() {
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger)
            .createChild('MiniMessageCodeActionProvider');
        this.dataLoader = MiniMessageDataLoader.getInstance();
    }
    
    /**
     * 提供代码操作
     */
    async provideCodeActions(
        document: TextDocument,
        range: Range,
        context: CodeActionContext,
        _token: CancellationToken
    ): Promise<CodeAction[] | undefined> {
        try {
            // 确保 MiniMessage 数据已加载
            await this.dataLoader.ensureLoaded();
            
            const actions: CodeAction[] = [];
            
            // 获取 MiniMessage 相关的诊断
            const miniMessageDiagnostics = context.diagnostics.filter(
                d => d.source?.includes('MiniMessage')
            );
            
            for (const diagnostic of miniMessageDiagnostics) {
                const diagnosticActions = this.createActionsForDiagnostic(
                    document,
                    diagnostic
                );
                actions.push(...diagnosticActions);
            }
            
            // 添加通用重构操作
            const refactorActions = this.createRefactorActions(document, range);
            actions.push(...refactorActions);
            
            return actions;
            
        } catch (error) {
            this.logger.error('Error providing MiniMessage code actions', error as Error);
            return undefined;
        }
    }
    
    /**
     * 为诊断创建修复操作
     */
    private createActionsForDiagnostic(
        document: TextDocument,
        diagnostic: Diagnostic
    ): CodeAction[] {
        const actions: CodeAction[] = [];
        const code = diagnostic.code as string;
        
        switch (code) {
            case DiagnosticCodes.UNCLOSED_TAG:
                actions.push(...this.createUnclosedTagFixes(document, diagnostic));
                break;
                
            case DiagnosticCodes.INVALID_TAG:
                actions.push(...this.createInvalidTagFixes(document, diagnostic));
                break;
                
            case DiagnosticCodes.INVALID_COLOR:
            case DiagnosticCodes.INVALID_HEX_COLOR:
                actions.push(...this.createInvalidColorFixes(document, diagnostic));
                break;
                
            case DiagnosticCodes.UNMATCHED_CLOSING_TAG:
                actions.push(...this.createUnmatchedClosingTagFixes(document, diagnostic));
                break;
                
            case DiagnosticCodes.INVALID_CLICK_ACTION:
                actions.push(...this.createInvalidClickActionFixes(document, diagnostic));
                break;
                
            case DiagnosticCodes.INVALID_HOVER_ACTION:
                actions.push(...this.createInvalidHoverActionFixes(document, diagnostic));
                break;
                
            case DiagnosticCodes.MISSING_ARGUMENT:
                actions.push(...this.createMissingArgumentFixes(document, diagnostic));
                break;
        }
        
        // 通用操作：删除问题标签
        if (code !== DiagnosticCodes.UNCLOSED_TAG) {
            actions.push(this.createDeleteTagAction(document, diagnostic));
        }
        
        return actions;
    }
    
    /**
     * 创建未闭合标签修复
     */
    private createUnclosedTagFixes(
        document: TextDocument,
        diagnostic: Diagnostic
    ): CodeAction[] {
        const actions: CodeAction[] = [];
        const tagText = document.getText(diagnostic.range);
        
        // 提取标签名称（支持普通标签、否定标签和十六进制颜色）
        const tagMatch = tagText.match(/<(!)?([a-z_#][a-z0-9_]*)/i);
        if (!tagMatch) {
            return actions;
        }
        
        const tagName = tagMatch[2];
        const line = document.lineAt(diagnostic.range.start.line);
        
        // 修复方案 1：在行尾添加关闭标签
        const fix1 = new CodeAction(
            `Add closing tag '</${tagName}>'`,
            CodeActionKind.QuickFix
        );
        fix1.edit = new WorkspaceEdit();
        fix1.edit.insert(document.uri, line.range.end, `</${tagName}>`);
        fix1.diagnostics = [diagnostic];
        fix1.isPreferred = true;
        actions.push(fix1);
        
        // 修复方案 2：将标签改为自闭合
        const fix2 = new CodeAction(
            `Convert to self-closing tag '<${tagName}/>'`,
            CodeActionKind.QuickFix
        );
        fix2.edit = new WorkspaceEdit();
        fix2.edit.replace(document.uri, diagnostic.range, `<${tagName}/>`);
        fix2.diagnostics = [diagnostic];
        actions.push(fix2);
        
        return actions;
    }
    
    /**
     * 创建无效标签修复
     */
    private createInvalidTagFixes(
        document: TextDocument,
        diagnostic: Diagnostic
    ): CodeAction[] {
        const actions: CodeAction[] = [];
        
        // 从诊断消息中提取建议的标签
        const messageMatch = diagnostic.message.match(/Did you mean: ([^?]+)\?/);
        if (messageMatch) {
            const suggestions = messageMatch[1].split(', ');
            
            for (const suggestion of suggestions) {
                const trimmedSuggestion = suggestion.trim();
                const fix = new CodeAction(
                    `Change to '<${trimmedSuggestion}>'`,
                    CodeActionKind.QuickFix
                );
                
                const tagText = document.getText(diagnostic.range);
                // 支持普通标签、否定标签和十六进制颜色
                const newTagText = tagText.replace(/<(!)?[a-z_#][a-z0-9_]*/i, `<$1${trimmedSuggestion}`);
                
                fix.edit = new WorkspaceEdit();
                fix.edit.replace(document.uri, diagnostic.range, newTagText);
                fix.diagnostics = [diagnostic];
                
                if (suggestions.indexOf(suggestion) === 0) {
                    fix.isPreferred = true;
                }
                
                actions.push(fix);
            }
        }
        
        return actions;
    }
    
    /**
     * Create invalid color fixes
     */
    private createInvalidColorFixes(
        document: TextDocument,
        diagnostic: Diagnostic
    ): CodeAction[] {
        const actions: CodeAction[] = [];
        const tagText = document.getText(diagnostic.range);
        
        // Provide named color suggestions
        const colorNames = this.dataLoader.getColors();
        for (const colorName of colorNames.slice(0, 5)) {
            const fix = new CodeAction(
                `Use color '${colorName}'`,
                CodeActionKind.QuickFix
            );
            
            // 替换颜色参数
            const newTagText = tagText.replace(
                /<(color|colour|c):([^>]+)>/i,
                `<$1:${colorName}>`
            );
            
            fix.edit = new WorkspaceEdit();
            fix.edit.replace(document.uri, diagnostic.range, newTagText);
            fix.diagnostics = [diagnostic];
            actions.push(fix);
        }
        
        // 提供十六进制颜色模板
        const hexFix = new CodeAction(
            `Use hex color '#FF5555'`,
            CodeActionKind.QuickFix
        );
        
        const hexTagText = tagText.replace(
            /<(color|colour|c):([^>]+)>/i,
            '<$1:#FF5555>'
        );
        
        hexFix.edit = new WorkspaceEdit();
        hexFix.edit.replace(document.uri, diagnostic.range, hexTagText);
        hexFix.diagnostics = [diagnostic];
        actions.push(hexFix);
        
        return actions;
    }
    
    /**
     * Create invalid click action fixes
     */
    private createInvalidClickActionFixes(
        document: TextDocument,
        diagnostic: Diagnostic
    ): CodeAction[] {
        const actions: CodeAction[] = [];
        const tagText = document.getText(diagnostic.range);
        
        for (const action of this.dataLoader.getClickActions()) {
            const fix = new CodeAction(
                `Use click action '${action}'`,
                CodeActionKind.QuickFix
            );
            
            const newTagText = tagText.replace(
                /<click:([^:>]+)/i,
                `<click:${action}`
            );
            
            fix.edit = new WorkspaceEdit();
            fix.edit.replace(document.uri, diagnostic.range, newTagText);
            fix.diagnostics = [diagnostic];
            
            if (action === 'run_command') {
                fix.isPreferred = true;
            }
            
            actions.push(fix);
        }
        
        return actions;
    }
    
    /**
     * Create invalid hover action fixes
     */
    private createInvalidHoverActionFixes(
        document: TextDocument,
        diagnostic: Diagnostic
    ): CodeAction[] {
        const actions: CodeAction[] = [];
        const tagText = document.getText(diagnostic.range);
        
        for (const action of this.dataLoader.getHoverActions()) {
            const fix = new CodeAction(
                `Use hover action '${action}'`,
                CodeActionKind.QuickFix
            );
            
            const newTagText = tagText.replace(
                /<hover:([^:>]+)/i,
                `<hover:${action}`
            );
            
            fix.edit = new WorkspaceEdit();
            fix.edit.replace(document.uri, diagnostic.range, newTagText);
            fix.diagnostics = [diagnostic];
            
            if (action === 'show_text') {
                fix.isPreferred = true;
            }
            
            actions.push(fix);
        }
        
        return actions;
    }
    
    /**
     * 创建无匹配关闭标签修复
     */
    private createUnmatchedClosingTagFixes(
        document: TextDocument,
        diagnostic: Diagnostic
    ): CodeAction[] {
        const actions: CodeAction[] = [];
        
        // 删除无匹配的关闭标签
        const fix = new CodeAction(
            'Remove unmatched closing tag',
            CodeActionKind.QuickFix
        );
        fix.edit = new WorkspaceEdit();
        fix.edit.delete(document.uri, diagnostic.range);
        fix.diagnostics = [diagnostic];
        fix.isPreferred = true;
        actions.push(fix);
        
        return actions;
    }
    
    /**
     * 创建缺失参数修复
     */
    private createMissingArgumentFixes(
        document: TextDocument,
        diagnostic: Diagnostic
    ): CodeAction[] {
        const actions: CodeAction[] = [];
        const tagText = document.getText(diagnostic.range);
        
        // 提取标签名称（支持普通标签和十六进制颜色）
        const tagMatch = tagText.match(/<([a-z_#][a-z0-9_]*)/i);
        if (!tagMatch) {
            return actions;
        }
        
        const tagName = tagMatch[1].toLowerCase();
        
        // 根据标签类型提供模板
        let template = '';
        switch (tagName) {
            case 'click':
                template = '<click:run_command:/help>';
                break;
            case 'hover':
                template = '<hover:show_text:\'Tooltip\'>';
                break;
            case 'color':
            case 'colour':
            case 'c':
                template = '<color:red>';
                break;
            case 'gradient':
                template = '<gradient:#5e4fa2:#f79459>';
                break;
            case 'score':
                template = '<score:@s:objective>';
                break;
            case 'nbt':
            case 'data':
                template = '<nbt:entity:@s:Health>';
                break;
            case 'i18n':
                template = '<i18n:translation.key>';
                break;
            case 'l10n':
                template = '<l10n:translation.key>';
                break;
            default:
                return actions;
        }
        
        const fix = new CodeAction(
            `Replace with template: ${template}`,
            CodeActionKind.QuickFix
        );
        fix.edit = new WorkspaceEdit();
        fix.edit.replace(document.uri, diagnostic.range, template);
        fix.diagnostics = [diagnostic];
        fix.isPreferred = true;
        actions.push(fix);
        
        return actions;
    }
    
    /**
     * 创建删除标签操作
     */
    private createDeleteTagAction(
        document: TextDocument,
        diagnostic: Diagnostic
    ): CodeAction {
        const fix = new CodeAction(
            'Remove this tag',
            CodeActionKind.QuickFix
        );
        fix.edit = new WorkspaceEdit();
        fix.edit.delete(document.uri, diagnostic.range);
        fix.diagnostics = [diagnostic];
        return fix;
    }
    
    /**
     * 创建重构操作
     */
    private createRefactorActions(
        document: TextDocument,
        range: Range
    ): CodeAction[] {
        const actions: CodeAction[] = [];
        const selectedText = document.getText(range);
        
        // 如果选中了文本，提供包装标签选项
        if (selectedText.length > 0 && !selectedText.includes('\n')) {
            // 用颜色包装
            actions.push(this.createWrapAction(
                document,
                range,
                selectedText,
                'Wrap with color tag',
                '<red>',
                '</red>'
            ));
            
            // 用粗体包装
            actions.push(this.createWrapAction(
                document,
                range,
                selectedText,
                'Wrap with bold tag',
                '<bold>',
                '</bold>'
            ));
            
            // 用斜体包装
            actions.push(this.createWrapAction(
                document,
                range,
                selectedText,
                'Wrap with italic tag',
                '<italic>',
                '</italic>'
            ));
            
            // 用渐变包装
            actions.push(this.createWrapAction(
                document,
                range,
                selectedText,
                'Wrap with gradient',
                '<gradient:#5e4fa2:#f79459>',
                '</gradient>'
            ));
            
            // 用彩虹包装
            actions.push(this.createWrapAction(
                document,
                range,
                selectedText,
                'Wrap with rainbow',
                '<rainbow>',
                '</rainbow>'
            ));
            
            // 用悬停包装
            actions.push(this.createWrapAction(
                document,
                range,
                selectedText,
                'Wrap with hover tooltip',
                '<hover:show_text:\'Tooltip\'>',
                '</hover>'
            ));
            
            // 用点击包装
            actions.push(this.createWrapAction(
                document,
                range,
                selectedText,
                'Wrap with click action',
                '<click:run_command:/help>',
                '</click>'
            ));
        }
        
        return actions;
    }
    
    /**
     * 创建包装操作
     */
    private createWrapAction(
        document: TextDocument,
        range: Range,
        text: string,
        title: string,
        prefix: string,
        suffix: string
    ): CodeAction {
        const action = new CodeAction(title, CodeActionKind.Refactor);
        action.edit = new WorkspaceEdit();
        action.edit.replace(document.uri, range, `${prefix}${text}${suffix}`);
        return action;
    }
    
    /**
     * 释放资源
     */
    dispose(): void {
        this.logger.debug('MiniMessage code action provider disposed');
    }
}


