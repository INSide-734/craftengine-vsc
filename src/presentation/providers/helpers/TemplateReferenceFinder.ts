/**
 * 模板引用查找器
 *
 * 负责在文档中查找模板引用，包括基于 Schema 的字段检测、
 * 模板参数提取和相似模板建议
 */

import { type TextDocument, Range, Position, DiagnosticRelatedInformation, Location } from 'vscode';
import { type ILogger } from '../../../core/interfaces/ILogger';
import { type ITemplateService, type ITemplateMatch } from '../../../core/interfaces/ITemplateService';
import { type ISchemaService } from '../../../core/interfaces/ISchemaService';
import { type IYamlPathParser } from '../../../core/interfaces/IYamlPathParser';
import { type TemplateParameterRecord } from '../../../core/interfaces/ITemplate';
import { YamlHelper } from '../../../infrastructure/yaml/YamlHelper';
import { calculateSimilarity, getIndentLevel } from '../../../infrastructure/utils';

/**
 * 模板使用信息
 */
export interface ITemplateUsage {
    templateName: string;
    range: Range;
    parameters: TemplateParameterRecord;
    line: number;
    type: 'direct' | 'array';
}

/**
 * 模板引用查找器
 *
 * 提供文档中模板引用的查找、参数提取和相似模板建议功能
 */
export class TemplateReferenceFinder {
    private readonly logger: ILogger;
    private readonly templateService: ITemplateService;
    private readonly schemaService: ISchemaService;
    private readonly yamlPathParser: IYamlPathParser;

    /** 模板名称补全提供者标识 */
    private static readonly TEMPLATE_NAME_PROVIDER = 'craftengine.templateName';

    constructor(
        logger: ILogger,
        templateService: ITemplateService,
        schemaService: ISchemaService,
        yamlPathParser: IYamlPathParser,
    ) {
        this.logger = logger;
        this.templateService = templateService;
        this.schemaService = schemaService;
        this.yamlPathParser = yamlPathParser;
    }

    /**
     * 查找文档中的模板使用
     *
     * 基于 Schema 的 x-completion-provider 属性判断字段是否期望模板名称
     */
    async findTemplateUsages(document: TextDocument): Promise<ITemplateUsage[]> {
        const usages: ITemplateUsage[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // 跳过空行和纯注释行
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith('#')) {
                continue;
            }

            // 查找键值对模式: key: value
            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) {
                continue;
            }

            const value = line.substring(colonIndex + 1).trim();
            if (!value) {
                continue;
            }

            // 检查是否在注释中
            if (YamlHelper.isInComment(line, colonIndex + 1)) {
                continue;
            }

            // 模板名称匹配模式
            const templateNamePattern = /^([a-zA-Z][a-zA-Z0-9_:\/\${}-]*)$/;
            const cleanValue = value.replace(/^["']|["']$/g, '');

            if (!templateNamePattern.test(cleanValue)) {
                continue;
            }

            // 基于 Schema 检查此位置是否期望模板名称
            const position = new Position(i, colonIndex + 1);
            const isTemplateField = await this.isTemplateFieldBySchema(document, position);

            if (!isTemplateField) {
                continue;
            }

            // 计算模板名称的范围
            const valueStart =
                colonIndex +
                1 +
                (line.substring(colonIndex + 1).length - line.substring(colonIndex + 1).trimStart().length);
            const valueEnd = valueStart + value.length;

            // 获取缩进信息用于查找参数
            const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
            const parameters = await this.extractTemplateParameters(lines, i + 1, indent);

            usages.push({
                templateName: cleanValue,
                range: new Range(i, valueStart, i, valueEnd),
                parameters,
                line: i,
                type: 'direct',
            });
        }

        return usages;
    }

