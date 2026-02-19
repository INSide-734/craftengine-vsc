/**
 * Template 实体单元测试
 * 
 * 测试 Template 领域实体的所有功能，包括：
 * - 构造和验证
 * - 参数查询
 * - 参数验证
 * - 使用记录
 * - 不可变性
 * - 序列化/反序列化
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Template } from '../../../../domain/entities/Template';
import { Uri, Position } from 'vscode';
import { ITemplateParameter } from '../../../../core/interfaces/ITemplate';

describe('Template', () => {
    // 测试数据
    const createTestUri = () => Uri.file('/test/templates.yaml');
    const createTestPosition = () => new Position(10, 0);
    
    const createBasicTemplateData = () => ({
        id: 'tpl-001',
        name: 'test-template',
        parameters: [
            { name: 'userId', required: true, type: 'string' },
            { name: 'role', required: false, defaultValue: 'user', type: 'string' },
        ] as ITemplateParameter[],
        sourceFile: createTestUri(),
        definitionPosition: createTestPosition(),
    });

    describe('constructor', () => {
        it('should create a valid template with required properties', () => {
            const data = createBasicTemplateData();
            const template = new Template(data);

            expect(template.id).toBe('tpl-001');
            expect(template.name).toBe('test-template');
            expect(template.parameters).toHaveLength(2);
            expect(template.sourceFile).toBeDefined();
            expect(template.definitionPosition).toBeDefined();
        });

        it('should set default values for optional properties', () => {
            const data = createBasicTemplateData();
            const template = new Template(data);

            expect(template.createdAt).toBeInstanceOf(Date);
            expect(template.updatedAt).toBeInstanceOf(Date);
            expect(template.usageCount).toBe(0);
            expect(template.lastUsedAt).toBeUndefined();
            expect(template.content).toEqual({});
        });

        it('should use provided optional values', () => {
            const createdAt = new Date('2024-01-01');
            const updatedAt = new Date('2024-06-01');
            const lastUsedAt = new Date('2024-05-01');
            const content = { key: 'value' };

            const template = new Template({
                ...createBasicTemplateData(),
                createdAt,
                updatedAt,
                usageCount: 10,
                lastUsedAt,
                content,
            });

            expect(template.createdAt).toEqual(createdAt);
            expect(template.updatedAt).toEqual(updatedAt);
            expect(template.usageCount).toBe(10);
            expect(template.lastUsedAt).toEqual(lastUsedAt);
            expect(template.content).toEqual(content);
        });

        it('should freeze parameters array', () => {
            const data = createBasicTemplateData();
            const template = new Template(data);

            expect(Object.isFrozen(template.parameters)).toBe(true);
        });

        it('should freeze content object', () => {
            const template = new Template({
                ...createBasicTemplateData(),
                content: { key: 'value' },
            });

            expect(Object.isFrozen(template.content)).toBe(true);
        });
    });

    describe('validation', () => {
        it('should throw error when ID is empty', () => {
            expect(() => new Template({
                ...createBasicTemplateData(),
                id: '',
            })).toThrow(/ID cannot be empty/);
        });

        it('should throw error when ID is only whitespace', () => {
            expect(() => new Template({
                ...createBasicTemplateData(),
                id: '   ',
            })).toThrow(/ID cannot be empty/);
        });

        it('should throw error when name is empty', () => {
            expect(() => new Template({
                ...createBasicTemplateData(),
                name: '',
            })).toThrow(/name cannot be empty/);
        });

        it('should throw error when name is only whitespace', () => {
            expect(() => new Template({
                ...createBasicTemplateData(),
                name: '   ',
            })).toThrow(/name cannot be empty/);
        });

        it('should throw error when parameter name is empty', () => {
            expect(() => new Template({
                ...createBasicTemplateData(),
                parameters: [{ name: '', required: true }],
            })).toThrow(/invalid name/);
        });

        it('should throw error when parameter name is duplicate', () => {
            expect(() => new Template({
                ...createBasicTemplateData(),
                parameters: [
                    { name: 'userId', required: true },
                    { name: 'userId', required: false },
                ],
            })).toThrow(/duplicate parameter name/);
        });

        it('should throw error when parameter is not an object', () => {
            expect(() => new Template({
                ...createBasicTemplateData(),
                parameters: [null as any],
            })).toThrow(/must be an object/);
        });

        it('should throw error when parameter name is not a string', () => {
            expect(() => new Template({
                ...createBasicTemplateData(),
                parameters: [{ name: 123 as any, required: true }],
            })).toThrow(/invalid name type/);
        });
    });

    describe('getRequiredParameters', () => {
        it('should return only required parameters', () => {
            const template = new Template(createBasicTemplateData());
            const requiredParams = template.getRequiredParameters();

            expect(requiredParams).toHaveLength(1);
            expect(requiredParams[0].name).toBe('userId');
            expect(requiredParams[0].required).toBe(true);
        });

        it('should return empty array when no required parameters', () => {
            const template = new Template({
                ...createBasicTemplateData(),
                parameters: [
                    { name: 'optional1', required: false },
                    { name: 'optional2', required: false },
                ],
            });

            expect(template.getRequiredParameters()).toHaveLength(0);
        });

        it('should return readonly array', () => {
            const template = new Template(createBasicTemplateData());
            const requiredParams = template.getRequiredParameters();

            // 验证返回的是只读数组（不能直接测试 readonly，但可以确保返回新数组）
            expect(Array.isArray(requiredParams)).toBe(true);
        });
    });

    describe('getOptionalParameters', () => {
        it('should return only optional parameters', () => {
            const template = new Template(createBasicTemplateData());
            const optionalParams = template.getOptionalParameters();

            expect(optionalParams).toHaveLength(1);
            expect(optionalParams[0].name).toBe('role');
            expect(optionalParams[0].required).toBe(false);
        });

        it('should return empty array when no optional parameters', () => {
            const template = new Template({
                ...createBasicTemplateData(),
                parameters: [
                    { name: 'required1', required: true },
                    { name: 'required2', required: true },
                ],
            });

            expect(template.getOptionalParameters()).toHaveLength(0);
        });
    });

    describe('hasParameter', () => {
        let template: Template;

        beforeEach(() => {
            template = new Template(createBasicTemplateData());
        });

        it('should return true for existing parameter', () => {
            expect(template.hasParameter('userId')).toBe(true);
            expect(template.hasParameter('role')).toBe(true);
        });

        it('should return false for non-existing parameter', () => {
            expect(template.hasParameter('nonExistent')).toBe(false);
        });

        it('should be case-sensitive', () => {
            expect(template.hasParameter('UserId')).toBe(false);
            expect(template.hasParameter('ROLE')).toBe(false);
        });
    });

    describe('getParameter', () => {
        let template: Template;

        beforeEach(() => {
            template = new Template(createBasicTemplateData());
        });

        it('should return parameter for existing name', () => {
            const param = template.getParameter('userId');

            expect(param).toBeDefined();
            expect(param?.name).toBe('userId');
            expect(param?.required).toBe(true);
            expect(param?.type).toBe('string');
        });

        it('should return undefined for non-existing name', () => {
            expect(template.getParameter('nonExistent')).toBeUndefined();
        });

        it('should return parameter with default value', () => {
            const param = template.getParameter('role');

            expect(param).toBeDefined();
            expect(param?.defaultValue).toBe('user');
        });
    });

    describe('validateParameters', () => {
        let template: Template;

        beforeEach(() => {
            template = new Template(createBasicTemplateData());
        });

        it('should return valid result when all required parameters provided', () => {
            const result = template.validateParameters({
                userId: 'user-123',
            });

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should return valid result with extra parameters', () => {
            const result = template.validateParameters({
                userId: 'user-123',
                extraParam: 'extra-value',
            });

            expect(result.isValid).toBe(true);
        });

        it('should return invalid result when missing required parameter', () => {
            const result = template.validateParameters({});

            expect(result.isValid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].parameter).toBe('userId');
            expect(result.errors[0].type).toBe('missing');
            expect(result.errors[0].message).toContain('Missing required parameter');
        });

        it('should return multiple errors for multiple missing parameters', () => {
            const template = new Template({
                ...createBasicTemplateData(),
                parameters: [
                    { name: 'param1', required: true },
                    { name: 'param2', required: true },
                    { name: 'param3', required: true },
                ],
            });

            const result = template.validateParameters({});

            expect(result.isValid).toBe(false);
            expect(result.errors).toHaveLength(3);
        });

        it('should have empty warnings array', () => {
            const result = template.validateParameters({ userId: 'test' });

            expect(result.warnings).toEqual([]);
        });
    });

    describe('recordUsage', () => {
        it('should return new instance with incremented usage count', () => {
            const template = new Template(createBasicTemplateData());
            const newTemplate = template.recordUsage();

            expect(newTemplate).not.toBe(template);
            expect(newTemplate.usageCount).toBe(1);
            expect(template.usageCount).toBe(0); // 原实例不变
        });

        it('should update lastUsedAt', () => {
            const template = new Template(createBasicTemplateData());
            const before = new Date();
            const newTemplate = template.recordUsage();
            const after = new Date();

            expect(newTemplate.lastUsedAt).toBeDefined();
            expect(newTemplate.lastUsedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(newTemplate.lastUsedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
        });

        it('should preserve other properties', () => {
            const template = new Template(createBasicTemplateData());
            const newTemplate = template.recordUsage();

            expect(newTemplate.id).toBe(template.id);
            expect(newTemplate.name).toBe(template.name);
            expect(newTemplate.parameters).toEqual(template.parameters);
            expect(newTemplate.sourceFile.toString()).toBe(template.sourceFile.toString());
        });

        it('should accumulate usage count', () => {
            let template = new Template(createBasicTemplateData());
            
            template = template.recordUsage();
            template = template.recordUsage();
            template = template.recordUsage();

            expect(template.usageCount).toBe(3);
        });
    });

    describe('update', () => {
        it('should return new instance with updated parameters', () => {
            const template = new Template(createBasicTemplateData());
            const newParams = [{ name: 'newParam', required: true }];
            const newTemplate = template.update({ parameters: newParams });

            expect(newTemplate).not.toBe(template);
            expect(newTemplate.parameters).toEqual(newParams);
            expect(template.parameters).not.toEqual(newParams); // 原实例不变
        });

        it('should update definitionPosition', () => {
            const template = new Template(createBasicTemplateData());
            const newPosition = new Position(20, 5);
            const newTemplate = template.update({ definitionPosition: newPosition });

            expect(newTemplate.definitionPosition).toEqual(newPosition);
        });

        it('should update content', () => {
            const template = new Template(createBasicTemplateData());
            const newContent = { newKey: 'newValue' };
            const newTemplate = template.update({ content: newContent });

            expect(newTemplate.content).toEqual(newContent);
        });

        it('should update updatedAt', () => {
            const template = new Template(createBasicTemplateData());
            const before = new Date();
            const newTemplate = template.update({ content: {} });
            const after = new Date();

            expect(newTemplate.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(newTemplate.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
        });

        it('should preserve unchanged properties', () => {
            const template = new Template(createBasicTemplateData());
            const newTemplate = template.update({ content: { key: 'value' } });

            expect(newTemplate.id).toBe(template.id);
            expect(newTemplate.name).toBe(template.name);
            expect(newTemplate.usageCount).toBe(template.usageCount);
            expect(newTemplate.createdAt).toEqual(template.createdAt);
        });
    });

    describe('equals', () => {
        it('should return true for equal templates', () => {
            const data = createBasicTemplateData();
            const template1 = new Template(data);
            const template2 = new Template(data);

            expect(template1.equals(template2)).toBe(true);
        });

        it('should return false for different IDs', () => {
            const data = createBasicTemplateData();
            const template1 = new Template(data);
            const template2 = new Template({ ...data, id: 'different-id' });

            expect(template1.equals(template2)).toBe(false);
        });

        it('should return false for different names', () => {
            const data = createBasicTemplateData();
            const template1 = new Template(data);
            const template2 = new Template({ ...data, name: 'different-name' });

            expect(template1.equals(template2)).toBe(false);
        });

        it('should return false for different parameters', () => {
            const data = createBasicTemplateData();
            const template1 = new Template(data);
            const template2 = new Template({
                ...data,
                parameters: [{ name: 'different', required: true }],
            });

            expect(template1.equals(template2)).toBe(false);
        });

        it('should return false for different parameter count', () => {
            const data = createBasicTemplateData();
            const template1 = new Template(data);
            const template2 = new Template({
                ...data,
                parameters: [...data.parameters, { name: 'extra', required: false }],
            });

            expect(template1.equals(template2)).toBe(false);
        });
    });

    describe('getHashCode', () => {
        it('should return consistent hash for same template', () => {
            const data = createBasicTemplateData();
            const template = new Template(data);
            
            const hash1 = template.getHashCode();
            const hash2 = template.getHashCode();

            expect(hash1).toBe(hash2);
        });

        it('should include template name in hash', () => {
            const template = new Template(createBasicTemplateData());
            const hash = template.getHashCode();

            expect(hash).toContain('test-template');
        });

        it('should include parameter info in hash', () => {
            const template = new Template(createBasicTemplateData());
            const hash = template.getHashCode();

            expect(hash).toContain('userId');
            expect(hash).toContain('role');
        });

        it('should return different hash for different templates', () => {
            const data = createBasicTemplateData();
            const template1 = new Template(data);
            const template2 = new Template({ ...data, name: 'other-template' });

            expect(template1.getHashCode()).not.toBe(template2.getHashCode());
        });
    });

    describe('toJSON', () => {
        it('should return serializable object', () => {
            const template = new Template(createBasicTemplateData());
            const json = template.toJSON();

            expect(typeof json).toBe('object');
            expect(json.id).toBe('tpl-001');
            expect(json.name).toBe('test-template');
        });

        it('should convert dates to ISO strings', () => {
            const template = new Template(createBasicTemplateData());
            const json = template.toJSON();

            expect(typeof json.createdAt).toBe('string');
            expect(typeof json.updatedAt).toBe('string');
        });

        it('should convert Uri to string', () => {
            const template = new Template(createBasicTemplateData());
            const json = template.toJSON();

            expect(typeof json.sourceFile).toBe('string');
        });

        it('should be JSON serializable', () => {
            const template = new Template(createBasicTemplateData());
            const jsonString = JSON.stringify(template.toJSON());
            const parsed = JSON.parse(jsonString);

            expect(parsed.id).toBe('tpl-001');
            expect(parsed.name).toBe('test-template');
        });
    });

    describe('fromJSON', () => {
        it('should create template from JSON data', () => {
            const original = new Template(createBasicTemplateData());
            const json = original.toJSON();
            const restored = Template.fromJSON(json);

            expect(restored.id).toBe(original.id);
            expect(restored.name).toBe(original.name);
            expect(restored.parameters).toEqual(original.parameters);
        });

        it('should restore dates correctly', () => {
            const original = new Template(createBasicTemplateData());
            const json = original.toJSON();
            const restored = Template.fromJSON(json);

            expect(restored.createdAt).toBeInstanceOf(Date);
            expect(restored.updatedAt).toBeInstanceOf(Date);
        });

        it('should restore Uri correctly', () => {
            const original = new Template(createBasicTemplateData());
            const json = original.toJSON();
            const restored = Template.fromJSON(json);

            expect(restored.sourceFile).toBeInstanceOf(Uri);
        });

        it('should handle optional lastUsedAt', () => {
            const json = {
                id: 'tpl-001',
                name: 'test',
                parameters: [],
                sourceFile: 'file:///test.yaml',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            const template = Template.fromJSON(json);

            expect(template.lastUsedAt).toBeUndefined();
        });

        it('should handle optional definitionPosition', () => {
            const json = {
                id: 'tpl-001',
                name: 'test',
                parameters: [],
                sourceFile: 'file:///test.yaml',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            const template = Template.fromJSON(json);

            expect(template.definitionPosition).toBeUndefined();
        });

        it('should restore definitionPosition correctly', () => {
            const original = new Template(createBasicTemplateData());
            const json = original.toJSON();
            const restored = Template.fromJSON(json);

            expect(restored.definitionPosition).toBeInstanceOf(Position);
            expect(restored.definitionPosition?.line).toBe(10);
            expect(restored.definitionPosition?.character).toBe(0);
        });
    });

    describe('createSafe', () => {
        it('should return success result for valid data', () => {
            const data = createBasicTemplateData();
            const result = Template.createSafe(data);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.template).toBeInstanceOf(Template);
                expect(result.template.name).toBe('test-template');
            }
        });

        it('should return error result for invalid data', () => {
            const data = { ...createBasicTemplateData(), id: '' };
            const result = Template.createSafe(data);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('ID cannot be empty');
            }
        });

        it('should not throw exception for invalid data', () => {
            const data = { ...createBasicTemplateData(), name: '' };
            
            expect(() => Template.createSafe(data)).not.toThrow();
        });

        it('should capture all validation errors', () => {
            const data = {
                ...createBasicTemplateData(),
                parameters: [{ name: '', required: true }],
            };
            const result = Template.createSafe(data);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('invalid name');
            }
        });
    });

    describe('immutability', () => {
        it('should not allow modification of parameters array', () => {
            const template = new Template(createBasicTemplateData());

            // 尝试修改参数数组（应该不起作用或抛出错误）
            expect(() => {
                (template.parameters as any).push({ name: 'new', required: false });
            }).toThrow();
        });

        it('should not allow modification of content object', () => {
            const template = new Template({
                ...createBasicTemplateData(),
                content: { key: 'value' },
            });

            // 尝试修改内容对象
            expect(() => {
                (template.content as any).key = 'modified';
            }).toThrow();
        });

        it('should deep freeze nested content objects', () => {
            const template = new Template({
                ...createBasicTemplateData(),
                content: { nested: { deep: 'value' } },
            });

            // 尝试修改嵌套对象
            expect(() => {
                (template.content as any).nested.deep = 'modified';
            }).toThrow();
        });

        it('should deep freeze parameter objects', () => {
            const template = new Template(createBasicTemplateData());

            // 尝试修改参数对象的属性
            expect(() => {
                (template.parameters[0] as any).name = 'modified';
            }).toThrow();
        });
    });
});

