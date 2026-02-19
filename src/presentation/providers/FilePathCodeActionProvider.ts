import {
    CodeActionProvider,
    CodeActionKind,
    CodeAction,
    TextDocument,
    Range,
    Diagnostic,
    WorkspaceEdit,
    CodeActionContext,
    CancellationToken,
    workspace,
    Uri,
    window
} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { ILogger } from '../../core/interfaces/ILogger';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { IFilePathDiagnosticData } from './FilePathDiagnosticProvider';

/** Diagnostic 扩展类型，支持 data 属性 */
type DiagnosticWithData = Diagnostic & { data: unknown };

/**
 * 文件路径代码动作提供者
 * 
 * 为文件路径验证错误提供快速修复建议：
 * - 替换为相似路径
 * - 创建缺失的文件
 * - 修复格式错误
 * 
 * @example
 * ```typescript
 * const provider = new FilePathCodeActionProvider();
 * context.subscriptions.push(
 *     languages.registerCodeActionsProvider('yaml', provider)
 * );
 * ```
 */
export class FilePathCodeActionProvider implements CodeActionProvider {
    private readonly logger: ILogger;
    
    // 支持的快速修复类型
    public static readonly providedCodeActionKinds = [
        CodeActionKind.QuickFix
    ];
    
    constructor() {
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger)
            .createChild('FilePathCodeActionProvider');
    }
    
    /**
     * 提供代码动作
     */
    async provideCodeActions(
        document: TextDocument,
        _range: Range,
        context: CodeActionContext,
        token?: CancellationToken
    ): Promise<CodeAction[]> {
        if (token?.isCancellationRequested) {
            return [];
        }
        
        const actions: CodeAction[] = [];
        
        try {
            // 只处理文件路径验证错误
            const filePathDiagnostics = context.diagnostics.filter(
                diagnostic => diagnostic.source === 'CraftEngine File Path'
            );
            
            if (filePathDiagnostics.length === 0) {
                return [];
            }
            
            this.logger.debug('Providing code actions for file path diagnostics', {
                diagnosticsCount: filePathDiagnostics.length,
                file: document.fileName
            });
            
            // 为每个诊断提供修复建议
            for (const diagnostic of filePathDiagnostics) {
                const diagnosticActions = await this.createActionsForDiagnostic(
                    diagnostic,
                    document,
                    token
                );
                
                actions.push(...diagnosticActions);
            }
            
        } catch (error) {
            this.logger.error('Failed to provide code actions', error as Error);
        }
        
        return actions;
    }
    
    /**
     * 为单个诊断创建代码动作
     */
    private async createActionsForDiagnostic(
        diagnostic: Diagnostic,
        document: TextDocument,
        token?: CancellationToken
    ): Promise<CodeAction[]> {
        if (token?.isCancellationRequested) {
            return [];
        }
        
        const actions: CodeAction[] = [];
        const data = (diagnostic as DiagnosticWithData).data as IFilePathDiagnosticData | undefined;
        
        if (!data) {
            return actions;
        }
        
        switch (data.type) {
            case 'file-not-found':
                actions.push(...this.createFileNotFoundActions(diagnostic, document, data));
                break;
                
            case 'namespace-not-found':
                actions.push(...this.createNamespaceNotFoundActions(diagnostic, document, data));
                break;
                
            case 'invalid-format':
                actions.push(...this.createInvalidFormatActions(diagnostic, document, data));
                break;
        }
        
        return actions;
    }
    
    /**
     * 创建文件未找到的修复动作
     */
    private createFileNotFoundActions(
        diagnostic: Diagnostic,
        document: TextDocument,
        data: IFilePathDiagnosticData
    ): CodeAction[] {
        const actions: CodeAction[] = [];
        
        // 1. 替换为相似路径的建议
        if (data.suggestions && data.suggestions.length > 0) {
            for (const suggestion of data.suggestions.slice(0, 3)) {
                const action = new CodeAction(
                    `Replace with "${suggestion}"`,
                    CodeActionKind.QuickFix
                );
                
                const edit = new WorkspaceEdit();
                edit.replace(document.uri, diagnostic.range, suggestion);
                action.edit = edit;
                action.diagnostics = [diagnostic];
                action.isPreferred = data.suggestions.indexOf(suggestion) === 0;
                
                actions.push(action);
            }
        }
        
        // 2. 创建文件的动作
        if (data.basePath && data.namespace && data.relativePath) {
            const createFileAction = new CodeAction(
                `Create file "${data.namespace}:${data.relativePath}"`,
                CodeActionKind.QuickFix
            );
            
            createFileAction.command = {
                title: 'Create File',
                command: 'craftengine.createResourceFile',
                arguments: [{
                    namespace: data.namespace,
                    relativePath: data.relativePath,
                    basePath: data.basePath,
                    resourceType: data.resourceType
                }]
            };
            
            createFileAction.diagnostics = [diagnostic];
            
            actions.push(createFileAction);
        }
        
        return actions;
    }
    
    /**
     * 创建命名空间未找到的修复动作
     */
    private createNamespaceNotFoundActions(
        diagnostic: Diagnostic,
        document: TextDocument,
        data: IFilePathDiagnosticData
    ): CodeAction[] {
        const actions: CodeAction[] = [];
        
        // 建议使用 minecraft 命名空间
        if (data.relativePath) {
            const action = new CodeAction(
                `Use "minecraft:${data.relativePath}"`,
                CodeActionKind.QuickFix
            );
            
            const edit = new WorkspaceEdit();
            edit.replace(document.uri, diagnostic.range, `minecraft:${data.relativePath}`);
            action.edit = edit;
            action.diagnostics = [diagnostic];
            action.isPreferred = true;
            
            actions.push(action);
        }
        
        return actions;
    }
    
    /**
     * 创建格式错误的修复动作
     */
    private createInvalidFormatActions(
        diagnostic: Diagnostic,
        document: TextDocument,
        data: IFilePathDiagnosticData
    ): CodeAction[] {
        const actions: CodeAction[] = [];
        
        const inputPath = data.inputPath || '';
        
        // 尝试修复常见的格式问题
        
        // 1. 大写字母转小写
        if (/[A-Z]/.test(inputPath)) {
            const fixedPath = inputPath.toLowerCase();
            const action = new CodeAction(
                `Convert to lowercase: "${fixedPath}"`,
                CodeActionKind.QuickFix
            );
            
            const edit = new WorkspaceEdit();
            edit.replace(document.uri, diagnostic.range, fixedPath);
            action.edit = edit;
            action.diagnostics = [diagnostic];
            action.isPreferred = true;
            
            actions.push(action);
        }
        
        // 2. 反斜杠转正斜杠
        if (inputPath.includes('\\')) {
            const fixedPath = inputPath.replace(/\\/g, '/');
            const action = new CodeAction(
                `Fix path separators: "${fixedPath}"`,
                CodeActionKind.QuickFix
            );
            
            const edit = new WorkspaceEdit();
            edit.replace(document.uri, diagnostic.range, fixedPath);
            action.edit = edit;
            action.diagnostics = [diagnostic];
            
            actions.push(action);
        }
        
        // 3. 添加默认命名空间
        if (!inputPath.includes(':') && /^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*$/.test(inputPath)) {
            const fixedPath = `minecraft:${inputPath}`;
            const action = new CodeAction(
                `Add namespace: "${fixedPath}"`,
                CodeActionKind.QuickFix
            );
            
            const edit = new WorkspaceEdit();
            edit.replace(document.uri, diagnostic.range, fixedPath);
            action.edit = edit;
            action.diagnostics = [diagnostic];
            
            actions.push(action);
        }
        
        // 4. 移除非法字符
        const cleanedPath = inputPath
            .toLowerCase()
            .replace(/[^a-z0-9_.\-/:]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        
        if (cleanedPath !== inputPath && cleanedPath.length > 0) {
            const action = new CodeAction(
                `Clean path: "${cleanedPath}"`,
                CodeActionKind.QuickFix
            );
            
            const edit = new WorkspaceEdit();
            edit.replace(document.uri, diagnostic.range, cleanedPath);
            action.edit = edit;
            action.diagnostics = [diagnostic];
            
            actions.push(action);
        }
        
        return actions;
    }
}

