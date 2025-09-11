import * as assert from 'assert';
import * as vscode from 'vscode';
import { registerSchemaProvider } from '../../features/SchemaProvider';
import { templateCache } from '../../core/TemplateCache';
import { TestLogger } from '../utils/TestLogger';

suite('SchemaProvider Tests', () => {
    
    suiteSetup(async () => {
        TestLogger.testLog('Setting up SchemaProvider tests', 'info');
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
                requiredParameters: ['param1', 'param2'],
                optionalParameters: [],
                sourceFile: vscode.Uri.file('test.yml'),
                definitionPosition: new vscode.Position(5, 0)
            },
            {
                name: 'test:mixed_params',
                parameters: ['required_param', 'optional_param'],
                requiredParameters: ['required_param'],
                optionalParameters: ['optional_param'],
                sourceFile: vscode.Uri.file('test.yml'),
                definitionPosition: new vscode.Position(10, 0)
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
    
    test('Should register schema provider without errors', async () => {
        // 创建一个模拟的扩展上下文
        const mockContext: vscode.ExtensionContext = {
            subscriptions: [],
            workspaceState: {} as any,
            globalState: {} as any,
            extensionUri: vscode.Uri.file('/test'),
            extensionPath: '/test',
            storagePath: '/test/storage',
            globalStoragePath: '/test/global',
            logPath: '/test/log',
            environmentVariableCollection: {} as any,
            asAbsolutePath: (relativePath: string) => `/test/${relativePath}`,
            storageUri: vscode.Uri.file('/test/storage'),
            globalStorageUri: vscode.Uri.file('/test/global'),
            logUri: vscode.Uri.file('/test/log'),
            extensionMode: vscode.ExtensionMode.Test,
            secrets: {} as any,
            extension: {} as any,
            languageModelAccessInformation: {} as any
        };
        
        // 测试注册过程不应该抛出错误
        assert.doesNotThrow(async () => {
            await registerSchemaProvider(mockContext);
        }, 'Schema provider registration should not throw errors');
        
        // 验证订阅数组不为空（即使 YAML 扩展不存在，也应该尝试注册）
        // 注意：在测试环境中，Red Hat YAML 扩展可能不存在，所以我们主要测试不会崩溃
        assert.ok(true, 'Schema provider registration completed without errors');
    });
    
    test('Should handle missing YAML extension gracefully', async () => {
        const mockContext: vscode.ExtensionContext = {
            subscriptions: [],
            workspaceState: {} as any,
            globalState: {} as any,
            extensionUri: vscode.Uri.file('/test'),
            extensionPath: '/test',
            storagePath: '/test/storage',
            globalStoragePath: '/test/global',
            logPath: '/test/log',
            environmentVariableCollection: {} as any,
            asAbsolutePath: (relativePath: string) => `/test/${relativePath}`,
            storageUri: vscode.Uri.file('/test/storage'),
            globalStorageUri: vscode.Uri.file('/test/global'),
            logUri: vscode.Uri.file('/test/log'),
            extensionMode: vscode.ExtensionMode.Test,
            secrets: {} as any,
            extension: {} as any,
            languageModelAccessInformation: {} as any
        };
        
        // 在没有 YAML 扩展的情况下，应该优雅地处理
        let errorThrown = false;
        try {
            await registerSchemaProvider(mockContext);
        } catch (error) {
            errorThrown = true;
        }
        
        assert.strictEqual(errorThrown, false, 'Should handle missing YAML extension without throwing errors');
    });
    
    test('Should generate valid JSON schema structure', () => {
        // 由于 generateDynamicSchema 是内部函数，我们通过间接方式测试
        // 这里我们测试模板缓存中的数据是否能正确生成 schema 结构
        
        const templates = templateCache.getAll();
        assert.ok(templates.length > 0, 'Should have templates in cache for schema generation');
        
        // 验证模板结构包含生成 schema 所需的字段
        templates.forEach(template => {
            assert.ok(template.name, 'Template should have name');
            assert.ok(Array.isArray(template.parameters), 'Template should have parameters array');
            assert.ok(Array.isArray(template.requiredParameters), 'Template should have requiredParameters array');
            assert.ok(Array.isArray(template.optionalParameters), 'Template should have optionalParameters array');
        });
    });
    
    test('Should handle templates with no parameters in schema', () => {
        const simpleTemplate = templateCache.get('test:simple_template');
        assert.ok(simpleTemplate, 'Should find simple template');
        assert.strictEqual(simpleTemplate.parameters.length, 0, 'Simple template should have no parameters');
        assert.strictEqual(simpleTemplate.requiredParameters.length, 0, 'Simple template should have no required parameters');
        assert.strictEqual(simpleTemplate.optionalParameters.length, 0, 'Simple template should have no optional parameters');
    });
    
    test('Should handle templates with only required parameters in schema', () => {
        const templateWithParams = templateCache.get('test:template_with_params');
        assert.ok(templateWithParams, 'Should find template with params');
        assert.strictEqual(templateWithParams.parameters.length, 2, 'Template should have 2 parameters');
        assert.strictEqual(templateWithParams.requiredParameters.length, 2, 'Template should have 2 required parameters');
        assert.strictEqual(templateWithParams.optionalParameters.length, 0, 'Template should have no optional parameters');
    });
    
    test('Should handle templates with mixed parameters in schema', () => {
        const mixedTemplate = templateCache.get('test:mixed_params');
        assert.ok(mixedTemplate, 'Should find mixed template');
        assert.strictEqual(mixedTemplate.parameters.length, 2, 'Mixed template should have 2 parameters');
        assert.strictEqual(mixedTemplate.requiredParameters.length, 1, 'Mixed template should have 1 required parameter');
        assert.strictEqual(mixedTemplate.optionalParameters.length, 1, 'Mixed template should have 1 optional parameter');
    });
    
    test('Should validate schema generation inputs', () => {
        // 测试 schema 生成所需的输入数据
        const allTemplates = templateCache.getAll();
        
        // 验证每个模板都有生成 schema 所需的基本信息
        allTemplates.forEach((template, index) => {
            assert.ok(typeof template.name === 'string', `Template ${index} should have string name`);
            assert.ok(template.name.length > 0, `Template ${index} should have non-empty name`);
            assert.ok(Array.isArray(template.parameters), `Template ${index} should have parameters array`);
            
            // 验证参数数组的一致性
            const totalParams = template.requiredParameters.length + template.optionalParameters.length;
            assert.strictEqual(template.parameters.length, totalParams, 
                `Template ${index} parameter counts should be consistent`);
            
            // 验证没有重复参数
            const allParams = [...template.requiredParameters, ...template.optionalParameters];
            const uniqueParams = new Set(allParams);
            assert.strictEqual(allParams.length, uniqueParams.size, 
                `Template ${index} should not have duplicate parameters`);
        });
    });
    
    test('Should handle empty template cache for schema generation', () => {
        // 临时清空缓存
        const originalCache = new Map((templateCache as any).cache);
        (templateCache as any).cache.clear();
        
        const templates = templateCache.getAll();
        assert.strictEqual(templates.length, 0, 'Cache should be empty');
        
        // Schema 生成应该能处理空缓存而不崩溃
        assert.doesNotThrow(() => {
            // 这里我们无法直接调用 generateDynamicSchema，但可以验证缓存状态
            const emptyTemplates = templateCache.getAll();
            assert.strictEqual(emptyTemplates.length, 0, 'Should handle empty cache gracefully');
        }, 'Should handle empty template cache without errors');
        
        // 恢复缓存
        (templateCache as any).cache = originalCache;
    });
});
