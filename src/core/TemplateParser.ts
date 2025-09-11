import * as yaml from 'yaml';
import { Template } from '../types';
import { Uri } from 'vscode';
import { TemplateUtils } from '../utils';

// 调试日志控制
const DEBUG_ENABLED = process.env.NODE_ENV !== 'test' && process.env.DEBUG === 'true';

// 缓存正则表达式以提高性能
const TEMPLATE_PARAM_REGEX = /\$\{([^}]+?)(?::-.*?)?}/g;
const SPECIAL_PARAMS = new Set(['__NAMESPACE__', '__ID__']);

/**
 * 从 YAML 文本内容中解析出 CraftEngine 模板
 * 
 * 解析 YAML 文件内容，查找所有以 "templates" 开头的键，
 * 并提取其中的模板定义和参数占位符。
 * 
 * @param {string} fileContent - YAML 文件的字符串内容
 * @param {Uri} fileUri - 文件的 URI，用于溯源
 * @returns {Template[]} 解析出的模板数组
 * 
 * @example
 * // 解析 YAML 文件内容
 * const templates = parseTemplates(yamlContent, fileUri);
 * console.log(`Found ${templates.length} templates`);
 */
export function parseTemplates(fileContent: string, fileUri: Uri): Template[] {
    if (!fileContent || typeof fileContent !== 'string') {
        return [];
    }

    const foundTemplates: Template[] = [];
    
    try {
        const parsedYaml = yaml.parse(fileContent);
        if (!parsedYaml || typeof parsedYaml !== 'object') {
            return [];
        }

        // 将文件内容按行分割，用于查找模板定义位置
        const lines = fileContent.split('\n');

        // 查找所有以 templates 开头的键
        for (const key in parsedYaml) {
            if (key.startsWith('templates')) {
                const templatesNode = parsedYaml[key];
                if (isValidTemplatesNode(templatesNode)) {
                    const templates = extractTemplatesFromNode(templatesNode, lines, fileUri);
                    foundTemplates.push(...templates);
                }
            }
        }
    } catch (error) {
        // 只在非测试环境中输出错误信息
        if (!isTestEnvironment()) {
            console.error(`Error parsing YAML content from ${fileUri.fsPath}:`, error);
        }
    }
    
    return foundTemplates;
}



/**
 * 检查一个键是否是合法的模板名称
 * 
 * 根据 CraftEngine 的命名约定，模板名称必须包含冒号。
 * 
 * @param {string} key - 要检查的键名
 * @returns {boolean} 如果是合法的模板名称则返回 true，否则返回 false
 * 
 * @example
 * // 检查键名是否为合法模板名称
 * isTemplateKey('api:rest'); // true
 * isTemplateKey('api'); // false
 */
function isTemplateKey(key: string): boolean {
    return TemplateUtils.isValidTemplateName(key);
}

/**
 * 检查模板节点是否有效
 * 
 * @param {any} node - 要检查的节点
 * @returns {boolean} 如果节点有效则返回 true
 */
function isValidTemplatesNode(node: any): boolean {
    return typeof node === 'object' && node !== null && !Array.isArray(node);
}

/**
 * 从模板节点中提取所有模板
 * 
 * @param {object} templatesNode - 模板节点
 * @param {string[]} lines - 文件行数组
 * @param {Uri} fileUri - 文件 URI
 * @returns {Template[]} 提取的模板数组
 */
function extractTemplatesFromNode(templatesNode: Record<string, any>, lines: string[], fileUri: Uri): Template[] {
    const templates: Template[] = [];
    
    for (const templateKey in templatesNode) {
        if (isTemplateKey(templateKey)) {
            const definition = templatesNode[templateKey];
            if (DEBUG_ENABLED) {
                console.log(`Processing template: ${templateKey}`);
                console.log('Template definition:', definition);
            }
            const parameterResult = findParameters(definition);
            if (DEBUG_ENABLED) {
                console.log(`Parameter result for ${templateKey}:`, parameterResult);
            }
            
            // 查找模板定义在文件中的位置
            const definitionPosition = TemplateUtils.findTemplatePosition(lines, templateKey);
            
            templates.push({
                name: templateKey,
                parameters: parameterResult.all,
                requiredParameters: parameterResult.required,
                optionalParameters: parameterResult.optional,
                sourceFile: fileUri,
                definitionPosition: definitionPosition,
            });
        }
    }
    
    return templates;
}

