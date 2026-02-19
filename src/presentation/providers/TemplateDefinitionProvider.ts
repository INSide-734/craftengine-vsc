import { 
    DefinitionProvider, 
    TextDocument, 
    Position, 
    Definition, 
    LocationLink,
    Range,
    CancellationToken
} from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { ITemplateService } from '../../core/interfaces/ITemplateService';
import { ILogger } from '../../core/interfaces/ILogger';
import { IConfiguration } from '../../core/interfaces/IConfiguration';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { PerformanceMonitor } from '../../infrastructure/performance/PerformanceMonitor';
import { YamlHelper } from '../../infrastructure/yaml/YamlHelper';

/**
 * 模板定义跳转提供者
 * 
 * 提供从模板使用位置跳转到模板定义的功能
 */
export class TemplateDefinitionProvider implements DefinitionProvider {
    private readonly templateService: ITemplateService;
    private readonly logger: ILogger;
    private readonly configuration: IConfiguration;
    private readonly performanceMonitor: PerformanceMonitor;
    
    constructor() {
        this.templateService = ServiceContainer.getService<ITemplateService>(SERVICE_TOKENS.TemplateService);
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild('DefinitionProvider');
        this.configuration = ServiceContainer.getService<IConfiguration>(SERVICE_TOKENS.Configuration);
        this.performanceMonitor = ServiceContainer.getService<PerformanceMonitor>(SERVICE_TOKENS.PerformanceMonitor);
    }
    
    async provideDefinition(
        document: TextDocument,
        position: Position,
        token?: CancellationToken
    ): Promise<Definition | LocationLink[] | undefined> {
        const timer = this.performanceMonitor.startTimer('definition.provide');
        
        try {
            // 检查功能是否启用
            if (!this.configuration.get('definition.enabled', true)) {
                return undefined;
            }
            
            if (token?.isCancellationRequested) {
                return undefined;
            }
            
            this.logger.debug('Providing definition', {
                file: document.fileName,
                line: position.line,
                character: position.character
            });
            
            // 获取光标位置的模板名称和范围
            const templateInfo = this.getTemplateNameAtPosition(document, position);
            if (!templateInfo) {
                this.logger.debug('No template name found at position');
                return undefined;
            }
            
            this.logger.debug('Template name detected for definition', {
                templateName: templateInfo.name,
                range: templateInfo.range
            });
            
            // 搜索模板定义
            const searchResults = await this.templateService.searchTemplates({
                prefix: templateInfo.name,
                limit: 10, // 可能有多个同名模板
                fuzzy: false
            });
            
            if (searchResults.length === 0) {
                this.logger.debug('Template definition not found', { templateName: templateInfo.name });
                return undefined;
            }
            
            // 创建定义位置列表（使用 LocationLink 以支持完整的模板名称高亮）
            const definitions: LocationLink[] = [];
            
            for (const result of searchResults) {
                const template = result.template;
                
                // 精确匹配模板名称
                if (template.name === templateInfo.name) {
                    const targetPosition = template.definitionPosition || new Position(0, 0);
                    const targetRange = new Range(targetPosition, targetPosition);
                    
                    const locationLink: LocationLink = {
                        // 源文件中的选择范围（完整的模板名称）
                        originSelectionRange: templateInfo.range,
                        // 目标文件 URI
                        targetUri: template.sourceFile,
                        // 目标范围（用于预览显示的范围）
                        targetRange: targetRange,
                        // 目标选择范围（光标定位的精确位置）
                        targetSelectionRange: targetRange
                    };
                    definitions.push(locationLink);
                    
                    this.logger.debug('Template definition found', {
                        templateName: template.name,
                        file: template.sourceFile.fsPath,
                        line: template.definitionPosition?.line
                    });
                }
            }
            
            if (definitions.length === 0) {
                this.logger.debug('No exact template matches found', { templateName: templateInfo.name });
                return undefined;
            }
            
            // 如果只有一个定义，直接返回
            if (definitions.length === 1) {
                return definitions;
            }
            
            // 多个定义，返回列表
            this.logger.debug('Multiple template definitions found', {
                templateName: templateInfo.name,
                count: definitions.length
            });
            
            return definitions;
            
        } catch (error) {
            this.logger.error('Error providing definition', error as Error, {
                file: document.fileName,
                position: { line: position.line, character: position.character }
            });
            return undefined;
        } finally {
            timer.stop({ 
                document: document.fileName 
            });
        }
    }
    
