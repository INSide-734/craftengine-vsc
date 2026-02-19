/**
 * 扩展参数类型验证器
 *
 * 负责查找和验证文档中的扩展参数类型使用，
 * 包括结构验证、属性类型检查和语义验证
 */

import {
    TextDocument,
    Diagnostic,
    DiagnosticSeverity,
    Range,
    DiagnosticRelatedInformation,
    Location
} from 'vscode';
import { ILogger } from '../../../core/interfaces/ILogger';
import { IExtendedTypeService } from '../../../core/interfaces/IExtendedParameterType';
import { getIndentLevel } from '../../../infrastructure/utils';

/**
 * 扩展参数类型使用信息
 */
export interface ExtendedTypeUsage {
    typeName: string;
    typeRange: Range;
    properties: Map<string, { value: string; range: Range; lineNumber: number }>;
    blockStartLine: number;
    blockIndent: number;
}

/**
 * 扩展参数类型验证器
 *
 * 提供扩展参数类型的查找、结构验证和语义验证功能
 */
export class ExtendedTypeValidator {
    private readonly logger: ILogger;
    private readonly extendedTypeService: IExtendedTypeService;

    constructor(logger: ILogger, extendedTypeService: IExtendedTypeService) {
        this.logger = logger;
        this.extendedTypeService = extendedTypeService;
    }

    /**
     * 验证文档中的扩展参数类型
     *
     * 查找所有使用扩展参数类型的位置并验证其结构
     */
    async validateExtendedParameterTypes(document: TextDocument): Promise<Diagnostic[]> {
        const diagnostics: Diagnostic[] = [];

        try {
            const extendedTypeUsages = this.findExtendedTypeUsages(document);

            for (const usage of extendedTypeUsages) {
                const typeDiagnostics = this.validateExtendedTypeUsage(usage, document);
                diagnostics.push(...typeDiagnostics);
            }

            this.logger.debug('Extended parameter type validation completed', {
                file: document.fileName,
                usageCount: extendedTypeUsages.length,
                diagnosticCount: diagnostics.length
            });
        } catch (error) {
            this.logger.error('Error validating extended parameter types', error as Error, {
                file: document.fileName
            });
        }

        return diagnostics;
    }

    /**
     * 查找文档中的扩展参数类型使用
     */
    findExtendedTypeUsages(document: TextDocument): ExtendedTypeUsage[] {
        const usages: ExtendedTypeUsage[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // 跳过空行和注释
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            // 检查是否是 type: xxx 行
            const typeMatch = trimmed.match(/^type:\s*([a-z_]+)\s*$/);
            if (!typeMatch) {
                continue;
            }

            const typeName = typeMatch[1];

            // 检查是否是已知的扩展参数类型
            if (!this.extendedTypeService.isValidType(typeName)) {
                continue;
            }

            // 计算 type 值的范围
            const typeValueStart = line.indexOf(typeName);
            const typeValueEnd = typeValueStart + typeName.length;
            const typeRange = new Range(i, typeValueStart, i, typeValueEnd);

            // 获取当前块的缩进级别
            const blockIndent = getIndentLevel(line);

            // 收集同一块内的所有属性
            const properties = this.collectBlockProperties(lines, i, blockIndent);

            usages.push({
                typeName,
                typeRange,
                properties,
                blockStartLine: i,
                blockIndent
            });
        }

        return usages;
    }

