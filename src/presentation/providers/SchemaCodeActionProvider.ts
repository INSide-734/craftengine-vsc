import {
    type CodeActionProvider,
    CodeActionKind,
    CodeAction,
    type TextDocument,
    Range,
    type Diagnostic,
    WorkspaceEdit,
    type CodeActionContext,
    type CancellationToken,
    Position,
} from 'vscode';
import { extractDiagnosticCode } from './helpers/DiagnosticCodeHelper';

/** Schema 诊断源 */
const SCHEMA_DIAGNOSTIC_SOURCE = 'CraftEngine Schema';

/**
 * Schema 代码动作提供者
 *
 * 为 Schema 验证错误提供快速修复建议
 */
export class SchemaCodeActionProvider implements CodeActionProvider {
    public static readonly providedCodeActionKinds = [CodeActionKind.QuickFix];

    constructor() {}

    async provideCodeActions(
        document: TextDocument,
        _range: Range,
        context: CodeActionContext,
        token?: CancellationToken,
    ): Promise<CodeAction[]> {
        if (token?.isCancellationRequested) {
            return [];
        }

        const schemaDiagnostics = context.diagnostics.filter((d) => d.source === SCHEMA_DIAGNOSTIC_SOURCE);
        if (schemaDiagnostics.length === 0) {
            return [];
        }

        const actions: CodeAction[] = [];
        for (const diagnostic of schemaDiagnostics) {
            actions.push(...this.createActionsForDiagnostic(diagnostic, document));
        }

        return actions;
    }

    private createActionsForDiagnostic(diagnostic: Diagnostic, document: TextDocument): CodeAction[] {
        const code = extractDiagnosticCode(diagnostic);

        switch (code) {
            case 'required':
                return this.createAddRequiredPropertyActions(diagnostic, document);
            case 'additionalProperties':
                return this.createRemoveUnknownPropertyActions(diagnostic, document);
            case 'type':
                return this.createFixTypeActions(diagnostic, document);
            case 'enum':
                return this.createSelectEnumValueActions(diagnostic, document);
            case 'pattern':
            case 'format':
                return this.createFixFormatActions(diagnostic, document);
            default:
                return [];
        }
    }

    private createAddRequiredPropertyActions(diagnostic: Diagnostic, document: TextDocument): CodeAction[] {
        const match = diagnostic.message.match(/Missing required property: (\w+)/);
        if (!match) {
            return [];
        }

        const propertyName = match[1];
        const insertInfo = this.findInsertPosition(diagnostic.range, document);

        const needsNewline =
            insertInfo.position.line < document.lineCount &&
            document.lineAt(insertInfo.position.line).text.trim() !== '';

        const edit = new WorkspaceEdit();
        const insertText = needsNewline
            ? `${insertInfo.indentation}${propertyName}: \n`
            : `${insertInfo.indentation}${propertyName}: `;

        edit.insert(document.uri, insertInfo.position, insertText);

        const action = new CodeAction(`Add required property '${propertyName}'`, CodeActionKind.QuickFix);
        action.edit = edit;
        action.diagnostics = [diagnostic];
        action.isPreferred = true;

        return [action];
    }

    private createRemoveUnknownPropertyActions(diagnostic: Diagnostic, document: TextDocument): CodeAction[] {
        const match = diagnostic.message.match(/Unexpected property.*: (\w+)/);
        if (!match) {
            return [];
        }

        const propertyName = match[1];
        const propertyRange = this.findPropertyRange(propertyName, diagnostic.range, document);

        if (!propertyRange) {
            return [];
        }

        const edit = new WorkspaceEdit();
        edit.delete(document.uri, propertyRange);

        const action = new CodeAction(`Remove unexpected property '${propertyName}'`, CodeActionKind.QuickFix);
        action.edit = edit;
        action.diagnostics = [diagnostic];
        action.isPreferred = true;

        return [action];
    }

    private createFixTypeActions(diagnostic: Diagnostic, document: TextDocument): CodeAction[] {
        const match = diagnostic.message.match(/expected[:\s]+(?:📦|📋|📝|🔢)?(?:[\s]*)(\w+)/);
        if (!match) {
            return [];
        }

        const expectedType = match[1];
        const currentValue = document.getText(diagnostic.range).trim();
        const line = document.lineAt(diagnostic.range.start.line);
        const isEmptyValue = !currentValue || currentValue.trim() === '' || line.text.trim().endsWith(':');

        if (isEmptyValue) {
            return this.createDeleteLineAction(diagnostic, document);
        }

        const newValue = this.convertValueToType(currentValue, expectedType);
        if (!newValue) {
            return [];
        }

        const edit = new WorkspaceEdit();
        edit.replace(document.uri, diagnostic.range, newValue);

        const action = new CodeAction(`Convert to ${expectedType}`, CodeActionKind.QuickFix);
        action.edit = edit;
        action.diagnostics = [diagnostic];

        return [action];
    }