    /**
     * 获取光标位置的模板名称和范围
     */
    private getTemplateNameAtPosition(document: TextDocument, position: Position): { name: string; range: Range } | undefined {
        const line = document.lineAt(position);
        const lineText = line.text;
        
        // 先检查光标是否在注释中
        if (YamlHelper.isInComment(lineText, position.character)) {
            return undefined;
        }
        
        // 方法1: 检查直接模板引用 "template: name"
        const directMatch = this.getDirectTemplateMatch(lineText, position);
        if (directMatch) {
            return directMatch;
        }
        
        // 方法2: 检查数组模板引用 "- name"
        const arrayMatch = this.getArrayTemplateMatch(document, position);
        if (arrayMatch) {
            return arrayMatch;
        }
        
        return undefined;
    }
    
    /**
     * 获取直接模板匹配
     */
    private getDirectTemplateMatch(lineText: string, position: Position): { name: string; range: Range } | undefined {
        const templatePattern = /\btemplate:\s*([a-zA-Z][a-zA-Z0-9_:/-]*)/g;
        let match;
        
        while ((match = templatePattern.exec(lineText)) !== null) {
            // 检查匹配是否在注释中
            if (YamlHelper.isMatchInComment(lineText, match, 1)) {
                continue;
            }
            
            const templateName = match[1];
            const startPos = match.index + match[0].indexOf(templateName);
            const endPos = startPos + templateName.length;
            
            // 检查光标是否在模板名称范围内
            if (position.character >= startPos && position.character <= endPos) {
                const range = new Range(
                    position.line, startPos,
                    position.line, endPos
                );
                return { name: templateName, range };
            }
        }
        
        return undefined;
    }
    
    /**
     * 获取数组模板匹配
     */
    private getArrayTemplateMatch(document: TextDocument, position: Position): { name: string; range: Range } | undefined {
        const line = document.lineAt(position);
        const lineText = line.text;
        
        // 检查当前行是否是数组项格式
        const arrayPattern = /^\s*-\s*([a-zA-Z][a-zA-Z0-9_:/-]*)/;
        const arrayMatch = lineText.match(arrayPattern);
        
        if (!arrayMatch) {
            return undefined;
        }
        
        // 检查是否在注释中
        if (YamlHelper.isMatchInComment(lineText, arrayMatch, 1)) {
            return undefined;
        }
        
        const templateName = arrayMatch[1];
        const startPos = lineText.indexOf(templateName);
        const endPos = startPos + templateName.length;
        
        // 检查光标是否在模板名称范围内
        if (position.character < startPos || position.character > endPos) {
            return undefined;
        }
        
        // 验证这确实是在template数组中
        if (this.isInTemplateArray(document, position.line)) {
            const range = new Range(
                position.line, startPos,
                position.line, endPos
            );
            return { name: templateName, range };
        }
        
        return undefined;
    }
    
    /**
     * 检查是否在template数组中
     */
    private isInTemplateArray(document: TextDocument, lineNumber: number): boolean {
        const currentLine = document.lineAt(lineNumber);
        const currentIndent = this.getIndentLevel(currentLine.text);
        
        // 向上查找template:键
        for (let i = lineNumber - 1; i >= 0; i--) {
            const line = document.lineAt(i);
            const lineText = line.text.trim();
            
            if (!lineText) {
                continue;
            }
            
            const lineIndent = this.getIndentLevel(line.text);
            
            // 如果遇到相同或更少缩进的非空行
            if (lineIndent < currentIndent) {
                // 检查是否是template:键
                return lineText.startsWith('template:') && 
                       (lineText === 'template:' || !!lineText.match(/^template:\s*$/));
            }
            
            // 如果遇到相同缩进的行，说明不在template数组中
            if (lineIndent === currentIndent && lineText.startsWith('-')) {
                continue; // 同级数组项，继续查找
            }
            
            if (lineIndent === currentIndent && !lineText.startsWith('-')) {
                return false; // 同级非数组项，不在template数组中
            }
        }
        
        return false;
    }
    
    /**
     * 获取缩进级别
     */
    private getIndentLevel(text: string): number {
        const match = text.match(/^(\s*)/);
        return match ? match[1].length : 0;
    }
}
