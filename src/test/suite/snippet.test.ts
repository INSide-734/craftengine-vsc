import * as assert from 'assert';
import * as vscode from 'vscode';
import { createEnhancedSnippet, generateParameterSuggestions } from '../../features/SnippetGenerator';
import { TestLogger } from '../utils/TestLogger';

suite('SnippetGenerator Tests', () => {
    
    test('Should create snippet for template without parameters', () => {
        TestLogger.testLog('Testing snippet creation for template without parameters', 'info');
        const template = {
            name: 'test:simple_template',
            parameters: [],
            requiredParameters: [],
            optionalParameters: [],
            sourceFile: vscode.Uri.file('test.yml'),
            definitionPosition: new vscode.Position(0, 0)
        };
        
        const context = {
            mode: 'direct',
            baseIndent: ''
        };
        
        const snippet = createEnhancedSnippet(template, context);
        
        assert.ok(snippet, 'Should create snippet');
        assert.strictEqual(snippet.value, 'test:simple_template', 'Should contain only template name for templates without parameters');
    });
    
    test('Should create snippet for template with required parameters', () => {
        const template = {
            name: 'test:template_with_params',
            parameters: ['param1', 'param2'],
            requiredParameters: ['param1', 'param2'],
            optionalParameters: [],
            sourceFile: vscode.Uri.file('test.yml'),
            definitionPosition: new vscode.Position(0, 0)
        };
        
        const context = {
            mode: 'direct',
            baseIndent: ''
        };
        
        const snippet = createEnhancedSnippet(template, context);
        
        assert.ok(snippet, 'Should create snippet');
        assert.ok(snippet.value.includes('test:template_with_params'), 'Should contain template name');
        assert.ok(snippet.value.includes('arguments:'), 'Should include arguments section');
        assert.ok(snippet.value.includes('param1'), 'Should include param1');
        assert.ok(snippet.value.includes('param2'), 'Should include param2');
        assert.ok(snippet.value.includes('${1:param1}'), 'Should include placeholder for param1');
        assert.ok(snippet.value.includes('${2:param2}'), 'Should include placeholder for param2');
    });
    
    test('Should create snippet for template with mixed parameters', () => {
        const template = {
            name: 'test:mixed_template',
            parameters: ['required_param', 'optional_param'],
            requiredParameters: ['required_param'],
            optionalParameters: ['optional_param'],
            sourceFile: vscode.Uri.file('test.yml'),
            definitionPosition: new vscode.Position(0, 0)
        };
        
        const context = {
            mode: 'direct',
            baseIndent: ''
        };
        
        const snippet = createEnhancedSnippet(template, context);
        
        assert.ok(snippet, 'Should create snippet');
        assert.ok(snippet.value.includes('required_param'), 'Should include required parameter');
        assert.ok(snippet.value.includes('optional_param'), 'Should include optional parameter');
        assert.ok(snippet.value.includes('${1:required_param}'), 'Should include placeholder for required param');
        assert.ok(snippet.value.includes('${2:optional_param # optional}'), 'Should mark optional parameter');
    });
    
    test('Should create snippet for array mode', () => {
        const template = {
            name: 'test:array_template',
            parameters: ['param1'],
            requiredParameters: ['param1'],
            optionalParameters: [],
            sourceFile: vscode.Uri.file('test.yml'),
            definitionPosition: new vscode.Position(0, 0)
        };
        
        const context = {
            mode: 'array',
            baseIndent: ''
        };
        
        const snippet = createEnhancedSnippet(template, context);
        
        assert.ok(snippet, 'Should create snippet');
        assert.strictEqual(snippet.value, 'test:array_template', 'Should contain only template name in array mode');
    });
    
    test('Should create snippet for nested mode with proper indentation', () => {
        const template = {
            name: 'test:nested_template',
            parameters: ['param1'],
            requiredParameters: ['param1'],
            optionalParameters: [],
            sourceFile: vscode.Uri.file('test.yml'),
            definitionPosition: new vscode.Position(0, 0)
        };
        
        const context = {
            mode: 'nested',
            baseIndent: '  '
        };
        
        const snippet = createEnhancedSnippet(template, context);
        
        assert.ok(snippet, 'Should create snippet');
        assert.ok(snippet.value.includes('test:nested_template'), 'Should contain template name');
        assert.ok(snippet.value.includes('  arguments:'), 'Should include indented arguments section');
        assert.ok(snippet.value.includes('    param1:'), 'Should include properly indented parameter');
    });
    
    test('Should generate parameter suggestions for common parameter names', () => {
        const urlSuggestions = generateParameterSuggestions('url');
        assert.ok(urlSuggestions.length > 0, 'Should return suggestions for url parameter');
        assert.ok(urlSuggestions.some(s => s.includes('api')), 'Should include API-related suggestions for url');
        
        const materialSuggestions = generateParameterSuggestions('material');
        assert.ok(materialSuggestions.length > 0, 'Should return suggestions for material parameter');
        assert.ok(materialSuggestions.some(s => s.includes('minecraft:')), 'Should include Minecraft-related suggestions');
        
        const methodSuggestions = generateParameterSuggestions('method');
        assert.ok(methodSuggestions.length > 0, 'Should return suggestions for method parameter');
        assert.ok(methodSuggestions.includes('GET'), 'Should include GET method');
        assert.ok(methodSuggestions.includes('POST'), 'Should include POST method');
    });
    
    test('Should generate parameter suggestions for partial matches', () => {
        const suggestions = generateParameterSuggestions('block_type');
        assert.ok(suggestions.length > 0, 'Should return suggestions for partial matches');
        
        const pathSuggestions = generateParameterSuggestions('file_path');
        assert.ok(pathSuggestions.length > 0, 'Should return path-related suggestions for partial match');
    });
    
    test('Should provide default suggestions for unknown parameters', () => {
        const suggestions = generateParameterSuggestions('unknown_parameter');
        assert.ok(suggestions.length > 0, 'Should return default suggestions for unknown parameters');
        assert.ok(suggestions.includes('${value}'), 'Should include generic placeholder');
        assert.ok(suggestions.includes('placeholder'), 'Should include placeholder option');
    });
    
    test('Should handle case insensitive parameter matching', () => {
        const suggestions = generateParameterSuggestions('URL');
        assert.ok(suggestions.length > 0, 'Should handle uppercase parameter names');
        
        const materialSuggestions = generateParameterSuggestions('MATERIAL');
        assert.ok(materialSuggestions.length > 0, 'Should handle uppercase material parameter');
    });
    
    test('Should create snippet with proper tab stops ordering', () => {
        const template = {
            name: 'test:multi_param',
            parameters: ['first', 'second', 'third'],
            requiredParameters: ['first', 'second'],
            optionalParameters: ['third'],
            sourceFile: vscode.Uri.file('test.yml'),
            definitionPosition: new vscode.Position(0, 0)
        };
        
        const context = {
            mode: 'direct',
            baseIndent: ''
        };
        
        const snippet = createEnhancedSnippet(template, context);
        
        assert.ok(snippet, 'Should create snippet');
        assert.ok(snippet.value.includes('${1:first}'), 'Should have first tab stop');
        assert.ok(snippet.value.includes('${2:second}'), 'Should have second tab stop');
        assert.ok(snippet.value.includes('${3:third # optional}'), 'Should have third tab stop for optional param');
    });
    
    test('Should handle empty parameter arrays', () => {
        const template = {
            name: 'test:empty_params',
            parameters: [],
            requiredParameters: [],
            optionalParameters: [],
            sourceFile: vscode.Uri.file('test.yml'),
            definitionPosition: new vscode.Position(0, 0)
        };
        
        const context = {
            mode: 'direct',
            baseIndent: ''
        };
        
        const snippet = createEnhancedSnippet(template, context);
        
        assert.ok(snippet, 'Should create snippet');
        assert.strictEqual(snippet.value, 'test:empty_params', 'Should handle empty parameter arrays gracefully');
        assert.ok(!snippet.value.includes('arguments:'), 'Should not include arguments section for empty parameters');
    });
});
