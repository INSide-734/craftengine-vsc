/**
 * Schema 工具函数和辅助类
 */

import { type IJsonSchemaNode } from '../../../core/types/JsonSchemaTypes';

/**
 * 从正则表达式模式中提取字段名称
 *
 * @param pattern 正则表达式模式，例如 "^items(#.*)?$"
 * @returns 提取的字段名称，例如 "items"
 */
export function extractFieldNameFromPattern(pattern: string): string | null {
    try {
        // 移除正则表达式的开始和结束标记
        let fieldName = pattern.replace(/^\^/, '').replace(/\$$/, '');

        // 移除可选的注释部分
        fieldName = fieldName.replace(/\(#\.\*\)?\?\$?$/, '');

        // 移除其他正则表达式元字符
        fieldName = fieldName.replace(/[\\^$*+?.()|[\]{}]/g, '');

        // 验证是否为有效的字段名称
        if (fieldName && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(fieldName)) {
            return fieldName;
        }

        // 尝试查找第一个单词字符序列
        const match = pattern.match(/([a-zA-Z][a-zA-Z0-9_-]*)/);
        if (match) {
            return match[1];
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * 获取备用的顶级字段列表
 *
 * 当 Schema 不可用时使用的默认字段列表
 */
export function getFallbackTopLevelFields(): string[] {
    return [
        'blocks',
        'categories',
        'emoji',
        'equipments',
        'events',
        'furniture',
        'items',
        'loot_tables',
        'recipes',
        'templates',
    ];
}

/**
 * Schema 属性详情
 */
export interface ISchemaPropertyDetails {
    description?: string;
    type?: string | string[];
    examples?: unknown[];
    enum?: unknown[];
    default?: unknown;
    required?: boolean;
    deprecated?: boolean;
    pattern?: string;
}

/**
 * Schema 属性信息
 */
export interface ISchemaProperty {
    key: string;
    schema: IJsonSchemaNode;
}
