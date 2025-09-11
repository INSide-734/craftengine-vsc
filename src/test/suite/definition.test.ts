import * as assert from 'assert';
import * as vscode from 'vscode';
import { TemplateDefinitionProvider } from '../../features/DefinitionProvider';
import { templateCache } from '../../core/TemplateCache';
import { TestLogger } from '../utils/TestLogger';

suite('TemplateDefinitionProvider Tests', () => {
    let definitionProvider: TemplateDefinitionProvider;
    
    suiteSetup(async () => {
        TestLogger.testLog('Setting up TemplateDefinitionProvider tests', 'info');
        definitionProvider = new TemplateDefinitionProvider();
        
        // 添加测试模板到缓存
        const testTemplates = [
            {
                name: 'test:simple_template',
                parameters: [],
                requiredParameters: [],
                optionalParameters: [],
                sourceFile: vscode.Uri.file('/test/templates.yml'),
                definitionPosition: new vscode.Position(5, 2)
            },
            {
                name: 'test:template_with_params',
                parameters: ['param1', 'param2'],
                requiredParameters: ['param1', 'param2'],
                optionalParameters: [],
                sourceFile: vscode.Uri.file('/test/other.yml'),
                definitionPosition: new vscode.Position(10, 4)
            }
        ];
        
        // 清空并重新填充缓存
        (templateCache as any).cache.clear();
        testTemplates.forEach(template => {
            (templateCache as any).cache.set(template.name, template);
        });
    });
    
    suiteTeardown(() => {
        TestLogger.testLog('Cleaning up TemplateDefinitionProvider tests', 'info');
        (templateCache as any).cache.clear();
    });
    
    test('Should provide definition for template name', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'template: test:simple_template',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 15); // 在模板名称中间
        const definition = definitionProvider.provideDefinition(document, position);
        
        assert.ok(definition, 'Should return definition location');
        assert.ok(definition instanceof vscode.Location, 'Should return Location object');
        
        const location = definition as vscode.Location;
        assert.strictEqual(location.uri.fsPath.replace(/\\/g, '/'), '/test/templates.yml', 'Should point to correct source file');
        assert.strictEqual(location.range.start.line, 5, 'Should point to correct line');
        assert.strictEqual(location.range.start.character, 2, 'Should point to correct character');
    });
    
    test('Should provide definition for template with different source file', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'template: test:template_with_params',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 20); // 在模板名称中间
        const definition = definitionProvider.provideDefinition(document, position);
        
        assert.ok(definition, 'Should return definition location');
        
        const location = definition as vscode.Location;
        assert.strictEqual(location.uri.fsPath.replace(/\\/g, '/'), '/test/other.yml', 'Should point to correct source file');
        assert.strictEqual(location.range.start.line, 10, 'Should point to correct line');
        assert.strictEqual(location.range.start.character, 4, 'Should point to correct character');
    });
    
    test('Should not provide definition outside template name', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'template: test:simple_template',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 5); // 在 "template" 关键字上
        const definition = definitionProvider.provideDefinition(document, position);
        
        assert.strictEqual(definition, undefined, 'Should not provide definition outside template name');
    });
    
    test('Should not provide definition for non-template lines', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'some_key: some_value',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 10);
        const definition = definitionProvider.provideDefinition(document, position);
        
        assert.strictEqual(definition, undefined, 'Should not provide definition for non-template lines');
    });
    
    test('Should not provide definition for unknown template', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'template: unknown:template',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 15);
        const definition = definitionProvider.provideDefinition(document, position);
        
        assert.strictEqual(definition, undefined, 'Should not provide definition for unknown template');
    });
    
    test('Should handle template without explicit definition position', async () => {
        // 添加一个没有明确定义位置的模板
        const templateWithoutPosition = {
            name: 'test:no_position',
            parameters: [],
            requiredParameters: [],
            optionalParameters: [],
            sourceFile: vscode.Uri.file('/test/templates.yml'),
            definitionPosition: undefined
        };
        
        (templateCache as any).cache.set('test:no_position', templateWithoutPosition);
        
        const document = await vscode.workspace.openTextDocument({
            content: 'template: test:no_position',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 15);
        const definition = definitionProvider.provideDefinition(document, position);
        
        assert.ok(definition, 'Should return definition location even without explicit position');
        
        const location = definition as vscode.Location;
        assert.strictEqual(location.uri.fsPath.replace(/\\/g, '/'), '/test/templates.yml', 'Should point to correct source file');
        assert.strictEqual(location.range.start.line, 0, 'Should default to line 0');
        assert.strictEqual(location.range.start.character, 0, 'Should default to character 0');
    });
    
    test('Should handle cursor at beginning of template name', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'template: test:simple_template',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 10); // 在模板名称开始处
        const definition = definitionProvider.provideDefinition(document, position);
        
        assert.ok(definition, 'Should return definition when cursor is at beginning of template name');
    });
    
    test('Should handle cursor at end of template name', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: 'template: test:simple_template',
            language: 'yaml'
        });
        
        const position = new vscode.Position(0, 29); // 在模板名称结束处
        const definition = definitionProvider.provideDefinition(document, position);
        
        assert.ok(definition, 'Should return definition when cursor is at end of template name');
    });
    
    test('Should handle array template context', async () => {
        const document = await vscode.workspace.openTextDocument({
            content: `template:
  - test:simple_template`,
            language: 'yaml'
        });
        
        const position = new vscode.Position(1, 10); // 在数组项的模板名称上
        const definition = definitionProvider.provideDefinition(document, position);
        
        assert.ok(definition, 'Should return definition for array template');
        
        const location = definition as vscode.Location;
        assert.strictEqual(location.uri.fsPath.replace(/\\/g, '/'), '/test/templates.yml', 'Should point to correct source file');
    });
});
