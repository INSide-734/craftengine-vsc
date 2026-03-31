/**
 * 模型预览 WebView 面板
 *
 * 管理模型预览的 WebView 面板，显示渲染的 3D 模型图像。
 *
 * @remarks
 * 该面板负责：
 * - 创建和管理 WebView 面板
 * - 显示渲染的模型图像
 * - 支持复制图片到剪贴板
 * - 处理面板生命周期
 */

import { type WebviewPanel, window, ViewColumn, type Disposable, env } from 'vscode';
import { type ILogger } from '../../core/interfaces/ILogger';

// ============================================
// 模型预览面板
// ============================================

/**
 * 模型预览 WebView 面板
 */
export class ModelPreviewPanel implements Disposable {
    private panel: WebviewPanel | undefined;
    private readonly logger: ILogger;
    private currentItemId: string | undefined;
    private currentImageBuffer: Buffer | undefined;
    private readonly disposables: Disposable[] = [];

    constructor(logger: ILogger) {
        this.logger = logger.createChild('ModelPreviewPanel');
    }

    /**
     * 显示预览面板
     *
     * @param itemId - 物品 ID
     * @param imageBuffer - PNG 图像 Buffer
     */
    show(itemId: string, imageBuffer: Buffer): void {
        if (!this.panel) {
            this.createPanel();
        }

        this.currentItemId = itemId;
        this.currentImageBuffer = imageBuffer;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.panel!.title = `Preview: ${this.formatItemId(itemId)}`;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.panel!.webview.html = this.getWebviewContent(itemId, imageBuffer);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.panel!.reveal(ViewColumn.Beside);

        this.logger.debug('Preview panel shown', { itemId });
    }

    /**
     * 更新预览图像
     *
     * @param itemId - 物品 ID
     * @param imageBuffer - PNG 图像 Buffer
     */
    update(itemId: string, imageBuffer: Buffer): void {
        if (this.panel) {
            this.currentItemId = itemId;
            this.currentImageBuffer = imageBuffer;
            this.panel.title = `Preview: ${this.formatItemId(itemId)}`;
            this.panel.webview.html = this.getWebviewContent(itemId, imageBuffer);
            this.logger.debug('Preview panel updated', { itemId });
        } else {
            this.show(itemId, imageBuffer);
        }
    }

    /**
     * 获取当前显示的物品 ID
     */
    getCurrentItemId(): string | undefined {
        return this.currentItemId;
    }

    /**
     * 检查面板是否可见
     */
    isVisible(): boolean {
        return this.panel?.visible ?? false;
    }

    /**
     * 释放资源
     */
    dispose(): void {
        this.panel?.dispose();
        this.panel = undefined;
        this.currentItemId = undefined;
        this.currentImageBuffer = undefined;

        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;

        this.logger.debug('Preview panel disposed');
    }

    // ============================================
    // 私有方法
    // ============================================

    /**
     * 创建 WebView 面板
     */
    private createPanel(): void {
        this.panel = window.createWebviewPanel('craftengineModelPreview', 'Model Preview', ViewColumn.Beside, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });

