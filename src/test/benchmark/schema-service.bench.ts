/**
 * Schema 服务性能测试
 * 
 * 测试 Schema 查询和导航在不同场景下的性能表现，包括：
 * - Schema 路径导航
 * - 属性提取和缓存
 * - LRU 缓存操作
 * - Schema 可用性快速检查
 * - 模式匹配（patternProperties）
 * 
 * 性能基准目标:
 * | 操作 | 目标时间 |
 * |------|----------|
 * | 浅层路径导航 | < 0.5ms |
 * | 深层路径导航（5层+） | < 2ms |
 * | 属性缓存命中 | < 0.1ms |
 * | hasSchemaForPath 快速检查 | < 0.5ms |
 */
import { describe, bench } from 'vitest';
import { defaultBenchOptions, fastBenchOptions } from './bench-options';

// ========================================
// LRU 缓存实现（模拟 SchemaQueryService 使用的缓存）
// ========================================

class LRUCache<K, V> {
    private cache = new Map<K, V>();
    
    constructor(private readonly maxSize: number) {}
    
    get(key: K): V | undefined {
        const value = this.cache.get(key);
        if (value !== undefined) {
            // Move to end (most recently used)
            this.cache.delete(key);
            this.cache.set(key, value);
        }
        return value;
    }
    
    set(key: K, value: V): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Remove least recently used (first item)
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(key, value);
    }
    
    has(key: K): boolean {
        return this.cache.has(key);
    }
    
    clear(): void {
        this.cache.clear();
    }
    
    get size(): number {
        return this.cache.size;
    }
}

// ========================================
// 测试用 Schema 生成函数
// ========================================

/**
 * 生成简单的 Schema
 */
function generateSimpleSchema(propertiesCount: number): any {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    
    for (let i = 0; i < propertiesCount; i++) {
        const propName = `property${i}`;
        properties[propName] = {
            type: 'string',
            description: `Property ${i} description`
        };
        if (i % 3 === 0) {
            required.push(propName);
        }
    }
    
    return {
        type: 'object',
        properties,
        required
    };
}

/**
 * 生成嵌套的 Schema
 */
function generateNestedSchema(depth: number, breadth: number): any {
    function generateLevel(currentDepth: number): any {
        if (currentDepth >= depth) {
            return {
                type: 'string',
                description: `Leaf at depth ${currentDepth}`
            };
        }
        
        const properties: Record<string, any> = {};
        for (let i = 0; i < breadth; i++) {
            properties[`child${i}`] = generateLevel(currentDepth + 1);
        }
        
        return {
            type: 'object',
            properties,
            additionalProperties: false
        };
    }
    
    return {
        type: 'object',
        properties: {
            root: generateLevel(0)
        }
    };
}

/**
 * 生成包含 patternProperties 的 Schema
 */
function generatePatternSchema(patternCount: number, propertiesPerPattern: number): any {
    const patternProperties: Record<string, any> = {};
    
    for (let i = 0; i < patternCount; i++) {
        const pattern = `^pattern${i}_[a-z]+$`;
        const properties: Record<string, any> = {};
        
        for (let j = 0; j < propertiesPerPattern; j++) {
            properties[`prop${j}`] = {
                type: 'string',
                description: `Pattern ${i} property ${j}`
            };
        }
        
        patternProperties[pattern] = {
            type: 'object',
            properties
        };
    }
    
    return {
        type: 'object',
        patternProperties,
        additionalProperties: false
    };
}

/**
 * 生成 CraftEngine 风格的 Schema
 * 
 * 符合实际 CraftEngine Schema 结构：
 * - items 使用 namespace:name 格式的 patternProperties
 * - 支持 template + arguments 模式
 * - 支持完整的 material/data/settings 配置
 * - 使用 x-completion-provider 驱动补全
 */
