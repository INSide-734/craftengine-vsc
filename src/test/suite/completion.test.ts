import * as assert from 'assert';
import * as vscode from 'vscode';
import { TemplateCompletionProvider } from '../../features/CompletionProvider';
import { templateCache } from '../../core/TemplateCache';
import { TestLogger } from '../utils/TestLogger';

suite('TemplateCompletionProvider Tests', () => {
    let completionProvider: TemplateCompletionProvider;
    
    suiteSetup(async () => {
        TestLogger.testLog('Setting up TemplateCompletionProvider tests', 'info');
        completionProvider = new TemplateCompletionProvider();
        
        // 添加测试模板到缓存
        const testTemplates = [
            {
                name: 'test:simple_template',
                parameters: [],
                requiredParameters: [],
                optionalParameters: [],
                sourceFile: vscode.Uri.file('test.yml'),
                definitionPosition: new vscode.Position(0, 0)
            },
            {
                name: 'test:template_with_params',
                parameters: ['param1', 'param2'],
                requiredParameters: ['param1'],
                optionalParameters: ['param2'],
                sourceFile: vscode.Uri.file('test.yml'),
                definitionPosition: new vscode.Position(5, 0)
            },
            {
                name: 'namespace:block/dynamic',
                parameters: ['block_type', 'hardness'],
                requiredParameters: ['block_type', 'hardness'],
                optionalParameters: [],
                sourceFile: vscode.Uri.file('test.yml'),
                definitionPosition: new vscode.Position(10, 0)
            }
        ];
        
        // 清空并重新填充缓存
        (templateCache as any).cache.clear();
        testTemplates.forEach(template => {
            (templateCache as any).cache.set(template.name, template);
        });
        TestLogger.testLog('TemplateCompletionProvider tests setup completed', 'success');
    });
    
    suiteTeardown(() => {
        TestLogger.testLog('Cleaning up TemplateCompletionProvider tests', 'info');
        (templateCache as any).cache.clear();
    });
    
    test('Should provide completion for direct template context', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'template: ',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 10); // 在 "template: " 后面
        const completionList = completionProvider.provideCompletionItems(document, position);
        
        assert.ok(completionList, 'Should return completion list');
        assert.ok(completionList.items.length > 0, 'Should have completion items');
        
        // 检查是否包含测试模板
        const templateNames = completionList.items.map(item => item.label);
        assert.ok(templateNames.includes('test:simple_template'), 'Should include simple template');
        assert.ok(templateNames.includes('test:template_with_params'), 'Should include template with params');
    });
    
    test('Should provide completion for array template context', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: `template:
  - `,
            language: 'yaml'
        });
        
        const position = new vscode.Position(1, 4); // 在 "  - " 后面
        const completionList = completionProvider.provideCompletionItems(document, position);
        
        assert.ok(completionList, 'Should return completion list for array context');
        assert.ok(completionList.items.length > 0, 'Should have completion items for array context');
    });
    
    test('Should filter templates based on input prefix', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'template: test:',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 15); // 在 "template: test:" 后面
        const completionList = completionProvider.provideCompletionItems(document, position);
        
        assert.ok(completionList, 'Should return completion list');
        
        // 检查过滤结果
        const templateNames = completionList.items.map(item => item.label);
        assert.ok(templateNames.includes('test:simple_template'), 'Should include matching template');
        assert.ok(templateNames.includes('test:template_with_params'), 'Should include matching template with params');
        assert.ok(!templateNames.includes('namespace:block/dynamic'), 'Should not include non-matching template');
    });
    
    test('Should not provide completion outside template context', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'some_key: some_value',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 10);
        const completionList = completionProvider.provideCompletionItems(document, position);
        
        assert.strictEqual(completionList, undefined, 'Should not provide completion outside template context');
    });
    
    test('Should create completion items with correct details', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'template: ',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 10);
        const completionList = completionProvider.provideCompletionItems(document, position);
        
        assert.ok(completionList, 'Should return completion list');
        
        const templateWithParams = completionList.items.find(item => item.label === 'test:template_with_params');
        assert.ok(templateWithParams, 'Should find template with params');
        assert.ok(templateWithParams.detail?.includes('1 required, 1 optional'), 'Should show parameter counts');
        
        const simpleTemplate = completionList.items.find(item => item.label === 'test:simple_template');
        assert.ok(simpleTemplate, 'Should find simple template');
        assert.ok(simpleTemplate.detail?.includes('no parameters'), 'Should indicate no parameters');
    });
    
    test('Should include insert template command', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'template: ',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 10);
        const completionList = completionProvider.provideCompletionItems(document, position);
        
        assert.ok(completionList, 'Should return completion list');
        
        const firstItem = completionList.items[0];
        assert.ok(firstItem.command, 'Should have command');
        assert.strictEqual(firstItem.command.command, 'craftengine.insertTemplateSnippet', 'Should have correct command');
        assert.ok(firstItem.command.arguments, 'Should have command arguments');
        assert.ok(firstItem.command.arguments[0], 'Should pass template as argument');
    });
    
    test('Should handle cancellation token', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'template: ',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 10);
        const cancellationToken = new vscode.CancellationTokenSource();
        
        // 立即取消
        cancellationToken.cancel();
        
        const completionList = completionProvider.provideCompletionItems(document, position, cancellationToken.token);
        
        assert.strictEqual(completionList, undefined, 'Should return undefined when cancelled');
    });
    
    test('Should handle empty template cache gracefully', async () => {
        // 临时清空缓存
        const originalCache = new Map((templateCache as any).cache);
        (templateCache as any).cache.clear();
        
        const document = await vscode.workspace.openTextDocument({
            content: 'template: ',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 10);
        const completionList = completionProvider.provideCompletionItems(document, position);
        
        assert.ok(completionList, 'Should return completion list even when cache is empty');
        assert.strictEqual(completionList.items.length, 0, 'Should have no items when cache is empty');
        
        // 恢复缓存
        (templateCache as any).cache = originalCache;
    });

    test('Should resolve completion item with template documentation', async () => {
        // 创建一个补全项
        const completionItem = new vscode.CompletionItem('test:template_with_params', vscode.CompletionItemKind.Snippet);
        
        // 调用resolveCompletionItem方法
        const resolvedItem = completionProvider.resolveCompletionItem(completionItem);
        
        assert.ok(resolvedItem, 'Should return resolved completion item');
        assert.ok(resolvedItem.documentation, 'Should have documentation');
        assert.ok(resolvedItem.detail, 'Should have detail');
        
        // 检查文档内容
        const documentation = resolvedItem.documentation as vscode.MarkdownString;
        assert.ok(documentation.value.includes('test:template_with_params'), 'Should include template name in documentation');
        assert.ok(documentation.value.includes('Required Parameters'), 'Should include required parameters section');
        assert.ok(documentation.value.includes('Optional Parameters'), 'Should include optional parameters section');
        assert.ok(documentation.value.includes('param1'), 'Should include required parameter');
        assert.ok(documentation.value.includes('param2'), 'Should include optional parameter');
    });

    test('Should resolve completion item for template without parameters', async () => {
        // 创建一个简单模板的补全项
        const completionItem = new vscode.CompletionItem('test:simple_template', vscode.CompletionItemKind.Snippet);
        
        // 调用resolveCompletionItem方法
        const resolvedItem = completionProvider.resolveCompletionItem(completionItem);
        
        assert.ok(resolvedItem, 'Should return resolved completion item');
        assert.ok(resolvedItem.documentation, 'Should have documentation');
        assert.ok(resolvedItem.detail, 'Should have detail');
        
        // 检查文档内容
        const documentation = resolvedItem.documentation as vscode.MarkdownString;
        assert.ok(documentation.value.includes('test:simple_template'), 'Should include template name in documentation');
        assert.ok(documentation.value.includes('no parameters'), 'Should indicate no parameters');
    });

    test('Should handle resolveCompletionItem with cancellation token', async () => {
        const completionItem = new vscode.CompletionItem('test:template_with_params', vscode.CompletionItemKind.Snippet);
        const cancellationToken = new vscode.CancellationTokenSource();
        
        // 立即取消
        cancellationToken.cancel();
        
        const resolvedItem = completionProvider.resolveCompletionItem(completionItem, cancellationToken.token);
        
        assert.strictEqual(resolvedItem, undefined, 'Should return undefined when cancelled');
    });

    test('Should handle resolveCompletionItem for non-existent template', async () => {
        // 创建一个不存在的模板的补全项
        const completionItem = new vscode.CompletionItem('non:existent:template', vscode.CompletionItemKind.Snippet);
        
        // 调用resolveCompletionItem方法
        const resolvedItem = completionProvider.resolveCompletionItem(completionItem);
        
        assert.strictEqual(resolvedItem, undefined, 'Should return undefined for non-existent template');
    });

    test('Should update completion item detail in resolveCompletionItem', async () => {
        const completionItem = new vscode.CompletionItem('test:template_with_params', vscode.CompletionItemKind.Snippet);
        
        // 调用resolveCompletionItem方法
        const resolvedItem = completionProvider.resolveCompletionItem(completionItem);
        
        assert.ok(resolvedItem, 'Should return resolved completion item');
        assert.ok(resolvedItem.detail?.includes('CraftEngine Template'), 'Should include CraftEngine Template in detail');
        assert.ok(resolvedItem.detail?.includes('1 required, 1 optional'), 'Should show correct parameter counts');
    });
});
