import {
    type CodeActionProvider,
    type TextDocument,
    Range,
    type CodeActionContext,
    CodeAction,
    CodeActionKind,
    WorkspaceEdit,
    Position,
    type Diagnostic,
} from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { type ILogger } from '../../core/interfaces/ILogger';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { type IExtendedTypeService } from '../../core/interfaces/IExtendedParameterType';
import { getIndentLevel } from '../../infrastructure/utils';

/**
 * 扩展参数类型代码操作提供者
 *
 * 为扩展参数类型的诊断错误提供快速修复建议（Quick Fix）
 * 支持的错误类型：
 * - missing_required_property: 缺少必需属性
 * - unknown_property: 未知属性
 * - invalid_property_type: 属性值类型错误
 */
export class ExtendedTypeCodeActionProvider implements CodeActionProvider {
    private readonly logger: ILogger;
    private readonly extendedTypeService: IExtendedTypeService;

    /** 诊断源标识 */
    static readonly DIAGNOSTIC_SOURCE = 'CraftEngine Extended Type';

    /** 提供的 CodeAction 类型 */
    static readonly providedCodeActionKinds = [CodeActionKind.QuickFix];

    constructor() {
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild(
            'ExtendedTypeCodeActionProvider',
        );
        this.extendedTypeService = ServiceContainer.getService<IExtendedTypeService>(
            SERVICE_TOKENS.ExtendedTypeService,
        );
    }

    /**
     * 提供代码操作
     */
    async provideCodeActions(document: TextDocument, _range: Range, context: CodeActionContext): Promise<CodeAction[]> {
        const actions: CodeAction[] = [];

        try {
            for (const diagnostic of context.diagnostics) {
                // 只处理扩展参数类型相关的诊断
                if (diagnostic.source !== ExtendedTypeCodeActionProvider.DIAGNOSTIC_SOURCE) {
                    continue;
                }

                const fixActions = this.createFixActionsForDiagnostic(document, diagnostic);
                actions.push(...fixActions);
            }

            if (actions.length > 0) {
                this.logger.debug('Extended type code actions provided', {
                    document: document.fileName,
                    actionsCount: actions.length,
                });
            }
        } catch (error) {
            this.logger.error('Error providing extended type code actions', error as Error);
        }

        return actions;
    }

    /**
     * 为诊断创建修复操作
     */
    private createFixActionsForDiagnostic(document: TextDocument, diagnostic: Diagnostic): CodeAction[] {
        const code = diagnostic.code;

        switch (code) {
            case 'missing_required_property':
                return this.createMissingPropertyActions(document, diagnostic);
            case 'unknown_property':
                return this.createUnknownPropertyActions(document, diagnostic);
            case 'invalid_property_type':
                return this.createInvalidTypeActions(document, diagnostic);
            case 'invalid_range':
                return this.createInvalidRangeActions(document, diagnostic);
            case 'invalid_step':
                return this.createInvalidStepActions(document, diagnostic);
            default:
                return [];
        }
    }

