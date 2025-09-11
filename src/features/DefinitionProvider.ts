// src/features/DefinitionProvider.ts
import { DefinitionProvider, TextDocument, Position, Definition, Location } from 'vscode';
import { templateCache } from '../core/TemplateCache';
import { TemplateUtils } from '../utils';

/**
 * 模板定义跳转提供者类
 * 
 * 实现 VS Code 的 DefinitionProvider 接口，当用户按住Ctrl+左键点击模板名称时，
 * 跳转到该模板的定义位置。
 * 
 * @implements {DefinitionProvider}
 */
export class TemplateDefinitionProvider implements DefinitionProvider {
    /**
     * 提供定义跳转位置
     * 
     * 当用户按住Ctrl+左键点击文档中的某个位置时调用此方法。
     * 该方法会检查光标位置是否在模板名称上，如果是，则返回该模板的定义位置。
     * 
     * @param {TextDocument} document - 当前活动的文本文档
     * @param {Position} position - 光标位置
     * @returns {Definition | undefined} 定义位置，如果不需要跳转则返回 undefined
     * 
     * @example
     * // 当用户按住Ctrl+左键点击以下内容时：
     * // template: myTemplate
     * // 会跳转到 myTemplate 的定义位置
     */
    provideDefinition(document: TextDocument, position: Position): Definition | undefined {
        const line = document.lineAt(position.line);
        const lineText = line.text;
        
        // 检查当前行是否包含 template: 模式
        const templateName = TemplateUtils.extractTemplateName(lineText);
        if (!templateName) {
            return undefined;
        }
        
        // 检查光标是否在模板名称范围内
        if (!TemplateUtils.isCursorOnTemplateName(lineText, position, templateName)) {
            return undefined;
        }
        
        // 从缓存中获取模板信息
        const template = templateCache.get(templateName);
        if (!template) {
            return undefined;
        }
        
        // 返回模板定义位置
        // 如果有具体的定义位置，使用它；否则使用文件开头位置
        const definitionPosition = template.definitionPosition || new Position(0, 0);
        const location = new Location(template.sourceFile, definitionPosition);
        
        return location;
    }
}
