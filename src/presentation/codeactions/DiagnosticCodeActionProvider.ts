/**
 * 统一的诊断代码操作提供者
 *
 * 为所有诊断提供快速修复
 */

import {
    CodeAction,
    CodeActionContext,
    CodeActionKind,
    CodeActionProvider,
    Diagnostic,
    Disposable,
    languages,
    Range,
    TextDocument
} from 'vscode';
import { ILogger } from '../../core/interfaces/ILogger';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import {
    IQuickFixProvider,
    RequiredFieldFix,
    UnknownPropertyFix,
    EnumValueFix,
    TypeMismatchFix
} from './fixes';

/**
 * 诊断代码操作提供者
 *
 * 统一管理所有诊断的快速修复操作
 */
export class DiagnosticCodeActionProvider implements CodeActionProvider, Disposable {
    private readonly logger: ILogger;
    private readonly fixProviders = new Map<string, IQuickFixProvider>();
    private readonly disposables: Disposable[] = [];

    /**
     * 支持的代码操作类型
     */
    static readonly providedCodeActionKinds = [
        CodeActionKind.QuickFix
    ];

    constructor() {
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger)
            .createChild('DiagnosticCodeActionProvider');

        // 注册内置的快速修复提供者
        this.registerBuiltinProviders();

        this.logger.info('DiagnosticCodeActionProvider initialized');
    }

    /**
     * 注册内置的快速修复提供者
     */
    private registerBuiltinProviders(): void {
        // 缺失必需字段
        this.registerFixProvider(new RequiredFieldFix());

        // 未知属性
        this.registerFixProvider(new UnknownPropertyFix());

        // 枚举值错误
        this.registerFixProvider(new EnumValueFix());

        // 类型不匹配
        this.registerFixProvider(new TypeMismatchFix());

        this.logger.debug('Built-in fix providers registered', {
            count: this.fixProviders.size
        });
    }

    /**
     * 注册快速修复提供者
     *
     * @param provider 快速修复提供者
     */
    registerFixProvider(provider: IQuickFixProvider): void {
        for (const code of provider.supportedCodes) {
            this.fixProviders.set(code, provider);
            this.logger.debug('Registered fix provider', { code });
        }
    }

    /**
     * 注册到 VS Code
     *
     * @returns Disposable
     */
    register(): Disposable {
        const registration = languages.registerCodeActionsProvider(
            { language: 'yaml', scheme: 'file' },
            this,
            {
                providedCodeActionKinds: DiagnosticCodeActionProvider.providedCodeActionKinds
            }
        );

        this.disposables.push(registration);
        return registration;
    }

    /**
     * 提供代码操作
     */
    provideCodeActions(
        document: TextDocument,
        _range: Range,
        context: CodeActionContext
    ): CodeAction[] {
        const actions: CodeAction[] = [];

        // 只处理 CraftEngine 的诊断
        const craftEngineDiagnostics = context.diagnostics.filter(d =>
            d.source?.startsWith('CraftEngine')
        );

        if (craftEngineDiagnostics.length === 0) {
            return actions;
        }

        this.logger.debug('Providing code actions', {
            file: document.fileName,
            diagnosticsCount: craftEngineDiagnostics.length
        });

        // 为每个诊断提供修复
        for (const diagnostic of craftEngineDiagnostics) {
            const fixes = this.getFixesForDiagnostic(diagnostic, document);
            actions.push(...fixes);
        }

        return actions;
    }

    /**
     * 获取诊断的修复操作
     */
    private getFixesForDiagnostic(diagnostic: Diagnostic, document: TextDocument): CodeAction[] {
        const code = this.extractCode(diagnostic);

        // 查找对应的修复提供者
        const provider = this.fixProviders.get(code);
        if (!provider) {
            this.logger.debug('No fix provider for code', { code });
            return [];
        }

        // 检查提供者是否支持该诊断
        if (!provider.canFix(diagnostic)) {
            return [];
        }

        try {
            const fixes = provider.provideFixes(diagnostic, document);
            this.logger.debug('Generated fixes', {
                code,
                fixCount: fixes.length
            });
            return fixes;
        } catch (error) {
            this.logger.error('Failed to generate fixes', error as Error, { code });
            return [];
        }
    }

    /**
     * 从诊断中提取错误代码
     */
    private extractCode(diagnostic: Diagnostic): string {
        if (typeof diagnostic.code === 'string') {
            return diagnostic.code;
        }
        if (typeof diagnostic.code === 'object' && diagnostic.code !== null && 'value' in diagnostic.code) {
            return String(diagnostic.code.value);
        }
        return '';
    }

    /**
     * 清理资源
     */
    dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
        this.fixProviders.clear();
        this.logger.info('DiagnosticCodeActionProvider disposed');
    }
}
