/**
 * 模型预览命令处理器
 *
 * 处理模型预览相关的命令，包括右键菜单触发的预览命令。
 *
 * @remarks
 * 该处理器负责：
 * - 注册预览命令
 * - 检测光标位置是否在物品 ID 上
 * - 调用预览服务生成预览
 * - 显示预览面板
 */

import {
    commands,
    window,
    ExtensionContext,
    TextEditor,
    Position,
    TextEditorSelectionChangeEvent,
    ProgressLocation,
    Disposable,
} from 'vscode';
import { ILogger } from '../../core/interfaces/ILogger';
import { IModelPreviewService } from '../../core/interfaces/IModelPreviewService';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { ModelPreviewPanel } from '../webview/ModelPreviewPanel';

// ============================================
// 常量定义
// ============================================

/** 命名空间 ID 正则表达式 */
const NAMESPACED_ID_PATTERN = /[a-z][a-z0-9_-]*:[a-z][a-z0-9_/-]*/g;

/** 命令 ID */
const COMMAND_ID = 'craftengine.previewItemModel';

/** 上下文键 */
const CONTEXT_KEY = 'craftengine.isItemIdAtCursor';

// ============================================
// 模型预览命令处理器
// ============================================

/**
 * 模型预览命令处理器
 */
export class ModelPreviewCommands implements Disposable {
    private readonly logger: ILogger;
    private previewService: IModelPreviewService | undefined;
    private panel: ModelPreviewPanel | undefined;
    private readonly disposables: Disposable[] = [];

    constructor() {
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger)
            .createChild('ModelPreviewCommands');
    }

    /**
     * 注册命令
     */
    register(context: ExtensionContext): void {
        // 注册预览命令
        const commandDisposable = commands.registerCommand(
            COMMAND_ID,
            () => this.previewItemAtCursor()
        );
        context.subscriptions.push(commandDisposable);
        this.disposables.push(commandDisposable);

        // 注册光标位置监听（用于上下文菜单条件）
        const selectionDisposable = window.onDidChangeTextEditorSelection(
            (e) => this.updateContextForCursor(e)
        );
        context.subscriptions.push(selectionDisposable);
        this.disposables.push(selectionDisposable);

        // 初始化上下文
        commands.executeCommand('setContext', CONTEXT_KEY, false);

        this.logger.info('Model preview commands registered');
    }

    /**
     * 释放资源
     */
    dispose(): void {
        this.panel?.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }

    // ============================================
    // 命令处理
    // ============================================

    /**
     * 预览光标位置的物品模型
     */
    private async previewItemAtCursor(): Promise<void> {
        const editor = window.activeTextEditor;
        if (!editor) {
            window.showWarningMessage('No active editor');
            return;
        }

        // 获取光标位置的物品 ID
        const itemId = this.getItemIdAtCursor(editor, editor.selection.active);
        if (!itemId) {
            window.showWarningMessage('No item ID found at cursor position');
            return;
        }

        this.logger.info('Preview requested', { itemId });

        // 显示进度
        await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: `Generating preview for ${itemId}...`,
                cancellable: false,
            },
            async () => {
                await this.generateAndShowPreview(itemId);
            }
        );
    }

    /**
     * 生成并显示预览
     */
    private async generateAndShowPreview(itemId: string): Promise<void> {
        try {
            // 延迟获取预览服务（避免循环依赖）
            if (!this.previewService) {
                this.previewService = ServiceContainer.getService<IModelPreviewService>(
                    SERVICE_TOKENS.ModelPreviewService
                );
            }

            // 生成预览
            const result = await this.previewService.previewItem(itemId);

            if (result.success && result.imageBuffer) {
                // 创建或更新面板
                if (!this.panel) {
                    this.panel = new ModelPreviewPanel(this.logger);
                }
                this.panel.show(itemId, result.imageBuffer);
                this.logger.info('Preview shown', { itemId });
            } else {
                window.showErrorMessage(`Preview failed: ${result.error ?? 'Unknown error'}`);
                this.logger.warn('Preview failed', { itemId, error: result.error });
            }
        } catch (error) {
            const message = (error as Error).message;
            window.showErrorMessage(`Preview error: ${message}`);
            this.logger.error('Preview error', error as Error, { itemId });
        }
    }

    // ============================================
    // 上下文检测
    // ============================================

    /**
     * 更新上下文（用于右键菜单条件）
     */
    private updateContextForCursor(e: TextEditorSelectionChangeEvent): void {
        // 只处理 YAML 文件
        if (e.textEditor.document.languageId !== 'yaml') {
            commands.executeCommand('setContext', CONTEXT_KEY, false);
            return;
        }

        const isOnItemId = this.checkIfOnItemId(e.textEditor, e.selections[0].active);
        commands.executeCommand('setContext', CONTEXT_KEY, isOnItemId);
    }

    /**
     * 检查光标是否在物品 ID 上
     */
    private checkIfOnItemId(editor: TextEditor, position: Position): boolean {
        const itemId = this.getItemIdAtCursor(editor, position);
        return itemId !== undefined;
    }

    /**
     * 获取光标位置的物品 ID
     */
    private getItemIdAtCursor(editor: TextEditor, position: Position): string | undefined {
        const line = editor.document.lineAt(position.line);
        const lineText = line.text;

        // 查找行中所有的命名空间 ID
        NAMESPACED_ID_PATTERN.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = NAMESPACED_ID_PATTERN.exec(lineText)) !== null) {
            const startCol = match.index;
            const endCol = startCol + match[0].length;

            // 检查光标是否在这个 ID 范围内
            if (position.character >= startCol && position.character <= endCol) {
                return match[0];
            }
        }

        return undefined;
    }
}
