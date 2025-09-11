import * as assert from 'assert';
import * as vscode from 'vscode';
import { TemplateDiagnosticManager } from '../../features/DiagnosticProvider';
import { templateCache } from '../../core/TemplateCache';
import { TestLogger } from '../utils/TestLogger';

suite('Template Diagnostic Tests', () => {
    let diagnosticManager: TemplateDiagnosticManager;
    
    suiteSetup(async () => {
        TestLogger.testLog('Setting up Template Diagnostic tests', 'info');
        diagnosticManager = new TemplateDiagnosticManager();
        
        // 添加一个测试模板到缓存
        const testTemplate = {
            name: 'test:template',
            parameters: ['param1', 'param2'],
            requiredParameters: ['param1', 'param2'],
            optionalParameters: [],
            sourceFile: vscode.Uri.file('test.yml'),
            definitionPosition: new vscode.Position(0, 0)
        };
        
        // 直接添加到缓存（模拟已解析的模板）
        (templateCache as any).cache.set('test:template', testTemplate);
        
        // 等待一下确保缓存设置完成
        await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    suiteTeardown(() => {
        diagnosticManager.dispose();
        (templateCache as any).cache.clear();
    });
    
    test('Should detect missing arguments section', async () => {
        // 重新设置模板缓存（因为扩展激活可能清空了它）
        const testTemplate = {
            name: 'test:template',
            parameters: ['param1', 'param2'],
            requiredParameters: ['param1', 'param2'],
            optionalParameters: [],
            sourceFile: vscode.Uri.file('test.yml'),
            definitionPosition: new vscode.Position(0, 0)
        };
        (templateCache as any).cache.set('test:template', testTemplate);
        
        const content = `items:
  test:item:
    template: test:template`;
        
        const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'yaml'
        });
        
        diagnosticManager.updateDiagnostics(doc);
        
        const diagnostics = diagnosticManager['diagnosticCollection'].get(doc.uri);
        assert.ok(diagnostics, 'Diagnostics should be created');
        assert.strictEqual(diagnostics!.length, 1, 'Should have one diagnostic');
        assert.strictEqual(diagnostics![0].severity, vscode.DiagnosticSeverity.Error);
        assert.ok(diagnostics![0].message.includes('missing arguments section'), 'Should mention missing arguments section');
    });
    
    test('Should detect missing parameters', async () => {
        // 重新设置模板缓存（因为扩展激活可能清空了它）
        const testTemplate = {
            name: 'test:template',
            parameters: ['param1', 'param2'],
            requiredParameters: ['param1', 'param2'],
            optionalParameters: [],
            sourceFile: vscode.Uri.file('test.yml'),
            definitionPosition: new vscode.Position(0, 0)
        };
        (templateCache as any).cache.set('test:template', testTemplate);
        
        const content = `items:
  test:item:
    template: test:template
    arguments:
      param1: value1`;
        
        const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'yaml'
        });
        
        diagnosticManager.updateDiagnostics(doc);
        
        const diagnostics = diagnosticManager['diagnosticCollection'].get(doc.uri);
        assert.ok(diagnostics, 'Diagnostics should be created');
        assert.strictEqual(diagnostics!.length, 1, 'Should have one diagnostic');
        assert.strictEqual(diagnostics![0].severity, vscode.DiagnosticSeverity.Error);
        assert.ok(diagnostics![0].message.includes('param2'), 'Should mention missing param2');
    });
    
    test('Should not create diagnostics for complete template usage', async () => {
        const content = `items:
  test:item:
    template: test:template
    arguments:
      param1: value1
      param2: value2`;
        
        const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'yaml'
        });
        
        diagnosticManager.updateDiagnostics(doc);
        
        const diagnostics = diagnosticManager['diagnosticCollection'].get(doc.uri);
        assert.strictEqual(diagnostics?.length || 0, 0, 'Should have no diagnostics for complete template usage');
    });
    
    test('Should not create diagnostics for templates without parameters', async () => {
        // 创建一个不需要参数的模板
        const noArgsTemplate = {
            name: 'test:no_args_template',
            parameters: [], // 空参数数组
            requiredParameters: [],
            optionalParameters: [],
            sourceFile: vscode.Uri.file('test.yml'),
            definitionPosition: new vscode.Position(0, 0)
        };
        (templateCache as any).cache.set('test:no_args_template', noArgsTemplate);
        
        const content = `items:
  test:item:
    template: test:no_args_template`;
        
        const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'yaml'
        });
        
        diagnosticManager.updateDiagnostics(doc);
        
        const diagnostics = diagnosticManager['diagnosticCollection'].get(doc.uri);
        assert.strictEqual(diagnostics?.length || 0, 0, 'Should have no diagnostics for templates without parameters');
    });
    
    test('Should not create diagnostics for templates without parameters even with extra arguments', async () => {
        // 创建一个不需要参数的模板
        const noArgsTemplate = {
            name: 'test:no_args_template',
            parameters: [], // 空参数数组
            requiredParameters: [],
            optionalParameters: [],
            sourceFile: vscode.Uri.file('test.yml'),
            definitionPosition: new vscode.Position(0, 0)
        };
        (templateCache as any).cache.set('test:no_args_template', noArgsTemplate);
        
        const content = `items:
  test:item:
    template: test:no_args_template
    arguments:
      extra_param: value`;
        
        const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'yaml'
        });
        
        diagnosticManager.updateDiagnostics(doc);
        
        const diagnostics = diagnosticManager['diagnosticCollection'].get(doc.uri);
        assert.strictEqual(diagnostics?.length || 0, 0, 'Should have no diagnostics for templates without parameters even with extra arguments');
    });
    
    test('Should create warnings for optional parameters with default values', async () => {
        // 创建一个有可选参数的模板
        const templateWithDefaults = {
            name: 'test:template_with_defaults',
            parameters: ['required_param', 'optional_param'],
            requiredParameters: ['required_param'],
            optionalParameters: ['optional_param'],
            sourceFile: vscode.Uri.file('test.yml'),
            definitionPosition: new vscode.Position(0, 0)
        };
        (templateCache as any).cache.set('test:template_with_defaults', templateWithDefaults);
        
        const content = `items:
  test:item:
    template: test:template_with_defaults
    arguments:
      required_param: value1`;
        
        const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'yaml'
        });
        
        diagnosticManager.updateDiagnostics(doc);
        
        const diagnostics = diagnosticManager['diagnosticCollection'].get(doc.uri);
        assert.ok(diagnostics, 'Diagnostics should be created');
        assert.strictEqual(diagnostics!.length, 1, 'Should have one warning for missing optional parameter');
        assert.strictEqual(diagnostics![0].severity, vscode.DiagnosticSeverity.Warning, 'Should be a warning, not an error');
        assert.ok(diagnostics![0].message.includes('optional parameter'), 'Should mention optional parameter');
    });
    
    test('Should create both errors and warnings for mixed parameters', async () => {
        // 创建一个有必需和可选参数的模板
        const mixedTemplate = {
            name: 'test:mixed_template',
            parameters: ['required_param', 'optional_param'],
            requiredParameters: ['required_param'],
            optionalParameters: ['optional_param'],
            sourceFile: vscode.Uri.file('test.yml'),
            definitionPosition: new vscode.Position(0, 0)
        };
        (templateCache as any).cache.set('test:mixed_template', mixedTemplate);
        
        const content = `items:
  test:item:
    template: test:mixed_template
    arguments:
      optional_param: value1`;
        
        const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'yaml'
        });
        
        diagnosticManager.updateDiagnostics(doc);
        
        const diagnostics = diagnosticManager['diagnosticCollection'].get(doc.uri);
        assert.ok(diagnostics, 'Diagnostics should be created');
        assert.strictEqual(diagnostics!.length, 1, 'Should have one diagnostic for missing required parameter');
        
        // 找到错误诊断
        const errorDiagnostic = diagnostics!.find(d => d.severity === vscode.DiagnosticSeverity.Error);
        assert.ok(errorDiagnostic, 'Should have an error diagnostic');
        assert.ok(errorDiagnostic!.message.includes('required_param'), 'Should mention missing required parameter');
    });
    
    test('Should create warnings for templates with only optional parameters', async () => {
        // 创建一个只有可选参数的模板
        const optionalOnlyTemplate = {
            name: 'test:optional_only_template',
            parameters: ['optional_param1', 'optional_param2'],
            requiredParameters: [],
            optionalParameters: ['optional_param1', 'optional_param2'],
            sourceFile: vscode.Uri.file('test.yml'),
            definitionPosition: new vscode.Position(0, 0)
        };
        (templateCache as any).cache.set('test:optional_only_template', optionalOnlyTemplate);
        
        const content = `items:
  test:item:
    template: test:optional_only_template`;
        
        const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'yaml'
        });
        
        diagnosticManager.updateDiagnostics(doc);
        
        const diagnostics = diagnosticManager['diagnosticCollection'].get(doc.uri);
        assert.ok(diagnostics, 'Diagnostics should be created');
        assert.strictEqual(diagnostics!.length, 1, 'Should have one warning for missing arguments section');
        assert.strictEqual(diagnostics![0].severity, vscode.DiagnosticSeverity.Warning, 'Should be a warning, not an error');
        assert.ok(diagnostics![0].message.includes('optional parameter'), 'Should mention optional parameters');
    });
    
    test('Should handle invalid YAML gracefully', async () => {
        const content = `items:
  test:item:
    template: test:template
    arguments:
      param1: value1
      param2: value2
    invalid: yaml: content: [`;
        
        const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'yaml'
        });
        
        // 不应该抛出异常
        assert.doesNotThrow(() => {
            diagnosticManager.updateDiagnostics(doc);
        });
    });
});
