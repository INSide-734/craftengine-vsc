import * as path from 'path';
import { type JSONSchema7 } from 'json-schema';
import { type IJsonSchemaNode } from '../../core/types/JsonSchemaTypes';
import {
    type ISchemaParser,
    type ISchemaParseResult,
    type ISchemaMatch,
    type ISchemaContext,
} from '../../core/interfaces/ISchemaParser';
import { type ISchemaFileLoader } from '../../core/interfaces/ISchemaFileLoader';
import { type ILogger } from '../../core/interfaces/ILogger';
import { safeCompileRegex } from '../../core/utils';

/**
 * Schema 加载器和解析器
 *
 * 负责：
 * - 加载 schema 文件
 * - 解析 $ref 引用
 * - 缓存已加载的 schema
 * - 根据上下文查找匹配的 schema
 */
export class SchemaLoader implements ISchemaParser {
    private readonly schemaCache = new Map<string, ISchemaParseResult>();
    private readonly schemasBasePath: string;
    private readonly logger: ILogger;

    constructor(
        logger: ILogger,
        private readonly fileLoader: ISchemaFileLoader,
        schemasBasePath?: string,
    ) {
        // esbuild 打包后 __dirname = <root>/out/
        this.schemasBasePath = schemasBasePath || path.join(__dirname, '../schemas');
        this.logger = logger.createChild('SchemaLoader');
    }

    /**
     * 加载 schema 文件
     */
    async loadSchema(schemaId: string, baseSchemaPath?: string): Promise<ISchemaParseResult> {
        // 先解析为绝对路径，使用绝对路径作为缓存键（确保同一文件只加载一次）
        const filePath = this.resolveSchemaPath(schemaId, baseSchemaPath);

        // 检查缓存（使用绝对路径作为键）
        if (this.schemaCache.has(filePath)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return this.schemaCache.get(filePath)!;
        }

        try {
            this.logger.debug('Loading schema', { schemaId, baseSchemaPath, filePath });

            // 委托给 ISchemaFileLoader 加载原始文件
            const rawSchema = await this.fileLoader.loadSchema(schemaId);
            const schema = rawSchema as unknown as JSONSchema7;

            // 解析 $ref 引用（传递当前 schema 的目录路径）
            const schemaDir = path.dirname(filePath);
            const resolved = await this.resolveSchema(schema, schemaDir);

            // 提取依赖
            const dependencies = this.extractDependencies(schema as unknown as IJsonSchemaNode);

            const result: ISchemaParseResult = {
                schema,
                resolved,
                dependencies,
            };

            // 使用绝对路径作为缓存键
            this.schemaCache.set(filePath, result);

            this.logger.debug('Schema loaded successfully', {
                schemaId,
                filePath,
                dependencies: dependencies.length,
            });

            return result;
        } catch (error) {
            this.logger.error('Failed to load schema', error as Error, { schemaId, baseSchemaPath });
            throw new Error(`Failed to load schema ${schemaId}: ${(error as Error).message}`);
        }
    }

