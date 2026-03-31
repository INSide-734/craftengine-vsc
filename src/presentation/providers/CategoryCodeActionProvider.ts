import { type TextDocument, CodeAction, CodeActionKind, WorkspaceEdit, type Diagnostic } from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { type IDataStoreService } from '../../core/interfaces/IDataStoreService';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { CategoryDiagnosticProvider } from './CategoryDiagnosticProvider';
import { BaseCodeActionProvider } from './BaseCodeActionProvider';
import { findSimilarStrings } from '../../infrastructure/utils';
import { CATEGORY_NOT_FOUND } from '../../core/constants/DiagnosticCodes';
import { extractDiagnosticCode, extractTextFromRange } from './helpers';

/**
 * 分类代码操作提供者
 *
 * 为分类引用诊断错误提供快速修复建议（Quick Fix）
 */
export class CategoryCodeActionProvider extends BaseCodeActionProvider {
    private readonly dataStoreService: IDataStoreService;

    /** 提供的 CodeAction 类型 */
    static readonly providedCodeActionKinds = [CodeActionKind.QuickFix];

    protected readonly diagnosticSource = CategoryDiagnosticProvider.DIAGNOSTIC_SOURCE;

    constructor() {
        super('CategoryCodeActionProvider');
        this.dataStoreService = ServiceContainer.getService<IDataStoreService>(SERVICE_TOKENS.DataStoreService);
    }

    /**
     * 为诊断创建修复操作
     */
    protected async createFixActions(document: TextDocument, diagnostic: Diagnostic): Promise<CodeAction[]> {
        const actions: CodeAction[] = [];

        // 提取诊断代码值
        const codeValue = extractDiagnosticCode(diagnostic);

        switch (codeValue) {
            case CATEGORY_NOT_FOUND.code:
                actions.push(...(await this.createUnknownCategoryActions(document, diagnostic)));
                break;

            default:
                // 为未知错误提供通用操作
                actions.push(...this.createGenericActions(diagnostic));
                break;
        }

        return actions;
    }

    /**
     * 创建未知分类的修复操作
     */
    private async createUnknownCategoryActions(document: TextDocument, diagnostic: Diagnostic): Promise<CodeAction[]> {
        const actions: CodeAction[] = [];
        const categoryId = extractTextFromRange(document, diagnostic.range);

        if (!categoryId) {
            return actions;
        }

        // 1. 查找相似的分类名称
        try {
            const allCategories = await this.dataStoreService.getAllCategories();
            const similarCategories = findSimilarStrings(
                categoryId,
                allCategories.map((c) => c.id),
                { threshold: 0.4 },
            ).map((result) => result.item);

            // 为每个相似分类创建替换操作
            for (const similarId of similarCategories.slice(0, 5)) {
                const action = new CodeAction(`Change '${categoryId}' to '${similarId}'`, CodeActionKind.QuickFix);

                action.diagnostics = [diagnostic];
                action.isPreferred = similarCategories[0] === similarId;

                const edit = new WorkspaceEdit();
                edit.replace(document.uri, diagnostic.range, similarId);
                action.edit = edit;

                actions.push(action);
            }
        } catch (error) {
            this.logger.error('Error finding similar categories', error as Error);
        }

        // 2. 移除 # 前缀（如果用户误输入了）
        if (categoryId.startsWith('#')) {
            const withoutHash = categoryId.substring(1);
            const existingWithoutHash = await this.dataStoreService.getCategoryById(withoutHash);
            if (existingWithoutHash) {
                const action = new CodeAction(
                    `Use existing category '${existingWithoutHash.id}'`,
                    CodeActionKind.QuickFix,
                );
                action.diagnostics = [diagnostic];
                action.isPreferred = true;

                const edit = new WorkspaceEdit();
                edit.replace(document.uri, diagnostic.range, existingWithoutHash.id);
                action.edit = edit;

                actions.unshift(action); // 放在最前面
            }
        }

        return actions;
    }

    /**
     * 创建通用修复操作
     */
    private createGenericActions(_diagnostic: Diagnostic): CodeAction[] {
        return [];
    }
}