    private convertValueToType(value: string, expectedType: string): string | undefined {
        switch (expectedType) {
            case 'string':
                return `"${value.replace(/"/g, '')}"`;
            case 'number':
            case 'integer': {
                const num = parseFloat(value.replace(/"/g, ''));
                return isNaN(num) ? undefined : String(Math.floor(num));
            }
            case 'boolean': {
                const boolValue = value.toLowerCase().trim();
                if (['true', 'false', 'yes', 'no', '1', '0'].includes(boolValue)) {
                    return ['true', 'yes', '1'].includes(boolValue) ? 'true' : 'false';
                }
                return undefined;
            }
            case 'array':
                return `[${value}]`;
            case 'object':
                return `\n  ${value}: `;
            default:
                return undefined;
        }
    }

    private createDeleteLineAction(diagnostic: Diagnostic, document: TextDocument): CodeAction[] {
        const line = document.lineAt(diagnostic.range.start.line);
        const deleteRange = new Range(line.range.start, new Position(line.range.end.line + 1, 0));

        const edit = new WorkspaceEdit();
        edit.delete(document.uri, deleteRange);

        const action = new CodeAction('Delete empty block', CodeActionKind.QuickFix);
        action.edit = edit;
        action.diagnostics = [diagnostic];

        return [action];
    }

    private createSelectEnumValueActions(diagnostic: Diagnostic, document: TextDocument): CodeAction[] {
        const match = diagnostic.message.match(/must be one of (.+)/);
        if (!match) {
            return [];
        }

        const allowedValues = match[1].split(',').map((v) => v.trim());

        return allowedValues.slice(0, 5).map((value) => {
            const edit = new WorkspaceEdit();
            edit.replace(document.uri, diagnostic.range, value);

            const action = new CodeAction(`Change to '${value}'`, CodeActionKind.QuickFix);
            action.edit = edit;
            action.diagnostics = [diagnostic];

            return action;
        });
    }

    private createFixFormatActions(diagnostic: Diagnostic, document: TextDocument): CodeAction[] {
        const currentValue = document.getText(diagnostic.range).trim();
        if (!currentValue) {
            return [];
        }

        if (diagnostic.message.includes('path') || diagnostic.message.includes('format')) {
            const normalized = currentValue.replace(/\\/g, '/').replace(/\/+/g, '/');

            if (normalized !== currentValue) {
                const edit = new WorkspaceEdit();
                edit.replace(document.uri, diagnostic.range, normalized);

                const action = new CodeAction('Normalize path format', CodeActionKind.QuickFix);
                action.edit = edit;
                action.diagnostics = [diagnostic];

                return [action];
            }
        }

        return [];
    }

    private findInsertPosition(range: Range, document: TextDocument): { position: Position; indentation: string } {
        const startLine = range.start.line;
        const parentIndent = this.getLeadingWhitespace(document.lineAt(startLine).text);

        let childIndentation = '  ';
        let lastChildLine = startLine;

        for (let i = startLine + 1; i < document.lineCount; i++) {
            const text = document.lineAt(i).text;
            if (text.trim() === '') {
                continue;
            }

            const currentIndent = this.getLeadingWhitespace(text);
            if (currentIndent <= parentIndent) {
                break;
            }

            if (childIndentation === '  ') {
                childIndentation = text.substring(0, currentIndent);
            }
            lastChildLine = i;
        }

        if (childIndentation === '  ') {
            return {
                position: new Position(startLine + 1, 0),
                indentation: ' '.repeat(parentIndent + 2),
            };
        }

        return {
            position: new Position(lastChildLine + 1, 0),
            indentation: childIndentation,
        };
    }

    private getLeadingWhitespace(text: string): number {
        const match = text.match(/^(\s*)/);
        return match ? match[1].length : 0;
    }

    private findPropertyRange(propertyName: string, diagnosticRange: Range, document: TextDocument): Range | undefined {
        const line = document.lineAt(diagnosticRange.start.line);
        const regex = new RegExp(`^(\\s*)${propertyName}\\s*:`);

        if (regex.test(line.text)) {
            const endPos =
                line.lineNumber + 1 < document.lineCount ? new Position(line.lineNumber + 1, 0) : line.range.end;

            return new Range(new Position(line.lineNumber, 0), endPos);
        }

        return undefined;
    }
}
