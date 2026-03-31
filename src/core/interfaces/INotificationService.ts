/**
 * 通知服务接口
 *
 * 抽象编辑器的通知功能，使 Application 层不直接依赖 vscode.window。
 */
export interface INotificationService {
    /**
     * 显示信息通知
     *
     * @param message - 通知消息
     * @returns 用户选择的操作，如果关闭则返回 undefined
     */
    showInformation(message: string): Promise<string | undefined>;

    /**
     * 显示警告通知
     *
     * @param message - 通知消息
     * @param actions - 可选的操作按钮
     * @returns 用户选择的操作，如果关闭则返回 undefined
     */
    showWarning(message: string, ...actions: string[]): Promise<string | undefined>;

    /**
     * 显示错误通知
     *
     * @param message - 通知消息
     * @returns 用户选择的操作，如果关闭则返回 undefined
     */
    showError(message: string): Promise<string | undefined>;
}