    /**
     * 解析 $ref 引用
     *
     * 注意：返回的 schema 可能仍包含内部 $ref（我们保留内部引用让 Ajv 处理）
     *
     * @param ref 引用路径
     * @param baseSchema 基础 schema
     * @param baseSchemaPath 当前 schema 文件的目录路径
     * @param rootSchema 根 schema（用于合并 $defs）
     */
    async resolveRef(
        ref: string,
        baseSchema: JSONSchema7,
        baseSchemaPath?: string,
        rootSchema?: JSONSchema7,
    ): Promise<JSONSchema7 | undefined> {
        try {
            // 处理内部引用 (#/$defs/xxx)
            if (ref.startsWith('#/')) {
                return this.resolveInternalRef(ref, baseSchema);
            }

            // 处理外部引用 (../common/base.schema.json#/$defs/xxx)
            if (ref.includes('#')) {
                const [filePath, internalPath] = ref.split('#');
                const externalSchema = await this.loadSchema(filePath, baseSchemaPath);

                // 将外部 schema 的 $defs 合并到根 schema，使内部引用能正确解析
                if (rootSchema && externalSchema.resolved.$defs) {
                    this.mergeDefs(
                        rootSchema as unknown as IJsonSchemaNode,
                        externalSchema.resolved.$defs as Record<string, IJsonSchemaNode>,
                    );
                }
                if (rootSchema && (externalSchema.resolved as IJsonSchemaNode).definitions) {
                    this.mergeDefs(
                        rootSchema as unknown as IJsonSchemaNode,
                        (externalSchema.resolved as IJsonSchemaNode).definitions as Record<string, IJsonSchemaNode>,
                        'definitions',
                    );
                }

                // 从已解析的 schema 中提取（外部引用已展开，内部引用保留）
                return this.resolveInternalRef('#' + internalPath, externalSchema.resolved);
            }

            // 处理文件引用 (../common/base.schema.json)
            const externalSchema = await this.loadSchema(ref, baseSchemaPath);
            // 返回已解析的 schema（外部引用已展开，内部引用保留）
            return externalSchema.resolved;
        } catch (error) {
            this.logger.warn('Failed to resolve ref', { ref, error: (error as Error).message, baseSchemaPath });
            return undefined;
        }
    }

    /**
     * 根据上下文查找匹配的 schema
     */
    async findSchemaForContext(context: ISchemaContext): Promise<ISchemaMatch[]> {
        const matches: ISchemaMatch[] = [];

        try {
            // 加载主 schema
            const mainSchema = await this.loadSchema('index.schema.json');

            // 遍历 YAML 路径，逐层匹配 schema
            let currentSchema = mainSchema.resolved;
            const path: string[] = [];

            for (let i = 0; i < context.yamlPath.length; i++) {
                const segment = context.yamlPath[i];
                path.push(segment);

                const matchedSchema = await this.matchSchemaSegment(segment, currentSchema);

                if (matchedSchema) {
                    matches.push({
                        schema: matchedSchema,
                        path: [...path],
                        score: 1.0 - i * 0.1, // 越深层级得分越低
                    });

                    currentSchema = matchedSchema;
                } else {
                    // 无法继续匹配
                    break;
                }
            }

            return matches.sort((a, b) => b.score - a.score);
        } catch (error) {
            this.logger.error('Failed to find schema for context', error as Error, {
                yamlPath: context.yamlPath,
            });
            return [];
        }
    }

    /**
     * 从 schema 中提取属性
     */
    extractProperties(schema: JSONSchema7): Map<string, JSONSchema7> {
        const properties = new Map<string, JSONSchema7>();

        // 提取 properties
        if (schema.properties) {
            Object.entries(schema.properties).forEach(([key, value]) => {
                if (typeof value === 'object') {
                    properties.set(key, value as JSONSchema7);
                }
            });
        }

        // 提取 patternProperties
        if (schema.patternProperties) {
            Object.entries(schema.patternProperties).forEach(([pattern, value]) => {
                if (typeof value === 'object') {
                    properties.set(`[pattern:${pattern}]`, value as JSONSchema7);
                }
            });
        }

        // 处理 allOf
        if (schema.allOf) {
            schema.allOf.forEach((subSchema) => {
                if (typeof subSchema === 'object') {
                    const subProps = this.extractProperties(subSchema as JSONSchema7);
                    subProps.forEach((value, key) => properties.set(key, value));
                }
            });
        }

        return properties;
    }

    /**
     * 从 schema 中提取枚举值
     */
    extractEnumValues(schema: JSONSchema7): string[] {
        const values: string[] = [];

        if (schema.enum) {
            schema.enum.forEach((value) => {
                if (typeof value === 'string') {
                    values.push(value);
                }
            });
        }

        // 处理 oneOf/anyOf 中的枚举
        const checkMultiple = (schemas?: (JSONSchema7 | boolean)[]) => {
            schemas?.forEach((subSchema) => {
                if (typeof subSchema === 'object' && subSchema.enum) {
                    subSchema.enum.forEach((value) => {
                        if (typeof value === 'string' && !values.includes(value)) {
                            values.push(value);
                        }
                    });
                }
            });
        };

        checkMultiple(schema.oneOf);
        checkMultiple(schema.anyOf);

        return values;
    }

