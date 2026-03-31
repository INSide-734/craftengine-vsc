import * as path from 'path';
import { type ILogger } from '../../../core/interfaces/ILogger';
import { type ISchemaFileLoader } from '../../../core/interfaces/ISchemaFileLoader';
import { SCHEMA_METADATA, SCHEMA_RESOLUTION } from './SchemaConstants';

/**
 * Schema 引用解析上下文
 */
interface IRefResolutionContext {
    schema: IJsonSchemaNode;
    visited: Set<string>;
    depth: number;
    maxDepth: number;
    /** 当前 Schema 文件的目录路径（用于解析相对引用） */
    currentSchemaDir?: string;
}

/**
 * 循环引用标记键名
 * 用于标识已检测到循环引用的 Schema
 */
const CIRCULAR_REF_KEY = '__circularRefMarker__';

/**
 * 检查 Schema 是否被标记为循环引用
 */
export function isCircularRef(schema: IJsonSchemaNode): boolean {
    return schema && typeof schema === 'object' && schema[CIRCULAR_REF_KEY] === true;
}

/**
 * Schema 引用解析器
 *
 * 负责解析 Schema 中的 $ref、allOf、oneOf、anyOf 等引用
 */
export class SchemaReferenceResolver {
    constructor(
        private readonly loader: ISchemaFileLoader,
        private readonly logger: ILogger,
    ) {}

    /**
     * 解析 Schema 中的所有引用
     *
     * @param schema Schema 对象
     * @param maxDepth 最大递归深度
     * @param contextSchema 上下文 Schema（用于内部引用）
     * @returns 解析后的 Schema
     */
    async resolveReferences(
        schema: IJsonSchemaNode,
        maxDepth: number = SCHEMA_RESOLUTION.DEFAULT_MAX_DEPTH,
        contextSchema?: IJsonSchemaNode,
    ): Promise<IJsonSchemaNode> {
        // 优先使用 Schema 上标记的上下文（由之前的外部引用解析设置）
        // 这样可以正确解析外部 Schema 中的内部引用
        const effectiveContext =
            (schema?.[SCHEMA_METADATA.CONTEXT_SCHEMA] as IJsonSchemaNode | undefined) || contextSchema || schema;

        // 确定当前 Schema 文件目录，优先级：
        // 1. schema[SCHEMA_METADATA.SCHEMA_DIR]（直接保存的目录路径）
        // 2. 从 schema[SCHEMA_METADATA.SCHEMA_FILE] 计算
        // 3. 从 effectiveContext[SCHEMA_METADATA.SCHEMA_DIR] 获取
        // 4. 从 effectiveContext[SCHEMA_METADATA.SCHEMA_FILE] 计算
        let currentSchemaDir = schema?.[SCHEMA_METADATA.SCHEMA_DIR] as string | undefined;
        if (!currentSchemaDir) {
            const schemaFile = (schema?.[SCHEMA_METADATA.SCHEMA_FILE] ||
                effectiveContext?.[SCHEMA_METADATA.SCHEMA_FILE]) as string | undefined;
            // 使用 path.posix.dirname 确保跨平台一致性
            currentSchemaDir = schemaFile
                ? path.posix.dirname(schemaFile.replace(/\\/g, '/'))
                : (effectiveContext?.[SCHEMA_METADATA.SCHEMA_DIR] as string | undefined);
        }

        const context: IRefResolutionContext = {
            schema: effectiveContext,
            visited: new Set<string>(),
            depth: 0,
            maxDepth,
            currentSchemaDir,
        };

        return this.resolveWithContext(schema, context);
    }

    /**
     * 带上下文的引用解析
     */
    private async resolveWithContext(schema: IJsonSchemaNode, context: IRefResolutionContext): Promise<IJsonSchemaNode> {
        if (!schema || context.depth >= context.maxDepth) {
            if (context.depth >= context.maxDepth) {
                this.logger.debug('Max resolution depth reached', {
                    depth: context.depth,
                    maxDepth: context.maxDepth,
                });
            }
            return schema;
        }

        // 增加深度，并且如果 schema 有自己的 SCHEMA_DIR，使用它
        // 这确保了从外部引用解析的 Schema 在处理其内部的 oneOf/allOf 时
        // 使用正确的目录上下文来解析相对路径
        const effectiveSchemaDir =
            (schema[SCHEMA_METADATA.SCHEMA_DIR] as string | undefined) || context.currentSchemaDir;

        const newContext = {
            ...context,
            depth: context.depth + 1,
            currentSchemaDir: effectiveSchemaDir,
        };

        try {
            // 处理 $ref
            if (schema.$ref) {
                return await this.resolveRef(schema, newContext);
            }

            // 处理 allOf
            if (schema.allOf && Array.isArray(schema.allOf)) {
                return await this.resolveAllOf(schema, newContext);
            }

            // 处理 oneOf
            if (schema.oneOf && Array.isArray(schema.oneOf)) {
                return await this.resolveOneOf(schema, newContext);
            }

            // 处理 anyOf
            if (schema.anyOf && Array.isArray(schema.anyOf)) {
                return await this.resolveAnyOf(schema, newContext);
            }

            return schema;
        } catch (error) {
            this.logger.error('Failed to resolve references', error as Error);
            return schema;
        }
    }

