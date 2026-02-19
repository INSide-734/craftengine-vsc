import {
    TextDocument,
    Diagnostic,
    DiagnosticSeverity,
    DiagnosticTag,
    DiagnosticRelatedInformation,
    Location,
    Range,
    Position
} from 'vscode';
import { ILogger } from '../../../core/interfaces/ILogger';
import { IValidationError } from '../../../infrastructure/schema/SchemaValidator';
import { IPositionInfo } from '../../../core/interfaces/IParsedDocument';
import { DiagnosticSeverityConfig } from '../../../infrastructure/config/DiagnosticSeverityConfig';
import { getDiagnosticCodeInfo, mapAjvKeywordToCode } from '../../../core/constants/DiagnosticCodes';
import { SCHEMA_MESSAGES } from '../../../core/constants/DiagnosticMessages';
import { SchemaPositionResolver } from './SchemaPositionResolver';
import * as yaml from 'yaml';

/**
 * Schema 诊断格式化器
 *
 * 负责将 Schema 验证错误转换为 VS Code 诊断对象，
 * 包括消息格式化、严重程度映射和诊断标签。
 */
export class SchemaDiagnosticFormatter {
    private readonly positionResolver: SchemaPositionResolver;
    private readonly severityConfig: DiagnosticSeverityConfig;

    constructor(private readonly logger: ILogger) {
        this.positionResolver = new SchemaPositionResolver(logger);
        this.severityConfig = new DiagnosticSeverityConfig();
    }

    /**
     * 创建验证错误诊断
     */
    async createValidationDiagnostic(
        error: IValidationError,
        document: TextDocument,
        positionMap?: Map<string, IPositionInfo>,
        defaultSeverity: DiagnosticSeverity = DiagnosticSeverity.Error
    ): Promise<Diagnostic | null> {
        try {
            const range = this.positionResolver.getErrorRange(error, document, positionMap);
            const diagnosticCode = mapAjvKeywordToCode(error.code);
            const codeInfo = getDiagnosticCodeInfo(diagnosticCode);

            const configuredSeverity = this.severityConfig.getSeverity(diagnosticCode);
            if (configuredSeverity === null) {
                return null;
            }

            const severity = configuredSeverity ?? defaultSeverity;
            const message = this.formatValidationMessage(error);

            const diagnostic = new Diagnostic(range, message, severity);
            diagnostic.source = 'CraftEngine Schema';

            if (codeInfo) {
                diagnostic.code = diagnosticCode;
            } else {
                diagnostic.code = diagnosticCode;
            }

            if (error.suggestion) {
                diagnostic.relatedInformation = [
                    new DiagnosticRelatedInformation(
                        new Location(document.uri, range),
                        `Quick Fix: ${error.suggestion}`
                    )
                ];
            }

            diagnostic.tags = this.getDiagnosticTags(error);
            return diagnostic;
        } catch (err) {
            this.logger.error('Failed to create validation diagnostic', err as Error, {
                error: error.message
            });
            return null;
        }
    }

    /**
     * 创建解析错误诊断
     */
    createParseErrorDiagnostic(error: yaml.YAMLError, document: TextDocument): Diagnostic {
        const range = this.getParseErrorRange(error, document);
        const diagnostic = new Diagnostic(range, error.message, DiagnosticSeverity.Error);
        diagnostic.source = 'CraftEngine Schema';
        diagnostic.code = 'yaml_syntax_error';
        return diagnostic;
    }

    /**
     * 创建解析警告诊断
     */
    createParseWarningDiagnostic(warning: yaml.YAMLWarning, document: TextDocument): Diagnostic {
        const range = this.getParseErrorRange(warning, document);
        const diagnostic = new Diagnostic(range, warning.message, DiagnosticSeverity.Warning);
        diagnostic.source = 'CraftEngine Schema';
        diagnostic.code = 'yaml_warning';
        return diagnostic;
    }