    /**
     * 清除缓存
     */
    clearCache(): void {
        this.schemaCache.clear();
        this.fileLoader.clearCache();
        this.logger.debug('Schema cache cleared');
    }

    /**
     * 解析 schema 路径
     * @param schemaId schema 标识符（可能是相对路径或绝对路径）
     * @param baseSchemaPath 当前 schema 文件的目录路径（用于解析相对引用）
     */
    private resolveSchemaPath(schemaId: string, baseSchemaPath?: string): string {
        // 如果是绝对路径，直接使用
        if (path.isAbsolute(schemaId)) {
            return schemaId;
        }

        // 如果是相对路径且提供了基础路径，从基础路径解析
        if ((schemaId.startsWith('../') || schemaId.startsWith('./')) && baseSchemaPath) {
            return path.resolve(baseSchemaPath, schemaId);
        }

        // 如果是相对路径但没有基础路径，从 schemas 根目录解析
        if (schemaId.startsWith('../') || schemaId.startsWith('./')) {
            return path.resolve(this.schemasBasePath, schemaId);
        }

        // 否则，假设在 schemas 目录下
        return path.join(this.schemasBasePath, schemaId);
    }

    /**
     * 递归解析 schema（处理所有 $ref）
     * @param schema 要解析的 schema
     * @param baseSchemaPath 当前 schema 文件的目录路径
     */
    private async resolveSchema(schema: JSONSchema7, baseSchemaPath?: string): Promise<JSONSchema7> {
        // 深拷贝以避免修改原始 schema
        const resolved = JSON.parse(JSON.stringify(schema)) as JSONSchema7;

        // 传递顶层 schema 作为内部引用的基础
        await this.resolveSchemaRefs(resolved as unknown as IJsonSchemaNode, resolved, baseSchemaPath);

        return resolved;
    }

    /**
     * 递归解析 schema 中的所有 $ref
     *
     * 策略：
     * 1. 展开外部引用，并将外部 schema 的 $defs 合并到根 schema
     * 2. 保留内部引用让 Ajv 在运行时处理（避免递归自引用导致栈溢出）
     *
     * @param node 当前正在处理的 schema 节点
     * @param rootSchema 顶层 schema（用于合并 $defs 和解析内部引用）
     * @param baseSchemaPath 当前 schema 文件的目录路径
     */
    private async resolveSchemaRefs(
        node: IJsonSchemaNode,
        rootSchema: JSONSchema7,
        baseSchemaPath?: string,
    ): Promise<void> {
        if (!node || typeof node !== 'object') {
            return;
        }

        // 处理 $ref
        if (node.$ref) {
            const ref = node.$ref as string;

            // 内部引用（#/$defs/xxx）保留不展开，让 Ajv 在运行时处理
            // 这样可以正确处理递归结构（如 model.schema.json 中的 modelConfig 自引用）
            if (ref.startsWith('#/')) {
                return;
            }

            // 只展开外部引用，同时将外部 schema 的 $defs 合并到根 schema
            const refSchema = await this.resolveRef(ref, rootSchema, baseSchemaPath, rootSchema);

            if (refSchema) {
                // 深拷贝以避免修改原始引用的 schema
                const resolvedCopy = JSON.parse(JSON.stringify(refSchema));

                // 移除嵌入 schema 的根级标识符，避免 Ajv 重复注册
                delete resolvedCopy.$id;
                delete resolvedCopy.$schema;

                // 将外部 schema 的 $defs 合并到根 schema，使内部引用能正确解析
                if (resolvedCopy.$defs) {
                    this.mergeDefs(rootSchema as unknown as IJsonSchemaNode, resolvedCopy.$defs);
                    delete resolvedCopy.$defs;
                }
                // 同样处理 definitions（JSON Schema draft-07 的写法）
                if (resolvedCopy.definitions) {
                    this.mergeDefs(rootSchema as unknown as IJsonSchemaNode, resolvedCopy.definitions, 'definitions');
                    delete resolvedCopy.definitions;
                }

                // 合并引用的 schema
                Object.assign(node, resolvedCopy);
                delete node.$ref;

                // 递归解析合并后的内容（内部引用会被跳过）
                await this.resolveSchemaRefs(node, rootSchema, baseSchemaPath);
            }
            return;
        }

        // 递归处理所有属性
        for (const key in node) {
            const value = node[key];
            if (Array.isArray(value)) {
                for (const item of value) {
                    if (item && typeof item === 'object') {
                        await this.resolveSchemaRefs(item as IJsonSchemaNode, rootSchema, baseSchemaPath);
                    }
                }
            } else if (typeof value === 'object' && value !== null) {
                await this.resolveSchemaRefs(value as IJsonSchemaNode, rootSchema, baseSchemaPath);
            }
        }
    }