    /**
     * 解析 $ref 引用
     */
    private async resolveRef(schema: IJsonSchemaNode, context: IRefResolutionContext): Promise<IJsonSchemaNode> {
        const ref = schema.$ref as string;

        // 循环引用检测：使用当前链路的副本，避免不同分支间的误判
        if (context.visited.has(ref)) {
            this.logger.debug('Circular reference detected', { ref });
            // 返回一个标记了循环引用的 schema，下游代码可以检测并处理
            return {
                [CIRCULAR_REF_KEY]: true,
                __circularRef__: ref,
                type: 'object',
                description: `Circular reference to ${ref}`,
            };
        }

        // 创建新的 visited 集合（当前链路的副本 + 当前 ref）
        // 这样同一个 $ref 在不同分支中被引用不会误判为循环
        const branchVisited = new Set(context.visited);
        branchVisited.add(ref);

        try {
            // 分离文件路径和内部路径
            const [filePart, internalPath] = ref.split('#');

            let targetSchema: IJsonSchemaNode;
            let externalSchemaRoot: IJsonSchemaNode | null = null;
            let newSchemaDir: string | undefined = context.currentSchemaDir;
            let resolvedFilename: string | undefined;

            if (filePart) {
                // 外部引用 - 解析文件路径
                resolvedFilename = this.resolveFilePath(filePart, context.currentSchemaDir);
                targetSchema = await this.loader.loadSchema(resolvedFilename);
                // 保存外部 Schema 的根，用于解析其内部引用
                externalSchemaRoot = targetSchema;
                // 更新当前 Schema 目录为新加载的 Schema 的目录
                // 使用 path.posix.dirname 确保跨平台一致性
                newSchemaDir = path.posix.dirname(resolvedFilename.replace(/\\/g, '/'));
            } else {
                // 内部引用 - 使用当前上下文的根 Schema
                const root = this.findSchemaRoot(context.schema);
                if (!root) {
                    this.logger.debug('Failed to resolve $ref: no schema root', { ref });
                    return schema;
                }
                targetSchema = root;
            }

            // 解析内部路径
            if (internalPath) {
                const navigated = this.navigateSchemaPath(targetSchema, internalPath);
                if (!navigated) {
                    this.logger.debug('Failed to resolve $ref', { ref });
                    return schema;
                }
                targetSchema = navigated;
            }

            // 合并其他属性
            const { $ref: _ref, ...rest } = schema;
            const resolved: IJsonSchemaNode = { ...targetSchema, ...rest };

            // 确定用于递归解析的上下文 Schema
            // 1. 如果是外部引用，使用外部 Schema 作为新上下文
            // 2. 如果是内部引用，保持当前上下文
            const newContextSchema = externalSchemaRoot || context.schema;

            // 在解析后的 Schema 上标记其上下文，用于后续引用解析
            resolved[SCHEMA_METADATA.CONTEXT_SCHEMA] = newContextSchema;

            // 如果是外部引用，同时设置 SCHEMA_FILE 和 SCHEMA_DIR
            // 以便后续嵌套引用解析能获取正确的目录
            // 这确保了当后续代码再次调用 resolveReferences 时，能正确计算相对路径
            if (filePart && newSchemaDir) {
                resolved[SCHEMA_METADATA.SCHEMA_FILE] =
                    externalSchemaRoot?.[SCHEMA_METADATA.SCHEMA_FILE] || resolvedFilename;
                resolved[SCHEMA_METADATA.SCHEMA_DIR] = newSchemaDir;
            }

            const resolveContext = {
                ...context,
                schema: newContextSchema,
                currentSchemaDir: newSchemaDir,
                visited: branchVisited,
            };

            return await this.resolveWithContext(resolved, resolveContext);
        } catch (error) {
            this.logger.error('Failed to resolve $ref', error as Error, { ref });
            return schema;
        }
    }

