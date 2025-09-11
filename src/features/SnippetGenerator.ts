// src/features/SnippetGenerator.ts
import { window, SnippetString } from 'vscode';
import { Template } from '../types';
import { DocumentUtils } from '../utils';

/**
 * 为给定的模板生成一个可交互的 SnippetString
 * 
 * 根据模板参数生成包含占位符的代码片段，用户可以通过 Tab 键在参数之间跳转并输入值。
 * 支持必需参数和可选参数的区分显示。
 * 
 * @param {Template} template - 要生成代码片段的模板对象
 * @param {string} baseIndent - 基础缩进字符串，用于保持代码格式
 * @param {string} insertionMode - 插入模式: 'direct' | 'array' | 'nested'
 * @returns {SnippetString} 包含模板内容的代码片段字符串
 * 
 * @example
 * // 对于模板 { name: "api", requiredParameters: ["url"], optionalParameters: ["method"] }
 * // 生成的片段为：
 * // api
 * // arguments:
 * //   url: ${1:url}
 * //   method: ${2:method} # 可选
 */
function buildSnippet(template: Template, baseIndent: string, _insertionMode: string = 'direct'): SnippetString {
    const snippet = new SnippetString();

    snippet.appendText(template.name);

    if (template.parameters.length > 0) {
        snippet.appendText(`\n${baseIndent}arguments:\n`);
        
        let placeholderIndex = 1;
        
        // 首先添加必需参数
        template.requiredParameters.forEach((param) => {
            snippet.appendText(`${baseIndent}  ${param}: `);
            snippet.appendPlaceholder(param, placeholderIndex++);
            snippet.appendText('\n');
        });
        
        // 然后添加可选参数（带注释）
        template.optionalParameters.forEach((param) => {
            snippet.appendText(`${baseIndent}  ${param}: `);
            snippet.appendPlaceholder(param, placeholderIndex++);
            snippet.appendText(' # optional\n');
        });
    }

    return snippet;
}

/**
 * 在编辑器中插入模板代码段
 * 
 * 将模板转换为可交互的代码片段并插入到当前光标位置。该方法会：
 * 1. 分析当前上下文和插入模式
 * 2. 计算当前行的缩进
 * 3. 生成包含占位符的代码片段
 * 4. 智能替换内容
 * 
 * @param {Template} template - 要插入的模板对象
 * 
 * @example
 * // 当用户在 YAML 文件中输入 "template: " 并选择模板时，
 * // 会自动插入模板内容并创建可编辑的占位符
 */
export function insertTemplateSnippet(template: Template) {
    // 检查 template 参数是否有效
    if (!template || !template.name) {
        console.error('Invalid template provided to insertTemplateSnippet:', template);
        return;
    }

    const editor = window.activeTextEditor;
    if (!editor) {
        console.error('No active text editor found');
        return;
    }

    const document = editor.document;
    const position = editor.selection.active;
    const insertionContext = DocumentUtils.analyzeInsertionContext(document, position);

    // 1. 计算正确的缩进
    const baseIndent = insertionContext.baseIndent;

    // 2. 构造代码段
    const snippet = buildSnippet(template, baseIndent, insertionContext.mode);

    // 3. 计算需要替换的范围
    const rangeToReplace = DocumentUtils.calculateReplacementRange(document, position);

    // 4. 执行插入
    editor.insertSnippet(snippet, rangeToReplace).then(
        () => {
            console.log(`Successfully inserted template snippet: ${template.name}`);
        },
        (error) => {
            console.error('Failed to insert template snippet:', error);
        }
    );
}



/**
 * 创建增强的代码片段，支持更复杂的模板结构
 */
export function createEnhancedSnippet(template: Template, context: any): SnippetString {
    const snippet = new SnippetString();
    const baseIndent = context.baseIndent || '';
    
    // 根据不同的插入模式创建不同的片段格式
    switch (context.mode) {
        case 'array':
            // 数组模式：直接插入模板名
            snippet.appendText(template.name);
            break;
            
        case 'nested':
            // 嵌套模式：插入完整的模板结构
            snippet.appendText(template.name);
            if (template.parameters.length > 0) {
                snippet.appendText(`\n${baseIndent}arguments:`);
                addParameterSnippets(snippet, template, baseIndent + '  ');
            }
            break;
            
        default:
            // 直接模式：插入完整结构
            snippet.appendText(template.name);
            if (template.parameters.length > 0) {
                snippet.appendText(`\n${baseIndent}arguments:`);
                addParameterSnippets(snippet, template, baseIndent + '  ');
            }
            break;
    }
    
    return snippet;
}

/**
 * 添加参数代码片段
 */
function addParameterSnippets(snippet: SnippetString, template: Template, paramIndent: string) {
    let placeholderIndex = 1;
    
    // 添加必需参数
    template.requiredParameters.forEach((param) => {
        snippet.appendText(`\n${paramIndent}${param}: `);
        snippet.appendPlaceholder(param, placeholderIndex++);
    });
    
    // 添加可选参数
    template.optionalParameters.forEach((param) => {
        snippet.appendText(`\n${paramIndent}${param}: `);
        snippet.appendPlaceholder(`${param} # optional`, placeholderIndex++);
    });
}

/**
 * 生成智能的参数建议
 * 基于参数名称推断可能的值类型和默认值
 */
export function generateParameterSuggestions(paramName: string): string[] {
    const suggestions: { [key: string]: string[] } = {
        'url': ['https://api.example.com', '/api/v1/resource', '${baseUrl}/endpoint'],
        'path': ['minecraft:item/custom/', 'assets/textures/', 'models/'],
        'method': ['GET', 'POST', 'PUT', 'DELETE'],
        'material': ['minecraft:stone', 'minecraft:iron_ingot', 'minecraft:diamond'],
        'slot': ['head', 'chest', 'legs', 'feet', 'mainhand', 'offhand'],
        'part': ['helmet', 'chestplate', 'leggings', 'boots'],
        'type': ['minecraft:model', 'minecraft:special', 'minecraft:condition'],
        'name': ['${itemName}', '${templateName}', 'custom_item'],
        'id': ['${namespace}:${itemId}', 'custom:item'],
        'texture': ['minecraft:item/custom/', 'textures/item/'],
        'model': ['minecraft:item/generated', 'minecraft:item/handheld']
    };
    
    const lowerParam = paramName.toLowerCase();
    
    // 查找完全匹配
    if (suggestions[lowerParam]) {
        return suggestions[lowerParam];
    }
    
    // 查找部分匹配
    for (const [key, values] of Object.entries(suggestions)) {
        if (lowerParam.includes(key) || key.includes(lowerParam)) {
            return values;
        }
    }
    
    // 默认建议
    return ['${value}', 'placeholder', ''];
}