    /**
     * 获取解析错误的范围
     */
    private getParseErrorRange(error: yaml.YAMLError, document: TextDocument): Range {
        if (error.pos && error.pos.length === 2) {
            const [startOffset, endOffset] = error.pos;
            const startPos = document.positionAt(startOffset);
            const endPos = document.positionAt(endOffset);

            if (endOffset - startOffset <= 1) {
                return this.expandDiagnosticRange(document, startPos);
            }
            return new Range(startPos, endPos);
        }
        return new Range(0, 0, 0, 1);
    }

    /**
     * 扩展诊断范围以提供更好的可读性
     */
    private expandDiagnosticRange(document: TextDocument, startPos: Position): Range {
        const line = document.lineAt(startPos.line);
        const lineText = line.text;

        const wordRange = document.getWordRangeAtPosition(startPos, /[\w\-._]+:?/);
        if (wordRange && !wordRange.isEmpty) {
            return wordRange;
        }

        const trimmedStart = lineText.search(/\S/);
        const trimmedEnd = lineText.search(/\S\s*$/);

        if (trimmedStart !== -1 && trimmedEnd !== -1) {
            return new Range(startPos.line, trimmedStart, startPos.line, trimmedEnd + 1);
        }

        return new Range(startPos, line.range.end);
    }

    /**
     * 格式化验证消息
     */
    formatValidationMessage(error: IValidationError): string {
        switch (error.code) {
            case 'required': {
                const match = error.message.match(/Missing required field "([^"]+)"/);
                if (match) { return SCHEMA_MESSAGES.required(match[1]); }
                return error.message.replace(/^❌\s*/, '');
            }
            case 'type': {
                const match = error.message.match(/expected\s+(.+)$/i);
                if (match) { return SCHEMA_MESSAGES.type(match[1].replace(/[📝🔢✓📦📋∅\s]/g, '').trim()); }
                return error.message.replace(/^⚠️\s*/, '');
            }
            case 'enum': {
                const match = error.message.match(/Allowed:\s*(.+)$/);
                if (match) {
                    const values = match[1].split('|').map(v => v.trim().replace(/"/g, ''));
                    return SCHEMA_MESSAGES.enum(values);
                }
                return error.message.replace(/^❌\s*/, '');
            }
            case 'additionalProperties': {
                const match = error.message.match(/Unknown property "([^"]+)"/);
                if (match) { return SCHEMA_MESSAGES.additionalProperties(match[1]); }
                return error.message.replace(/^💡\s*/, '');
            }
            case 'pattern':
                return SCHEMA_MESSAGES.pattern();
            case 'minLength': {
                const match = error.message.match(/minimum\s+(\d+)/);
                if (match) { return SCHEMA_MESSAGES.minLength(parseInt(match[1], 10)); }
                return error.message.replace(/^⚠️\s*/, '');
            }
            case 'maxLength': {
                const match = error.message.match(/maximum\s+(\d+)/);
                if (match) { return SCHEMA_MESSAGES.maxLength(parseInt(match[1], 10)); }
                return error.message.replace(/^⚠️\s*/, '');
            }
            case 'minimum': {
                const match = error.message.match(/minimum is\s+(\d+)/);
                if (match) { return SCHEMA_MESSAGES.minimum(parseInt(match[1], 10)); }
                return error.message.replace(/^⚠️\s*/, '');
            }
            case 'maximum': {
                const match = error.message.match(/maximum is\s+(\d+)/);
                if (match) { return SCHEMA_MESSAGES.maximum(parseInt(match[1], 10)); }
                return error.message.replace(/^⚠️\s*/, '');
            }
            default:
                return error.message.replace(/^(?:❌|⚠️|💡|📝|🔢|✓|📦|📋|∅|➕|✂️|⬆️|⬇️|🗑️|📏)\s*/g, '');
        }
    }

    /**
     * 获取诊断标签
     */
    private getDiagnosticTags(error: IValidationError): DiagnosticTag[] {
        const tags: DiagnosticTag[] = [];
        if (error.code === 'additionalProperties') {
            tags.push(DiagnosticTag.Unnecessary);
        }
        return tags;
    }
}
