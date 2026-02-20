import * as yaml from 'yaml';
import {
    type ITemplateExpander,
    type ITemplateExpansionResult,
    type IPositionMapping,
    type IExpansionError,
    type IExpansionContext,
} from '../../../core/interfaces/ITemplateExpander';
import { type IDataStoreService } from '../../../core/interfaces/IDataStoreService';
import { type ILogger } from '../../../core/interfaces/ILogger';

/**
 * 模板展开器实现
 *
 * 负责将含有模板引用的配置展开为完整配置，用于 Schema 验证。
 *
 * @remarks
 * 主要功能：
 * - 递归展开模板引用
 * - 替换参数占位符
 * - 检测循环引用
 * - 生成位置映射
 *
 * @example
 * ```typescript
 * const expander = new TemplateExpander(templateRepository, logger);
 * const result = await expander.expandDocument(yamlContent);
 *
 * if (result.success) {
 *     // 验证展开后的数据
 *     await schemaValidator.validate(result.expanded);
 * }
 * ```
 */
export class TemplateExpander implements ITemplateExpander {
    /** 最大嵌套深度，防止无限递归 */
    private static readonly MAX_DEPTH = 10;

    /** 特殊参数，由 CraftEngine 自动提供 */
    private static readonly SPECIAL_PARAMS = new Set(['__NAMESPACE__', '__ID__']);

    constructor(
        private readonly dataStoreService: IDataStoreService,
        private readonly logger: ILogger,
    ) {}

    /**
     * 展开文档中的所有模板引用
     */
    async expandDocument(content: string): Promise<ITemplateExpansionResult> {
        const errors: IExpansionError[] = [];
        const positionMap = new Map<string, IPositionMapping>();
        const usedTemplates: string[] = [];

        try {
            // 解析 YAML
            const data = yaml.parse(content);

            if (!data || typeof data !== 'object') {
                return {
                    expanded: data,
                    success: true,
                    positionMap,
                    errors,
                    usedTemplates,
                };
            }

            // 展开对象
            const expanded = await this.expandObjectInternal(
                data,
                [],
                new Set<string>(),
                positionMap,
                errors,
                usedTemplates,
                0,
            );

            // 判断是否成功（忽略 template_not_found 错误）
            const criticalErrors = errors.filter((e) => e.type !== 'template_not_found');

            return {
                expanded,
                success: criticalErrors.length === 0,
                positionMap,
                errors,
                usedTemplates,
            };
        } catch (error) {
            this.logger.error('Failed to expand document', error as Error);

            errors.push({
                path: '',
                message: `YAML parse error: ${(error as Error).message}`,
                type: 'file_read_error',
            });

            return {
                expanded: null,
                success: false,
                positionMap,
                errors,
                usedTemplates,
            };
        }
    }

    /**
     * 展开单个对象
     */
    async expandObject(obj: unknown, context?: IExpansionContext): Promise<ITemplateExpansionResult> {
        const errors: IExpansionError[] = [];
        const positionMap = new Map<string, IPositionMapping>();
        const usedTemplates: string[] = [];

        try {
            const expanded = await this.expandObjectInternal(
                obj,
                context?.path || [],
                context?.visited || new Set<string>(),
                positionMap,
                errors,
                usedTemplates,
                context?.currentDepth || 0,
            );

            const criticalErrors = errors.filter((e) => e.type !== 'template_not_found');

            return {
                expanded,
                success: criticalErrors.length === 0,
                positionMap,
                errors,
                usedTemplates,
            };
        } catch (error) {
            this.logger.error('Failed to expand object', error as Error);

            errors.push({
                path: (context?.path || []).join('/'),
                message: `Expansion error: ${(error as Error).message}`,
                type: 'file_read_error',
            });

            return {
                expanded: obj,
                success: false,
                positionMap,
                errors,
                usedTemplates,
            };
        }
    }

