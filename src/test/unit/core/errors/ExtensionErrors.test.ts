import { describe, it, expect } from 'vitest';
import {
    ConfigurationError,
    TemplateError,
    TemplateParseError,
    TemplateValidationError,
    TemplateNotFoundError,
    DependencyInjectionError,
    ServiceNotRegisteredError,
    CircularDependencyError,
    FileOperationError,
    InitializationError,
    ServiceNotInitializedError,
    ModelGenerationError,
    InvalidItemModelError,
    SchemaNotFoundError,
} from '../../../../core/errors/ExtensionErrors';

describe('ExtensionErrors', () => {
    describe('ConfigurationError', () => {
        it('should create with correct code and message', () => {
            const error = new ConfigurationError('Invalid config');
            expect(error.message).toBe('Invalid config');
            expect(error.code).toBe('CONFIGURATION_ERROR');
            expect(error.name).toBe('ConfigurationError');
            expect(error.timestamp).toBeInstanceOf(Date);
            expect(error).toBeInstanceOf(Error);
        });

        it('should include context', () => {
            const ctx = { key: 'logging.level', value: 'INVALID' };
            const error = new ConfigurationError('Bad value', ctx);
            expect(error.context).toEqual(ctx);
        });

        it('should work without context', () => {
            const error = new ConfigurationError('No context');
            expect(error.context).toBeUndefined();
        });
    });

    describe('TemplateError', () => {
        it('should accept custom error code', () => {
            const error = new TemplateError('msg', 'CUSTOM_CODE', { foo: 'bar' });
            expect(error.code).toBe('CUSTOM_CODE');
            expect(error.context).toEqual({ foo: 'bar' });
        });
    });

    describe('TemplateParseError', () => {
        it('should use TEMPLATE_PARSE_ERROR code', () => {
            const error = new TemplateParseError('parse failed', { line: 15 });
            expect(error.code).toBe('TEMPLATE_PARSE_ERROR');
            expect(error.name).toBe('TemplateParseError');
            expect(error.context).toEqual({ line: 15 });
        });
    });
    describe('TemplateValidationError', () => {
        it('should use TEMPLATE_VALIDATION_ERROR code', () => {
            const error = new TemplateValidationError('validation failed');
            expect(error.code).toBe('TEMPLATE_VALIDATION_ERROR');
            expect(error.name).toBe('TemplateValidationError');
        });
    });

    describe('TemplateNotFoundError', () => {
        it('should format message with template name', () => {
            const error = new TemplateNotFoundError('user-profile');
            expect(error.message).toBe("Template 'user-profile' not found");
            expect(error.code).toBe('TEMPLATE_NOT_FOUND');
            expect(error.context?.templateName).toBe('user-profile');
        });

        it('should merge additional context', () => {
            const error = new TemplateNotFoundError('tpl', { requestedBy: 'admin' });
            expect(error.context?.templateName).toBe('tpl');
            expect(error.context?.requestedBy).toBe('admin');
        });
    });

    describe('DependencyInjectionError', () => {
        it('should use DEPENDENCY_INJECTION_ERROR code', () => {
            const error = new DependencyInjectionError('DI failed');
            expect(error.code).toBe('DEPENDENCY_INJECTION_ERROR');
        });
    });

    describe('ServiceNotRegisteredError', () => {
        it('should format message with service name', () => {
            const error = new ServiceNotRegisteredError('TemplateService');
            expect(error.message).toBe("Service 'TemplateService' is not registered");
            expect(error.context?.serviceName).toBe('TemplateService');
        });
    });

    describe('CircularDependencyError', () => {
        it('should format dependency chain', () => {
            const chain = ['A', 'B', 'C', 'A'];
            const error = new CircularDependencyError(chain);
            expect(error.message).toBe('Circular dependency detected: A -> B -> C -> A');
            expect(error.context?.dependencyChain).toEqual(chain);
        });
    });

    describe('FileOperationError', () => {
        it('should include filePath and operation in context', () => {
            const error = new FileOperationError('read failed', '/path/to/file', 'read');
            expect(error.code).toBe('FILE_OPERATION_ERROR');
            expect(error.context?.filePath).toBe('/path/to/file');
            expect(error.context?.operation).toBe('read');
        });

        it('should merge additional context', () => {
            const error = new FileOperationError('err', '/f', 'write', { reason: 'perm' });
            expect(error.context?.reason).toBe('perm');
            expect(error.context?.filePath).toBe('/f');
        });
    });

    describe('InitializationError', () => {
        it('should include component in context', () => {
            const error = new InitializationError('init failed', 'SchemaService');
            expect(error.code).toBe('INITIALIZATION_ERROR');
            expect(error.context?.component).toBe('SchemaService');
        });
    });

    describe('ServiceNotInitializedError', () => {
        it('should format message with service name', () => {
            const error = new ServiceNotInitializedError('SchemaService');
            expect(error.message).toBe('SchemaService not initialized. Call initialize() first.');
            expect(error.code).toBe('SERVICE_NOT_INITIALIZED');
            expect(error.context?.serviceName).toBe('SchemaService');
        });
    });

    describe('ModelGenerationError', () => {
        it('should use MODEL_GENERATION_ERROR code', () => {
            const error = new ModelGenerationError('gen failed');
            expect(error.code).toBe('MODEL_GENERATION_ERROR');
        });
    });

    describe('InvalidItemModelError', () => {
        it('should format message with model type', () => {
            const error = new InvalidItemModelError('unknown_type');
            expect(error.message).toBe('Invalid item model type: unknown_type');
            expect(error.code).toBe('INVALID_ITEM_MODEL');
            expect(error.context?.modelType).toBe('unknown_type');
        });
    });

    describe('SchemaNotFoundError', () => {
        it('should format message with filename', () => {
            const error = new SchemaNotFoundError('schema.json');
            expect(error.message).toBe('Schema file not found: schema.json');
            expect(error.code).toBe('SCHEMA_NOT_FOUND');
            expect(error.context?.filename).toBe('schema.json');
        });
    });

    describe('Inheritance chain', () => {
        it('TemplateParseError extends TemplateError extends ExtensionError extends Error', () => {
            const error = new TemplateParseError('test');
            expect(error).toBeInstanceOf(TemplateError);
            expect(error).toBeInstanceOf(Error);
        });

        it('ServiceNotRegisteredError extends DependencyInjectionError', () => {
            const error = new ServiceNotRegisteredError('svc');
            expect(error).toBeInstanceOf(DependencyInjectionError);
            expect(error).toBeInstanceOf(Error);
        });

        it('CircularDependencyError extends DependencyInjectionError', () => {
            const error = new CircularDependencyError(['A', 'B']);
            expect(error).toBeInstanceOf(DependencyInjectionError);
        });
    });
});