    /**
     * 基于 Schema 检查位置是否期望模板名称
     *
     * 检查 Schema 的 x-completion-provider 属性是否为 craftengine.templateName
     */
    async isTemplateFieldBySchema(document: TextDocument, position: Position): Promise<boolean> {
        try {
            // 解析 YAML 路径
            const path = this.yamlPathParser.parsePath(document, position);

            if (path.length === 0) {
                return false;
            }

            // 获取该路径的 Schema
            const schema = await this.schemaService.getSchemaForPath(path);

            if (!schema) {
                return false;
            }

            // 检查 Schema 的 x-completion-provider 属性
            const completionProvider = this.schemaService.getCustomProperty(schema, 'completion-provider');

            return completionProvider === TemplateReferenceFinder.TEMPLATE_NAME_PROVIDER;
        } catch (error) {
            this.logger.debug('Error checking schema for template field', {
                error: error instanceof Error ? error.message : String(error),
            });
            return false;
        }
    }

    /**
     * 提取模板参数
     */
    async extractTemplateParameters(
        lines: string[],
        startLine: number,
        baseIndent: number,
    ): Promise<TemplateParameterRecord> {
        const parameters: TemplateParameterRecord = {};

        // 查找arguments块
        let argumentsLine = -1;
        for (let i = startLine; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) {
                continue;
            }

            const lineIndent = getIndentLevel(lines[i]);
            if (lineIndent < baseIndent) {
                break; // 超出当前模板范围
            }

            if (line.startsWith('arguments:')) {
                argumentsLine = i;
                break;
            }
        }

        if (argumentsLine === -1) {
            return parameters;
        }

        // 提取arguments下的参数
        const argumentsIndent = getIndentLevel(lines[argumentsLine]);
        for (let i = argumentsLine + 1; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            if (!trimmedLine) {
                continue;
            }

            const lineIndent = getIndentLevel(line);
            if (lineIndent <= argumentsIndent) {
                break; // 超出arguments范围
            }

            // 解析参数行
            const paramMatch = trimmedLine.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*(.*)$/);
            if (paramMatch) {
                const paramName = paramMatch[1];
                const paramValue = paramMatch[2];

                // 简单的值解析
                try {
                    if (paramValue.startsWith('"') && paramValue.endsWith('"')) {
                        parameters[paramName] = paramValue.slice(1, -1);
                    } else if (paramValue.startsWith("'") && paramValue.endsWith("'")) {
                        parameters[paramName] = paramValue.slice(1, -1);
                    } else if (paramValue === 'true' || paramValue === 'false') {
                        parameters[paramName] = paramValue === 'true';
                    } else if (!isNaN(Number(paramValue))) {
                        parameters[paramName] = Number(paramValue);
                    } else {
                        parameters[paramName] = paramValue;
                    }
                } catch {
                    parameters[paramName] = paramValue;
                }
            }
        }

        return parameters;
    }

    /**
     * 查找相似模板建议
     */
    async findSimilarTemplatesSuggestions(
        templateName: string,
        document: TextDocument,
        range: Range,
    ): Promise<DiagnosticRelatedInformation[]> {
        const relatedInfo: DiagnosticRelatedInformation[] = [];

        try {
            const allTemplates = await this.templateService.searchTemplates({
                prefix: '',
                limit: 1000,
                fuzzy: true,
            });
            const similarTemplates = this.findSimilarNames(
                templateName,
                allTemplates.map((m: ITemplateMatch) => m.template.name),
            );

            // 添加相似模板建议（最多3个）
            for (const similarName of similarTemplates.slice(0, 3)) {
                relatedInfo.push(
                    new DiagnosticRelatedInformation(
                        new Location(document.uri, range),
                        `Did you mean template: ${similarName}?`,
                    ),
                );
            }
        } catch (error) {
            this.logger.debug('Failed to find similar templates', { error });
        }

        return relatedInfo;
    }

    /**
     * 查找相似的名称
     *
     * @param target 目标名称
     * @param names 候选名称列表
     * @returns 相似度超过阈值的名称列表，按相似度降序排列
     */
    findSimilarNames(target: string, names: string[]): string[] {
        // 相似度阈值：0.6 表示至少 60% 的字符匹配才会建议替代模板
        // 该值经过测试，能够在避免过多噪音的同时提供有用的建议
        const SIMILARITY_THRESHOLD = 0.6;

        return names
            .map((name) => ({
                name,
                score: calculateSimilarity(target.toLowerCase(), name.toLowerCase()),
            }))
            .filter((item) => item.score > SIMILARITY_THRESHOLD)
            .sort((a, b) => b.score - a.score)
            .map((item) => item.name);
    }
}
