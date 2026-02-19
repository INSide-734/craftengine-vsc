import { EditorTextDocument, EditorPosition } from '../types/EditorTypes';

/**
 * YAML 路径解析器接口
 * 
 * 用于从光标位置向上遍历 YAML 结构，构建完整的路径数组
 */
export interface IYamlPathParser {
    /**
     * 解析 YAML 路径
     * 
     * @param document 文档对象
     * @param position 光标位置
     * @returns 从根到当前位置的路径数组，例如 ["items", "my-item", "template"]
     */
    parsePath(document: EditorTextDocument, position: EditorPosition): string[];
    
    /**
     * 获取指定行的缩进级别
     * 
     * @param line 行文本
     * @returns 缩进级别（空格数）
     */
    getIndentLevel(line: string): number;
    
    /**
     * 提取键名
     * 
     * @param line 行文本
     * @returns 键名，如果不是键值对则返回 undefined
     */
    extractKeyName(line: string): string | undefined;
}

