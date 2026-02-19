// 提供者注册器
export { ProviderRegistry } from './ProviderRegistry';

// 统一补全系统
export { UnifiedCompletionProvider } from './UnifiedCompletionProvider';

// 错误提示系统
export { ErrorNotificationManager } from './ErrorNotificationManager';
export { DiagnosticStatusBarManager } from './DiagnosticStatusBarManager';

// 命令处理
export { NewTemplateCommands } from './commands/NewTemplateCommands';

// 模板相关提供者
export { TemplateHoverProvider } from './providers/TemplateHoverProvider';
export { TemplateDefinitionProvider } from './providers/TemplateDefinitionProvider';
export { TemplateDiagnosticProvider } from './providers/TemplateDiagnosticProvider';
export { TemplateCodeActionProvider } from './providers/TemplateCodeActionProvider';

// 翻译相关提供者
export { TranslationDefinitionProvider } from './providers/TranslationDefinitionProvider';
export { TranslationReferenceProvider } from './providers/TranslationReferenceProvider';
export { TranslationDiagnosticProvider } from './providers/TranslationDiagnosticProvider';
export { TranslationCodeActionProvider } from './providers/TranslationCodeActionProvider';