    /**
     * 收集同一块内的所有属性
     */
    collectBlockProperties(
        lines: string[],
        startLine: number,
        blockIndent: number
    ): Map<string, { value: string; range: Range; lineNumber: number }> {
        const properties = new Map<string, { value: string; range: Range; lineNumber: number }>();

        // 向上扫描
        for (let i = startLine; i >= 0; i--) {
            const line = lines[i];
            const trimmed = line.trim();

            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            const lineIndent = getIndentLevel(line);

            // 如果缩进小于块缩进，说明退出了当前块
            if (lineIndent < blockIndent) {
                break;
            }

            // 只处理同级属性
            if (lineIndent === blockIndent) {
                const propMatch = trimmed.match(/^([a-zA-Z_-]+):\s*(.*)$/);
                if (propMatch) {
                    const propName = propMatch[1];
                    const propValue = propMatch[2];
                    const propStart = line.indexOf(propName);
                    const propEnd = propStart + propName.length;

                    if (!properties.has(propName)) {
                        properties.set(propName, {
                            value: propValue,
                            range: new Range(i, propStart, i, propEnd),
                            lineNumber: i
                        });
                    }
                }
            }
        }

        // 向下扫描
        for (let i = startLine + 1; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            const lineIndent = getIndentLevel(line);

            // 如果缩进小于块缩进，说明退出了当前块
            if (lineIndent < blockIndent) {
                break;
            }

            // 只处理同级属性
            if (lineIndent === blockIndent) {
                const propMatch = trimmed.match(/^([a-zA-Z_-]+):\s*(.*)$/);
                if (propMatch) {
                    const propName = propMatch[1];
                    const propValue = propMatch[2];
                    const propStart = line.indexOf(propName);
                    const propEnd = propStart + propName.length;

                    if (!properties.has(propName)) {
                        properties.set(propName, {
                            value: propValue,
                            range: new Range(i, propStart, i, propEnd),
                            lineNumber: i
                        });
                    }
                }
            }
        }

        return properties;
    }

    /**
     * 验证单个扩展参数类型使用
     */
    validateExtendedTypeUsage(usage: ExtendedTypeUsage, document: TextDocument): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        const typeDef = this.extendedTypeService.getTypeDefinition(usage.typeName);

        if (!typeDef) {
            return diagnostics;
        }

        // 1. 检查必需属性是否存在
        for (const requiredProp of typeDef.requiredProperties) {
            if (!usage.properties.has(requiredProp)) {
                const diagnostic = new Diagnostic(
                    usage.typeRange,
                    `Missing required property '${requiredProp}' for extended type '${usage.typeName}'`,
                    DiagnosticSeverity.Error
                );
                diagnostic.source = 'CraftEngine Extended Type';
                diagnostic.code = 'missing_required_property';

                // 添加相关信息
                diagnostic.relatedInformation = [
                    new DiagnosticRelatedInformation(
                        new Location(document.uri, usage.typeRange),
                        `Required properties for '${usage.typeName}': ${typeDef.requiredProperties.join(', ')}`
                    )
                ];

                diagnostics.push(diagnostic);
            }
        }

        // 2. 检查属性值类型
        for (const [propName, propInfo] of usage.properties) {
            const expectedType = typeDef.propertyTypes[propName];

            if (!expectedType) {
                // 未知属性 - 可能是用户自定义的，给出警告
                const allKnownProps = [...typeDef.requiredProperties, ...typeDef.optionalProperties];
                if (!allKnownProps.includes(propName) && propName !== 'type') {
                    const diagnostic = new Diagnostic(
                        propInfo.range,
                        `Unknown property '${propName}' for extended type '${usage.typeName}'`,
                        DiagnosticSeverity.Warning
                    );
                    diagnostic.source = 'CraftEngine Extended Type';
                    diagnostic.code = 'unknown_property';

                    diagnostic.relatedInformation = [
                        new DiagnosticRelatedInformation(
                            new Location(document.uri, usage.typeRange),
                            `Valid properties: ${allKnownProps.join(', ')}`
                        )
                    ];

                    diagnostics.push(diagnostic);
                }
                continue;
            }

            // 验证属性值类型
            const typeError = this.validatePropertyType(propName, propInfo.value, expectedType);
            if (typeError) {
                const diagnostic = new Diagnostic(
                    propInfo.range,
                    typeError,
                    DiagnosticSeverity.Error
                );
                diagnostic.source = 'CraftEngine Extended Type';
                diagnostic.code = 'invalid_property_type';

                diagnostics.push(diagnostic);
            }
        }

