import { EditorUri, EditorPosition, EditorRange } from '../types/EditorTypes';

/**
 * YAML 文档节点类型
 */
export type YamlNodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'undefined';

/**
 * YAML 值类型 - 表示 YAML 文档中可能的值类型
 */
export type YamlValue = string | number | boolean | null | undefined |
    YamlValue[] | { [key: string]: YamlValue };

/**
 * YAML 文档节点
 * 
 * 表示 YAML 文档中的一个节点，包含值、位置和元数据
 */
export interface IYamlNode {
    /** 节点类型 */
    readonly type: YamlNodeType;
    
    /** 节点值 */
    readonly value: YamlValue;
    
    /** 节点在文档中的位置 */
    readonly position?: {
        /** 起始位置 */
        start: EditorPosition;
        /** 结束位置 */
        end: EditorPosition;
        /** 范围 */
        range: EditorRange;
    };
    
    /** 父节点 */
    readonly parent?: IYamlNode;
    
    /** 子节点（如果是对象或数组） */
    readonly children?: Map<string | number, IYamlNode>;
    
    /** 节点路径（从根到当前节点的键路径） */
    readonly path: (string | number)[];
    
    /** 节点键名（如果是对象属性） */
    readonly key?: string | number;
}

/**
 * YAML 文档解析结果
 */
export interface IYamlParseResult {
    /** 解析后的根节点 */
    readonly root: IYamlNode | null;
    
    /** 解析错误列表 */
    readonly errors: IYamlParseError[];
    
    /** 是否解析成功 */
    readonly success: boolean;
    
    /** 文档元数据 */
    readonly metadata: {
        /** 源文件 URI */
        sourceFile: EditorUri;
        /** 文档总行数 */
        totalLines: number;
        /** 解析时间戳 */
        parsedAt: Date;
    };
}

/**
 * YAML 解析错误
 */
export interface IYamlParseError {
    /** 错误消息 */
    readonly message: string;
    
    /** 错误严重程度 */
    readonly severity: 'error' | 'warning' | 'info';
    
    /** 错误位置 */
    readonly position?: {
        line: number;
        character: number;
    };
    
    /** 错误代码 */
    readonly code?: string;
}

/**
 * YAML 文档接口
 * 
 * 提供对 YAML 文档的访问和操作
 */
export interface IYamlDocument {
    /** 源文件 URI */
    readonly sourceFile: EditorUri;
    
    /** 文档内容 */
    readonly content: string;
    
    /** 解析结果 */
    readonly parseResult: IYamlParseResult;
    
    /** 获取指定路径的节点 */
    getNode(path: (string | number)[]): IYamlNode | null;
    
    /** 获取指定路径的值 */
    getValue(path: (string | number)[]): YamlValue;
    
    /** 检查指定路径是否存在 */
    hasPath(path: (string | number)[]): boolean;
    
    /** 获取所有顶级键 */
    getTopLevelKeys(): string[];
    
    /** 检查文档是否有效 */
    isValid(): boolean;
    
    /** 获取所有错误 */
    getErrors(): IYamlParseError[];
}