        // 监听面板关闭事件
        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
                this.currentItemId = undefined;
                this.currentImageBuffer = undefined;
                this.logger.debug('Preview panel closed by user');
            },
            null,
            this.disposables,
        );

        // 监听 WebView 消息
        this.panel.webview.onDidReceiveMessage((message) => this.handleWebviewMessage(message), null, this.disposables);

        this.logger.debug('Preview panel created');
    }

    /**
     * 处理 WebView 消息
     */
    private async handleWebviewMessage(message: { command: string }): Promise<void> {
        switch (message.command) {
            case 'copyToClipboard':
                await this.copyImageToClipboard();
                break;
        }
    }

    /**
     * 复制图片到剪贴板
     */
    private async copyImageToClipboard(): Promise<void> {
        if (!this.currentImageBuffer) {
            window.showWarningMessage('No image to copy');
            return;
        }

        try {
            // 将 PNG Buffer 转换为 base64 data URI
            const base64 = this.currentImageBuffer.toString('base64');
            const dataUri = `data:image/png;base64,${base64}`;

            // 复制 data URI 到剪贴板（用户可以粘贴到支持的应用中）
            await env.clipboard.writeText(dataUri);

            window.showInformationMessage('Image copied to clipboard (as data URI)');
            this.logger.debug('Image copied to clipboard', { itemId: this.currentItemId });
        } catch (error) {
            window.showErrorMessage(`Failed to copy image: ${(error as Error).message}`);
            this.logger.error('Failed to copy image to clipboard', error as Error);
        }
    }

    /**
     * 格式化物品 ID 用于显示
     */
    private formatItemId(itemId: string): string {
        // 截断过长的 ID
        if (itemId.length > 30) {
            return itemId.substring(0, 27) + '...';
        }
        return itemId;
    }

    /**
     * 生成随机 nonce
     */
    private generateNonce(): string {
        const array = new Uint8Array(16);
        for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 256);
        }
        return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * 验证 base64 字符串合法性
     */
    private isValidBase64(str: string): boolean {
        return /^[A-Za-z0-9+/]*={0,2}$/.test(str);
    }

    /**
     * 生成 WebView HTML 内容
     */
    private getWebviewContent(itemId: string, imageBuffer: Buffer): string {
        const base64Image = imageBuffer.toString('base64');
        const timestamp = new Date().toLocaleTimeString();
        const nonce = this.generateNonce();

        // 验证 base64 数据合法性
        if (!this.isValidBase64(base64Image)) {
            this.logger.warn('Invalid base64 image data detected', { itemId });
            return `<!DOCTYPE html><html><body><p>Invalid image data</p></body></html>`;
        }

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <title>Model Preview</title>
    <style nonce="${nonce}">
        ${this.getStyles()}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2 class="item-id">${this.escapeHtml(itemId)}</h2>
        </div>
        <div class="preview-container">
            <img class="preview-image"
                 id="previewImage"
                 src="data:image/png;base64,${base64Image}"
                 alt="Model Preview for ${this.escapeHtml(itemId)}">
        </div>
        <div class="actions">
            <button class="copy-button" id="copyButton" title="Copy image to clipboard">
                <span class="button-icon"></span>
                <span class="button-text">Copy Image</span>
            </button>
        </div>
        <div class="footer">
            <span class="timestamp">Rendered at ${timestamp}</span>
        </div>
    </div>
    <script nonce="${nonce}">
        ${this.getScript()}
    </script>
</body>
</html>`;
    }

    /**
     * 获取 CSS 样式
     */
    private getStyles(): string {
        return `
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .container {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 20px;
            max-width: 100%;
        }

        .header {
            margin-bottom: 16px;
            text-align: center;
        }

        .item-id {
            font-size: 1.1em;
            font-weight: 600;
            color: var(--vscode-textLink-foreground);
            word-break: break-all;
        }

        .preview-container {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 24px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 8px;
            border: 1px solid var(--vscode-panel-border);
        }

        .preview-image {
            max-width: 100%;
            max-height: 70vh;
            image-rendering: pixelated;
            image-rendering: crisp-edges;
        }

        .actions {
            margin-top: 16px;
            display: flex;
            gap: 8px;
        }

        .copy-button {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            transition: background-color 0.2s;
        }

        .copy-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .copy-button:active {
            transform: scale(0.98);
        }

        .copy-button.success {
            background-color: var(--vscode-testing-iconPassed, #4caf50);
        }

        .button-icon {
            font-size: 14px;
        }

        .footer {
            margin-top: 16px;
            text-align: center;
        }

        .timestamp {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
        }
        `;
    }

    /**
     * 获取 WebView 脚本
     */
    private getScript(): string {
        return `
        (function() {
            const vscode = acquireVsCodeApi();
            const copyButton = document.getElementById('copyButton');
            const previewImage = document.getElementById('previewImage');

            copyButton.addEventListener('click', async () => {
                try {
                    // 尝试使用 Clipboard API 复制图片
                    const img = previewImage;
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);

                    canvas.toBlob(async (blob) => {
                        try {
                            await navigator.clipboard.write([
                                new ClipboardItem({ 'image/png': blob })
                            ]);
                            showSuccess();
                        } catch (e) {
                            // 如果浏览器 API 失败，回退到 VS Code API
                            vscode.postMessage({ command: 'copyToClipboard' });
                        }
                    }, 'image/png');
                } catch (e) {
                    // 回退到 VS Code API
                    vscode.postMessage({ command: 'copyToClipboard' });
                }
            });

            function showSuccess() {
                const buttonText = copyButton.querySelector('.button-text');
                const buttonIcon = copyButton.querySelector('.button-icon');
                const originalText = buttonText.textContent;
                const originalIcon = buttonIcon.textContent;

                copyButton.classList.add('success');
                buttonText.textContent = 'Copied!';
                buttonIcon.textContent = '✓';

                setTimeout(() => {
                    copyButton.classList.remove('success');
                    buttonText.textContent = originalText;
                    buttonIcon.textContent = originalIcon;
                }, 2000);
            }
        })();
        `;
    }

    /**
     * HTML 转义
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