function generateCraftEngineSchema(): any {
    return {
        type: 'object',
        patternProperties: {
            // items 部分使用 items(#section)? 格式
            '^items(#.*)?$': {
                type: 'object',
                patternProperties: {
                    // 物品 ID 格式：namespace:item-name 或简单名称
                    '^[a-z][a-z0-9_-]*:[a-z][a-z0-9_/-]*$': {
                        $ref: '#/$defs/itemConfig'
                    },
                    '^[a-z][a-z0-9_-]*$': {
                        $ref: '#/$defs/itemConfig'
                    }
                },
                additionalProperties: false
            },
            // templates 部分使用 templates#section#subsection 格式
            '^templates(#[a-z0-9_-]+)*$': {
                type: 'object',
                patternProperties: {
                    '^[a-z][a-z0-9_-]*:[a-z][a-z0-9_/-]*$': {
                        $ref: '#/$defs/templateConfig'
                    }
                },
                additionalProperties: false
            },
            // translations 部分
            '^translations(#.*)?$': {
                type: 'object',
                additionalProperties: {
                    type: 'object',
                    additionalProperties: { type: 'string' }
                }
            },
            // categories 部分
            '^categories(#.*)?$': {
                type: 'object',
                patternProperties: {
                    '^[a-z][a-z0-9_-]*:[a-z][a-z0-9_/-]*$': {
                        $ref: '#/$defs/categoryConfig'
                    }
                },
                additionalProperties: false
            }
        },
        additionalProperties: false,
        $defs: {
            itemConfig: {
                type: 'object',
                properties: {
                    template: {
                        type: 'string',
                        description: 'Template reference',
                        'x-completion-provider': 'craftengine.templateName'
                    },
                    arguments: {
                        type: 'object',
                        description: 'Template arguments',
                        additionalProperties: { type: 'string' }
                    },
                    material: {
                        type: 'string',
                        description: 'Base material (Minecraft Material enum)'
                    },
                    'custom-model-data': {
                        type: 'integer',
                        description: 'Custom model data value'
                    },
                    category: {
                        type: 'string',
                        description: 'Item category reference'
                    },
                    data: {
                        type: 'object',
                        properties: {
                            'item-name': {
                                type: 'string',
                                description: 'Item display name (supports MiniMessage)'
                            },
                            lore: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Item lore lines'
                            },
                            components: {
                                type: 'object',
                                description: 'Minecraft components'
                            }
                        }
                    },
                    settings: {
                        type: 'object',
                        properties: {
                            stackable: { type: 'boolean' },
                            tradeable: { type: 'boolean' },
                            'max-stack-size': { type: 'number' }
                        }
                    },
                    model: {
                        type: 'object',
                        description: 'Model configuration (1.21.4+)'
                    },
                    'legacy-model': {
                        type: 'object',
                        description: 'Legacy model configuration'
                    }
                }
            },
            templateConfig: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        description: 'Model type'
                    },
                    path: {
                        type: 'string',
                        description: 'Model path (supports ${param} placeholders)'
                    },
                    generation: {
                        type: 'object',
                        properties: {
                            parent: { type: 'string' },
                            textures: {
                                type: 'object',
                                additionalProperties: { type: 'string' }
                            }
                        }
                    }
                },
                additionalProperties: true
            },
            categoryConfig: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    icon: { type: 'string' },
                    priority: { type: 'number' },
                    list: {
                        type: 'array',
                        items: { type: 'string' }
                    }
                }
            }
        }
    };
}

/**
 * 生成包含 $ref 引用的 Schema
 */
function generateRefSchema(refCount: number): any {
    const definitions: Record<string, any> = {};
    
    for (let i = 0; i < refCount; i++) {
        definitions[`definition${i}`] = {
            type: 'object',
            properties: {
                id: { type: 'string' },
                value: { type: 'number' },
                description: { type: 'string' }
            }
        };
    }
    
    const properties: Record<string, any> = {};
    for (let i = 0; i < refCount; i++) {
        properties[`item${i}`] = {
            $ref: `#/$defs/definition${i}`
        };
    }
    
    return {
        type: 'object',
        $defs: definitions,
        properties
    };
}

