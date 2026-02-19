import { Uri, Position, Range } from 'vscode';
import { IYamlDocument, IYamlNode, IYamlParseResult, IYamlParseError, YamlNodeType, YamlValue } from '../../core/interfaces/IYamlDocument';

/**
 * YAML 文档节点实现
 * 
 * 表示 YAML 文档树中的一个节点，包含节点类型、值、位置信息和层次结构关系。
 * 节点可以是标量值、对象、数组等不同类型。
 * 
 * @remarks
 * - 支持父子节点关系维护
 * - 提供精确的文档位置信息（行列号和范围）
 * - 保留完整的路径信息便于节点定位
 * 
 * @example
 * ```typescript
 * const node = new YamlNode(
 *     'string',
 *     'example-value',
 *     { start: new Position(0, 0), end: new Position(0, 12), range: new Range(0, 0, 0, 12) },
 *     parentNode,
 *     undefined,
 *     ['templates', 'user-profile']
 * );
 * ```
 */
class YamlNode implements IYamlNode {
    /**
     * 构造 YAML 节点实例
     * 
     * @param type - 节点类型（string, number, boolean, object, array, null）
     * @param value - 节点的值
     * @param position - 节点在文档中的位置信息（可选）
     * @param parent - 父节点引用（可选）
     * @param children - 子节点映射表，键为字段名或数组索引（可选）
     * @param path - 从根节点到当前节点的完整路径
     * @param key - 当前节点的键名（如果是对象字段）或索引（如果是数组元素）
     */
    constructor(
        public readonly type: YamlNodeType,
        public readonly value: YamlValue,
        public readonly position?: {
            start: Position;
            end: Position;
            range: Range;
        },
        public readonly parent?: IYamlNode,
        public readonly children?: Map<string | number, IYamlNode>,
        public readonly path: (string | number)[] = [],
        public readonly key?: string | number
    ) {}
}

/**
 * YAML 文档实现
 * 
 * 表示一个已解析的 YAML 文档，提供对文档结构的查询和访问接口。
 * 支持通过路径访问节点、获取值、检查路径存在性等操作。
 * 
 * @remarks
 * - 保留原始文档内容和来源信息
 * - 提供解析结果和错误信息
 * - 支持灵活的路径导航
 * 
 * @example
 * ```typescript
 * const doc = new YamlDocument(uri, content, parseResult);
 * 
 * // 获取节点
 * const node = doc.getNode(['templates', 'user-profile']);
 * 
 * // 获取值
 * const value = doc.getValue(['templates', 'user-profile', 'name']);
 * 
 * // 检查路径是否存在
 * if (doc.hasPath(['templates', 'user-profile'])) {
 *     // 处理模板
 * }
 * ```
 */
export class YamlDocument implements IYamlDocument {
    /**
     * 构造 YAML 文档实例
     * 
     * @param sourceFile - 文档的源文件 URI
     * @param content - 原始 YAML 文本内容
     * @param parseResult - 解析结果，包含根节点、错误信息等
     */
    constructor(
        public readonly sourceFile: Uri,
        public readonly content: string,
        public readonly parseResult: IYamlParseResult
    ) {}

    /**
     * 获取指定路径的节点
     * 
     * @param path - 节点路径，使用字符串键和数字索引的数组表示
     * @returns 找到的节点，如果路径不存在则返回 null
     * 
     * @example
     * ```typescript
     * // 获取对象字段
     * const node = doc.getNode(['templates', 'user-profile']);
     * 
     * // 获取数组元素
     * const node = doc.getNode(['items', 0]);
     * 
     * // 获取嵌套结构
     * const node = doc.getNode(['templates', 'user-profile', 'parameters', 0, 'name']);
     * ```
     */
    getNode(path: (string | number)[]): IYamlNode | null {
        if (!this.parseResult.root || path.length === 0) {
            return this.parseResult.root || null;
        }

        let current: IYamlNode | undefined = this.parseResult.root;
        
        for (const key of path) {
            if (!current?.children) {
                return null;
            }
            
            current = current.children.get(key);
            if (!current) {
                return null;
            }
        }
        
        return current || null;
    }

    /**
     * 获取指定路径的值
     * 
     * @param path - 节点路径
     * @returns 节点的值，如果路径不存在则返回 undefined
     * 
     * @example
     * ```typescript
     * const templateName = doc.getValue(['templates', 'user-profile', 'name']);
     * console.log(templateName); // 输出: 'User Profile Template'
     * ```
     */
    getValue(path: (string | number)[]): YamlValue {
        const node = this.getNode(path);
        return node?.value;
    }

    /**
     * 检查指定路径是否存在
     * 
     * @param path - 要检查的节点路径
     * @returns 如果路径存在返回 true，否则返回 false
     * 
     * @example
     * ```typescript
     * if (doc.hasPath(['templates', 'user-profile'])) {
     *     console.log('Template exists');
     * }
     * ```
     */
    hasPath(path: (string | number)[]): boolean {
        return this.getNode(path) !== null;
    }

