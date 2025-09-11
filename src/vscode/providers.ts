import { languages, ExtensionContext, DocumentSelector } from 'vscode';
import { TemplateCompletionProvider } from '../features/CompletionProvider';
import { TemplateHoverProvider } from '../features/HoverProvider';
import { TemplateDefinitionProvider } from '../features/DefinitionProvider';
import { TemplateDiagnosticManager } from '../features/DiagnosticProvider';

const YAML_SELECTOR: DocumentSelector = { language: 'yaml', scheme: 'file' };

/**
 * 注册所有 CraftEngine 扩展提供者
 * 
 * 注册扩展提供的所有 VS Code 语言服务提供者，包括补全提供者、悬停提示提供者和定义跳转提供者等。
 * 将注册的提供者添加到扩展上下文的订阅中，确保在扩展停用时能够正确清理资源。
 * 
 * @param {ExtensionContext} context - VS Code 扩展上下文
 * 
 * @example
 * // 在扩展激活时调用：
 * // registerProviders(context);
 */
export function registerProviders(context: ExtensionContext) {
    // 注册补全提供者
    const completionProvider = languages.registerCompletionItemProvider(
        YAML_SELECTOR,
        new TemplateCompletionProvider(),
        ':', 't', 'e', 'm', 'p', 'l', 'a', 't' // 触发字符
    );
    
    // 注册悬停提示提供者
    const hoverProvider = languages.registerHoverProvider(
        YAML_SELECTOR,
        new TemplateHoverProvider()
    );
    
    // 注册定义跳转提供者
    const definitionProvider = languages.registerDefinitionProvider(
        YAML_SELECTOR,
        new TemplateDefinitionProvider()
    );
    
    // 创建诊断管理器
    const diagnosticManager = new TemplateDiagnosticManager();
    
    // 将所有提供者添加到上下文的订阅中
    context.subscriptions.push(completionProvider, hoverProvider, definitionProvider, diagnosticManager);
    
    // 返回诊断管理器，供其他模块使用
    return diagnosticManager;
}