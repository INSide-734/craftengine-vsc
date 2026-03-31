/**
 * 扩展参数类型接口定义
 *
 * 定义扩展参数类型的数据结构，用于模板参数的高级类型支持
 */

/**
 * 扩展参数类型的基础定义
 */
export interface IExtendedParameterTypeDefinition {
    /** 类型名称 */
    name: string;
    /** 类型描述 */
    description: string;
    /** 必需属性列表 */
    requiredProperties: string[];
    /** 可选属性列表 */
    optionalProperties: string[];
    /** 属性类型映射 */
    propertyTypes: Record<string, string>;
    /** 使用示例 */
    example: string;
}

/**
 * 扩展参数类型的属性定义
 */
export interface IExtendedPropertyDefinition {
    /** 属性名称 */
    name: string;
    /** 属性描述 */
    description: string;
    /** 属性类型 */
    type: string;
    /** 枚举值（如果是枚举类型） */
    enumValues?: string[];
    /** 示例值 */
    examples?: string[];
}

/**
 * 扩展参数类型服务接口
 */
export interface IExtendedTypeService {
    /**
     * 获取所有扩展参数类型名称
     */
    getTypeNames(): string[];

    /**
     * 检查是否是有效的扩展参数类型
     * @param typeName 类型名称
     */
    isValidType(typeName: string): boolean;

    /**
     * 获取扩展参数类型定义
     * @param typeName 类型名称
     */
    getTypeDefinition(typeName: string): IExtendedParameterTypeDefinition | undefined;

    /**
     * 获取扩展参数类型的属性定义
     * @param typeName 类型名称
     */
    getTypeProperties(typeName: string): IExtendedPropertyDefinition[];

    /**
     * 获取扩展参数类型的代码片段
     * @param typeName 类型名称
     */
    getTypeSnippet(typeName: string): string | undefined;
}
