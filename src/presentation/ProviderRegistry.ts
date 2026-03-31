import {
    languages,
    type ExtensionContext,
    type DocumentSelector,
    type Disposable,
    CodeActionKind,
    type CodeActionProvider,
    type CodeActionProviderMetadata,
} from 'vscode';
import { ServiceContainer } from '../infrastructure/ServiceContainer';
import { type ILogger } from '../core/interfaces/ILogger';
import { SERVICE_TOKENS } from '../core/constants/ServiceTokens';
import { type IEventBus } from '../core/interfaces/IEventBus';
import { generateEventId } from '../infrastructure/utils';

// 语言服务提供者
import { TemplateHoverProvider } from './providers/TemplateHoverProvider';
import { SchemaKeyHoverProvider } from './providers/SchemaKeyHoverProvider';
import { TemplateDefinitionProvider } from './providers/TemplateDefinitionProvider';
import { TranslationDefinitionProvider } from './providers/TranslationDefinitionProvider';
import { ItemIdDefinitionProvider } from './providers/ItemIdDefinitionProvider';
import { TranslationReferenceProvider } from './providers/TranslationReferenceProvider';

// 诊断提供者
import { TemplateDiagnosticProvider } from './providers/TemplateDiagnosticProvider';
import { TranslationDiagnosticProvider } from './providers/TranslationDiagnosticProvider';
import { SchemaDiagnosticProvider } from './providers/SchemaDiagnosticProvider';
import { FilePathDiagnosticProvider } from './providers/FilePathDiagnosticProvider';
import { MiniMessageDiagnosticProvider } from './providers/MiniMessageDiagnosticProvider';
import { ItemIdDiagnosticProvider } from './providers/ItemIdDiagnosticProvider';
import { VersionConditionDiagnosticProvider } from './providers/VersionConditionDiagnosticProvider';
import { CategoryDiagnosticProvider } from './providers/CategoryDiagnosticProvider';

// 快速修复提供者
import { TemplateCodeActionProvider } from './providers/TemplateCodeActionProvider';
import { TranslationCodeActionProvider } from './providers/TranslationCodeActionProvider';
import { SchemaCodeActionProvider } from './providers/SchemaCodeActionProvider';
import { FilePathCodeActionProvider, registerFilePathCommands } from './providers/FilePathCodeActionProvider';
import { MiniMessageCodeActionProvider } from './providers/MiniMessageCodeActionProvider';
import { ItemIdCodeActionProvider } from './providers/ItemIdCodeActionProvider';
import { VersionConditionCodeActionProvider } from './providers/VersionConditionCodeActionProvider';
import { CategoryCodeActionProvider } from './providers/CategoryCodeActionProvider';
import { ExtendedTypeCodeActionProvider } from './providers/ExtendedTypeCodeActionProvider';

// 统一诊断代码操作提供者
import { DiagnosticCodeActionProvider } from './codeactions/DiagnosticCodeActionProvider';

// 工作区诊断管理器
import { WorkspaceDiagnosticManager } from '../application/services/extension/WorkspaceDiagnosticManager';

// 定义跳转提供者
import { CategoryDefinitionProvider } from './providers/CategoryDefinitionProvider';

// 补全与状态栏
import { UnifiedCompletionProvider } from './UnifiedCompletionProvider';
import { DiagnosticStatusBarManager } from './DiagnosticStatusBarManager';

// 命令处理器
import { NewTemplateCommands } from './commands/NewTemplateCommands';
import { ModelPreviewCommands } from './commands/ModelPreviewCommands';

/** YAML 文件选择器 */
const YAML_SELECTOR: DocumentSelector = { language: 'yaml', scheme: 'file' };

/** 通用 CodeAction 元数据 */
const QUICKFIX_METADATA: CodeActionProviderMetadata = {
    providedCodeActionKinds: [CodeActionKind.QuickFix],
};

/**
 * 提供者注册器
 *
 * 负责注册和管理所有 VSCode 语言服务提供者
 */
export class ProviderRegistry {
    private readonly logger: ILogger;

    // 诊断提供者实例
    private templateDiagnostic?: TemplateDiagnosticProvider;
    private translationDiagnostic?: TranslationDiagnosticProvider;
    private schemaDiagnostic?: SchemaDiagnosticProvider;
    private filePathDiagnostic?: FilePathDiagnosticProvider;
    private miniMessageDiagnostic?: MiniMessageDiagnosticProvider;
    private itemIdDiagnostic?: ItemIdDiagnosticProvider;
    private versionConditionDiagnostic?: VersionConditionDiagnosticProvider;
    private categoryDiagnostic?: CategoryDiagnosticProvider;

    // 其他提供者
    private unifiedCompletion?: UnifiedCompletionProvider;
    private statusBar?: DiagnosticStatusBarManager;

