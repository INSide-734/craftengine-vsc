import { EditorUri, EditorPosition, createEditorPosition } from '../../../core/types/EditorTypes';
import * as yaml from 'yaml';
import { ITemplate, ITemplateParameter } from '../../../core/interfaces/ITemplate';
import { ITemplateParseError } from '../../../core/interfaces/ITemplateService';
import { Template } from '../../entities/Template';
import { IConfiguration } from '../../../core/interfaces/IConfiguration';
import { ILogger } from '../../../core/interfaces/ILogger';

/**
 * 模板解析结果
 */
export interface ITemplateParseResultInternal {
    templates: ITemplate[];
    errors: ITemplateParseError[];
}

/**
 * 模板解析服务
 * 
 * 负责从 YAML 文本中解析出 CraftEngine 模板定义。
 * 支持以下特殊语法：
 * - templates#category#subcategory 格式的键名
 * - 包含冒号的模板名称（如 default:model/cube_all）
 * - ${param} 或 ${param:-default} 格式的参数占位符
 */
export class TemplateParserService {
    /** 默认特殊参数 */
    private static readonly DEFAULT_SPECIAL_PARAMS = new Set(['__NAMESPACE__', '__ID__']);

    /** 默认排除的元数据键 */
    private static readonly DEFAULT_EXCLUDE_KEYS = new Set(['template', 'arguments']);

    /** 默认模板键名 */
    private static readonly DEFAULT_TEMPLATE_KEY_FALLBACK = 'templates';

    /** 特殊参数，由 CraftEngine 自动提供，不需要用户填写 */
    private readonly specialParams: Set<string>;

    /** 排除的元数据键 */
    private readonly excludeKeys: Set<string>;

    /** 默认模板键名 */
    private readonly defaultTemplateKey: string;

    private readonly logger: ILogger;
    private readonly configuration?: IConfiguration;

    constructor(
        logger: ILogger,
        configuration?: IConfiguration,
        templateParserConfig?: {
            specialParams?: string[];
            excludeKeys?: string[];
            defaultTemplateKey?: string;
        }
    ) {
        this.logger = logger.createChild('TemplateParserService');
        this.configuration = configuration;
        this.specialParams = templateParserConfig?.specialParams
            ? new Set(templateParserConfig.specialParams)
            : TemplateParserService.DEFAULT_SPECIAL_PARAMS;
        this.excludeKeys = templateParserConfig?.excludeKeys
            ? new Set(templateParserConfig.excludeKeys)
            : TemplateParserService.DEFAULT_EXCLUDE_KEYS;
        this.defaultTemplateKey = templateParserConfig?.defaultTemplateKey
            ?? TemplateParserService.DEFAULT_TEMPLATE_KEY_FALLBACK;
    }
    
    /**
     * 从文本中解析模板（带错误收集）
     */
    parseTemplatesWithErrors(text: string, sourceFile: EditorUri): ITemplateParseResultInternal {
        const templates: ITemplate[] = [];
        const errors: ITemplateParseError[] = [];
        
        if (!text || typeof text !== 'string') {
            return { templates, errors };
        }
        
        try {
            const parsedYaml = yaml.parse(text);
            
            if (!parsedYaml || typeof parsedYaml !== 'object') {
                return { templates, errors };
            }
            
            const lines = text.split('\n');
            const templateKey = this.configuration?.get<string>('parser.templateKey', this.defaultTemplateKey) 
                || this.defaultTemplateKey;
            
            // 查找所有以模板键开头的顶级键
            for (const topLevelKey in parsedYaml) {
                if (!topLevelKey.startsWith(templateKey)) {
                    continue;
                }
                
                const templatesNode = parsedYaml[topLevelKey];
                if (!templatesNode || typeof templatesNode !== 'object' || Array.isArray(templatesNode)) {
                    continue;
                }
                
                // 提取模板
                for (const templateName in templatesNode) {
                    // 有效模板名必须包含冒号
                    if (!templateName.includes(':')) {
                        continue;
                    }
                    
                    try {
                        const definition = templatesNode[templateName];
                        const template = this.createTemplate(templateName, definition, lines, sourceFile);
                        
                        if (template) {
                            templates.push(template);
                        }
                    } catch (error) {
                        errors.push({
                            message: `Template "${templateName}": ${error instanceof Error ? error.message : String(error)}`,
                            severity: 'error'
                        });
                    }
                }
            }
            
        } catch (error) {
            errors.push({
                message: `YAML parsing error: ${error instanceof Error ? error.message : String(error)}`,
                severity: 'error'
            });
        }
        
        return { templates, errors };
    }
    
    /**
     * 从定义创建单个模板实例
     *
     * @param name 模板名称
     * @param definition 模板定义对象
     * @param lines 文档行内容
     * @param sourceFile 源文件路径
     * @returns 模板实例，如果创建失败则返回 null
     */
    createTemplate(
        name: string,
        definition: unknown,
        lines: string[],
        sourceFile: EditorUri
    ): ITemplate | null {
        const parameters = this.parseParameters(definition);
        const content = this.extractContent(definition);
        const position = this.findPosition(lines, name);
        
        const result = Template.createSafe({
            id: name,
            name,
            parameters,
            content,
            sourceFile,
            definitionPosition: position,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        
        if (result.success) {
            return result.template;
        }
        
        this.logger.debug('Failed to create template', { name, error: result.error });
        return null;
    }
    
    /**
     * 解析模板参数
     */
    private parseParameters(definition: unknown): ITemplateParameter[] {
        const paramMap = new Map<string, ITemplateParameter>();
        this.collectParameters(definition, paramMap);
        return Array.from(paramMap.values());
    }
    
    /**
     * 递归收集参数引用
     */
    private collectParameters(node: unknown, paramMap: Map<string, ITemplateParameter>): void {
        if (typeof node === 'string') {
            // 匹配 ${paramName} 或 ${paramName:-defaultValue}
            const regex = /\$\{([^}]+?)(?::-([^}]*?))?\}/g;
            let match;
            
            while ((match = regex.exec(node)) !== null) {
                const paramName = match[1].trim();
                const defaultValue = match[2];
                
                if (this.specialParams.has(paramName) || paramMap.has(paramName)) {
                    continue;
                }
                
                paramMap.set(paramName, {
                    name: paramName,
                    required: defaultValue === undefined,
                    type: 'any',
                    defaultValue
                });
            }
        } else if (Array.isArray(node)) {
            node.forEach(item => this.collectParameters(item, paramMap));
        } else if (node && typeof node === 'object') {
            Object.values(node as Record<string, unknown>).forEach(v => this.collectParameters(v, paramMap));
        }
    }
    
    /**
     * 提取模板内容（排除元数据键）
     */
    private extractContent(definition: unknown): Record<string, unknown> {
        if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
            return {};
        }
        
        const content: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(definition as Record<string, unknown>)) {
            if (!this.excludeKeys.has(key)) {
                content[key] = JSON.parse(JSON.stringify(value)); // 简单深拷贝
            }
        }
        return content;
    }
    
    /**
     * 查找模板定义位置
     */
    private findPosition(lines: string[], templateName: string): EditorPosition {
        const escapedName = templateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`^\\s*${escapedName}\\s*:`);

        for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
                const column = lines[i].indexOf(templateName);
                return createEditorPosition(i, column >= 0 ? column : 0);
            }
        }

        return createEditorPosition(0, 0);
    }
}