    /**
     * 创建缺少必需属性的修复操作
     */
    private createMissingPropertyActions(document: TextDocument, diagnostic: Diagnostic): CodeAction[] {
        const actions: CodeAction[] = [];

        // 从错误消息中提取属性名和类型名
        const match = diagnostic.message.match(/Missing required property '(\w+(?:-\w+)*)' for extended type '(\w+)'/);
        if (!match) {
            return actions;
        }

        const [, propName, typeName] = match;
        const typeDef = this.extendedTypeService.getTypeDefinition(typeName);
        const properties = this.extendedTypeService.getTypeProperties(typeName);

        if (!typeDef) {
            return actions;
        }

        // 查找属性定义以获取默认值
        const propDef = properties.find((p: { name: string }) => p.name === propName);
        const defaultValue = this.getDefaultValueForProperty(propName, propDef?.type || 'string', propDef?.examples);

        // 1. 添加缺失的属性
        const addAction = new CodeAction(`Add required property '${propName}'`, CodeActionKind.QuickFix);
        addAction.diagnostics = [diagnostic];
        addAction.isPreferred = true;

        const insertPosition = this.findPropertyInsertPosition(document, diagnostic.range);
        if (insertPosition) {
            const indent = this.getIndentAtLine(document, diagnostic.range.start.line);
            const edit = new WorkspaceEdit();
            edit.insert(document.uri, insertPosition, `${indent}${propName}: ${defaultValue}\n`);
            addAction.edit = edit;
            actions.push(addAction);
        }

        // 2. 添加所有缺失的必需属性
        const missingProps = this.findAllMissingRequiredProperties(document, diagnostic.range, typeDef);
        if (missingProps.length > 1) {
            const addAllAction = new CodeAction(
                `Add all missing required properties (${missingProps.length})`,
                CodeActionKind.QuickFix,
            );
            addAllAction.diagnostics = [diagnostic];

            if (insertPosition) {
                const indent = this.getIndentAtLine(document, diagnostic.range.start.line);
                const edit = new WorkspaceEdit();
                let insertText = '';

                for (const prop of missingProps) {
                    const pDef = properties.find((p: { name: string }) => p.name === prop);
                    const pValue = this.getDefaultValueForProperty(prop, pDef?.type || 'string', pDef?.examples);
                    insertText += `${indent}${prop}: ${pValue}\n`;
                }

                edit.insert(document.uri, insertPosition, insertText);
                addAllAction.edit = edit;
                actions.push(addAllAction);
            }
        }

        return actions;
    }

    /**
     * 创建未知属性的修复操作
     */
    private createUnknownPropertyActions(document: TextDocument, diagnostic: Diagnostic): CodeAction[] {
        const actions: CodeAction[] = [];

        // 从错误消息中提取属性名和类型名
        const match = diagnostic.message.match(/Unknown property '(\w+(?:-\w+)*)' for extended type '(\w+)'/);
        if (!match) {
            return actions;
        }

        const [, propName, typeName] = match;
        const typeDef = this.extendedTypeService.getTypeDefinition(typeName);

        if (!typeDef) {
            return actions;
        }

        // 1. 删除未知属性
        const deleteAction = new CodeAction(`Remove unknown property '${propName}'`, CodeActionKind.QuickFix);
        deleteAction.diagnostics = [diagnostic];

        const lineRange = this.getFullLineRange(document, diagnostic.range.start.line);
        const edit = new WorkspaceEdit();
        edit.delete(document.uri, lineRange);
        deleteAction.edit = edit;
        actions.push(deleteAction);

        // 2. 查找相似的有效属性并提供替换建议
        const allValidProps = [...typeDef.requiredProperties, ...typeDef.optionalProperties];
        const similarProps = this.findSimilarProperties(propName, allValidProps);

        for (const similarProp of similarProps.slice(0, 3)) {
            const replaceAction = new CodeAction(`Change '${propName}' to '${similarProp}'`, CodeActionKind.QuickFix);
            replaceAction.diagnostics = [diagnostic];

            const replaceEdit = new WorkspaceEdit();
            replaceEdit.replace(document.uri, diagnostic.range, similarProp);
            replaceAction.edit = replaceEdit;
            actions.push(replaceAction);
        }

        return actions;
    }

