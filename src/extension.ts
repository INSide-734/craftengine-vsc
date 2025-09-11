import * as vscode from 'vscode';
import { templateCache } from './core/TemplateCache';
import { registerCommands } from './vscode/commands';
import { registerProviders } from './vscode/providers';
import { setupFileWatcher, disposeFileWatcher } from './features/FileWatcher';
import { registerSchemaProvider } from './features/SchemaProvider';
import { TemplateDiagnosticManager } from './features/DiagnosticProvider';

/**
 * 扩展激活函数
 * 
 * 当 VS Code 扩展被激活时调用此函数。执行以下初始化步骤：
 * 1. 注册所有命令
 * 2. 注册所有 Provider（补全、语法高亮等）
 * 3. 设置文件监视器
 * 4. 注册 Schema Provider（用于 YAML 验证）
 * 5. 执行首次全量扫描
 * 
 * @param {vscode.ExtensionContext} context - VS Code 扩展上下文
 * @returns {Promise<void>} 激活过程的异步操作
 * 
 * @example
 * // 此函数由 VS Code 自动调用，无需手动调用
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    console.log('Congratulations, your extension "craftengine-helper" is now active!');

    // 1. 注册所有命令
    registerCommands(context);

    // 2. 注册所有 Provider 并获取诊断管理器
    const diagnosticManager: TemplateDiagnosticManager = registerProviders(context);
    
    // 3. 设置文件监视器
    setupFileWatcher(context);

    // 4. 尝试注册 Schema Provider（如果失败也不会阻止扩展激活）
    try {
        await registerSchemaProvider(context);
    } catch (error) {
        console.warn('Schema provider registration failed, but extension will continue to work:', error);
    }

    // 5. 首次启动时，执行一次全量扫描
    // 使用 setTimeout 避免阻塞扩展激活
    setTimeout(async () => {
        console.log('Starting template cache rebuild...');
        await templateCache.rebuild();
        console.log('Template cache rebuild completed');
        
        // 扫描完成后，更新所有打开文档的诊断信息
        const openDocuments = vscode.workspace.textDocuments.filter(doc => 
            doc.languageId === 'yaml' && doc.uri.scheme === 'file'
        );
        
        for (const doc of openDocuments) {
            diagnosticManager.updateDiagnostics(doc);
        }
    }, 100);
    
    // 6. 监听文档变化，实时更新诊断信息
    const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.languageId === 'yaml' && event.document.uri.scheme === 'file') {
            diagnosticManager.updateDiagnostics(event.document);
        }
    });
    
    const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument(document => {
        if (document.languageId === 'yaml' && document.uri.scheme === 'file') {
            diagnosticManager.updateDiagnostics(document);
        }
    });
    
    const onDidCloseTextDocument = vscode.workspace.onDidCloseTextDocument(document => {
        if (document.languageId === 'yaml' && document.uri.scheme === 'file') {
            diagnosticManager.clearDiagnostics(document.uri);
        }
    });
    
    // 将事件监听器添加到上下文的订阅中
    context.subscriptions.push(onDidChangeTextDocument, onDidOpenTextDocument, onDidCloseTextDocument);
}

/**
 * 扩展停用函数
 * 
 * 当 VS Code 扩展被禁用或卸载时调用此函数。
 * 负责清理所有资源，防止内存泄漏。
 * 
 * @example
 * // 此函数由 VS Code 自动调用，无需手动调用
 */
export function deactivate() {
    // 清理文件监视器等资源
    disposeFileWatcher();
    console.log('CraftEngine Helper has been deactivated.');
}