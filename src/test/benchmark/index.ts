/**
 * 性能测试入口
 * 
 * 导出所有性能测试模块，便于统一管理和运行。
 * 
 * 运行方式:
 * - 运行所有性能测试: npm run test:bench
 * - 运行 YAML 解析器测试: npm run test:bench:yaml
 * - 运行模板存储测试: npm run test:bench:store
 * - 运行模板搜索测试: npm run test:bench:search
 * - 运行事件总线测试: npm run test:bench:eventbus
 * 
 * 性能基准目标:
 * | 操作 | 目标时间 |
 * |------|----------|
 * | YAML 解析（小文件 <50行） | < 1ms |
 * | YAML 解析（中等文件 100-500行） | < 10ms |
 * | YAML 解析（大文件 1000行） | < 50ms |
 * | YAML 路径解析（中等文件） | < 5ms |
 * | YAML 路径解析（大文件） | < 10ms |
 * | 模板搜索（1000模板） | < 10ms |
 * | 事件发布（100订阅者） | < 5ms |
 * | 模板存储查询 | < 1ms |
 * | 翻译键查询 | < 0.5ms |
 * | 翻译键前缀搜索 | < 10ms |
 * | 翻译键补全建议 | < 5ms |
 * | DI 容器服务解析 | < 0.5ms |
 * | Schema 路径导航 | < 2ms |
 * | Schema 可用性检查 | < 0.5ms |
 */

// 导出测试模块标识（用于文档目的）
export const BENCHMARK_MODULES = [
    'yaml-parser.bench.ts',
    'yaml-path-parser.bench.ts',
    'template-store.bench.ts',
    'template-search.bench.ts',
    'translation-store.bench.ts',
    'event-bus.bench.ts',
    'di-container.bench.ts',
    'schema-service.bench.ts',
] as const;

// 性能基准定义
export const PERFORMANCE_BASELINES = {
    yamlParsing: {
        small: { maxMs: 1, description: 'Small YAML (<50 lines)' },
        medium: { maxMs: 10, description: 'Medium YAML (100-500 lines)' },
        large: { maxMs: 50, description: 'Large YAML (1000 lines)' },
        veryLarge: { maxMs: 200, description: 'Very large YAML (5000 lines)' },
    },
    yamlPathParsing: {
        small: { maxMs: 1, description: 'Small document path parsing (<50 lines)' },
        medium: { maxMs: 5, description: 'Medium document path parsing (100-500 lines)' },
        large: { maxMs: 10, description: 'Large document path parsing (1000 lines)' },
        deep: { maxMs: 5, description: 'Deep nested path parsing (8+ levels)' },
    },
    templateSearch: {
        small: { maxMs: 5, description: 'Search in 100 templates' },
        medium: { maxMs: 10, description: 'Search in 500 templates' },
        large: { maxMs: 20, description: 'Search in 2000 templates' },
    },
    eventBus: {
        publish: { maxMs: 1, description: 'Publish to 10 subscribers' },
        publishMany: { maxMs: 5, description: 'Publish to 100 subscribers' },
    },
    templateStore: {
        query: { maxMs: 1, description: 'Single query operation' },
        bulkAdd: { maxMs: 100, description: 'Add 1000 templates' },
    },
    translationStore: {
        query: { maxMs: 0.5, description: 'Query by name' },
        search: { maxMs: 10, description: 'Prefix search in 1000 keys' },
        bulkAdd: { maxMs: 100, description: 'Add 1000 translation keys' },
        completion: { maxMs: 5, description: 'Translation key completion' },
    },
    diContainer: {
        resolve: { maxMs: 0.5, description: 'Single service resolution' },
        resolveMany: { maxMs: 10, description: 'Resolve 100 services' },
    },
    schemaService: {
        navigate: { maxMs: 2, description: 'Navigate schema path' },
        hasSchema: { maxMs: 0.5, description: 'Quick schema availability check' },
        extractProps: { maxMs: 2, description: 'Extract schema properties' },
        cacheHit: { maxMs: 0.1, description: 'Cache hit lookup' },
    },
} as const;