    /**
     * 将外部 schema 的 $defs 合并到根 schema
     * @param rootSchema 根 schema
     * @param defs 要合并的定义
     * @param key 定义的键名（$defs 或 definitions）
     */
    private mergeDefs(rootSchema: IJsonSchemaNode, defs: Record<string, unknown>, key: string = '$defs'): void {
        if (!rootSchema[key]) {
            rootSchema[key] = {};
        }

        const rootDefs = rootSchema[key] as Record<string, unknown>;
        for (const [name, def] of Object.entries(defs)) {
            // 如果已存在同名定义，跳过（避免覆盖）
            if (!rootDefs[name]) {
                rootDefs[name] = def;
            }
        }
    }

    /**
     * 解析内部引用
     */
    private resolveInternalRef(ref: string, schema: JSONSchema7): JSONSchema7 | undefined {
        // 移除 # 前缀
        const path = ref.replace(/^#\//, '').split('/');

        let current: unknown = schema;
        for (const segment of path) {
            if (!current || typeof current !== 'object') {
                return undefined;
            }
            current = (current as Record<string, unknown>)[segment];
        }

        return current as JSONSchema7;
    }

    /**
     * 提取 schema 依赖
     */
    private extractDependencies(schema: IJsonSchemaNode, deps: Set<string> = new Set()): string[] {
        if (!schema || typeof schema !== 'object') {
            return Array.from(deps);
        }

        // 检查 $ref
        if (schema.$ref && typeof schema.$ref === 'string') {
            // 提取外部文件引用
            const match = schema.$ref.match(/^([^#]+)/);
            if (match && !match[1].startsWith('#')) {
                deps.add(match[1]);
            }
        }

        // 递归检查所有属性
        for (const key in schema) {
            const value = schema[key];
            if (Array.isArray(value)) {
                value.forEach((item: unknown) => {
                    if (item && typeof item === 'object') {
                        this.extractDependencies(item as IJsonSchemaNode, deps);
                    }
                });
            } else if (typeof value === 'object' && value !== null) {
                this.extractDependencies(value as IJsonSchemaNode, deps);
            }
        }

        return Array.from(deps);
    }

    /**
     * 匹配 schema 段
     */
    private async matchSchemaSegment(segment: string, schema: JSONSchema7): Promise<JSONSchema7 | undefined> {
        // 检查 properties
        if (schema.properties && schema.properties[segment]) {
            const prop = schema.properties[segment];
            if (typeof prop === 'object') {
                return prop as JSONSchema7;
            }
        }

        // 检查 patternProperties
        if (schema.patternProperties) {
            for (const [pattern, value] of Object.entries(schema.patternProperties)) {
                const regex = safeCompileRegex(pattern);
                if (regex && regex.test(segment)) {
                    if (typeof value === 'object') {
                        return value as JSONSchema7;
                    }
                }
            }
        }

        // 检查 additionalProperties
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            return schema.additionalProperties as JSONSchema7;
        }

        return undefined;
    }
}
