/**
 * Schema 数据加载器模块
 *
 * 提供从 Schema 文件中加载扩展数据的功能。
 * 这些加载器从 Schema 的自定义扩展字段（x-* 属性）中提取数据。
 */

export {
    MiniMessageDataLoader,
    IMiniMessageSchemaData,
    IMiniMessageTagDefinition,
    IMiniMessageTagArgument,
    IHexColorDefinition,
} from './MiniMessageDataLoader';
