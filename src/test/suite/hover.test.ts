import * as assert from 'assert';
import * as vscode from 'vscode';
import { TemplateHoverProvider } from '../../features/HoverProvider';
import { templateCache } from '../../core/TemplateCache';
import { TestLogger } from '../utils/TestLogger';

suite('TemplateHoverProvider Tests', () => {
    let hoverProvider: TemplateHoverProvider;
    
    suiteSetup(async () => {
        TestLogger.testLog('Setting up TemplateHoverProvider tests', 'info');
        hoverProvider = new TemplateHoverProvider();
        
        // 添加测试模板到缓存
        const testTemplates = [
            {
                name: 'test:simple_template',
                parameters: [],
                requiredParameters: [],
                optionalParameters: [],
                sourceFile: vscode.Uri.file('/test/templates.yml'),
                definitionPosition: new vscode.Position(0, 0)
            },
            {
                name: 'test:template_with_params',
                parameters: ['param1', 'param2', 'optional_param'],
                requiredParameters: ['param1', 'param2'],
                optionalParameters: ['optional_param'],
                sourceFile: vscode.Uri.file('/test/templates.yml'),
                definitionPosition: new vscode.Position(5, 0)
            }
        ];
        
        // 清空并重新填充缓存
        (templateCache as any).cache.clear();
        testTemplates.forEach(template => {
            (templateCache as any).cache.set(template.name, template);
        });
    });
    
    suiteTeardown(() => {
        (templateCache as any).cache.clear();
    });
    
    test('Should provide hover for template name', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'template: test:simple_template',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 15); // 在模板名称中间
        const hover = hoverProvider.provideHover(document, position);
        
        assert.ok(hover, 'Should return hover information');
        assert.ok(hover.contents, 'Should have hover contents');
        
        const content = hover.contents[0] as vscode.MarkdownString;
        assert.ok(content.value.includes('test:simple_template'), 'Should include template name');
        assert.ok(content.value.includes('no parameters'), 'Should indicate no parameters');
    });
    
    test('Should provide hover for template with parameters', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'template: test:template_with_params',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 20); // 在模板名称中间
        const hover = hoverProvider.provideHover(document, position);
        
        assert.ok(hover, 'Should return hover information');
        
        const content = hover.contents[0] as vscode.MarkdownString;
        assert.ok(content.value.includes('test:template_with_params'), 'Should include template name');
        assert.ok(content.value.includes('Parameters'), 'Should show parameters section');
        assert.ok(content.value.includes('param1'), 'Should list parameter param1');
        assert.ok(content.value.includes('param2'), 'Should list parameter param2');
        assert.ok(content.value.includes('optional_param'), 'Should list optional parameter');
    });
    
    test('Should not provide hover outside template name', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'template: test:simple_template',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 5); // 在 "template" 关键字上
        const hover = hoverProvider.provideHover(document, position);
        
        assert.strictEqual(hover, undefined, 'Should not provide hover outside template name');
    });
    
    test('Should not provide hover for non-template lines', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'some_key: some_value',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 10);
        const hover = hoverProvider.provideHover(document, position);
        
        assert.strictEqual(hover, undefined, 'Should not provide hover for non-template lines');
    });
    
    test('Should not provide hover for unknown template', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'template: unknown:template',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 15);
        const hover = hoverProvider.provideHover(document, position);
        
        assert.strictEqual(hover, undefined, 'Should not provide hover for unknown template');
    });
    
    test('Should provide correct hover range', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'template: test:simple_template',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 15); // 在模板名称中间
        const hover = hoverProvider.provideHover(document, position);
        
        assert.ok(hover, 'Should return hover information');
        assert.ok(hover.range, 'Should have hover range');
        
        // 检查范围是否覆盖整个模板名称
        assert.strictEqual(hover.range.start.line, 0, 'Range should start at line 0');
        assert.strictEqual(hover.range.start.character, 10, 'Range should start at character 10 (after "template: ")');
        assert.strictEqual(hover.range.end.line, 0, 'Range should end at line 0');
        assert.strictEqual(hover.range.end.character, 30, 'Range should end at character 30 (end of template name)');
    });
    
    test('Should include source file information', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'template: test:simple_template',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 15);
        const hover = hoverProvider.provideHover(document, position);
        
        assert.ok(hover, 'Should return hover information');
        
        const content = hover.contents[0] as vscode.MarkdownString;
        assert.ok(content.value.includes('Source:'), 'Should include source file information');
        assert.ok(content.value.includes('/test/templates.yml'), 'Should show correct source file path');
    });
    
    test('Should include navigation tip', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'template: test:simple_template',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 15);
        const hover = hoverProvider.provideHover(document, position);
        
        assert.ok(hover, 'Should return hover information');
        
        const content = hover.contents[0] as vscode.MarkdownString;
        assert.ok(content.value.includes('Ctrl and click'), 'Should include navigation tip');
        assert.ok(content.value.includes('go to template definition'), 'Should mention definition navigation');
    });
    
    test('Should handle array template context', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: `template:
  - test:simple_template`,
            language: 'yaml'
        });
        
        const position = new vscode.Position(1, 10); // 在数组项的模板名称上
        const hover = hoverProvider.provideHover(document, position);
        
        assert.ok(hover, 'Should return hover information for array template');
        
        const content = hover.contents[0] as vscode.MarkdownString;
        assert.ok(content.value.includes('test:simple_template'), 'Should include template name');
    });
});
