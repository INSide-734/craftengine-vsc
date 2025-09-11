import { commands, ExtensionContext, window, extensions } from 'vscode';
import { insertTemplateSnippet } from '../features/SnippetGenerator';
import { templateCache } from '../core/TemplateCache';

/**
 * 注册所有 CraftEngine 扩展命令
 * 
 * 注册扩展提供的所有 VS Code 命令，并将它们添加到扩展上下文的订阅中，
 * 确保在扩展停用时能够正确清理资源。
 * 
 * @param {ExtensionContext} context - VS Code 扩展上下文
 * 
 * @example
 * // 在扩展激活时调用：
 * // registerCommands(context);
 */
export function registerCommands(context: ExtensionContext) {
    const insertSnippetCommand = commands.registerCommand(
        'craftengine.insertTemplateSnippet',
        (...args: any[]) => {
            // 从参数数组中获取第一个参数（template 对象）
            const template = args[0];
            insertTemplateSnippet(template);
        }
    );
    
    const rebuildCacheCommand = commands.registerCommand(
        'craftengine.rebuildCache',
        async () => {
            try {
                await window.showInformationMessage('Rebuilding template cache...');
                await templateCache.rebuild();
                const stats = templateCache.getStats();
                await window.showInformationMessage(
                    `Cache rebuild completed! Found ${stats.totalTemplates} templates from ${stats.totalFiles} files.`
                );
            } catch (error) {
                await window.showErrorMessage(`Cache rebuild failed: ${error}`);
            }
        }
    );
    
    const debugCacheCommand = commands.registerCommand(
        'craftengine.debugCache',
        () => {
            const stats = templateCache.getStats();
            const templates = templateCache.getAll();
            console.log('=== CraftEngine Cache Debug Info ===');
            console.log(`Total templates: ${stats.totalTemplates}`);
            console.log(`Total files: ${stats.totalFiles}`);
            console.log('Template names:', templates.map(t => t.name));
            console.log('Template details:', templates.map(t => ({
                name: t.name,
                parameters: t.parameters,
                required: t.requiredParameters,
                optional: t.optionalParameters
            })));
            window.showInformationMessage(
                `Cache debug information has been output to console. Found ${stats.totalTemplates} templates.`
            );
        }
    );

    const checkYamlExtensionCommand = commands.registerCommand(
        'craftengine.checkYamlExtension',
        async () => {
            const yamlExtension = extensions.getExtension('redhat.vscode-yaml');
            if (!yamlExtension) {
                const action = await window.showWarningMessage(
                    'Red Hat YAML extension is not installed. Schema validation requires this extension.',
                    'Install Red Hat YAML Extension',
                    'Learn More'
                );
                if (action === 'Install Red Hat YAML Extension') {
                    commands.executeCommand('workbench.extensions.install', 'redhat.vscode-yaml');
                } else if (action === 'Learn More') {
                    window.showInformationMessage(
                        'Red Hat YAML extension provides powerful YAML language support, including:\n' +
                        '• Syntax highlighting\n' +
                        '• Smart completion\n' +
                        '• Schema validation\n' +
                        '• Error detection\n\n' +
                        'After installation, CraftEngine extension will be able to provide complete Schema validation functionality.'
                    );
                }
            } else {
                const isActive = yamlExtension.isActive;
                const version = yamlExtension.packageJSON?.version || 'Unknown version';
                window.showInformationMessage(
                    `Red Hat YAML Extension Status:\n` +
                    `• Installed: Yes\n` +
                    `• Version: ${version}\n` +
                    `• Active Status: ${isActive ? 'Active' : 'Inactive'}\n` +
                    `• Schema Validation: ${isActive ? 'Available' : 'Extension needs to be activated'}`
                );
            }
        }
    );
    
    context.subscriptions.push(insertSnippetCommand, rebuildCacheCommand, debugCacheCommand, checkYamlExtensionCommand);
}