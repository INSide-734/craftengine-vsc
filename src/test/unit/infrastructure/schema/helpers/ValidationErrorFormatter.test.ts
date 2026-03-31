import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ValidationErrorFormatter } from '../../../../../infrastructure/schema/helpers/ValidationErrorFormatter';
import { ValidationLevel } from '../../../../../infrastructure/schema/SchemaValidator';
import { type ILogger } from '../../../../../core/interfaces/ILogger';
import { type ErrorObject } from 'ajv';

describe('ValidationErrorFormatter', () => {
    let formatter: ValidationErrorFormatter;
    let mockLogger: ILogger;

    beforeEach(() => {
        mockLogger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            fatal: vi.fn(),
            createChild: vi.fn(() => mockLogger),
        } as unknown as ILogger;

        formatter = new ValidationErrorFormatter(mockLogger);
    });

    const createError = (overrides: Partial<ErrorObject>): ErrorObject =>
        ({
            keyword: 'type',
            instancePath: '/test',
            schemaPath: '#/properties/test/type',
            params: {},
            message: 'test error',
            ...overrides,
        }) as ErrorObject;

    describe('processErrors', () => {
        it('should format required errors', () => {
            const errors = [
                createError({
                    keyword: 'required',
                    instancePath: '/config',
                    params: { missingProperty: 'name' },
                }),
            ];

            const result = formatter.processErrors(errors, ValidationLevel.Strict);

            expect(result).toHaveLength(1);
            expect(result[0].message).toContain('Missing required field');
            expect(result[0].message).toContain('name');
            expect(result[0].severity).toBe('error');
        });

        it('should format type errors', () => {
            const errors = [
                createError({
                    keyword: 'type',
                    params: { type: 'string' },
                }),
            ];

            const result = formatter.processErrors(errors, ValidationLevel.Strict);

            expect(result).toHaveLength(1);
            expect(result[0].message).toContain('Type mismatch');
        });

        it('should format enum errors with few values', () => {
            const errors = [
                createError({
                    keyword: 'enum',
                    params: { allowedValues: ['a', 'b', 'c'] },
                }),
            ];

            const result = formatter.processErrors(errors, ValidationLevel.Strict);

            expect(result[0].message).toContain('Allowed');
        });

        it('should format enum errors with many values', () => {
            const errors = [
                createError({
                    keyword: 'enum',
                    params: { allowedValues: ['a', 'b', 'c', 'd'] },
                }),
            ];

            const result = formatter.processErrors(errors, ValidationLevel.Strict);

            expect(result[0].message).toContain('4 allowed values');
        });

        it('should format additionalProperties errors', () => {
            const errors = [
                createError({
                    keyword: 'additionalProperties',
                    params: { additionalProperty: 'unknownField' },
                }),
            ];

            const result = formatter.processErrors(errors, ValidationLevel.Strict);

            expect(result[0].message).toContain('Unknown property');
            expect(result[0].message).toContain('unknownField');
        });

        it('should deduplicate identical errors', () => {
            const errors = [
                createError({ keyword: 'required', instancePath: '/a', params: { missingProperty: 'x' } }),
                createError({ keyword: 'required', instancePath: '/a', params: { missingProperty: 'x' } }),
            ];

            const result = formatter.processErrors(errors, ValidationLevel.Strict);

            expect(result).toHaveLength(1);
        });

        it('should keep different errors at same path', () => {
            const errors = [
                createError({ keyword: 'required', instancePath: '/a', params: { missingProperty: 'x' } }),
                createError({ keyword: 'required', instancePath: '/a', params: { missingProperty: 'y' } }),
            ];

            const result = formatter.processErrors(errors, ValidationLevel.Strict);

            expect(result).toHaveLength(2);
        });

        it('should set warning severity for additionalProperties in loose mode', () => {
            const errors = [
                createError({
                    keyword: 'additionalProperties',
                    params: { additionalProperty: 'extra' },
                }),
            ];

            const result = formatter.processErrors(errors, ValidationLevel.Loose);

            expect(result[0].severity).toBe('warning');
        });

        it('should provide suggestions for required errors', () => {
            const errors = [
                createError({
                    keyword: 'required',
                    params: { missingProperty: 'name' },
                }),
            ];

            const result = formatter.processErrors(errors, ValidationLevel.Strict);

            expect(result[0].suggestion).toContain('name');
        });

        it('should filter version condition oneOf type errors', () => {
            const errors = [
                createError({
                    keyword: 'type',
                    schemaPath: '#/properties/field/oneOf/1/type',
                    params: { type: 'object' },
                }),
            ];

            const result = formatter.processErrors(errors, ValidationLevel.Strict);

            expect(result).toHaveLength(0);
        });

        it('should format minLength/maxLength errors', () => {
            const minErr = [createError({ keyword: 'minLength', params: { limit: 3 } })];
            const maxErr = [createError({ keyword: 'maxLength', params: { limit: 10 } })];

            expect(formatter.processErrors(minErr, ValidationLevel.Strict)[0].message).toContain('Too short');
            expect(formatter.processErrors(maxErr, ValidationLevel.Strict)[0].message).toContain('Too long');
        });

        it('should format minimum/maximum errors', () => {
            const minErr = [createError({ keyword: 'minimum', params: { limit: 0 } })];
            const maxErr = [createError({ keyword: 'maximum', params: { limit: 100 } })];

            expect(formatter.processErrors(minErr, ValidationLevel.Strict)[0].message).toContain('too small');
            expect(formatter.processErrors(maxErr, ValidationLevel.Strict)[0].message).toContain('too large');
        });
    });
});
