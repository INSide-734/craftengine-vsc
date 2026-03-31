// LRUCache 由 SchemaFileLoader 直接从 infrastructure 导入

import { type IJsonSchemaNode } from '../../../core/types/JsonSchemaTypes';

/**
 * Schema 缓存项
 */
export interface ISchemaCacheEntry {
    schema: IJsonSchemaNode;
    timestamp: number;
    accessCount: number;
    lastAccess: number;
}