    /**
     * 解析文件引用路径
     *
     * @param filePart 引用中的文件路径部分（如 "../common/base.schema.json"）
     * @param currentDir 当前 Schema 文件所在目录（如 "sections"）
     * @returns 相对于 schemas 根目录的路径（如 "common/base.schema.json"）
     */
    private resolveFilePath(filePart: string, currentDir?: string): string {
        // 如果没有当前目录信息，或者不是相对路径，直接返回清理后的路径
        if (!currentDir || (!filePart.startsWith('./') && !filePart.startsWith('../'))) {
            return filePart.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
        }

        // 使用 path.posix 确保跨平台一致性（Schema 引用使用 POSIX 风格路径）
        const resolvedPath = path.posix.normalize(path.posix.join(currentDir, filePart));

        // 确保结果不会超出 schemas 目录
        if (resolvedPath.startsWith('..')) {
            this.logger.warn('Schema reference escapes schemas directory', { filePart, currentDir });
            return filePart.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
        }

        return resolvedPath;
    }

    /**
     * 解析 allOf
     *
     * 注意：除了合并 allOf 中的 Schema，还需要保留原始 Schema 中的其他属性
     * （如 patternProperties、required 等），否则这些属性会丢失
     */
    private async resolveAllOf(schema: IJsonSchemaNode, context: IRefResolutionContext): Promise<IJsonSchemaNode> {
        const resolvedSchemas = await Promise.all(
            (schema.allOf as IJsonSchemaNode[]).map((s: IJsonSchemaNode) => this.resolveWithContext(s, context)),
        );

        // 提取原始 Schema 中除 allOf 之外的属性
        const { allOf: _allOf, ...restOfOriginalSchema } = schema;

        // 合并 allOf 中解析的 Schema，然后将原始 Schema 的其他属性也合并进来
        // 原始 Schema 的属性优先级更高（放在最后）
        const result = this.mergeSchemas([...resolvedSchemas, restOfOriginalSchema]);
        // 保留上下文元数据，确保后续引用解析能获取正确的目录
        this.preserveMetadata(result, schema, context);
        return result;
    }

    /**
     * 解析 oneOf
     */
    private async resolveOneOf(schema: IJsonSchemaNode, context: IRefResolutionContext): Promise<IJsonSchemaNode> {
        const resolvedSchemas = await Promise.all(
            (schema.oneOf as IJsonSchemaNode[]).map((s: IJsonSchemaNode) => this.resolveWithContext(s, context)),
        );

        const result = { ...schema, oneOf: resolvedSchemas };
        // 保留上下文元数据，确保后续引用解析能获取正确的目录
        this.preserveMetadata(result, schema, context);
        return result;
    }

    /**
     * 解析 anyOf
     */
    private async resolveAnyOf(schema: IJsonSchemaNode, context: IRefResolutionContext): Promise<IJsonSchemaNode> {
        const resolvedSchemas = await Promise.all(
            (schema.anyOf as IJsonSchemaNode[]).map((s: IJsonSchemaNode) => this.resolveWithContext(s, context)),
        );

        const result = { ...schema, anyOf: resolvedSchemas };
        // 保留上下文元数据，确保后续引用解析能获取正确的目录
        this.preserveMetadata(result, schema, context);
        return result;
    }

    /**
     * 导航 Schema 路径
     *
     * 导航到内部路径后，确保返回的子对象继承父 Schema 的元数据
     */
    private navigateSchemaPath(schema: IJsonSchemaNode, internalPath: string): IJsonSchemaNode | undefined {
        const parts = internalPath.split('/').filter((p) => p);
        let current: unknown = schema;

        for (const part of parts) {
            if (current && typeof current === 'object') {
                current = (current as Record<string, unknown>)[part];
            } else {
                return undefined;
            }
        }

        // 如果导航到的是一个对象，确保它继承父 Schema 的元数据
        // 这对于正确解析嵌套的相对路径引用至关重要
        if (current && typeof current === 'object' && !Array.isArray(current)) {
            const currentNode = current as IJsonSchemaNode;
            const hasFile = !currentNode[SCHEMA_METADATA.SCHEMA_FILE] && !!schema[SCHEMA_METADATA.SCHEMA_FILE];
            const hasDir = !currentNode[SCHEMA_METADATA.SCHEMA_DIR] && !!schema[SCHEMA_METADATA.SCHEMA_DIR];
            if (hasFile || hasDir) {
                const merged: IJsonSchemaNode = { ...currentNode };
                if (hasFile) {
                    merged[SCHEMA_METADATA.SCHEMA_FILE] = schema[SCHEMA_METADATA.SCHEMA_FILE];
                }
                if (hasDir) {
                    merged[SCHEMA_METADATA.SCHEMA_DIR] = schema[SCHEMA_METADATA.SCHEMA_DIR];
                }
                current = merged;
            }
        }

        return current as IJsonSchemaNode | undefined;
    }

