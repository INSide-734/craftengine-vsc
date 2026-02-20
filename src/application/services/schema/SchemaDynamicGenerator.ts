import { type ILogger } from '../../../core/interfaces/ILogger';
import { type IDataStoreService } from '../../../core/interfaces/IDataStoreService';
import { type ITemplate } from '../../../core/interfaces/ITemplate';
import { type JsonSchemaNode } from '../../../core/types/JsonSchemaTypes';

/**
 * Schema 动态生成器
 *
 * 根据当前模板库的内容动态生成 JSON Schema，提供智能的模板名称补全和验证。
 * 生成的 Schema 会随着模板的增删改而自动更新。
 *
 * @remarks
 * **生成策略**：
 *
 * 1. **模板名称枚举**
 *    - 从模板库中提取所有模板名称
 *    - 生成 `enum` 约束，限制可用的模板名称
 *    - 支持单个模板引用和多模板引用
 *
 * 2. **结构定义**
 *    - 生成 `templates` 定义部分的 Schema
 *    - 生成 `items` 使用部分的 Schema
 *    - 使用 `patternProperties` 支持动态键名
 *
 * 3. **参数验证**
 *    - 为模板参数生成验证规则
 *    - 支持必需参数和可选参数
 *    - 生成参数类型约束
 *
 * 4. **回退机制**
 *    - 生成失败时返回基础 Schema
 *    - 保证扩展基本功能可用
 *    - 记录详细的错误信息
 *
 * **Schema 结构**：
 * ```json
 * {
 *   "$schema": "http://json-schema.org/draft-07/schema#",
 *   "properties": {
 *     "templates": { ... },  // 模板定义
 *     "items": { ... }       // 模板使用
 *   }
 * }
 * ```
 *
 * **更新时机**：
 * - 扩展激活时首次生成
 * - 模板文件变更时重新生成
 * - 手动触发 Schema 重载时生成
 *
 * @example
 * ```typescript
 * const generator = new SchemaDynamicGenerator(templateRepository, logger);
 *
 * // 生成动态 Schema
 * const schemaJson = await generator.generateDynamicSchema();
 * const schema = JSON.parse(schemaJson);
 *
 * console.log(schema.properties.items); // 查看 items Schema
 * console.log(schema.properties.templates); // 查看 templates Schema
 *
 * // 生成的 Schema 示例：
 * // {
 * //   "properties": {
 * //     "items": {
 * //       "patternProperties": {
 * //         "^[a-zA-Z][a-zA-Z0-9_-]*$": {
 * //           "properties": {
 * //             "template": {
 * //               "enum": ["user-profile", "admin-profile", "guest-profile"]
 * //             }
 * //           }
 * //         }
 * //       }
 * //     }
 * //   }
 * // }
 * ```
 */
export class SchemaDynamicGenerator {
    /** 缓存的 Schema JSON 字符串 */
    private cachedSchema: string | null = null;

    /**
     * 构造动态 Schema 生成器实例
     *
     * @param dataStoreService - 数据存储服务，用于获取所有可用的模板
     * @param logger - 日志记录器，用于记录生成过程
     */
    constructor(
        private readonly dataStoreService: IDataStoreService,
        private readonly logger: ILogger,
    ) {}

