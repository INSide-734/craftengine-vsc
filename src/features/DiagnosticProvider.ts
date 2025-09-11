// src/features/DiagnosticProvider.ts
import { DiagnosticCollection, TextDocument, Diagnostic, DiagnosticSeverity, Range, Position, Uri, languages } from 'vscode';
import { templateCache } from '../core/TemplateCache';
import { Template } from '../types';
import { TemplateUtils } from '../utils';
import * as yaml from 'yaml';

/**
 * 诊断配置选项
 */
interface DiagnosticConfig {
    /** 是否启用诊断功能 */
    enabled: boolean;
    /** 诊断严重级别 */
    severity: DiagnosticSeverity;
    /** 是否显示详细错误信息 */
    verbose: boolean;
}

/**
 * 文档分析结果
 */
interface DocumentAnalysisResult {
    /** 解析后的 YAML 对象 */
    parsedYaml: any;
    /** 文档行数组 */
    lines: string[];
    /** 是否解析成功 */
    isValid: boolean;
}

/**
 * 模板使用信息
 */
interface TemplateUsage {
    /** 模板名称 */
    name: string;
    /** 模板对象 */
    template: Template;
    /** 缺少的参数 */
    missingParams: string[];
    /** 配置项键名 */
    configKey: string;
    /** 配置项值 */
    configValue: any;
    /** 是否为必需参数 */
    isRequired: boolean;
}

/**
 * 模板诊断管理器类
 * 
 * 管理模板使用时的参数缺失诊断功能。
 * 当用户使用模板但缺少必需参数时，会显示错误诊断信息。
 */
export class TemplateDiagnosticManager {
    private diagnosticCollection: DiagnosticCollection;
    private config: DiagnosticConfig;
    private documentCache = new Map<string, DocumentAnalysisResult>();
    
    constructor() {
        this.diagnosticCollection = languages.createDiagnosticCollection('craftengine');
        this.config = {
            enabled: true,
            severity: DiagnosticSeverity.Error,
            verbose: false
        };
    }
    
    /**
     * 更新诊断配置
     * 
     * @param {Partial<DiagnosticConfig>} newConfig - 新的配置选项
     */
    public updateConfig(newConfig: Partial<DiagnosticConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }
    
    /**
     * 更新文档的诊断信息
     * 
     * @param {TextDocument} document - 要分析的文本文档
     */
    public updateDiagnostics(document: TextDocument): void {
        if (!this.config.enabled) {
            this.clearDiagnostics(document.uri);
            return;
        }
        
        const diagnostics = this.analyzeDocument(document);
        this.diagnosticCollection.set(document.uri, diagnostics);
    }
    
    /**
     * 清除文档的诊断信息
     * 
     * @param {Uri} uri - 文档的 URI
     */
    public clearDiagnostics(uri: Uri): void {
        this.diagnosticCollection.delete(uri);
    }
    
    /**
     * 清除所有诊断信息
     */
    public clearAllDiagnostics(): void {
        this.diagnosticCollection.clear();
    }
    
    /**
     * 销毁诊断管理器
     */
    public dispose(): void {
        this.diagnosticCollection.dispose();
    }
    
    /**
     * 分析文档并生成诊断信息
     * 
     * @param {TextDocument} document - 要分析的文本文档
     * @returns {Diagnostic[]} 诊断信息数组
     */
    private analyzeDocument(document: TextDocument): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        
        try {
            const analysisResult = this.parseDocument(document);
            if (!analysisResult.isValid) {
                return diagnostics;
            }
            
            // 分析文档中的所有配置项
            const templateUsages = this.findTemplateUsages(analysisResult);
            
            // 为每个模板使用创建诊断
            for (const usage of templateUsages) {
                const diagnostic = this.createDiagnosticForUsage(document, usage);
                if (diagnostic) {
                    diagnostics.push(diagnostic);
                }
            }
        } catch (error) {
            this.logError('Document analysis failed', error, document.uri);
        }
        