    /**
     * 获取所有顶级键
     * 
     * @returns 文档根级别的所有字符串键数组
     * 
     * @remarks
     * 只返回字符串类型的键，过滤掉数字索引
     * 
     * @example
     * ```typescript
     * const keys = doc.getTopLevelKeys();
     * console.log(keys); // 输出: ['templates', 'configurations', 'metadata']
     * ```
     */
    getTopLevelKeys(): string[] {
        if (!this.parseResult.root?.children) {
            return [];
        }

        return Array.from(this.parseResult.root.children.keys())
            .filter(key => typeof key === 'string')
            .map(key => key as string);
    }

    /**
     * 检查文档是否有效
     * 
     * @returns 如果文档解析成功且没有错误则返回 true
     * 
     * @remarks
     * 有效的文档意味着：
     * - 解析过程成功完成
     * - 没有语法错误
     * - 没有语义错误
     * 
     * @example
     * ```typescript
     * if (!doc.isValid()) {
     *     const errors = doc.getErrors();
     *     console.error('Document has errors:', errors);
     * }
     * ```
     */
    isValid(): boolean {
        return this.parseResult.success && this.parseResult.errors.length === 0;
    }

    /**
     * 获取所有错误
     * 
     * @returns 解析错误数组
     * 
     * @remarks
     * 错误包括语法错误、格式错误等，每个错误包含位置和描述信息
     * 
     * @example
     * ```typescript
     * const errors = doc.getErrors();
     * errors.forEach(error => {
     *     console.error(`Error at line ${error.line}: ${error.message}`);
     * });
     * ```
     */
    getErrors(): IYamlParseError[] {
        return this.parseResult.errors;
    }
}

/**
 * 位置映射类型：路径字符串 -> 位置信息
 * 
 * @remarks
 * 用于存储文档中每个节点的精确位置信息
 * 键格式为点分隔的路径字符串，如 "templates.user-profile.name"
 */
export type PositionMap = Map<string, {
    start: Position;
    end: Position;
    range: Range;
}>;

/**
 * 从 YAML 对象构建节点树
 * 
 * 递归遍历 YAML 对象结构，为每个节点创建包含位置信息的节点对象。
 * 支持对象、数组和标量值的处理。
 * 
 * @param obj - YAML 对象（可以是任意类型）
 * @param path - 从根节点到当前节点的路径（默认为空数组）
 * @param parent - 父节点引用（可选）
 * @param lines - 文档行数组，用于计算位置（可选）
 * @param positionMap - 位置映射，提供精确的位置信息（可选）
 * @returns 构建的节点对象，如果输入为 null/undefined 则返回对应的 null 节点
 * 
 * @remarks
 * - 如果提供 positionMap，将使用精确的位置信息
 * - 自动识别对象、数组和标量值类型
 * - 为每个节点构建完整的路径信息
 * - 递归处理嵌套结构
 * 
 * @example
 * ```typescript
 * const yamlObject = {
 *     templates: {
 *         'user-profile': {
 *             name: 'User Profile',
 *             parameters: ['username', 'email']
 *         }
 *     }
 * };
 * 
 * const rootNode = buildNodeTree(yamlObject, [], undefined, lines, positionMap);
 * 
 * // 访问节点
 * const templateNode = rootNode.children?.get('templates');
 * console.log(templateNode?.type); // 输出: 'object'
 * ```
 */
export function buildNodeTree(
    obj: unknown,
    path: (string | number)[] = [],
    parent?: IYamlNode,
    lines?: string[],
    positionMap?: PositionMap
): IYamlNode | null {
    if (obj === null || obj === undefined) {
        const pathKey = path.join('.');
        const position = positionMap?.get(pathKey);
        return new YamlNode('null', obj as YamlValue, position, parent, undefined, path);
    }

    const isArray = Array.isArray(obj);
    const type = isArray ? 'array' : typeof obj as YamlNodeType;
    const children = new Map<string | number, IYamlNode>();
    const pathKey = path.join('.');

    // 获取当前位置信息
    const position = positionMap?.get(pathKey);

    if (type === 'object' || type === 'array') {
        if (isArray) {
            (obj as unknown[]).forEach((item, index) => {
                const childPath = [...path, index];
                const child = buildNodeTree(item, childPath, undefined, lines, positionMap);
                if (child) {
                    children.set(index, child);
                }
            });
        } else {
            Object.keys(obj as Record<string, unknown>).forEach(key => {
                const childPath = [...path, key];
                const child = buildNodeTree((obj as Record<string, unknown>)[key], childPath, undefined, lines, positionMap);
                if (child) {
                    children.set(key, child);
                }
            });
        }
    }

    return new YamlNode(
        type,
        obj as YamlValue,
        position,
        parent,
        children.size > 0 ? children : undefined,
        path
    );
}