    /**
     * 查找 Schema 根
     */
    private findSchemaRoot(schema: IJsonSchemaNode): IJsonSchemaNode | null {
        return schema && typeof schema === 'object' ? schema : null;
    }

    /**
     * 保留 Schema 上下文元数据
     *
     * 确保解析后的 Schema 携带正确的上下文信息，
     * 以便后续引用解析能够获取正确的目录路径。
     *
     * @param result 解析后的 Schema 对象
     * @param originalSchema 原始 Schema 对象
     * @param context 当前解析上下文
     */
    private preserveMetadata(
        result: IJsonSchemaNode,
        originalSchema: IJsonSchemaNode,
        context: IRefResolutionContext,
    ): void {
        // 保留 SCHEMA_FILE：优先使用原始 Schema 的值，否则从上下文 schema 获取
        if (!result[SCHEMA_METADATA.SCHEMA_FILE]) {
            result[SCHEMA_METADATA.SCHEMA_FILE] =
                originalSchema[SCHEMA_METADATA.SCHEMA_FILE] || context.schema?.[SCHEMA_METADATA.SCHEMA_FILE];
        }

        // 设置 CONTEXT_SCHEMA：用于解析内部引用（如 #/$defs/xxx）
        // 总是使用 context.schema，确保内部引用能在正确的 Schema 中查找
        if (context.schema) {
            result[SCHEMA_METADATA.CONTEXT_SCHEMA] = context.schema;
        }

        // 保留 SCHEMA_DIR：直接保存当前目录，避免重复计算
        if (!result[SCHEMA_METADATA.SCHEMA_DIR] && context.currentSchemaDir) {
            result[SCHEMA_METADATA.SCHEMA_DIR] = context.currentSchemaDir;
        }
    }

    /**
     * 合并多个 Schema
     *
     * 注意：对于元数据属性（__schemaDir__、__schemaFile__），
     * 保留第一个非空值，确保来自外部引用的目录上下文不会被丢失。
     * 但 __contextSchema__ 应该使用后面的值（用于解析内部引用）。
     */
    private mergeSchemas(schemas: IJsonSchemaNode[]): IJsonSchemaNode {
        const result: IJsonSchemaNode = {};
        // 这些元数据属性保留第一个非空值（用于相对路径解析）
        const keepFirstKeys: string[] = [
            SCHEMA_METADATA.SCHEMA_DIR,
            SCHEMA_METADATA.SCHEMA_FILE,
            SCHEMA_METADATA.LOADED_AT,
            SCHEMA_METADATA.SCHEMA_SOURCE,
        ];
        // CONTEXT_SCHEMA 需要特殊处理：使用后面的值（用于内部引用解析）

        for (const schema of schemas) {
            if (!schema) {
                continue;
            }

            // 合并 properties
            if (schema.properties) {
                result.properties = {
                    ...(result.properties as Record<string, unknown>),
                    ...(schema.properties as Record<string, unknown>),
                };
            }

            // 合并 required
            if (schema.required) {
                result.required = [
                    ...new Set([...((result.required as string[]) || []), ...(schema.required as string[])]),
                ];
            }

            // 合并 patternProperties
            if (schema.patternProperties) {
                result.patternProperties = {
                    ...(result.patternProperties as Record<string, unknown>),
                    ...(schema.patternProperties as Record<string, unknown>),
                };
            }

            // 合并其他属性
            for (const key in schema) {
                if (['properties', 'required', 'patternProperties'].includes(key)) {
                    continue;
                }
                // 对于路径相关的元数据属性，保留第一个非空值
                if (keepFirstKeys.includes(key)) {
                    if (result[key] === undefined && schema[key] !== undefined) {
                        result[key] = schema[key];
                    }
                } else {
                    // 其他属性（包括 __contextSchema__）后面的覆盖前面的
                    result[key] = schema[key];
                }
            }
        }

        return result;
    }
}