    /**
     * 创建属性值类型错误的修复操作
     */
    private createInvalidTypeActions(document: TextDocument, diagnostic: Diagnostic): CodeAction[] {
        const actions: CodeAction[] = [];

        // 处理枚举类型错误
        const enumMatch = diagnostic.message.match(
            /Invalid value '([^']+)' for property '(\w+(?:-\w+)*)'\. Expected one of: (.+)/,
        );
        if (enumMatch) {
            const [, , , enumValuesStr] = enumMatch;
            const enumValues = enumValuesStr.split(', ');

            // 为每个有效的枚举值创建替换操作
            for (const enumValue of enumValues.slice(0, 5)) {
                const replaceAction = new CodeAction(`Change to '${enumValue}'`, CodeActionKind.QuickFix);
                replaceAction.diagnostics = [diagnostic];
                replaceAction.isPreferred = enumValues[0] === enumValue;

                const valueRange = this.getPropertyValueRange(document, diagnostic.range.start.line);
                if (valueRange) {
                    const edit = new WorkspaceEdit();
                    edit.replace(document.uri, valueRange, enumValue);
                    replaceAction.edit = edit;
                    actions.push(replaceAction);
                }
            }
        }

        // 处理整数类型错误
        const intMatch = diagnostic.message.match(/Property '(\w+(?:-\w+)*)' expects an integer value/);
        if (intMatch) {
            const [, propName] = intMatch;

            // 提供常用整数值建议
            const suggestedValues =
                propName === 'from'
                    ? ['0', '1']
                    : propName === 'to'
                      ? ['10', '20', '100']
                      : propName === 'step'
                        ? ['1', '2', '-1']
                        : ['0', '1'];

            for (const value of suggestedValues) {
                const replaceAction = new CodeAction(`Set ${propName} to ${value}`, CodeActionKind.QuickFix);
                replaceAction.diagnostics = [diagnostic];

                const valueRange = this.getPropertyValueRange(document, diagnostic.range.start.line);
                if (valueRange) {
                    const edit = new WorkspaceEdit();
                    edit.replace(document.uri, valueRange, value);
                    replaceAction.edit = edit;
                    actions.push(replaceAction);
                }
            }
        }

        return actions;
    }

    /**
     * 创建无效范围的修复操作 (self_increase_int)
     */
    private createInvalidRangeActions(document: TextDocument, diagnostic: Diagnostic): CodeAction[] {
        const actions: CodeAction[] = [];

        // 交换 from 和 to 的值
        const swapAction = new CodeAction('Swap from and to values', CodeActionKind.QuickFix);
        swapAction.diagnostics = [diagnostic];
        swapAction.isPreferred = true;

        const blockInfo = this.getBlockInfo(document, diagnostic.range.start.line);
        if (blockInfo.fromLine !== -1 && blockInfo.toLine !== -1) {
            const fromValue = this.getPropertyValue(document, blockInfo.fromLine);
            const toValue = this.getPropertyValue(document, blockInfo.toLine);

            if (fromValue && toValue) {
                const edit = new WorkspaceEdit();
                const fromValueRange = this.getPropertyValueRange(document, blockInfo.fromLine);
                const toValueRange = this.getPropertyValueRange(document, blockInfo.toLine);

                if (fromValueRange && toValueRange) {
                    edit.replace(document.uri, fromValueRange, toValue);
                    edit.replace(document.uri, toValueRange, fromValue);
                    swapAction.edit = edit;
                    actions.push(swapAction);
                }
            }
        }

        return actions;
    }

    /**
     * 创建无效步长的修复操作 (self_increase_int)
     */
    private createInvalidStepActions(document: TextDocument, diagnostic: Diagnostic): CodeAction[] {
        const actions: CodeAction[] = [];

        // 检查是否是 step 为 0 的错误
        if (diagnostic.message.includes('step cannot be 0')) {
            const valueRange = this.getPropertyValueRange(document, diagnostic.range.start.line);

            const setPositiveAction = new CodeAction('Set step to 1', CodeActionKind.QuickFix);
            setPositiveAction.diagnostics = [diagnostic];
            setPositiveAction.isPreferred = true;

            if (valueRange) {
                const edit = new WorkspaceEdit();
                edit.replace(document.uri, valueRange, '1');
                setPositiveAction.edit = edit;
                actions.push(setPositiveAction);
            }

            const setNegativeAction = new CodeAction('Set step to -1', CodeActionKind.QuickFix);
            setNegativeAction.diagnostics = [diagnostic];

            if (valueRange) {
                const edit = new WorkspaceEdit();
                edit.replace(document.uri, valueRange, '-1');
                setNegativeAction.edit = edit;
                actions.push(setNegativeAction);
            }
        }

        // 检查是否是步长方向错误
        if (diagnostic.message.includes('should be positive') || diagnostic.message.includes('should be negative')) {
            const stepValue = this.getPropertyValue(document, diagnostic.range.start.line);

            if (stepValue) {
                const numValue = parseInt(stepValue, 10);
                if (!isNaN(numValue)) {
                    const fixAction = new CodeAction(`Change step to ${-numValue}`, CodeActionKind.QuickFix);
                    fixAction.diagnostics = [diagnostic];
                    fixAction.isPreferred = true;

                    const valueRange = this.getPropertyValueRange(document, diagnostic.range.start.line);
                    if (valueRange) {
                        const edit = new WorkspaceEdit();
                        edit.replace(document.uri, valueRange, String(-numValue));
                        fixAction.edit = edit;
                        actions.push(fixAction);
                    }
                }
            }
        }

        return actions;
    }

    // ==================== 辅助方法 ====================

    /**
     * 获取属性的默认值
     */
    private getDefaultValueForProperty(propName: string, type: string, examples?: string[]): string {
        // 优先使用示例值
        if (examples && examples.length > 0) {
            const example = examples[0];
            if (example.includes('${')) {
                return `"${example}"`;
            }
            return example;
        }

        // 根据属性名和类型推断默认值
        switch (propName) {
            case 'condition':
                return '"${param:-false}"';
            case 'source':
            case 'value':
                return '"${param}"';
            case 'expression':
                return '"${value:-0} + 1"';
            case 'on-true':
            case 'on-false':
            case 'fallback':
                return 'value';
            case 'when':
                return '';
            case 'from':
                return '0';
            case 'to':
                return '10';
            case 'step':
                return '1';
            case 'locale':
                return 'en';
            case 'value-type':
                return 'double';
            default:
                if (type === 'integer') {
                    return '0';
                }
                return 'value';
        }
    }

    /**
     * 查找属性插入位置
     */
    private findPropertyInsertPosition(document: TextDocument, range: Range): Position | undefined {
        const line = range.start.line;
        const text = document.getText();
        const lines = text.split('\n');
        const blockIndent = getIndentLevel(lines[line]);

        // 向下查找同一块的最后一行
        for (let i = line + 1; i < lines.length; i++) {
            const lineText = lines[i];
            const trimmed = lineText.trim();

            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            const lineIndent = getIndentLevel(lineText);
            if (lineIndent < blockIndent) {
                return new Position(i, 0);
            }
            if (lineIndent === blockIndent && trimmed.match(/^[a-zA-Z_-]+:/)) {
                continue;
            }
        }

        return new Position(lines.length, 0);
    }

    /**
     * 获取指定行的缩进
     */
    private getIndentAtLine(document: TextDocument, line: number): string {
        const lineText = document.lineAt(line).text;
        const match = lineText.match(/^(\s*)/);
        return match ? match[1] : '';
    }

    /**
     * 获取完整行的范围（包括换行符）
     */
    private getFullLineRange(_document: TextDocument, line: number): Range {
        return new Range(new Position(line, 0), new Position(line + 1, 0));
    }

    /**
     * 获取属性值的范围
     */
    private getPropertyValueRange(document: TextDocument, line: number): Range | undefined {
        const lineText = document.lineAt(line).text;
        const colonIndex = lineText.indexOf(':');

        if (colonIndex === -1) {
            return undefined;
        }

        const valueStart = colonIndex + 1;
        const valueText = lineText.substring(valueStart);
        const trimmedStart = valueText.length - valueText.trimStart().length;

        return new Range(new Position(line, valueStart + trimmedStart), new Position(line, lineText.length));
    }

    /**
     * 获取属性值
     */
    private getPropertyValue(document: TextDocument, line: number): string | undefined {
        const lineText = document.lineAt(line).text;
        const colonIndex = lineText.indexOf(':');

        if (colonIndex === -1) {
            return undefined;
        }

        return lineText.substring(colonIndex + 1).trim();
    }

    /**
     * 获取块信息（from, to, step 行号）
     */
    private getBlockInfo(
        document: TextDocument,
        startLine: number,
    ): { fromLine: number; toLine: number; stepLine: number } {
        const result = { fromLine: -1, toLine: -1, stepLine: -1 };
        const text = document.getText();
        const lines = text.split('\n');
        const blockIndent = getIndentLevel(lines[startLine]);

        // 向上扫描
        for (let i = startLine; i >= 0; i--) {
            const lineText = lines[i];
            const trimmed = lineText.trim();

            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            const lineIndent = getIndentLevel(lineText);
            if (lineIndent < blockIndent) {
                break;
            }

            if (lineIndent === blockIndent) {
                if (trimmed.startsWith('from:')) {
                    result.fromLine = i;
                } else if (trimmed.startsWith('to:')) {
                    result.toLine = i;
                } else if (trimmed.startsWith('step:')) {
                    result.stepLine = i;
                }
            }
        }

        // 向下扫描
        for (let i = startLine + 1; i < lines.length; i++) {
            const lineText = lines[i];
            const trimmed = lineText.trim();

            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            const lineIndent = getIndentLevel(lineText);
            if (lineIndent < blockIndent) {
                break;
            }

            if (lineIndent === blockIndent) {
                if (trimmed.startsWith('from:')) {
                    result.fromLine = i;
                } else if (trimmed.startsWith('to:')) {
                    result.toLine = i;
                } else if (trimmed.startsWith('step:')) {
                    result.stepLine = i;
                }
            }
        }

        return result;
    }

    /**
     * 查找所有缺失的必需属性
     */
    private findAllMissingRequiredProperties(
        document: TextDocument,
        range: Range,
        typeDef: { requiredProperties: string[] },
    ): string[] {
        const text = document.getText();
        const lines = text.split('\n');
        const blockIndent = getIndentLevel(lines[range.start.line]);
        const existingProps = new Set<string>();

        // 收集已存在的属性
        for (let i = range.start.line; i >= 0; i--) {
            const lineText = lines[i];
            const trimmed = lineText.trim();

            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            const lineIndent = getIndentLevel(lineText);
            if (lineIndent < blockIndent) {
                break;
            }

            if (lineIndent === blockIndent) {
                const propMatch = trimmed.match(/^([a-zA-Z_-]+):/);
                if (propMatch) {
                    existingProps.add(propMatch[1]);
                }
            }
        }

        for (let i = range.start.line + 1; i < lines.length; i++) {
            const lineText = lines[i];
            const trimmed = lineText.trim();

            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            const lineIndent = getIndentLevel(lineText);
            if (lineIndent < blockIndent) {
                break;
            }

            if (lineIndent === blockIndent) {
                const propMatch = trimmed.match(/^([a-zA-Z_-]+):/);
                if (propMatch) {
                    existingProps.add(propMatch[1]);
                }
            }
        }

        return typeDef.requiredProperties.filter((prop) => !existingProps.has(prop));
    }

    /**
     * 查找相似的属性名
     */
    private findSimilarProperties(target: string, validProps: string[]): string[] {
        return validProps
            .map((prop) => ({
                prop,
                score: this.calculateSimilarity(target, prop),
            }))
            .filter((item) => item.score > 0.4)
            .sort((a, b) => b.score - a.score)
            .map((item) => item.prop);
    }

    /**
     * 计算字符串相似度
     */
    private calculateSimilarity(a: string, b: string): number {
        const longer = a.length > b.length ? a : b;
        const shorter = a.length > b.length ? b : a;

        if (longer.length === 0) {
            return 1.0;
        }

        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    /**
     * Levenshtein 距离计算
     */
    private levenshteinDistance(a: string, b: string): number {
        const matrix: number[][] = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
                }
            }
        }

        return matrix[b.length][a.length];
    }
}