/**
 * 注册创建资源文件命令
 */
export function registerFilePathCommands(context: { subscriptions: { push(disposable: unknown): void } }): void {
    const logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger)
        .createChild('FilePathCommands');
    
    const createResourceFileCommand = {
        command: 'craftengine.createResourceFile',
        callback: async (args: {
            namespace: string;
            relativePath: string;
            basePath: string;
            resourceType?: string;
        }) => {
            try {
                const workspaceFolders = workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    window.showErrorMessage('No workspace folder found');
                    return;
                }
                
                // 选择工作区文件夹（如果有多个）
                let targetFolder = workspaceFolders[0];
                if (workspaceFolders.length > 1) {
                    const selected = await window.showQuickPick(
                        workspaceFolders.map(f => ({
                            label: f.name,
                            folder: f
                        })),
                        { placeHolder: 'Select workspace folder' }
                    );
                    if (!selected) {
                        return;
                    }
                    targetFolder = selected.folder;
                }
                
                // 构建文件路径
                const basePath = args.basePath.replace('{namespace}', args.namespace);
                const fileExtension = getFileExtension(args.resourceType);
                const fileName = `${args.relativePath}${fileExtension}`;
                const absolutePath = path.join(targetFolder.uri.fsPath, basePath, fileName);
                
                // 确保目录存在
                const dirPath = path.dirname(absolutePath);
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                }
                
                // 创建文件（带模板内容）
                const template = getResourceTemplate(args.resourceType);
                fs.writeFileSync(absolutePath, template, 'utf-8');
                
                // 打开文件
                const doc = await workspace.openTextDocument(Uri.file(absolutePath));
                await window.showTextDocument(doc);
                
                window.showInformationMessage(`Created: ${args.namespace}:${args.relativePath}`);
                
                logger.info('Resource file created', {
                    namespace: args.namespace,
                    relativePath: args.relativePath,
                    resourceType: args.resourceType,
                    absolutePath
                });
                
            } catch (error) {
                logger.error('Failed to create resource file', error as Error);
                window.showErrorMessage(`Failed to create file: ${(error as Error).message}`);
            }
        }
    };
    
    context.subscriptions.push(
        require('vscode').commands.registerCommand(
            createResourceFileCommand.command,
            createResourceFileCommand.callback
        )
    );
}

