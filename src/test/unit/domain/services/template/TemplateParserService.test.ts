/**
 * TemplateParserService 单元测试
 *
 * 测试模板解析服务的所有功能，包括：
 * - 模板解析
 * - 参数提取
 * - 内容提取
 * - 位置查找
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemplateParserService } from '../../../../../domain/services/template/TemplateParserService';
import { ILogger } from '../../../../../core/interfaces/ILogger';
import { IConfiguration } from '../../../../../core/interfaces/IConfiguration';
import { Uri } from 'vscode';

describe('TemplateParserService', () => {
    let service: TemplateParserService;
    let mockLogger: ILogger;
    let mockConfiguration: IConfiguration;

    beforeEach(() => {
        mockLogger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            fatal: vi.fn(),
            createChild: vi.fn(() => mockLogger),
            setLevel: vi.fn(),
            getLevel: vi.fn(() => 0),
        } as unknown as ILogger;

        mockConfiguration = {
            get: vi.fn().mockReturnValue('templates')
        } as unknown as IConfiguration;

        service = new TemplateParserService(mockLogger, mockConfiguration);
    });

    // ========================================
    // parseTemplatesWithErrors 测试
    // ========================================

    describe('parseTemplatesWithErrors', () => {
        it('should parse simple template', () => {
            const yamlText = `templates:
  default:sword:
    name: Sword Template`;
            const sourceFile = Uri.file('/test/templates.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            expect(result.templates).toHaveLength(1);
            expect(result.templates[0].name).toBe('default:sword');
            expect(result.errors).toHaveLength(0);
        });

        it('should parse multiple templates', () => {
            const yamlText = `templates:
  default:sword:
    name: Sword
  default:axe:
    name: Axe
  default:bow:
    name: Bow`;
            const sourceFile = Uri.file('/test/templates.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            expect(result.templates).toHaveLength(3);
        });

        it('should parse templates with category format', () => {
            const yamlText = `templates#weapons#swords:
  default:diamond_sword:
    name: Diamond Sword`;
            const sourceFile = Uri.file('/test/templates.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            expect(result.templates).toHaveLength(1);
            expect(result.templates[0].name).toBe('default:diamond_sword');
        });

        it('should parse parameters from template content', () => {
            const yamlText = `templates:
  default:custom:
    name: \${itemName}
    description: \${description:-Default description}`;
            const sourceFile = Uri.file('/test/templates.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            expect(result.templates).toHaveLength(1);
            const template = result.templates[0];
            expect(template.parameters).toHaveLength(2);

            const nameParam = template.parameters.find(p => p.name === 'itemName');
            expect(nameParam).toBeDefined();
            expect(nameParam?.required).toBe(true);

            const descParam = template.parameters.find(p => p.name === 'description');
            expect(descParam).toBeDefined();
            expect(descParam?.required).toBe(false);
            expect(descParam?.defaultValue).toBe('Default description');
        });

        it('should skip special parameters', () => {
            const yamlText = `templates:
  default:item:
    namespace: \${__NAMESPACE__}
    id: \${__ID__}
    custom: \${customParam}`;
            const sourceFile = Uri.file('/test/templates.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            expect(result.templates).toHaveLength(1);
            // 应该只有 customParam，跳过 __NAMESPACE__ 和 __ID__
            expect(result.templates[0].parameters).toHaveLength(1);
            expect(result.templates[0].parameters[0].name).toBe('customParam');
        });

        it('should return empty result for empty text', () => {
            const result = service.parseTemplatesWithErrors('', Uri.file('/test.yaml'));

            expect(result.templates).toHaveLength(0);
            expect(result.errors).toHaveLength(0);
        });

        it('should return empty result for null text', () => {
            const result = service.parseTemplatesWithErrors(null as any, Uri.file('/test.yaml'));

            expect(result.templates).toHaveLength(0);
            expect(result.errors).toHaveLength(0);
        });

        it('should return empty result for non-string text', () => {
            const result = service.parseTemplatesWithErrors(123 as any, Uri.file('/test.yaml'));

            expect(result.templates).toHaveLength(0);
        });

        it('should skip non-template keys', () => {
            const yamlText = `items:
  my-item:
    name: My Item
templates:
  default:sword:
    name: Sword`;
            const sourceFile = Uri.file('/test/config.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            expect(result.templates).toHaveLength(1);
            expect(result.templates[0].name).toBe('default:sword');
        });

        it('should skip template names without colon', () => {
            const yamlText = `templates:
  invalid-template:
    name: Invalid
  valid:template:
    name: Valid`;
            const sourceFile = Uri.file('/test/templates.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            expect(result.templates).toHaveLength(1);
            expect(result.templates[0].name).toBe('valid:template');
        });

        it('should collect YAML parsing errors', () => {
            const invalidYaml = `templates:
  - invalid
  yaml: [structure`;
            const sourceFile = Uri.file('/test/templates.yaml');

            const result = service.parseTemplatesWithErrors(invalidYaml, sourceFile);

            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0].severity).toBe('error');
        });

        it('should handle nested parameter extraction', () => {
            const yamlText = `templates:
  default:complex:
    settings:
      display:
        name: \${displayName}
        color: \${color:-red}
    items:
      - id: \${itemId}`;
            const sourceFile = Uri.file('/test/templates.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            expect(result.templates).toHaveLength(1);
            const params = result.templates[0].parameters;
            expect(params.map(p => p.name)).toContain('displayName');
            expect(params.map(p => p.name)).toContain('color');
            expect(params.map(p => p.name)).toContain('itemId');
        });

        it('should exclude metadata keys from content', () => {
            const yamlText = `templates:
  default:item:
    template: some-template
    arguments:
      key: value
    name: Item Name`;
            const sourceFile = Uri.file('/test/templates.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            expect(result.templates).toHaveLength(1);
            const content = result.templates[0].content;
            expect(content).not.toHaveProperty('template');
            expect(content).not.toHaveProperty('arguments');
            expect(content).toHaveProperty('name');
        });

        it('should handle empty templates object', () => {
            const yamlText = `templates:`;
            const sourceFile = Uri.file('/test/templates.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            expect(result.templates).toHaveLength(0);
            expect(result.errors).toHaveLength(0);
        });

        it('should handle array templates gracefully', () => {
            const yamlText = `templates:
  - item1
  - item2`;
            const sourceFile = Uri.file('/test/templates.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            expect(result.templates).toHaveLength(0);
        });
    });

    // ========================================
    // 参数解析测试
    // ========================================

    describe('parameter parsing', () => {
        it('should parse required parameter', () => {
            const yamlText = `templates:
  default:test:
    name: \${requiredParam}`;
            const sourceFile = Uri.file('/test.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            const param = result.templates[0].parameters[0];
            expect(param.required).toBe(true);
            expect(param.defaultValue).toBeUndefined();
        });

        it('should parse optional parameter with default', () => {
            const yamlText = `templates:
  default:test:
    name: \${optionalParam:-defaultValue}`;
            const sourceFile = Uri.file('/test.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            const param = result.templates[0].parameters[0];
            expect(param.required).toBe(false);
            expect(param.defaultValue).toBe('defaultValue');
        });

        it('should parse parameter with empty default', () => {
            const yamlText = `templates:
  default:test:
    name: \${param:-}`;
            const sourceFile = Uri.file('/test.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            const param = result.templates[0].parameters[0];
            expect(param.required).toBe(false);
            expect(param.defaultValue).toBe('');
        });

        it('should not duplicate parameters', () => {
            const yamlText = `templates:
  default:test:
    name: \${param}
    title: \${param}`;
            const sourceFile = Uri.file('/test.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            expect(result.templates[0].parameters).toHaveLength(1);
        });

        it('should handle parameters in arrays', () => {
            const yamlText = `templates:
  default:test:
    lore:
      - \${line1}
      - \${line2}`;
            const sourceFile = Uri.file('/test.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            expect(result.templates[0].parameters).toHaveLength(2);
        });
    });

    // ========================================
    // 位置查找测试
    // ========================================

    describe('position finding', () => {
        it('should find template position', () => {
            const yamlText = `templates:
  default:sword:
    name: Sword`;
            const sourceFile = Uri.file('/test.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            expect(result.templates).toHaveLength(1);
            const position = result.templates[0].definitionPosition;
            expect(position).toBeDefined();
            expect(position?.line).toBe(1);
        });

        it('should handle template not found in lines', () => {
            // 这种情况不太可能发生，但测试边界情况
            const yamlText = `templates:
  default:sword:
    name: Sword`;
            const sourceFile = Uri.file('/test.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            // 即使找不到，也应该返回 Position(0, 0)
            expect(result.templates[0].definitionPosition).toBeDefined();
        });
    });

    // ========================================
    // 配置测试
    // ========================================

    describe('configuration', () => {
        it('should use custom template key from configuration', () => {
            vi.mocked(mockConfiguration.get).mockReturnValue('customTemplates');

            const yamlText = `customTemplates:
  default:item:
    name: Item`;
            const sourceFile = Uri.file('/test.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            expect(result.templates).toHaveLength(1);
        });

        it('should work without configuration', () => {
            const serviceWithoutConfig = new TemplateParserService(mockLogger);

            const yamlText = `templates:
  default:item:
    name: Item`;
            const sourceFile = Uri.file('/test.yaml');

            const result = serviceWithoutConfig.parseTemplatesWithErrors(yamlText, sourceFile);

            expect(result.templates).toHaveLength(1);
        });
    });

    // ========================================
    // 边缘情况测试
    // ========================================

    describe('edge cases', () => {
        it('should handle special characters in template name', () => {
            const yamlText = `templates:
  mypack:model/cube_all:
    parent: minecraft:block/cube_all`;
            const sourceFile = Uri.file('/test.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            expect(result.templates).toHaveLength(1);
            expect(result.templates[0].name).toBe('mypack:model/cube_all');
        });

        it('should handle deeply nested content', () => {
            const yamlText = `templates:
  default:complex:
    level1:
      level2:
        level3:
          level4:
            value: test`;
            const sourceFile = Uri.file('/test.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            expect(result.templates).toHaveLength(1);
            expect(result.templates[0].content).toHaveProperty('level1');
        });

        it('should handle primitive template definition', () => {
            // 这种情况下 definition 是原始值而不是对象
            const yamlText = `templates:
  default:simple: value`;
            const sourceFile = Uri.file('/test.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);

            // 原始值定义不会生成有效模板
            expect(result.templates.length).toBeLessThanOrEqual(1);
        });

        it('should deep freeze content to prevent mutations', () => {
            const yamlText = `templates:
  default:test:
    nested:
      value: original`;
            const sourceFile = Uri.file('/test.yaml');

            const result = service.parseTemplatesWithErrors(yamlText, sourceFile);
            const content = result.templates[0].content as any;

            // deepFreeze 使嵌套对象不可变，赋值应抛出 TypeError
            expect(() => {
                content.nested.value = 'modified';
            }).toThrow(TypeError);

            // 原始值保持不变
            expect(content.nested.value).toBe('original');
        });
    });
});
