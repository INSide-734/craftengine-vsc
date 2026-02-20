/**
 * ExtendedTypeCodeActionProvider 单元测试
 *
 * 测试扩展参数类型的快速修复功能
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TextDocument, Uri, Range, Diagnostic, DiagnosticSeverity, CodeActionKind } from '../../../__mocks__/vscode';
import type { TextDocument as VscodeTextDocument, Range as VscodeRange, CodeActionContext } from 'vscode';
import { ExtendedTypeCodeActionProvider } from '../../../../presentation/providers/ExtendedTypeCodeActionProvider';
import { ServiceContainer } from '../../../../infrastructure/ServiceContainer';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import { type IExtendedTypeService } from '../../../../core/interfaces/IExtendedParameterType';
import { SERVICE_TOKENS } from '../../../../core/constants/ServiceTokens';

// Mock ServiceContainer
vi.mock('../../../../infrastructure/ServiceContainer', () => ({
    ServiceContainer: {
        getService: vi.fn(),
    },
}));

describe('ExtendedTypeCodeActionProvider', () => {
    let provider: ExtendedTypeCodeActionProvider;
    let mockLogger: ILogger;
    let mockExtendedTypeService: IExtendedTypeService;

    beforeEach(() => {
        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            createChild: vi.fn().mockReturnThis(),
        } as unknown as ILogger;

        mockExtendedTypeService = {
            getTypeNames: vi.fn().mockReturnValue(['self_increase_int', 'condition', 'expression', 'when']),
            isValidType: vi
                .fn()
                .mockImplementation((name: string) =>
                    ['self_increase_int', 'condition', 'expression', 'when'].includes(name),
                ),
            getTypeDefinition: vi.fn().mockImplementation((name: string) => {
                if (name === 'self_increase_int') {
                    return {
                        name: 'self_increase_int',
                        description: 'Self-incrementing integer',
                        requiredProperties: ['from', 'to'],
                        optionalProperties: ['step'],
                        propertyTypes: {
                            from: 'integer',
                            to: 'integer',
                            step: 'integer',
                        },
                        example: 'type: self_increase_int\nfrom: 0\nto: 10',
                    };
                }
                if (name === 'expression') {
                    return {
                        name: 'expression',
                        description: 'Expression type',
                        requiredProperties: ['expression'],
                        optionalProperties: ['value-type'],
                        propertyTypes: {
                            expression: 'string',
                            'value-type': 'enum:double,int,long',
                        },
                        example: 'type: expression\nexpression: "${value}"',
                    };
                }
                return undefined;
            }),
            getTypeProperties: vi.fn().mockImplementation((name: string) => {
                if (name === 'self_increase_int') {
                    return [
                        { name: 'from', type: 'integer', required: true },
                        { name: 'to', type: 'integer', required: true },
                        { name: 'step', type: 'integer', required: false },
                    ];
                }
                if (name === 'expression') {
                    return [
                        { name: 'expression', type: 'string', required: true },
                        { name: 'value-type', type: 'enum:double,int,long', required: false },
                    ];
                }
                return [];
            }),
            getTypeSnippet: vi.fn().mockReturnValue(undefined),
            initialize: vi.fn().mockResolvedValue(undefined),
            clearCache: vi.fn(),
        } as unknown as IExtendedTypeService;

        vi.mocked(ServiceContainer.getService).mockImplementation((token: string | symbol) => {
            if (token === SERVICE_TOKENS.Logger) {
                return mockLogger;
            }
            if (token === SERVICE_TOKENS.ExtendedTypeService) {
                return mockExtendedTypeService;
            }
            throw new Error(`Service not found: ${token.toString()}`);
        });

        provider = new ExtendedTypeCodeActionProvider();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    // 辅助函数：创建测试文档
    function createDocument(content: string): VscodeTextDocument {
        return new TextDocument(Uri.file('/test/file.yaml'), content, 'yaml') as unknown as VscodeTextDocument;
    }

    // 辅助函数：创建诊断
    function createDiagnostic(
        line: number,
        startChar: number,
        endChar: number,
        message: string,
        code: string,
    ): Diagnostic {
        const diagnostic = new Diagnostic(new Range(line, startChar, line, endChar), message, DiagnosticSeverity.Error);
        diagnostic.source = 'CraftEngine Extended Type';
        diagnostic.code = code;
        return diagnostic;
    }

    describe('provideCodeActions', () => {
        it('should return empty array for non-extended-type diagnostics', async () => {
            const document = createDocument('type: self_increase_int\nfrom: 0\nto: 10');
            const diagnostic = new Diagnostic(new Range(0, 0, 0, 10), 'Some other error', DiagnosticSeverity.Error);
            diagnostic.source = 'Other Source';

            const actions = await provider.provideCodeActions(
                document,
                new Range(0, 0, 0, 10) as unknown as VscodeRange,
                { diagnostics: [diagnostic] } as unknown as CodeActionContext,
            );

            expect(actions).toHaveLength(0);
        });

        it('should provide actions for missing_required_property', async () => {
            const content = `type: self_increase_int
to: 10`;
            const document = createDocument(content);
            const diagnostic = createDiagnostic(
                0,
                6,
                22,
                "Missing required property 'from' for extended type 'self_increase_int'",
                'missing_required_property',
            );

            const actions = await provider.provideCodeActions(
                document,
                new Range(0, 6, 0, 22) as unknown as VscodeRange,
                { diagnostics: [diagnostic] } as unknown as CodeActionContext,
            );

            expect(actions.length).toBeGreaterThan(0);
            expect(actions[0].title).toContain("Add required property 'from'");
            expect(actions[0].kind).toBe(CodeActionKind.QuickFix);
            expect(actions[0].isPreferred).toBe(true);
        });

        it('should provide actions for unknown_property', async () => {
            const content = `type: self_increase_int
from: 0
to: 10
unknownProp: value`;
            const document = createDocument(content);
            const diagnostic = createDiagnostic(
                3,
                0,
                11,
                "Unknown property 'unknownProp' for extended type 'self_increase_int'",
                'unknown_property',
            );

            const actions = await provider.provideCodeActions(
                document,
                new Range(3, 0, 3, 11) as unknown as VscodeRange,
                { diagnostics: [diagnostic] } as unknown as CodeActionContext,
            );

            expect(actions.length).toBeGreaterThan(0);
            // 应该有删除选项
            const deleteAction = actions.find((a) => a.title.includes('Remove'));
            expect(deleteAction).toBeDefined();
        });

        it('should provide actions for invalid_property_type with enum', async () => {
            const content = `type: expression
expression: "\${value}"
value-type: invalid`;
            const document = createDocument(content);
            const diagnostic = createDiagnostic(
                2,
                0,
                10,
                "Invalid value 'invalid' for property 'value-type'. Expected one of: double, int, long",
                'invalid_property_type',
            );

            const actions = await provider.provideCodeActions(
                document,
                new Range(2, 0, 2, 10) as unknown as VscodeRange,
                { diagnostics: [diagnostic] } as unknown as CodeActionContext,
            );

            expect(actions.length).toBeGreaterThan(0);
            // 应该有替换为有效枚举值的选项
            const doubleAction = actions.find((a) => a.title.includes('double'));
            expect(doubleAction).toBeDefined();
        });

        it('should provide actions for invalid_step (step = 0)', async () => {
            const content = `type: self_increase_int
from: 0
to: 10
step: 0`;
            const document = createDocument(content);
            // 消息格式需要匹配 createInvalidStepActions 中的检查: 'step cannot be 0'
            const diagnostic = createDiagnostic(
                3,
                0,
                4,
                'step cannot be 0 - this would cause an infinite loop',
                'invalid_step',
            );

            const actions = await provider.provideCodeActions(
                document,
                new Range(3, 0, 3, 4) as unknown as VscodeRange,
                { diagnostics: [diagnostic] } as unknown as CodeActionContext,
            );

            expect(actions.length).toBeGreaterThan(0);
            // 应该有设置为 1 或 -1 的选项
            const setToOneAction = actions.find((a) => a.title.includes('Set step to 1'));
            expect(setToOneAction).toBeDefined();
        });

        it('should provide actions for invalid_step (wrong direction)', async () => {
            const content = `type: self_increase_int
from: 0
to: 10
step: -1`;
            const document = createDocument(content);
            const diagnostic = createDiagnostic(
                3,
                0,
                4,
                "When 'from' (0) < 'to' (10), 'step' should be positive, got -1",
                'invalid_step',
            );

            const actions = await provider.provideCodeActions(
                document,
                new Range(3, 0, 3, 4) as unknown as VscodeRange,
                { diagnostics: [diagnostic] } as unknown as CodeActionContext,
            );

            expect(actions.length).toBeGreaterThan(0);
            // 应该有反转步长的选项
            const fixAction = actions.find((a) => a.title.includes('Change step to 1'));
            expect(fixAction).toBeDefined();
        });
    });

    describe('static properties', () => {
        it('should have correct diagnostic source', () => {
            expect(ExtendedTypeCodeActionProvider.DIAGNOSTIC_SOURCE).toBe('CraftEngine Extended Type');
        });

        it('should provide QuickFix code action kind', () => {
            expect(ExtendedTypeCodeActionProvider.providedCodeActionKinds).toContain(CodeActionKind.QuickFix);
        });
    });
});