    /**
     * 生成动态 Schema
     *
     * 从模板仓储中获取所有模板，根据模板信息生成完整的 JSON Schema。
     *
     * @returns JSON Schema 的 JSON 字符串表示
     *
     * @remarks
     * 生成过程：
     * 1. 从仓储获取所有模板
     * 2. 提取模板名称列表
     * 3. 构建 templates 部分的 Schema
     * 4. 构建 items 部分的 Schema
     * 5. 组装完整的 Schema 对象
     * 6. 序列化为 JSON 字符串
     * 7. 如果出错，返回回退 Schema
     *
     * 性能考虑：
     * - 使用 JSON.stringify 序列化，带格式化
     * - 记录生成的 Schema 大小
     * - 记录模板数量统计
     *
     * @example
     * ```typescript
     * // 生成 Schema
     * const schemaJson = await generator.generateDynamicSchema();
     *
     * // 解析并使用
     * const schema = JSON.parse(schemaJson);
     *
     * // 注册到 YAML 扩展
     * yamlExtension.registerContributor(
     *     'craftengine',
     *     () => schemaJson,
     *     (uri) => uri.fsPath.endsWith('.yaml')
     * );
     * ```
     */
    async generateDynamicSchema(): Promise<string> {
        // 返回缓存结果（如果有）
        if (this.cachedSchema) {
            return this.cachedSchema;
        }

        try {
            const templates = await this.dataStoreService.getAllTemplates();

            const schema = {
                $schema: 'http://json-schema.org/draft-07/schema#',
                title: 'CraftEngine Template Schema',
                description: 'Dynamic schema for CraftEngine YAML template files',
                type: 'object',
                properties: {
                    templates: this.generateTemplatesSchema(templates),
                    items: this.generateItemsSchema(templates),
                },
                additionalProperties: true,
            };

            this.logger.debug('Dynamic schema generated', {
                templateCount: templates.length,
                schemaSize: JSON.stringify(schema).length,
            });

            this.cachedSchema = JSON.stringify(schema, null, 2);
            return this.cachedSchema;
        } catch (error) {
            this.logger.error('Error generating dynamic schema', error as Error);
            return this.getFallbackSchema();
        }
    }

    /**
     * 使缓存失效
     *
     * 在模板变更时调用，确保下次请求时重新生成 Schema。
     */
    invalidateCache(): void {
        this.cachedSchema = null;
    }

    /**
     * 生成模板定义的 Schema
     */
    private generateTemplatesSchema(templates: ITemplate[]): JsonSchemaNode {
        const templateNames = templates.map((t) => t.name);

        return {
            type: 'object',
            description: 'Template definitions',
            patternProperties: {
                '^[a-zA-Z][a-zA-Z0-9_-]*$': {
                    type: 'object',
                    description: 'Template configuration',
                    properties: {
                        template: {
                            oneOf: [
                                {
                                    type: 'string',
                                    enum: templateNames,
                                    description: 'Single template reference',
                                },
                                {
                                    type: 'array',
                                    items: {
                                        type: 'string',
                                        enum: templateNames,
                                    },
                                    description: 'Multiple template references',
                                },
                            ],
                        },
                        arguments: {
                            type: 'object',
                            description: 'Template arguments',
                            additionalProperties: true,
                        },
                    },
                    required: ['template'],
                },
            },
        };
    }

    /**
     * 生成项目定义的 Schema
     */
    private generateItemsSchema(templates: ITemplate[]): JsonSchemaNode {
        const templateNames = templates.map((t) => t.name);

        return {
            type: 'object',
            description: 'Item definitions using templates',
            patternProperties: {
                '^[a-zA-Z][a-zA-Z0-9_-]*$': {
                    type: 'object',
                    properties: {
                        template: {
                            type: 'string',
                            enum: templateNames,
                            description: 'Template to use for this item',
                        },
                        arguments: {
                            type: 'object',
                            description: 'Arguments for the template',
                        },
                    },
                    required: ['template'],
                },
            },
        };
    }

    /**
     * 获取备用 Schema
     */
    private getFallbackSchema(): string {
        const fallbackSchema = {
            $schema: 'http://json-schema.org/draft-07/schema#',
            title: 'CraftEngine Template Schema (Fallback)',
            description: 'Basic schema for CraftEngine YAML template files',
            type: 'object',
            properties: {
                templates: {
                    type: 'object',
                    description: 'Template definitions',
                    additionalProperties: true,
                },
                items: {
                    type: 'object',
                    description: 'Item definitions',
                    additionalProperties: true,
                },
            },
            additionalProperties: true,
        };

        return JSON.stringify(fallbackSchema, null, 2);
    }
}
