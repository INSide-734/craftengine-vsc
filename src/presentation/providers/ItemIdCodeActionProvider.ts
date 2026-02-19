import {
    TextDocument,
    CodeAction,
    CodeActionKind,
    WorkspaceEdit,
    Diagnostic
} from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { IDataStoreService } from '../../core/interfaces/IDataStoreService';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { ItemIdDiagnosticProvider } from './ItemIdDiagnosticProvider';
import { BaseCodeActionProvider } from './BaseCodeActionProvider';
import { findSimilarStrings } from '../../infrastructure/utils';
import { ITEM_NOT_FOUND } from '../../core/constants/DiagnosticCodes';
import { extractDiagnosticCode, extractTextFromRange } from './helpers';

/**
 * 物品 ID 代码操作提供者
 *
 * 为物品 ID 相关的诊断错误提供快速修复建议
 */
export class ItemIdCodeActionProvider extends BaseCodeActionProvider {
    private readonly dataStoreService: IDataStoreService;

    /** 提供的 CodeAction 类型 */
    static readonly providedCodeActionKinds = [
        CodeActionKind.QuickFix
    ];

    protected readonly diagnosticSource = ItemIdDiagnosticProvider.DIAGNOSTIC_SOURCE;

    constructor() {
        super('ItemIdCodeActionProvider');
        this.dataStoreService = ServiceContainer.getService<IDataStoreService>(
            SERVICE_TOKENS.DataStoreService
        );
    }

    /**
     * 为诊断创建修复操作
     */
    protected async createFixActions(
        document: TextDocument,
        diagnostic: Diagnostic
    ): Promise<CodeAction[]> {
        const actions: CodeAction[] = [];

        // 提取诊断代码值
        const codeValue = extractDiagnosticCode(diagnostic);

        switch (codeValue) {
            case ITEM_NOT_FOUND.code:
                actions.push(...await this.createUnknownItemActions(document, diagnostic));
                break;

            default:
                break;
        }

        return actions;
    }

    /**
     * 创建未知物品 ID 的修复操作
     */
    private async createUnknownItemActions(
        document: TextDocument,
        diagnostic: Diagnostic
    ): Promise<CodeAction[]> {
        const actions: CodeAction[] = [];
        const itemId = extractTextFromRange(document, diagnostic.range);

        if (!itemId) {
            return actions;
        }

        // 1. 查找相似的物品 ID
        try {
            const allItems = await this.dataStoreService.getAllItems();
            const similarItems = findSimilarStrings(
                itemId,
                allItems.map(item => item.id),
                { threshold: 0.4 }
            ).map(result => result.item);

            // 为每个相似物品创建替换操作
            for (const [index, similarId] of similarItems.slice(0, 5).entries()) {
                const action = new CodeAction(
                    `Replace with '${similarId}'`,
                    CodeActionKind.QuickFix
                );

                action.diagnostics = [diagnostic];
                action.isPreferred = index === 0;

                const edit = new WorkspaceEdit();
                edit.replace(document.uri, diagnostic.range, similarId);
                action.edit = edit;

                actions.push(action);
            }
        } catch (error) {
            this.logger.debug('Error finding similar items', { error });
        }

        // 2. 忽略此警告
        const ignoreAction = new CodeAction(
            'Ignore this item warning',
            CodeActionKind.QuickFix
        );
        ignoreAction.diagnostics = [diagnostic];
        ignoreAction.command = {
            title: 'Add to ignore list',
            command: 'craftengine.ignoreItemWarning',
            arguments: [itemId]
        };
        actions.push(ignoreAction);

        return actions;
    }

}

