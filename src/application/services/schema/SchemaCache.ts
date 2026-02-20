// LRUCache 由 SchemaFileLoader 直接从 infrastructure 导入

import { type JsonSchemaNode } from '../../../core/types/JsonSchemaTypes';

/**
 * Schema 缓存项
 */
export interface SchemaCacheEntry {
    schema: JsonSchemaNode;
    timestamp: number;
    accessCount: number;
    lastAccess: number;
}