    // 统一诊断代码操作提供者
    private diagnosticCodeAction?: DiagnosticCodeActionProvider;

    // 工作区诊断管理器
    private workspaceDiagnosticManager?: WorkspaceDiagnosticManager;

    constructor() {
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild('ProviderRegistry');
    }

    /**
     * 注册所有提供者和命令
     *
     * @param context VSCode 扩展上下文
     * @returns 模板诊断提供者实例
     */
    async registerAll(context: ExtensionContext): Promise<TemplateDiagnosticProvider> {
        this.logger.info('Registering all providers and commands');

        await this.initializeCompletionSystem(context);
        this.registerLanguageProviders(context);
        this.registerDiagnosticProviders(context);
        this.registerCodeActionProviders(context);
        this.initializeStatusBar(context);
        this.initializeWorkspaceDiagnosticManager(context);
        this.registerCommands(context);

        this.logger.info('All providers registered successfully');
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.templateDiagnostic!;
    }

    /**
     * 初始化补全系统
     */
    private async initializeCompletionSystem(context: ExtensionContext): Promise<void> {
        this.unifiedCompletion = new UnifiedCompletionProvider();
        await this.unifiedCompletion.initialize();

        context.subscriptions.push(
            languages.registerCompletionItemProvider(
                YAML_SELECTOR,
                this.unifiedCompletion.getProvider(),
                ...this.unifiedCompletion.getTriggerCharacters(),
            ),
        );
        this.logger.debug('Completion system initialized');
    }

    /**
     * 注册语言服务提供者
     */
    private registerLanguageProviders(context: ExtensionContext): void {
        context.subscriptions.push(
            // 悬停提示
            languages.registerHoverProvider(YAML_SELECTOR, new TemplateHoverProvider()),
            languages.registerHoverProvider(YAML_SELECTOR, new SchemaKeyHoverProvider()),
            // 定义跳转
            languages.registerDefinitionProvider(YAML_SELECTOR, new TemplateDefinitionProvider()),
            languages.registerDefinitionProvider(YAML_SELECTOR, new TranslationDefinitionProvider()),
            languages.registerDefinitionProvider(YAML_SELECTOR, new ItemIdDefinitionProvider()),
            languages.registerDefinitionProvider(YAML_SELECTOR, new CategoryDefinitionProvider()),
            // 引用查找
            languages.registerReferenceProvider(YAML_SELECTOR, new TranslationReferenceProvider()),
        );
        this.logger.debug('Language providers registered');
    }

    /**
     * 注册诊断提供者
     */
    private registerDiagnosticProviders(context: ExtensionContext): void {
        // 创建所有诊断提供者
        this.templateDiagnostic = new TemplateDiagnosticProvider();
        this.translationDiagnostic = new TranslationDiagnosticProvider();
        this.schemaDiagnostic = new SchemaDiagnosticProvider();
        this.filePathDiagnostic = new FilePathDiagnosticProvider();
        this.miniMessageDiagnostic = new MiniMessageDiagnosticProvider();
        this.itemIdDiagnostic = new ItemIdDiagnosticProvider();
        this.versionConditionDiagnostic = new VersionConditionDiagnosticProvider();
        this.categoryDiagnostic = new CategoryDiagnosticProvider();

        // 注册到 context
        context.subscriptions.push(
            this.templateDiagnostic,
            this.translationDiagnostic,
            this.schemaDiagnostic,
            this.filePathDiagnostic,
            this.miniMessageDiagnostic,
            this.itemIdDiagnostic,
            this.versionConditionDiagnostic,
            this.categoryDiagnostic,
        );
        this.logger.debug('Diagnostic providers registered');
    }

    /**
     * 注册快速修复提供者
     */
    private registerCodeActionProviders(context: ExtensionContext): void {
        // 简单提供者（无元数据）
        context.subscriptions.push(
            this.registerCodeAction(new TemplateCodeActionProvider()),
            this.registerCodeAction(new TranslationCodeActionProvider()),
        );

        // 带 QuickFix 元数据的提供者
        const providersWithMetadata: CodeActionProvider[] = [
            new SchemaCodeActionProvider(),
            new FilePathCodeActionProvider(),
            new MiniMessageCodeActionProvider(),
            new ItemIdCodeActionProvider(),
            new VersionConditionCodeActionProvider(),
            new CategoryCodeActionProvider(),
            new ExtendedTypeCodeActionProvider(),
        ];

        for (const provider of providersWithMetadata) {
            context.subscriptions.push(this.registerCodeAction(provider, QUICKFIX_METADATA));
        }

        // 注册统一诊断代码操作提供者
        this.diagnosticCodeAction = new DiagnosticCodeActionProvider();
        context.subscriptions.push(this.diagnosticCodeAction.register());

        // 注册文件路径相关命令
        registerFilePathCommands(context);

        this.logger.debug('Code action providers registered');
    }

