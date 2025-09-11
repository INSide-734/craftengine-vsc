import * as assert from 'assert';
import { Uri } from 'vscode';
import { parseTemplates } from '../../core/TemplateParser';
import { TemplateUtils } from '../../utils';

suite('TemplateParser Unit Tests', () => {

    // 'test' 或 'it' 定义一个具体的测试用例
    test('Should parse a simple template without arguments', () => {
        const yamlContent = `
templates:
  namespace:sound/stone:
    # some properties
`;
        const fileUri = Uri.file('test.yaml');
        const result = parseTemplates(yamlContent, fileUri);

        // 断言：检查结果是否符合预期
        assert.strictEqual(result.length, 1, 'Should find exactly one template');
        assert.strictEqual(result[0].name, 'namespace:sound/stone', 'Template name should be correct');
        assert.deepStrictEqual(result[0].parameters, [], 'Should have no parameters');
        assert.deepStrictEqual(result[0].requiredParameters, [], 'Should have no required parameters');
        assert.deepStrictEqual(result[0].optionalParameters, [], 'Should have no optional parameters');
    });

    test('Should parse a template with arguments', () => {
        const yamlContent = `
templates:
  namespace:block/dynamic:
    type: \${block_type}
    hardness: \${hardness}
`;
        const fileUri = Uri.file('test.yaml');
        const result = parseTemplates(yamlContent, fileUri);

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].name, 'namespace:block/dynamic');
        // 使用 assert.deepStrictEqual 比较数组或对象
        assert.deepStrictEqual(result[0].parameters.sort(), ['block_type', 'hardness'].sort(), 'Parameters should be parsed correctly');
        assert.deepStrictEqual(result[0].requiredParameters.sort(), ['block_type', 'hardness'].sort(), 'All parameters should be required');
        assert.deepStrictEqual(result[0].optionalParameters, [], 'Should have no optional parameters');
    });

    test('Should not parse keys without a colon as templates', () => {
        const yamlContent = `
templates:
  settings_group:
    value: 123
  namespace:valid/template: {}
`;
        const fileUri = Uri.file('test.yaml');
        const result = parseTemplates(yamlContent, fileUri);

        assert.strictEqual(result.length, 1, 'Should only find the template with a colon');
        assert.strictEqual(result[0].name, 'namespace:valid/template');
    });

    test('Should handle invalid YAML content gracefully', () => {
        const yamlContent = `
templates:
  key: value: invalid
`;
        const fileUri = Uri.file('test.yaml');
        
        // 使用 TestLogger 抑制错误输出
        const { TestLogger } = require('../utils/TestLogger');
        const result = TestLogger.suppressOutput(() => {
            return parseTemplates(yamlContent, fileUri);
        });

        assert.strictEqual(result.length, 0, 'Should return an empty array for invalid YAML');
    });

    test('Should handle empty or no templates block', () => {
        const yamlContent = `
other_key:
  value: true
`;
        const fileUri = Uri.file('test.yaml');
        const result = parseTemplates(yamlContent, fileUri);

        assert.strictEqual(result.length, 0);
    });

    test('Should parse parameters with default values correctly', () => {
        const yamlContent = `
templates:
  namespace:template_with_defaults:
    nutrition: \${nutrition:-1}
    saturation: \${saturation:-2.5d}
    map: \${map:-{aa:bb,cc:ddd}}
    string: \${string:-"1234"}
`;
        const fileUri = Uri.file('test.yaml');
        const result = parseTemplates(yamlContent, fileUri);

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].name, 'namespace:template_with_defaults');
        // 应该只提取参数名，不包含默认值
        assert.deepStrictEqual(result[0].parameters.sort(), ['nutrition', 'saturation', 'map', 'string'].sort());
        // 所有参数都有默认值，所以都是可选的
        assert.deepStrictEqual(result[0].requiredParameters, [], 'All parameters have default values, so none are required');
        assert.deepStrictEqual(result[0].optionalParameters.sort(), ['nutrition', 'saturation', 'map', 'string'].sort(), 'All parameters should be optional');
    });

    test('Should parse mixed required and optional parameters correctly', () => {
        const yamlContent = `
templates:
  namespace:mixed_template:
    required_param: \${required_param}
    optional_param: \${optional_param:-default_value}
    another_required: \${another_required}
`;
        const fileUri = Uri.file('test.yaml');
        const result = parseTemplates(yamlContent, fileUri);

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].name, 'namespace:mixed_template');
        assert.deepStrictEqual(result[0].parameters.sort(), ['required_param', 'optional_param', 'another_required'].sort());
        assert.deepStrictEqual(result[0].requiredParameters.sort(), ['required_param', 'another_required'].sort());
        assert.deepStrictEqual(result[0].optionalParameters, ['optional_param']);
    });

    test('Should parse special parameters correctly', () => {
        const yamlContent = `
templates:
  namespace:template_with_special:
    item: \${__NAMESPACE__}:\${__ID__}
    item-name: "<lang:item.\${__NAMESPACE__}.\${__ID__}>"
`;
        const fileUri = Uri.file('test.yaml');
        const result = parseTemplates(yamlContent, fileUri);

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].name, 'namespace:template_with_special');
        // 特殊参数 __NAMESPACE__ 和 __ID__ 不应该被提取，因为它们会自动获取
        assert.deepStrictEqual(result[0].parameters, []);
        assert.deepStrictEqual(result[0].requiredParameters, []);
        assert.deepStrictEqual(result[0].optionalParameters, []);
    });

    // 测试修复后的模板位置查找功能
    test('Should find correct template definition position', () => {
        const testContent = `
items:
  default:topaz_helmet:
    template:
      - default:armor/topaz
    arguments:
      part: helmet
      slot: head
      material: topaz

templates:
  default:armor/topaz:
    material: chainmail_\${part}
    custom-model-data: 1000
`;

        const lines = testContent.split('\n');
        const position = TemplateUtils.findTemplatePosition(lines, 'default:armor/topaz');
        
        // 应该找到第11行（templates: 下面的 default:armor/topaz:）
        assert.ok(position, 'Should find template definition position');
        assert.strictEqual(position!.line, 11, 'Should find correct line number');
        assert.strictEqual(position!.character, 2, 'Should find correct character position');
    });
});