import { extensions } from 'vscode';
import { type IExtensionRegistry, type IExtensionInfo } from '../../core/interfaces/IExtensionRegistry';

/**
 * VS Code 扩展注册表实现
 *
 * 包装 vscode.extensions API，使 Application 层不直接依赖 vscode。
 */
export class VscodeExtensionRegistry implements IExtensionRegistry {
    getExtension(extensionId: string): IExtensionInfo | undefined {
        const ext = extensions.getExtension(extensionId);
        if (!ext) {
            return undefined;
        }

        return {
            isActive: ext.isActive,
            exports: ext.exports,
            activate: async () => ext.activate(),
        };
    }
}
