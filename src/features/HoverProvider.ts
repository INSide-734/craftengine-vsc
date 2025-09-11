// src/features/HoverProvider.ts
import { HoverProvider, TextDocument, Position, Hover, MarkdownString, Range } from 'vscode';
import { templateCache } from '../core/TemplateCache';
import { TemplateUtils } from '../utils';

/**
 * 模板悬停提示提供者类
 * 
 * 实现 VS Code 的 HoverProvider 接口，当用户将光标指向模板名称时，
 * 显示该模板的详细参数信息。
 * 
 * @implements {HoverProvider}
 */
export class TemplateHoverProvider implements HoverProvider {
    /**
     * 提供悬停提示信息
     * 
     * 当用户将光标悬停在文档中的某个位置时调用此方法。
     * 该方法会检查光标位置是否在模板名称上，如果是，则显示该模板的参数信息。
     * 
     * @param {TextDocument} document - 当前活动的文本文档
     * @param {Position} position - 光标位置
     * @returns {Hover | undefined} 悬停提示信息，如果不需要显示则返回 undefined
     * 
     * @example
     * // 当用户将光标悬停在以下内容上时：
     * // template: myTemplate
     * // 会显示 myTemplate 的参数信息
     */
    provideHover(document: TextDocument, position: Position): Hover | undefined {
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
        
        const templateNameStart = lineText.indexOf(templateName);
        const templateNameEnd = templateNameStart + templateName.length;
        
        // 从缓存中获取模板信息
        const template = templateCache.get(templateName);
        if (!template) {
            return undefined;
        }
        
        // 创建悬停提示内容
        const content = new MarkdownString();
        content.appendMarkdown(`## 🚀 **${template.name}** Template\n\n`);
        
        if (template.parameters.length > 0) {
            content.appendMarkdown('### 📋 Parameters:\n\n');
            template.parameters.forEach((param, _index) => {
                content.appendMarkdown(`- **\`${param}\`**\n`);
            });
        } else {
            content.appendMarkdown('### 📋 Parameters:\n\n');
            content.appendMarkdown('> *✨ This template has no parameters*\n\n');
        }
        
        content.appendMarkdown('---\n');
        content.appendMarkdown(`*📁 Source: ${template.sourceFile.fsPath.replace(/\\/g, '/')}*\n\n`);
        content.appendMarkdown('*💡 Tip: Hold Ctrl and click to go to template definition*');
        
        // 创建范围，覆盖整个模板名称
        const range = new Range(
            new Position(position.line, templateNameStart),
            new Position(position.line, templateNameEnd)
        );
        
        return new Hover(content, range);
    }
}