        // 3. 类型特定的语义验证
        const semanticDiagnostics = this.validateExtendedTypeSemantics(usage, document);
        diagnostics.push(...semanticDiagnostics);

        return diagnostics;
    }

    /**
     * 验证扩展参数类型的语义
     *
     * 针对不同类型进行深层次的语义验证
     */
    validateExtendedTypeSemantics(
        usage: ExtendedTypeUsage,
        document: TextDocument
    ): Diagnostic[] {
        switch (usage.typeName) {
            case 'self_increase_int':
                return this.validateSelfIncreaseIntSemantics(usage, document);
            case 'condition':
                return this.validateConditionSemantics(usage, document);
            case 'when':
                return this.validateWhenSemantics(usage, document);
            case 'expression':
                return this.validateExpressionSemantics(usage, document);
            default:
                return [];
        }
    }

    /**
     * 验证 self_increase_int 类型的语义
     */
    private validateSelfIncreaseIntSemantics(
        usage: ExtendedTypeUsage,
        document: TextDocument
    ): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];

        const fromProp = usage.properties.get('from');
        const toProp = usage.properties.get('to');
        const stepProp = usage.properties.get('step');

        // 解析数值
        const fromValue = fromProp ? parseInt(fromProp.value, 10) : NaN;
        const toValue = toProp ? parseInt(toProp.value, 10) : NaN;
        const stepValue = stepProp ? parseInt(stepProp.value, 10) : 1;

        // 跳过包含变量的值
        if (fromProp?.value.includes('${') || toProp?.value.includes('${') || stepProp?.value.includes('${')) {
            return diagnostics;
        }

        // 验证 step 不能为 0
        if (stepProp && stepValue === 0) {
            const diagnostic = new Diagnostic(
                stepProp.range,
                `Property 'step' cannot be 0 - this would cause an infinite loop`,
                DiagnosticSeverity.Error
            );
            diagnostic.source = 'CraftEngine Extended Type';
            diagnostic.code = 'invalid_step';
            diagnostics.push(diagnostic);
        }

        // 验证 from/to/step 的逻辑关系
        if (!isNaN(fromValue) && !isNaN(toValue) && stepValue !== 0) {
            if (fromValue < toValue && stepValue < 0) {
                const targetRange = stepProp?.range || usage.typeRange;
                const diagnostic = new Diagnostic(
                    targetRange,
                    `When 'from' (${fromValue}) < 'to' (${toValue}), 'step' should be positive, got ${stepValue}`,
                    DiagnosticSeverity.Error
                );
                diagnostic.source = 'CraftEngine Extended Type';
                diagnostic.code = 'invalid_step';
                diagnostic.relatedInformation = [
                    new DiagnosticRelatedInformation(
                        new Location(document.uri, usage.typeRange),
                        'Tip: Either change step to a positive value, or swap from and to values'
                    )
                ];
                diagnostics.push(diagnostic);
            } else if (fromValue > toValue && stepValue > 0) {
                const targetRange = stepProp?.range || usage.typeRange;
                const diagnostic = new Diagnostic(
                    targetRange,
                    `When 'from' (${fromValue}) > 'to' (${toValue}), 'step' should be negative, got ${stepValue}`,
                    DiagnosticSeverity.Error
                );
                diagnostic.source = 'CraftEngine Extended Type';
                diagnostic.code = 'invalid_step';
                diagnostic.relatedInformation = [
                    new DiagnosticRelatedInformation(
                        new Location(document.uri, usage.typeRange),
                        'Tip: Either change step to a negative value, or swap from and to values'
                    )
                ];
                diagnostics.push(diagnostic);
            }
        }

        return diagnostics;
    }

    /**
     * 验证 condition 类型的语义
     */
    private validateConditionSemantics(
        usage: ExtendedTypeUsage,
        _document: TextDocument
    ): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];

        const conditionProp = usage.properties.get('condition');

        // 验证 condition 字段应包含变量引用
        if (conditionProp) {
            const value = conditionProp.value.replace(/^["']|["']$/g, '');
            if (value && !value.includes('${')) {
                const diagnostic = new Diagnostic(
                    conditionProp.range,
                    `Property 'condition' should contain a variable reference (\${...}) for dynamic evaluation`,
                    DiagnosticSeverity.Warning
                );
                diagnostic.source = 'CraftEngine Extended Type';
                diagnostic.code = 'static_condition';
                diagnostics.push(diagnostic);
            }
        }

        return diagnostics;
    }

    /**
     * 验证 when 类型的语义
     */
    private validateWhenSemantics(
        usage: ExtendedTypeUsage,
        _document: TextDocument
    ): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];

        const sourceProp = usage.properties.get('source');
        const whenProp = usage.properties.get('when');

        // 验证 source 字段应包含变量引用
        if (sourceProp) {
            const value = sourceProp.value.replace(/^["']|["']$/g, '');
            if (value && !value.includes('${')) {
                const diagnostic = new Diagnostic(
                    sourceProp.range,
                    `Property 'source' should contain a variable reference (\${...}) for dynamic matching`,
                    DiagnosticSeverity.Warning
                );
                diagnostic.source = 'CraftEngine Extended Type';
                diagnostic.code = 'static_source';
                diagnostics.push(diagnostic);
            }
        }

        // 验证 when 对象不能为空（如果是空字符串说明是对象类型，需要有子属性）
        if (whenProp && whenProp.value === '') {
            // when 是对象类型，检查是否有子属性
            // 这里简单检查，实际上需要更复杂的 YAML 解析
            // 暂时跳过，因为空的 when 对象会在后续行中定义
        }

        return diagnostics;
    }

    /**
     * 验证 expression 类型的语义
     */
    private validateExpressionSemantics(
        usage: ExtendedTypeUsage,
        _document: TextDocument
    ): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];

        const expressionProp = usage.properties.get('expression');

        if (expressionProp) {
            const value = expressionProp.value.replace(/^["']|["']$/g, '');

            // 跳过空值
            if (!value) {
                return diagnostics;
            }

            // 检查括号匹配
            let parenCount = 0;
            for (const char of value) {
                if (char === '(') {parenCount++;}
                if (char === ')') {parenCount--;}
                if (parenCount < 0) {break;}
            }

            if (parenCount !== 0) {
                const diagnostic = new Diagnostic(
                    expressionProp.range,
                    `Unbalanced parentheses in expression`,
                    DiagnosticSeverity.Error
                );
                diagnostic.source = 'CraftEngine Extended Type';
                diagnostic.code = 'invalid_expression';
                diagnostics.push(diagnostic);
            }
        }

        return diagnostics;
    }

    /**
     * 验证属性值类型
     */
    validatePropertyType(propName: string, value: string, expectedType: string): string | null {
        // 跳过空值（可能是多行值）
        if (!value.trim()) {
            return null;
        }

        // 跳过包含变量引用的值（无法静态验证）
        if (value.includes('${')) {
            return null;
        }

        // 处理枚举类型
        if (expectedType.startsWith('enum:')) {
            const enumValues = expectedType.substring(5).split(',');
            const cleanValue = value.replace(/^["']|["']$/g, '');
            if (!enumValues.includes(cleanValue)) {
                return `Invalid value '${cleanValue}' for property '${propName}'. Expected one of: ${enumValues.join(', ')}`;
            }
            return null;
        }

        // 处理整数类型
        if (expectedType === 'integer') {
            const cleanValue = value.replace(/^["']|["']$/g, '');
            if (!/^-?\d+$/.test(cleanValue)) {
                return `Property '${propName}' expects an integer value, got '${cleanValue}'`;
            }
            return null;
        }

        // 其他类型（string, any, object）不做严格验证
        return null;
    }
}