/**
 * 检查是否在测试环境中
 * 
 * @returns {boolean} 如果在测试环境中则返回 true
 */
function isTestEnvironment(): boolean {
    return process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'testing';
}

/**
 * 递归地从模板定义中查找所有参数占位符
 * 
 * 将模板定义转换为 JSON 字符串，然后使用正则表达式查找所有 ${...} 格式的参数占位符。
 * 返回去重后的参数名称数组，并区分必需参数和可选参数。
 * 
 * @param {any} definition - 模板的定义体 (可以是任何 JS 对象)
 * @returns {{all: string[], required: string[], optional: string[]}} 参数分类结果
 * 
 * @example
 * // 从模板定义中提取参数
 * const definition = { url: '${baseUrl}/api', method: '${httpMethod:-GET}' };
 * const params = findParameters(definition);
 * // 返回: {all: ['baseUrl', 'httpMethod'], required: ['baseUrl'], optional: ['httpMethod']}
 */
function findParameters(definition: any): {all: string[], required: string[], optional: string[]} {
    if (!definition) {
        return { all: [], required: [], optional: [] };
    }

    const allParams = new Set<string>();
    const requiredParams = new Set<string>();
    const optionalParams = new Set<string>();
    
    try {
        const contentString = JSON.stringify(definition);
        if (DEBUG_ENABLED) {
            console.log('Parsing template definition:', contentString);
        }
        
        // 重置正则表达式的 lastIndex
        TEMPLATE_PARAM_REGEX.lastIndex = 0;
        
        let match;
        while ((match = TEMPLATE_PARAM_REGEX.exec(contentString)) !== null) {
            const fullMatch = match[0]; // 完整的匹配，如 ${param:-default}
            const paramName = match[1]; // 参数名
            
            if (DEBUG_ENABLED) {
                console.log('Found parameter match:', { fullMatch, paramName });
            }
            
            // 排除 CraftEngine 的特殊参数，它们会自动从当前配置项获取
            if (!SPECIAL_PARAMS.has(paramName)) {
                allParams.add(paramName);
                
                // 检查是否有默认值（包含 :- 语法）
                if (fullMatch.includes(':-')) {
                    optionalParams.add(paramName);
                } else {
                    requiredParams.add(paramName);
                }
            }
        }
        
        if (DEBUG_ENABLED) {
            console.log('Parsed parameters:', {
                all: Array.from(allParams),
                required: Array.from(requiredParams),
                optional: Array.from(optionalParams)
            });
        }
    } catch (error) {
        if (DEBUG_ENABLED) {
            console.log('JSON.stringify failed, trying string processing:', error);
        }
        // 如果 JSON.stringify 失败，尝试直接处理字符串
        if (typeof definition === 'string') {
            processStringForParameters(definition, allParams, requiredParams, optionalParams);
        }
    }

    return {
        all: Array.from(allParams),
        required: Array.from(requiredParams),
        optional: Array.from(optionalParams)
    };
}

/**
 * 处理字符串中的参数占位符
 * 
 * @param {string} str - 要处理的字符串
 * @param {Set<string>} allParams - 所有参数的集合
 * @param {Set<string>} requiredParams - 必需参数的集合
 * @param {Set<string>} optionalParams - 可选参数的集合
 */
function processStringForParameters(
    str: string, 
    allParams: Set<string>, 
    requiredParams: Set<string>, 
    optionalParams: Set<string>
): void {
    TEMPLATE_PARAM_REGEX.lastIndex = 0;
    
    let match;
    while ((match = TEMPLATE_PARAM_REGEX.exec(str)) !== null) {
        const fullMatch = match[0];
        const paramName = match[1];
        
        if (!SPECIAL_PARAMS.has(paramName)) {
            allParams.add(paramName);
            
            if (fullMatch.includes(':-')) {
                optionalParams.add(paramName);
            } else {
                requiredParams.add(paramName);
            }
        }
    }
}