    /**
     * 内部递归展开方法
     */
    private async expandObjectInternal(
        obj: unknown,
        path: string[],
        visited: Set<string>,
        positionMap: Map<string, IPositionMapping>,
        errors: IExpansionError[],
        usedTemplates: string[],
        depth: number,
    ): Promise<unknown> {
        // 检查深度限制
        if (depth > TemplateExpander.MAX_DEPTH) {
            errors.push({
                path: path.join('/'),
                message: `Maximum template nesting depth (${TemplateExpander.MAX_DEPTH}) exceeded`,
                type: 'max_depth_exceeded',
            });
            return obj;
        }

        // 基础类型直接返回
        if (obj === null || obj === undefined || typeof obj !== 'object') {
            return obj;
        }

        // 数组递归处理
        if (Array.isArray(obj)) {
            const result = [];
            for (let i = 0; i < obj.length; i++) {
                result.push(
                    await this.expandObjectInternal(
                        obj[i],
                        [...path, String(i)],
                        visited,
                        positionMap,
                        errors,
                        usedTemplates,
                        depth,
                    ),
                );
            }
            return result;
        }

        // 对象处理
        const objRecord = obj as Record<string, unknown>;

        // 检查是否有 template 字段
        if ('template' in objRecord && objRecord.template) {
            return this.expandWithTemplate(objRecord, path, visited, positionMap, errors, usedTemplates, depth);
        }

        // 递归处理子属性
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(objRecord)) {
            result[key] = await this.expandObjectInternal(
                value,
                [...path, key],
                visited,
                positionMap,
                errors,
                usedTemplates,
                depth,
            );
        }
        return result;
    }

    /**
     * 使用模板展开对象
     */
    private async expandWithTemplate(
        obj: Record<string, unknown>,
        path: string[],
        visited: Set<string>,
        positionMap: Map<string, IPositionMapping>,
        errors: IExpansionError[],
        usedTemplates: string[],
        depth: number,
    ): Promise<Record<string, unknown>> {
        const templateField = obj.template;
        const templateNames = Array.isArray(templateField) ? (templateField as string[]) : [templateField as string];

        let result: Record<string, unknown> = {};
        const pathStr = path.join('/');

        // 按顺序应用多个模板
        for (const templateName of templateNames) {
            // 跳过无效的模板名
            if (!templateName || typeof templateName !== 'string') {
                continue;
            }

            // 跳过动态模板名（包含 ${...}）
            if (templateName.includes('${')) {
                this.logger.debug('Skipping dynamic template name', { templateName, path: pathStr });
                continue;
            }

            // 循环引用检测
            if (visited.has(templateName)) {
                errors.push({
                    path: pathStr,
                    message: `Circular template reference detected: ${templateName}`,
                    type: 'circular_reference',
                    templateName,
                });
                continue;
            }

            // 获取模板
            const template = await this.dataStoreService.getTemplateByName(templateName);
            if (!template) {
                errors.push({
                    path: pathStr,
                    message: `Template not found: ${templateName}`,
                    type: 'template_not_found',
                    templateName,
                });
                continue;
            }

            usedTemplates.push(templateName);

            // 获取模板内容
            const templateContent = template.content;
            if (!templateContent || Object.keys(templateContent).length === 0) {
                this.logger.debug('Template has no content', { templateName });
                continue;
            }

            // 替换参数
            const args = (obj.arguments || {}) as Record<string, unknown>;
            const substitutedContent = this.substituteParameters(templateContent, args);

            // 递归展开模板内容中的模板引用
            visited.add(templateName);
            const expandedTemplate = await this.expandObjectInternal(
                substitutedContent,
                path,
                visited,
                positionMap,
                errors,
                usedTemplates,
                depth + 1,
            );
            visited.delete(templateName);

            // 记录位置映射
            this.recordPositionMappings(
                expandedTemplate,
                path,
                templateName,
                template.sourceFile.toString(),
                positionMap,
            );

            // 合并模板内容
            result = this.deepMerge(result, expandedTemplate as Record<string, unknown>);
        }

        // 合并当前对象的属性（排除 template 和 arguments）
        const restProps: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (key !== 'template' && key !== 'arguments') {
                // 递归展开剩余属性
                restProps[key] = await this.expandObjectInternal(
                    value,
                    [...path, key],
                    visited,
                    positionMap,
                    errors,
                    usedTemplates,
                    depth,
                );
            }
        }

        // 当前对象的属性覆盖模板的属性
        result = this.deepMerge(result, restProps);

        return result;
    }

    /**
     * 替换参数占位符
     *
     * 支持格式：
     * - ${param} - 直接替换
     * - ${param:-default} - 如果参数不存在，使用默认值
     *
     * 当整个字符串只是一个占位符且参数值是对象或数组时，
     * 直接返回该对象/数组，而不是转换为 JSON 字符串。
     */
    private substituteParameters(content: unknown, params: Record<string, unknown>): unknown {
        if (typeof content === 'string') {
            // 检查是否整个字符串只是一个占位符（支持前后空白）
            const singleParamMatch = content.trim().match(/^\$\{([^}]+?)(?::-([^}]*?))?\}$/);
            if (singleParamMatch) {
                const paramName = singleParamMatch[1].trim();
                const defaultValue = singleParamMatch[2];

                // 跳过特殊参数
                if (!TemplateExpander.SPECIAL_PARAMS.has(paramName)) {
                    if (paramName in params) {
                        const value = params[paramName];
                        // 对于对象和数组，直接返回原值
                        if (value !== null && typeof value === 'object') {
                            return value;
                        }
                        // 基本类型转为字符串
                        return String(value);
                    }
                    // 使用默认值
                    if (defaultValue !== undefined) {
                        return defaultValue;
                    }
                }
                // 无法替换，保留原始字符串
                return content;
            }
            // 非单一占位符，使用字符串替换
            return this.substituteStringParameters(content, params);
        }

        if (Array.isArray(content)) {
            return content.map((item) => this.substituteParameters(item, params));
        }

        if (content && typeof content === 'object') {
            const result: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(content as Record<string, unknown>)) {
                // 键名也可能包含参数
                const newKey = typeof key === 'string' ? this.substituteStringParameters(key, params) : key;
                result[newKey] = this.substituteParameters(value, params);
            }
            return result;
        }

        return content;
    }

    /**
     * 替换字符串中的参数占位符
     */
    private substituteStringParameters(str: string, params: Record<string, unknown>): string {
        return str.replace(/\$\{([^}]+?)(?::-([^}]*?))?\}/g, (match, paramName, defaultValue) => {
            const trimmedName = paramName.trim();

            // 跳过特殊参数
            if (TemplateExpander.SPECIAL_PARAMS.has(trimmedName)) {
                return match;
            }

            if (trimmedName in params) {
                const value = params[trimmedName];
                // 如果值是对象或数组，转为 JSON 字符串
                return typeof value === 'object' ? JSON.stringify(value) : String(value);
            }

            // 使用默认值或保留原始占位符
            return defaultValue !== undefined ? defaultValue : match;
        });
    }

    /**
     * 深度合并对象（后者覆盖前者）
     */
    private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
        if (!source || typeof source !== 'object' || Array.isArray(source)) {
            return target;
        }

        const result = { ...target };

        for (const [key, sourceValue] of Object.entries(source)) {
            const targetValue = result[key];

            // 如果两者都是对象（非数组），递归合并
            if (
                targetValue &&
                sourceValue &&
                typeof targetValue === 'object' &&
                typeof sourceValue === 'object' &&
                !Array.isArray(targetValue) &&
                !Array.isArray(sourceValue)
            ) {
                result[key] = this.deepMerge(
                    targetValue as Record<string, unknown>,
                    sourceValue as Record<string, unknown>,
                );
            } else {
                // 否则直接覆盖
                result[key] = sourceValue;
            }
        }

        return result;
    }

    /**
     * 记录位置映射
     */
    private recordPositionMappings(
        content: unknown,
        basePath: string[],
        templateName: string,
        templateUri: string,
        positionMap: Map<string, IPositionMapping>,
    ): void {
        const recordRecursive = (obj: unknown, path: string[]) => {
            if (!obj || typeof obj !== 'object') {
                return;
            }

            const pathStr = path.join('/');
            positionMap.set(pathStr, {
                originalPath: pathStr,
                source: 'template',
                templateName,
                templateUri,
            });

            if (Array.isArray(obj)) {
                obj.forEach((item, index) => {
                    recordRecursive(item, [...path, String(index)]);
                });
            } else {
                for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
                    recordRecursive(value, [...path, key]);
                }
            }
        };

        recordRecursive(content, basePath);
    }
}