// ========================================
// 预生成测试数据
// ========================================

const simpleSchema10 = generateSimpleSchema(10);
const simpleSchema50 = generateSimpleSchema(50);
const simpleSchema100 = generateSimpleSchema(100);

const nestedSchema5 = generateNestedSchema(5, 3);
const nestedSchema8 = generateNestedSchema(8, 2);

const patternSchema5 = generatePatternSchema(5, 10);
const patternSchema10 = generatePatternSchema(10, 10);

const craftEngineSchema = generateCraftEngineSchema();

const refSchema10 = generateRefSchema(10);

// ========================================
// Schema 路径导航模拟
// ========================================

/**
 * 模拟 Schema 路径导航（同步版本，用于基准测试）
 */
function navigateSchemaPath(schema: any, path: string[]): any {
    let current = schema;
    
    for (const segment of path) {
        if (!current) {
            return undefined;
        }
        
        // 检查 properties
        if (current.properties && current.properties[segment]) {
            current = current.properties[segment];
            continue;
        }
        
        // 检查 patternProperties
        if (current.patternProperties) {
            let matched = false;
            for (const pattern of Object.keys(current.patternProperties)) {
                try {
                    const regex = new RegExp(pattern);
                    if (regex.test(segment)) {
                        current = current.patternProperties[pattern];
                        matched = true;
                        break;
                    }
                } catch {
                    // 忽略无效正则
                }
            }
            if (matched) {
                continue;
            }
        }
        
        // 检查 additionalProperties
        if (current.additionalProperties && typeof current.additionalProperties === 'object') {
            current = current.additionalProperties;
            continue;
        }
        
        // 检查 items（数组）
        if (current.type === 'array' && current.items) {
            current = current.items;
            continue;
        }
        
        return undefined;
    }
    
    return current;
}

/**
 * 快速 Schema 可用性检查（不解析引用）
 */
function hasSchemaForPath(schema: any, path: string[]): boolean {
    if (!schema || path.length === 0) {
        return true;
    }
    
    let current = schema;
    
    for (const segment of path) {
        // 如果有 $ref，假设引用有效
        if (current.$ref) {
            return true;
        }
        
        // 检查 properties
        if (current.properties && current.properties[segment]) {
            current = current.properties[segment];
            continue;
        }
        
        // 检查 patternProperties
        if (current.patternProperties) {
            let matched = false;
            for (const pattern of Object.keys(current.patternProperties)) {
                try {
                    if (new RegExp(pattern).test(segment)) {
                        current = current.patternProperties[pattern];
                        matched = true;
                        break;
                    }
                } catch {
                    // 忽略无效正则
                }
            }
            if (matched) {
                continue;
            }
        }
        
        // 检查 additionalProperties
        if (current.additionalProperties) {
            if (typeof current.additionalProperties === 'object') {
                current = current.additionalProperties;
                continue;
            }
            return true;
        }
        
        // 检查 items
        if (current.type === 'array' && current.items) {
            current = current.items;
            continue;
        }
        
        // 检查组合关键字
        if (current.allOf || current.oneOf || current.anyOf) {
            return true;
        }
        
        return false;
    }
    
    return true;
}

/**
 * 提取 Schema 属性
 */
function extractProperties(schema: any): Array<{ key: string; type: string; required: boolean }> {
    const properties: Array<{ key: string; type: string; required: boolean }> = [];
    
    if (!schema || !schema.properties) {
        return properties;
    }
    
    const requiredSet = new Set(schema.required || []);
    
    for (const [key, prop] of Object.entries(schema.properties)) {
        const propSchema = prop as any;
        properties.push({
            key,
            type: propSchema.type || 'unknown',
            required: requiredSet.has(key)
        });
    }
    
    return properties;
}

