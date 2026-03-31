import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaTransformer } from '../../../../../infrastructure/schema/helpers/SchemaTransformer';
import { type JSONSchema7 } from 'json-schema';

describe('SchemaTransformer', () => {
    let transformer: SchemaTransformer;

    beforeEach(() => {
        transformer = new SchemaTransformer();
    });

    describe('prepareSchema', () => {
        it('should deep clone schema without mutating original', () => {
            const original: JSONSchema7 = {
                type: 'object',
                properties: { name: { type: 'string' } },
            };
            const originalStr = JSON.stringify(original);

            transformer.prepareSchema(original, 'strict');

            expect(JSON.stringify(original)).toBe(originalStr);
        });

        it('should set additionalProperties=true for loose level', () => {
            const schema: JSONSchema7 = {
                type: 'object',
                properties: { name: { type: 'string' } },
            };

            const result = transformer.prepareSchema(schema, 'loose');

            expect(result.additionalProperties).toBe(true);
        });

        it('should set additionalProperties=false for strict level', () => {
            const schema: JSONSchema7 = {
                type: 'object',
                properties: { name: { type: 'string' } },
            };

            const result = transformer.prepareSchema(schema, 'strict');

            expect(result.additionalProperties).toBe(false);
        });

        it('should not modify additionalProperties for off level', () => {
            const schema: JSONSchema7 = {
                type: 'object',
                properties: { name: { type: 'string' } },
            };

            const result = transformer.prepareSchema(schema, 'off');

            expect(result.additionalProperties).toBeUndefined();
        });

        it('should not override existing additionalProperties', () => {
            const schema: JSONSchema7 = {
                type: 'object',
                properties: { name: { type: 'string' } },
                additionalProperties: true,
            };

            const result = transformer.prepareSchema(schema, 'strict');

            // 已有 additionalProperties 不应被覆盖
            expect(result.additionalProperties).toBe(true);
        });
    });

    describe('expandVersionConditionSupport', () => {
        it('should expand properties when x-supports-version-condition is true', () => {
            const schema = {
                type: 'object',
                'x-supports-version-condition': true,
                properties: {
                    name: { type: 'string', description: 'Name field' },
                },
            } as unknown as JSONSchema7;

            transformer.expandVersionConditionSupport(schema as never);

            const nameProp = (schema as Record<string, unknown>).properties as Record<string, unknown>;
            const nameSchema = nameProp.name as Record<string, unknown>;
            // 应该被展开为 oneOf
            expect(nameSchema.oneOf).toBeDefined();
            expect(nameSchema.description).toBe('Name field');
        });

        it('should not expand when x-supports-version-condition is absent', () => {
            const schema = {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                },
            } as unknown as JSONSchema7;

            transformer.expandVersionConditionSupport(schema as never);

            const nameProp = (schema as Record<string, unknown>).properties as Record<string, unknown>;
            const nameSchema = nameProp.name as Record<string, unknown>;
            expect(nameSchema.oneOf).toBeUndefined();
            expect(nameSchema.type).toBe('string');
        });

        it('should skip properties that already have oneOf', () => {
            const schema = {
                type: 'object',
                'x-supports-version-condition': true,
                properties: {
                    name: { oneOf: [{ type: 'string' }, { type: 'number' }] },
                },
            } as unknown as JSONSchema7;

            transformer.expandVersionConditionSupport(schema as never);

            const nameProp = (schema as Record<string, unknown>).properties as Record<string, unknown>;
            const nameSchema = nameProp.name as Record<string, unknown>;
            // 应保持原样
            expect((nameSchema.oneOf as unknown[]).length).toBe(2);
        });

        it('should recursively process nested schemas', () => {
            const schema = {
                type: 'object',
                properties: {
                    nested: {
                        type: 'object',
                        'x-supports-version-condition': true,
                        properties: {
                            value: { type: 'number' },
                        },
                    },
                },
            } as unknown as JSONSchema7;

            transformer.expandVersionConditionSupport(schema as never);

            const props = (schema as Record<string, unknown>).properties as Record<string, unknown>;
            const nested = props.nested as Record<string, unknown>;
            const nestedProps = nested.properties as Record<string, unknown>;
            const valueSchema = nestedProps.value as Record<string, unknown>;
            expect(valueSchema.oneOf).toBeDefined();
        });

        it('should handle null/undefined schema gracefully', () => {
            expect(() => transformer.expandVersionConditionSupport(null as never)).not.toThrow();
            expect(() => transformer.expandVersionConditionSupport(undefined as never)).not.toThrow();
        });

        it('should process allOf/anyOf/oneOf arrays', () => {
            const schema = {
                allOf: [
                    {
                        type: 'object',
                        'x-supports-version-condition': true,
                        properties: {
                            field: { type: 'string' },
                        },
                    },
                ],
            } as unknown as JSONSchema7;

            transformer.expandVersionConditionSupport(schema as never);

            const allOf = (schema as Record<string, unknown>).allOf as Record<string, unknown>[];
            const props = allOf[0].properties as Record<string, unknown>;
            const fieldSchema = props.field as Record<string, unknown>;
            expect(fieldSchema.oneOf).toBeDefined();
        });
    });
});
