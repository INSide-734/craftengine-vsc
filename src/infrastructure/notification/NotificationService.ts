import { window } from 'vscode';
import { type INotificationService } from '../../core/interfaces/INotificationService';

/**
 * VS Code 通知服务实现
 *
 * 包装 vscode.window 的通知 API，使 Application 层不直接依赖 vscode。
 */
export class NotificationService implements INotificationService {
    async showInformation(message: string): Promise<string | undefined> {
        return window.showInformationMessage(message);
    }

    async showWarning(message: string, ...actions: string[]): Promise<string | undefined> {
        return window.showWarningMessage(message, ...actions);
    }

    async showError(message: string): Promise<string | undefined> {
        return window.showErrorMessage(message);
    }
}