/**
 * 根据资源类型获取文件扩展名
 */
function getFileExtension(resourceType?: string): string {
    switch (resourceType) {
        case 'model':
        case 'loot_table':
        case 'recipe':
        case 'advancement':
            return '.json';
        case 'texture':
            return '.png';
        case 'sound':
            return '.ogg';
        case 'function':
            return '.mcfunction';
        case 'structure':
            return '.nbt';
        default:
            return '.json';
    }
}

/**
 * 根据资源类型获取模板内容
 */
function getResourceTemplate(resourceType?: string): string {
    switch (resourceType) {
        case 'model':
            return JSON.stringify({
                parent: 'minecraft:item/generated',
                textures: {
                    layer0: 'minecraft:item/missing'
                }
            }, null, 2);
            
        case 'loot_table':
            return JSON.stringify({
                type: 'minecraft:generic',
                pools: [
                    {
                        rolls: 1,
                        entries: [
                            {
                                type: 'minecraft:item',
                                name: 'minecraft:stone'
                            }
                        ]
                    }
                ]
            }, null, 2);
            
        case 'recipe':
            return JSON.stringify({
                type: 'minecraft:crafting_shaped',
                pattern: ['###', '###', '###'],
                key: {
                    '#': {
                        item: 'minecraft:stone'
                    }
                },
                result: {
                    item: 'minecraft:stone',
                    count: 1
                }
            }, null, 2);
            
        case 'advancement':
            return JSON.stringify({
                display: {
                    icon: {
                        item: 'minecraft:stone'
                    },
                    title: 'New Advancement',
                    description: 'Description',
                    frame: 'task'
                },
                criteria: {
                    trigger: {
                        trigger: 'minecraft:impossible'
                    }
                }
            }, null, 2);
            
        case 'function':
            return '# Minecraft Function\n# Add your commands here\n\nsay Hello, World!\n';
            
        default:
            return '{}';
    }
}