        return diagnostics;
    }
    
    /**
     * 解析文档内容
     * 
     * @param {TextDocument} document - 文档对象
     * @returns {DocumentAnalysisResult} 解析结果
     */
    private parseDocument(document: TextDocument): DocumentAnalysisResult {
        const cacheKey = document.uri.toString();
        const cached = this.documentCache.get(cacheKey);
        
        // 如果缓存存在且文档版本未变化，直接返回缓存结果
        if (cached) {
            return cached;
        }
        
        const content = document.getText();
        const lines = content.split('\n');
        
        try {
            const parsedYaml = yaml.parse(content);
            const result: DocumentAnalysisResult = {
                parsedYaml: parsedYaml,
                lines: lines,
                isValid: parsedYaml && typeof parsedYaml === 'object'
            };
            
            // 缓存结果
            this.documentCache.set(cacheKey, result);
            return result;
        } catch (error) {
            this.logYamlParseError(error, document.uri);
            return {
                parsedYaml: null,
                lines: lines,
                isValid: false
            };
        }
    }
    
    /**
     * 查找文档中所有模板使用情况
     * 
     * @param {DocumentAnalysisResult} analysisResult - 文档分析结果
     * @returns {TemplateUsage[]} 模板使用信息数组
     */
    private findTemplateUsages(analysisResult: DocumentAnalysisResult): TemplateUsage[] {
        const usages: TemplateUsage[] = [];
        
        if (!analysisResult.isValid) {
            return usages;
        }
        
        // 分析文档中的所有配置项
        for (const [key, value] of Object.entries(analysisResult.parsedYaml)) {
            if (typeof value === 'object' && value !== null) {
                this.analyzeConfigItemRecursively(key, value, usages);
            }
        }
        
        return usages;
    }
    
    /**
     * 递归分析配置项
     * 
     * @param {string} configKey - 配置项键名
     * @param {any} configValue - 配置项值
     * @param {TemplateUsage[]} usages - 模板使用信息数组
     * @param {string} parentPath - 父级路径，用于避免重复分析
     */
    private analyzeConfigItemRecursively(configKey: string, configValue: any, usages: TemplateUsage[], parentPath: string = ''): void {
        // 首先检查当前项是否使用了模板
        this.analyzeConfigItem(configKey, configValue, usages);
        
        // 然后递归检查子项
        if (typeof configValue === 'object' && configValue !== null) {
            for (const [subKey, subValue] of Object.entries(configValue)) {
                // 跳过 arguments 字段，避免重复分析
                // 但保留 template 字段，因为我们需要分析包含 template 的子项
                if (subKey === 'arguments') {
                    continue;
                }
                
                if (typeof subValue === 'object' && subValue !== null) {
                    this.analyzeConfigItemRecursively(subKey, subValue, usages, parentPath);
                }
            }
        }
    }
    
    /**
     * 分析单个配置项
     * 
     * @param {string} configKey - 配置项键名
     * @param {any} configValue - 配置项值
     * @param {TemplateUsage[]} usages - 模板使用信息数组
     */
    private analyzeConfigItem(configKey: string, configValue: any, usages: TemplateUsage[]): void {
        // 检查是否使用了模板
        const templateNames = this.extractTemplateNames(configValue);
        if (templateNames.length === 0) {
            return;
        }
        
        // 获取提供的参数
        const providedArgs = this.extractProvidedArguments(configValue);
        
        // 为每个需要参数的模板创建使用信息
        for (const templateName of templateNames) {
            const template = templateCache.get(templateName);
            if (!template) {
                continue;
            }
            
            // 检查必需参数
            const missingRequiredParams = template.requiredParameters.filter(param => !providedArgs.has(param));
            if (missingRequiredParams.length > 0) {
                usages.push({
                    name: templateName,
                    template: template,
                    missingParams: missingRequiredParams,
                    configKey: configKey,
                    configValue: configValue,
                    isRequired: true
                });
            }
            
            // 检查可选参数（有默认值的参数）
            const missingOptionalParams = template.optionalParameters.filter(param => !providedArgs.has(param));
            if (missingOptionalParams.length > 0) {
                usages.push({
                    name: templateName,
                    template: template,
                    missingParams: missingOptionalParams,
                    configKey: configKey,
                    configValue: configValue,
                    isRequired: false
                });
            }
        }
    }
    
    /**
     * 为模板使用创建诊断信息
     * 
     * @param {TextDocument} document - 文档对象
     * @param {TemplateUsage} usage - 模板使用信息
     * @returns {Diagnostic | null} 诊断信息，如果无法创建则返回 null
     */
    private createDiagnosticForUsage(document: TextDocument, usage: TemplateUsage): Diagnostic | null {
        const { configKey, configValue, name: templateName, missingParams, isRequired } = usage;
        
        // 根据参数类型设置严重级别
        const severity = isRequired ? this.config.severity : DiagnosticSeverity.Warning;
        
        // 如果没有 arguments 部分，在 template 行添加诊断
        if (!this.hasArgumentsSection(configValue)) {
            const templatePosition = this.findTemplatePosition(document, configKey, [templateName]);
            
            if (templatePosition) {
                const diagnostic = new Diagnostic(
                    templatePosition,
                    this.createMissingArgumentsSectionMessage(templateName, missingParams, isRequired),
                    severity
                );
                diagnostic.source = 'CraftEngine';
                diagnostic.code = isRequired ? 'missing-arguments-section' : 'missing-optional-arguments-section';
                return diagnostic;
            }
        } else {
            // 如果有 arguments 部分但缺少参数，在 arguments 部分添加诊断
            const argumentsPosition = this.findArgumentsPosition(document, configKey);
            
            if (argumentsPosition) {
                const diagnostic = new Diagnostic(
                    argumentsPosition,
                    this.createMissingParamsMessage(templateName, missingParams, isRequired),
                    severity
                );
                diagnostic.source = 'CraftEngine';
                diagnostic.code = isRequired ? 'missing-template-arguments' : 'missing-optional-template-arguments';
                return diagnostic;
            }
        }
        
        return null;
    }
    
    /**
     * 从配置项中提取模板名称列表
     * 
     * @param {any} configValue - 配置项值
     * @returns {string[]} 模板名称列表，如果没有使用模板则返回空数组
     */
    private extractTemplateNames(configValue: any): string[] {
        if (typeof configValue === 'object' && configValue !== null) {
            // 检查 template 字段
            if (configValue.template) {
                if (typeof configValue.template === 'string') {
                    return [configValue.template];
                } else if (Array.isArray(configValue.template)) {
                    // 对于多模板情况，返回所有模板
                    return configValue.template.filter((t: any) => typeof t === 'string');
                }
            }
        }
        return [];
    }
    
    /**
     * 从配置项中提取提供的参数
     * 
     * @param {any} configValue - 配置项值
     * @returns {Set<string>} 提供的参数名称集合
     */
    private extractProvidedArguments(configValue: any): Set<string> {
        const providedArgs = new Set<string>();
        
        if (typeof configValue === 'object' && configValue !== null && configValue.arguments) {
            const args = configValue.arguments;
            if (typeof args === 'object' && args !== null) {
                for (const argName in args) {
                    providedArgs.add(argName);
                }
            }
        }
        
        return providedArgs;
    }
    
    /**
     * 查找 arguments 部分在文档中的位置
     * 
     * @param {TextDocument} document - 文档对象
     * @param {string} configKey - 配置项键名
     * @returns {Range | null} arguments 部分的位置范围
     */
    private findArgumentsPosition(document: TextDocument, configKey: string): Range | null {
        const analysisResult = this.parseDocument(document);
        if (!analysisResult.isValid) {
            return null;
        }
        
        const lines = analysisResult.lines;
        const configStartLine = TemplateUtils.findConfigStartLine(lines, configKey);
        
        if (configStartLine === -1) {
            return null;
        }
        
        // 在配置项范围内查找 arguments 部分
        const argumentsLine = TemplateUtils.findKeyLineInConfig(lines, configStartLine, 'arguments');
        
        if (argumentsLine === -1) {
            // 如果没有找到 arguments 部分，在配置项末尾添加诊断
            const configEndLine = TemplateUtils.findConfigEndLine(lines, configStartLine);
            const position = new Position(configEndLine, 0);
            return new Range(position, position);
        }
        
        // 返回 arguments 行的位置
        const line = lines[argumentsLine];
        const argumentsStart = line.indexOf('arguments');
        const position = new Position(argumentsLine, argumentsStart);
        return new Range(position, position);
    }
    
    
    
    
    
    /**
     * 检查配置项是否有 arguments 部分
     * 
     * @param {any} configValue - 配置项值
     * @returns {boolean} 是否有 arguments 部分
     */
    private hasArgumentsSection(configValue: any): boolean {
        return typeof configValue === 'object' && configValue !== null && 'arguments' in configValue;
    }
    
    /**
     * 查找 template 行在文档中的位置
     * 
     * @param {TextDocument} document - 文档对象
     * @param {string} configKey - 配置项键名
     * @param {string[]} templateNames - 模板名称列表
     * @returns {Range | null} template 行的位置范围
     */
    private findTemplatePosition(document: TextDocument, configKey: string, templateNames: string[]): Range | null {
        const analysisResult = this.parseDocument(document);
        if (!analysisResult.isValid) {
            return null;
        }
        
        const lines = analysisResult.lines;
        const configStartLine = TemplateUtils.findConfigStartLine(lines, configKey);
        
        if (configStartLine === -1) {
            return null;
        }
        
        // 在配置项范围内查找 template 部分
        const templateLine = TemplateUtils.findKeyLineInConfig(lines, configStartLine, 'template');
        
        if (templateLine === -1) {
            return null;
        }
        
        // 查找模板名称在行中的位置
        const templateNamePosition = TemplateUtils.findTemplateNameRange(lines[templateLine], templateNames, templateLine);
        if (templateNamePosition) {
            return templateNamePosition;
        }
        
        // 如果找不到具体的模板名称位置，返回 template: 的位置
        const line = lines[templateLine];
        const templateStart = line.indexOf('template');
        const position = new Position(templateLine, templateStart);
        return new Range(position, position);
    }
    
    
    
    /**
     * 创建缺少 arguments 部分的友好错误消息
     * 
     * @param {string} templateName - 模板名称
     * @param {string[]} missingParams - 缺少的参数列表
     * @param {boolean} isRequired - 是否为必需参数
     * @returns {string} 友好的错误消息
     */
    private createMissingArgumentsSectionMessage(templateName: string, missingParams: string[], isRequired: boolean): string {
        const paramType = isRequired ? 'requires' : 'has optional parameter';
        const action = isRequired ? 'Please add arguments section and provide this parameter.' : 'Consider adding arguments section to override the default value.';
        
        if (missingParams.length === 1) {
            return `Template "${templateName}" ${paramType} "${missingParams[0]}" but is missing arguments section. ${action}`;
        } else {
            const missingList = missingParams.map(param => `"${param}"`).join(', ');
            return `Template "${templateName}" ${paramType} ${missingList} but is missing arguments section. ${action}`;
        }
    }
    
    /**
     * 创建缺少参数的友好错误消息
     * 
     * @param {string} templateName - 模板名称
     * @param {string[]} missingParams - 缺少的参数列表
     * @param {boolean} isRequired - 是否为必需参数
     * @returns {string} 友好的错误消息
     */
    private createMissingParamsMessage(templateName: string, missingParams: string[], isRequired: boolean): string {
        const paramType = isRequired ? 'required' : 'optional';
        const action = isRequired ? 'Please add this parameter in the arguments section.' : 'Consider adding this parameter to override the default value.';
        
        if (missingParams.length === 1) {
            return `Template "${templateName}" is missing ${paramType} parameter "${missingParams[0]}". ${action}`;
        } else {
            const missingList = missingParams.map(param => `"${param}"`).join(', ');
            return `Template "${templateName}" is missing the following ${paramType} parameters: ${missingList}. ${action}`;
        }
    }
    
    /**
     * 通用错误日志记录方法
     * 
     * @param {string} message - 错误消息
     * @param {any} error - 错误对象
     * @param {Uri} documentUri - 文档 URI
     */
    private logError(message: string, error: any, documentUri: Uri): void {
        if (!this.config.verbose) {
            return;
        }
        
        const fileName = documentUri.fsPath.split(/[/\\]/).pop() || 'unknown file';
        const timestamp = new Date().toLocaleString('en-US');
        
        console.warn(`[${timestamp}] ${message} - File: ${fileName}`, error);
    }
    
    /**
     * 美化并记录 YAML 解析错误
     * 
     * @param {any} error - 原始错误对象
     * @param {Uri} documentUri - 文档 URI
     */
    private logYamlParseError(error: any, documentUri: Uri): void {
        if (!this.config.verbose) {
            return;
        }
        
        const fileName = documentUri.fsPath.split(/[/\\]/).pop() || 'unknown file';
        const errorMessage = this.extractYamlErrorMessage(error);
        const errorLocation = this.extractYamlErrorLocation(error);
        
        const timestamp = new Date().toLocaleString('en-US');
        let log = `[${timestamp}] YAML Parse Error - File: ${fileName}\n`;
        log += `Error: ${errorMessage}\n`;
        
        if (errorLocation) {
            log += `Location: ${errorLocation}\n`;
        }
        
        console.warn(log);
    }
    
    /**
     * 从 YAML 错误中提取友好的错误消息
     * 
     * @param {any} error - 原始错误对象
     * @returns {string} 友好的错误消息
     */
    private extractYamlErrorMessage(error: any): string {
        if (!error) {
            return 'Unknown YAML parse error';
        }
        
        const errorStr = error.toString();
        
        // 提取具体的错误描述
        const errorMap: Record<string, string> = {
            'Nested mappings are not allowed in compact mappings': 'YAML Syntax Error: Nested mappings are not allowed in compact mappings',
            'Unexpected end of file': 'YAML Syntax Error: Unexpected end of file',
            'Unexpected character': 'YAML Syntax Error: Unexpected character',
            'Invalid indentation': 'YAML Syntax Error: Invalid indentation',
            'Duplicate key': 'YAML Syntax Error: Duplicate key',
            'Invalid escape sequence': 'YAML Syntax Error: Invalid escape sequence'
        };
        
        for (const [key, value] of Object.entries(errorMap)) {
            if (errorStr.includes(key)) {
                return value;
            }
        }
        
        // 尝试从错误消息中提取更具体的信息
        const match = errorStr.match(/YAMLParseError:\s*(.+?)(?:\s+at\s|$)/);
        if (match && match[1]) {
            return `YAML Parse Error: ${match[1].trim()}`;
        }
        
        return 'YAML Parse Error: Please check file syntax';
    }
    
    /**
     * 从 YAML 错误中提取位置信息
     * 
     * @param {any} error - 原始错误对象
     * @returns {string} 位置信息
     */
    private extractYamlErrorLocation(error: any): string {
        if (!error) {
            return '';
        }
        
        const errorStr = error.toString();
        
        // 提取行号和列号
        const lineMatch = errorStr.match(/at line (\d+)/);
        const columnMatch = errorStr.match(/column (\d+)/);
        
        if (lineMatch && columnMatch) {
            return `Line ${lineMatch[1]}, Column ${columnMatch[1]}`;
        } else if (lineMatch) {
            return `Line ${lineMatch[1]}`;
        }
        
        return '';
    }
    
    /**
     * 清除文档缓存
     * 
     * @param {Uri} uri - 文档 URI
     */
    public clearDocumentCache(uri: Uri): void {
        this.documentCache.delete(uri.toString());
    }
    
    /**
     * 清除所有文档缓存
     */
    public clearAllDocumentCache(): void {
        this.documentCache.clear();
    }
}