    /**
     * 注册 CodeAction 提供者
     */
    private registerCodeAction(provider: CodeActionProvider, metadata?: CodeActionProviderMetadata): Disposable {
        return languages.registerCodeActionsProvider(YAML_SELECTOR, provider, metadata);
    }

    /**
     * 初始化状态栏
     */
    private initializeStatusBar(context: ExtensionContext): void {
        this.statusBar = new DiagnosticStatusBarManager();
        context.subscriptions.push(this.statusBar);
    }

    /**
     * 初始化工作区诊断管理器
     */
    private initializeWorkspaceDiagnosticManager(context: ExtensionContext): void {
        const eventBus = ServiceContainer.getService<IEventBus>(SERVICE_TOKENS.EventBus);
        this.workspaceDiagnosticManager = new WorkspaceDiagnosticManager(this.logger, eventBus, generateEventId);
        context.subscriptions.push(this.workspaceDiagnosticManager);
        this.logger.debug('Workspace diagnostic manager initialized');
    }

    /**
     * 注册命令
     */
    private registerCommands(context: ExtensionContext): void {
        new NewTemplateCommands().registerCommands(context);

        // 注册模型预览命令
        const modelPreviewCommands = new ModelPreviewCommands();
        modelPreviewCommands.register(context);
        context.subscriptions.push(modelPreviewCommands);
    }

    // ==================== 访问器方法 ====================

    /**
     * 获取模板诊断提供者实例
     * @returns 模板诊断提供者实例，如果尚未初始化则返回 undefined
     */
    getTemplateDiagnosticProvider(): TemplateDiagnosticProvider | undefined {
        return this.templateDiagnostic;
    }

    /**
     * 获取翻译诊断提供者实例
     * @returns 翻译诊断提供者实例，如果尚未初始化则返回 undefined
     */
    getTranslationDiagnosticProvider(): TranslationDiagnosticProvider | undefined {
        return this.translationDiagnostic;
    }

    /**
     * 获取 Schema 诊断提供者实例
     * @returns Schema 诊断提供者实例，如果尚未初始化则返回 undefined
     */
    getSchemaDiagnosticProvider(): SchemaDiagnosticProvider | undefined {
        return this.schemaDiagnostic;
    }

    /**
     * 获取文件路径诊断提供者实例
     * @returns 文件路径诊断提供者实例，如果尚未初始化则返回 undefined
     */
    getFilePathDiagnosticProvider(): FilePathDiagnosticProvider | undefined {
        return this.filePathDiagnostic;
    }

    /**
     * 获取 MiniMessage 诊断提供者实例
     * @returns MiniMessage 诊断提供者实例，如果尚未初始化则返回 undefined
     */
    getMiniMessageDiagnosticProvider(): MiniMessageDiagnosticProvider | undefined {
        return this.miniMessageDiagnostic;
    }

    /**
     * 获取物品 ID 诊断提供者实例
     * @returns 物品 ID 诊断提供者实例，如果尚未初始化则返回 undefined
     */
    getItemIdDiagnosticProvider(): ItemIdDiagnosticProvider | undefined {
        return this.itemIdDiagnostic;
    }

    /**
     * 获取版本条件诊断提供者实例
     * @returns 版本条件诊断提供者实例，如果尚未初始化则返回 undefined
     */
    getVersionConditionDiagnosticProvider(): VersionConditionDiagnosticProvider | undefined {
        return this.versionConditionDiagnostic;
    }

    /**
     * 获取分类诊断提供者实例
     * @returns 分类诊断提供者实例，如果尚未初始化则返回 undefined
     */
    getCategoryDiagnosticProvider(): CategoryDiagnosticProvider | undefined {
        return this.categoryDiagnostic;
    }

    /**
     * 获取统一补全提供者实例
     * @returns 统一补全提供者实例，如果尚未初始化则返回 undefined
     */
    getUnifiedCompletionProvider(): UnifiedCompletionProvider | undefined {
        return this.unifiedCompletion;
    }

    /**
     * 获取诊断状态栏管理器实例
     * @returns 诊断状态栏管理器实例，如果尚未初始化则返回 undefined
     */
    getStatusBarManager(): DiagnosticStatusBarManager | undefined {
        return this.statusBar;
    }

    /**
     * 获取统一诊断代码操作提供者实例
     * @returns 统一诊断代码操作提供者实例，如果尚未初始化则返回 undefined
     */
    getDiagnosticCodeActionProvider(): DiagnosticCodeActionProvider | undefined {
        return this.diagnosticCodeAction;
    }

    /**
     * 获取工作区诊断管理器实例
     * @returns 工作区诊断管理器实例，如果尚未初始化则返回 undefined
     */
    getWorkspaceDiagnosticManager(): WorkspaceDiagnosticManager | undefined {
        return this.workspaceDiagnosticManager;
    }
}