describe('Schema Service Performance', () => {
    // ========================================
    // LRU 缓存性能测试
    // ========================================

    describe('LRU Cache Operations', () => {
        bench('cache set (empty cache)', () => {
            const cache = new LRUCache<string, any>(200);
            cache.set('key1', { data: 'value1' });
        }, defaultBenchOptions);

        bench('cache get (hit)', () => {
            const cache = new LRUCache<string, any>(200);
            cache.set('key1', { data: 'value1' });
            cache.get('key1');
        }, defaultBenchOptions);

        bench('cache get (miss)', () => {
            const cache = new LRUCache<string, any>(200);
            cache.get('nonexistent');
        }, defaultBenchOptions);

        bench('cache set with eviction (100 items)', () => {
            const cache = new LRUCache<string, any>(50);
            for (let i = 0; i < 100; i++) {
                cache.set(`key${i}`, { data: `value${i}` });
            }
        }, fastBenchOptions);

        bench('cache mixed get/set (100 ops)', () => {
            const cache = new LRUCache<string, any>(50);
            for (let i = 0; i < 50; i++) {
                cache.set(`key${i}`, { data: `value${i}` });
            }
            for (let i = 0; i < 50; i++) {
                cache.get(`key${i % 50}`);
                cache.set(`new_key${i}`, { data: `new_value${i}` });
            }
        }, fastBenchOptions);
    });

    // ========================================
    // Schema 路径导航测试
    // ========================================

    describe('Schema Path Navigation', () => {
        bench('navigate simple path (depth 1)', () => {
            navigateSchemaPath(simpleSchema50, ['property25']);
        }, defaultBenchOptions);

        bench('navigate nested path (depth 3)', () => {
            navigateSchemaPath(nestedSchema5, ['root', 'child1', 'child0']);
        }, defaultBenchOptions);

        bench('navigate nested path (depth 5)', () => {
            navigateSchemaPath(nestedSchema5, ['root', 'child0', 'child1', 'child0', 'child0']);
        }, defaultBenchOptions);

        bench('navigate nested path (depth 8)', () => {
            navigateSchemaPath(nestedSchema8, [
                'root', 'child0', 'child1', 'child0', 
                'child0', 'child1', 'child0', 'child1'
            ]);
        }, defaultBenchOptions);

        bench('navigate CraftEngine items path', () => {
            navigateSchemaPath(craftEngineSchema, ['items', 'default:jade_sword', 'template']);
        }, defaultBenchOptions);

        bench('navigate CraftEngine templates path', () => {
            navigateSchemaPath(craftEngineSchema, [
                'templates#models#2d', 'default:model/generated', 'generation', 'textures'
            ]);
        }, defaultBenchOptions);

        bench('navigate CraftEngine deep path', () => {
            navigateSchemaPath(craftEngineSchema, [
                'items', 'default:phoenix_staff', 'data', 'lore'
            ]);
        }, defaultBenchOptions);
    });

    // ========================================
    // Schema 可用性快速检查测试
    // ========================================

    describe('Schema Availability Check (hasSchemaForPath)', () => {
        bench('check shallow path (exists)', () => {
            hasSchemaForPath(simpleSchema50, ['property25']);
        }, defaultBenchOptions);

        bench('check shallow path (not exists)', () => {
            hasSchemaForPath(simpleSchema50, ['nonexistent']);
        }, defaultBenchOptions);

        bench('check deep path (exists)', () => {
            hasSchemaForPath(nestedSchema5, ['root', 'child0', 'child1', 'child0']);
        }, defaultBenchOptions);

        bench('check deep path (not exists)', () => {
            hasSchemaForPath(nestedSchema5, ['root', 'child0', 'nonexistent']);
        }, defaultBenchOptions);

        bench('check CraftEngine path with patterns', () => {
            hasSchemaForPath(craftEngineSchema, ['items', 'default:jade_sword', 'template']);
        }, defaultBenchOptions);

        bench('check path with additionalProperties', () => {
            hasSchemaForPath(craftEngineSchema, ['translations', 'en', 'item.jade_sword']);
        }, defaultBenchOptions);
    });

    // ========================================
    // 模式匹配测试
    // ========================================

    describe('Pattern Matching (patternProperties)', () => {
        bench('match against 5 patterns (hit on first)', () => {
            navigateSchemaPath(patternSchema5, ['pattern0_abc']);
        }, defaultBenchOptions);

        bench('match against 5 patterns (hit on last)', () => {
            navigateSchemaPath(patternSchema5, ['pattern4_abc']);
        }, defaultBenchOptions);

        bench('match against 5 patterns (no match)', () => {
            navigateSchemaPath(patternSchema5, ['nonmatching_key']);
        }, defaultBenchOptions);

        bench('match against 10 patterns', () => {
            navigateSchemaPath(patternSchema10, ['pattern5_test']);
        }, defaultBenchOptions);

        bench('CraftEngine item pattern match (namespace:name)', () => {
            navigateSchemaPath(craftEngineSchema, ['items', 'default:dragon_blade']);
        }, defaultBenchOptions);

        bench('CraftEngine item pattern match (simple name)', () => {
            navigateSchemaPath(craftEngineSchema, ['items', 'ruby']);
        }, defaultBenchOptions);
    });

    // ========================================
    // 属性提取测试
    // ========================================

    describe('Property Extraction', () => {
        bench('extract 10 properties', () => {
            extractProperties(simpleSchema10);
        }, defaultBenchOptions);

        bench('extract 50 properties', () => {
            extractProperties(simpleSchema50);
        }, defaultBenchOptions);

        bench('extract 100 properties', () => {
            extractProperties(simpleSchema100);
        }, fastBenchOptions);

        bench('extract from nested schema', () => {
            const innerSchema = navigateSchemaPath(nestedSchema5, ['root', 'child0']);
            extractProperties(innerSchema);
        }, defaultBenchOptions);

        bench('extract CraftEngine item properties', () => {
            const itemSchema = navigateSchemaPath(craftEngineSchema, ['items', 'default:jade_sword']);
            extractProperties(itemSchema);
        }, defaultBenchOptions);
    });

    // ========================================
    // 带缓存的操作测试
    // ========================================

    describe('Cached Operations', () => {
        bench('navigate + cache set', () => {
            const cache = new LRUCache<string, any>(200);
            const path = ['items', 'default:jade_sword', 'template'];
            const cacheKey = path.join('.');
            
            const schema = navigateSchemaPath(craftEngineSchema, path);
            cache.set(cacheKey, schema);
        }, defaultBenchOptions);

        bench('cache hit path', () => {
            const cache = new LRUCache<string, any>(200);
            const path = ['items', 'default:jade_sword', 'template'];
            const cacheKey = path.join('.');
            
            // Pre-populate cache
            const schema = navigateSchemaPath(craftEngineSchema, path);
            cache.set(cacheKey, schema);
            
            // Get from cache
            cache.get(cacheKey);
        }, defaultBenchOptions);

        bench('property extraction with cache', () => {
            const cache = new LRUCache<string, any[]>(200);
            const path = ['items', 'default:phoenix_staff'];
            const cacheKey = path.join('.');
            
            // Check cache first
            let properties = cache.get(cacheKey);
            if (!properties) {
                const schema = navigateSchemaPath(craftEngineSchema, path);
                properties = extractProperties(schema);
                cache.set(cacheKey, properties);
            }
        }, defaultBenchOptions);

        bench('hasSchemaForPath with cache', () => {
            const cache = new LRUCache<string, boolean>(500);
            const path = ['items', 'default:dragon_blade', 'settings', 'stackable'];
            const cacheKey = path.join('.');
            
            let result = cache.get(cacheKey);
            if (result === undefined) {
                result = hasSchemaForPath(craftEngineSchema, path);
                cache.set(cacheKey, result);
            }
        }, defaultBenchOptions);
    });

    // ========================================
    // 典型使用场景测试
    // ========================================

    describe('Typical Usage Patterns', () => {
        bench('completion scenario - get available properties', () => {
            const path = ['items', 'default:jade_sword'];
            const schema = navigateSchemaPath(craftEngineSchema, path);
            extractProperties(schema);
        }, defaultBenchOptions);

        bench('hover scenario - get property details', () => {
            const path = ['items', 'default:phoenix_staff', 'template'];
            const schema = navigateSchemaPath(craftEngineSchema, path);
            // 模拟获取属性详情（保持基准测试的一致性）
            if (schema) {
                void schema.type;
                void schema.description;
                void schema['x-completion-provider'];
            }
        }, defaultBenchOptions);

        bench('validation scenario - check multiple paths', () => {
            const paths = [
                ['items', 'default:jade_sword', 'template'],
                ['items', 'ruby', 'arguments'],
                ['templates#models#2d', 'default:model/generated', 'generation'],
                ['translations', 'en', 'item.jade_sword'],
            ];
            for (const path of paths) {
                hasSchemaForPath(craftEngineSchema, path);
            }
        }, defaultBenchOptions);

        bench('autocomplete - shouldActivate check', () => {
            // 模拟补全策略的 shouldActivate 快速检查
            const path = ['items', 'default:dragon_blade', 'template'];
            const hasSchema = hasSchemaForPath(craftEngineSchema, path);
            if (hasSchema) {
                const schema = navigateSchemaPath(craftEngineSchema, path);
                void schema?.['x-completion-provider'];
            }
        }, defaultBenchOptions);
    });

    // ========================================
    // 边界情况测试
    // ========================================

    describe('Edge Cases', () => {
        bench('empty path', () => {
            navigateSchemaPath(craftEngineSchema, []);
        }, defaultBenchOptions);

        bench('null schema', () => {
            navigateSchemaPath(null, ['items']);
        }, defaultBenchOptions);

        bench('undefined schema', () => {
            navigateSchemaPath(undefined, ['items']);
        }, defaultBenchOptions);

        bench('very long path (10 segments)', () => {
            hasSchemaForPath(nestedSchema8, [
                'root', 'child0', 'child0', 'child0', 'child0',
                'child0', 'child0', 'child0', 'child0', 'child0'
            ]);
        }, defaultBenchOptions);

        bench('path with special characters', () => {
            hasSchemaForPath(craftEngineSchema, ['items', 'default:item-with-dashes_and_underscores']);
        }, defaultBenchOptions);

        bench('path with namespace format', () => {
            hasSchemaForPath(craftEngineSchema, ['items', 'my-namespace:my-item/variant']);
        }, defaultBenchOptions);
    });

    // ========================================
    // 引用解析模拟测试
    // ========================================

    describe('Reference Resolution (Simulated)', () => {
        /**
         * 模拟简单的 $ref 解析
         */
        function resolveRef(schema: any, rootSchema: any): any {
            if (!schema?.$ref) {
                return schema;
            }
            
            const refPath = schema.$ref.replace('#/', '').split('/');
            let resolved = rootSchema;
            
            for (const segment of refPath) {
                if (resolved && typeof resolved === 'object') {
                    resolved = resolved[segment];
                } else {
                    return undefined;
                }
            }
            
            return resolved;
        }

        bench('resolve single $ref', () => {
            const schema = { $ref: '#/$defs/definition0' };
            resolveRef(schema, refSchema10);
        }, defaultBenchOptions);

        bench('resolve 10 $refs', () => {
            for (let i = 0; i < 10; i++) {
                const schema = { $ref: `#/$defs/definition${i}` };
                resolveRef(schema, refSchema10);
            }
        }, defaultBenchOptions);

        bench('navigate path with $ref', () => {
            // 先导航到包含 $ref 的位置，然后解析
            const schema = navigateSchemaPath(refSchema10, ['item5']);
            const resolved = resolveRef(schema, refSchema10);
            if (resolved) {
                extractProperties(resolved);
            }
        }, defaultBenchOptions);
    });
});

