import { MarkdownString } from 'vscode';
import { type ITemplate, type ITemplateParameter } from '../../../core/interfaces/ITemplate';
import { getRelativePath } from '../../../infrastructure/utils/StringUtils';

/**
 * 模板文档构建器
 *
 * 提供模板文档的统一生成逻辑，供悬停提示和补全项共享使用。
 * 避免在 TemplateHoverProvider 和 TemplateNameCompletionStrategy 中重复代码。
 */

/**
 * 根据参数类型获取示例值
 *
 * @param param - 模板参数
 * @returns 适合该参数类型的示例值字符串
 */
export function getExampleValue(param: ITemplateParameter): string {
    if (param.defaultValue !== undefined) {
        return JSON.stringify(param.defaultValue);
    }

    switch (param.type?.toLowerCase()) {
        case 'string':
            return '"example"';
        case 'number':
            return '42';
        case 'boolean':
            return 'true';
        case 'array':
            return '[]';
        case 'object':
            return '{}';
        default:
            return `"${param.name}_value"`;
    }
}

/**
 * 构建模板的 Markdown 文档
 *
 * 生成包含概览、使用示例和元信息的完整模板文档。
 * 用于悬停提示和补全项的文档面板。
 *
 * @param template - 模板实体
 * @returns 格式化的 MarkdownString
 */
export function buildTemplateMarkdown(template: ITemplate): MarkdownString {
    const md = new MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    const requiredParams = template.getRequiredParameters();
    const optionalParams = template.getOptionalParameters();

    // 标题
    md.appendMarkdown(`## 🎯 ${template.name}\n\n`);

    // 参数概览
    md.appendMarkdown('## 📊 Overview\n\n');
    md.appendMarkdown('| 📈 Metric | 🔢 Count |\n|:----------|:--------:|\n');
    md.appendMarkdown(`| **Total Parameters** | \`${template.parameters.length}\` |\n`);
    if (requiredParams.length > 0) {
        md.appendMarkdown(`| **🔴 Required** | \`${requiredParams.length}\` |\n`);
    }
    if (optionalParams.length > 0) {
        md.appendMarkdown(`| **🟡 Optional** | \`${optionalParams.length}\` |\n`);
    }
    md.appendMarkdown('\n');

    // 使用示例
    md.appendMarkdown('## 💡 Usage Example\n\n');
    md.appendMarkdown('```yaml\n');
    md.appendMarkdown(`# 🎯 Template: ${template.name}\ntemplate: ${template.name}\n`);

    if (template.parameters.length > 0) {
        md.appendMarkdown('arguments:\n');

        if (requiredParams.length > 0) {
            md.appendMarkdown('  # 🔴 Required parameters\n');
            requiredParams.forEach((p) => md.appendMarkdown(`  ${p.name}: ${getExampleValue(p)}\n`));
        }

        if (optionalParams.length > 0) {
            md.appendMarkdown('  # 🟡 Optional parameters (uncomment to use)\n');
            optionalParams.forEach((p) => md.appendMarkdown(`  # ${p.name}: ${getExampleValue(p)}\n`));
        }
    }

    md.appendMarkdown('```\n\n');

    // 元信息
    md.appendMarkdown('---\n\n');
    md.appendMarkdown('### 📋 Template Information\n\n');

    const infoTable = [];
    infoTable.push('| 🏷️ Property | 📄 Value |');
    infoTable.push('|:------------|:---------|');

    const relativePath = getRelativePath(template.sourceFile.fsPath);
    infoTable.push(`| **📁 Source File** | \`${relativePath}\` |`);

    if (template.definitionPosition) {
        infoTable.push(`| **📍 Line Number** | \`${template.definitionPosition.line + 1}\` |`);
    }

    if (template.updatedAt) {
        infoTable.push(`| **🕒 Last Updated** | \`${template.updatedAt.toLocaleString()}\` |`);
    }

    md.appendMarkdown(infoTable.join('\n') + '\n\n');

    // 操作提示
    md.appendMarkdown('> **💡 Quick Actions:**\n');
    md.appendMarkdown('> - 🖱️ `Ctrl+Click` to jump to definition\n');
    md.appendMarkdown('> - 🔍 Hover over parameters for more details\n\n');

    return md;
}
