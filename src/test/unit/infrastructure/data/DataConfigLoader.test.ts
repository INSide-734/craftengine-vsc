import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import { ILogger } from '../../../../core/interfaces/ILogger.js';
import { ServiceContainer } from '../../../../infrastructure/ServiceContainer.js';
import { SERVICE_TOKENS } from '../../../../core/constants/ServiceTokens.js';

// Mock fs 模块
vi.mock('fs', () => ({
    existsSync: vi.fn(),
    constants: {
        R_OK: 4
    },
    promises: {
        readFile: vi.fn(),
        access: vi.fn()
    }
}));

// Mock path 模块
vi.mock('path', async (importOriginal) => {
    const actual = await importOriginal<typeof import('path')>();
    return {
        ...actual,
        join: vi.fn((...args: string[]) => args.join('/')),
        resolve: vi.fn((...args: string[]) => args.join('/'))
    };
});

/**
 * DataConfigLoader 单元测试
 *
 * 测试场景：
 * 1. 成功加载数据源配置
 * 2. 成功加载补全优先级配置
 * 3. 成功加载性能配置
 * 4. 成功加载扩展类型配置
 * 5. 配置文件不存在时返回默认配置
 * 6. 配置缓存机制
 * 7. 获取数据源 URL 列表
 * 8. 获取补全策略优先级
 */
describe('DataConfigLoader', () => {
    let mockLogger: ILogger;

    // Mock 数据源配置
    const mockDataSourcesConfig = {
        version: '1.0.0',
        lastUpdated: '2026-02-03',
        description: 'Test data sources',
        network: {
            requestTimeout: 10000,
            retryAttempts: 3,
            retryDelayMs: 1000
        },
        sources: {
            minecraftAssets: {
                description: 'Test assets',
                primary: 'https://example.com/primary',
                mirrors: ['https://mirror1.com', 'https://mirror2.com'],
                endpoints: {
                    builtinItems: '{version}/items.json',
                    sounds: '{version}/sounds.json'
                }
            }
        },
        builtinSource: {
            identifier: '<test:builtin>',
            description: 'Test builtin'
        }
    };

    // Mock 补全优先级配置
    const mockCompletionPrioritiesConfig = {
        version: '1.0.0',
        lastUpdated: '2026-02-03',
        description: 'Test priorities',
        strategies: {
            main: {
                schemaAware: { name: 'Schema Aware', priority: 90, description: '' },
                schemaKey: { name: 'Schema Key', priority: 85, description: '' }
            },
            delegates: {
                filePath: { name: 'File Path', priority: 75, description: '' },
                templateName: { name: 'Template Name', priority: 80, description: '' }
            }
        },
        priorityCalculation: {
            baseValue: 100,
            adjustments: { nonRequiredProperty: -50 }
        },
        sortOrder: { required: 0, optional: 1 }
    };

    // Mock 性能配置
    const mockPerformanceConfig = {
        version: '1.0.0',
        lastUpdated: '2026-02-03',
        description: 'Test performance',
        logging: {
            maxFileSize: 5242880,
            maxFileSizeDescription: '5MB',
            rotationStrategy: 'timestamp-based',
            appendMode: true
        },
        network: {
            requestTimeout: 5000,
            retryAttempts: 2,
            retryDelayMs: 500
        },
        completion: {
            debounceMs: 300,
            maxResultsPerStrategy: 50,
            cacheHitRateTarget: 0.9
        },
        performance: {
            activationTimeoutMs: 1500,
            completionResponseTimeMs: 80,
            hoverResponseTimeMs: 40,
            diagnosticUpdateMs: 400
        },
        batch: {
            tagLoadBatchSize: 5,
            maxConcurrentRequests: 3
        }
    };

    // Mock 扩展类型配置
    const mockExtendedTypesConfig = {
        version: '1.0.0',
        lastUpdated: '2026-02-03',
        description: 'Test extended types',
        types: {
            condition: {
                name: 'condition',
                description: 'Test condition',
                requiredProperties: ['type', 'condition'],
                optionalProperties: [],
                propertyTypes: { type: 'string' },
                example: 'type: condition'
            }
        },
        propertyDefinitions: {
            condition: [
                { name: 'type', description: 'Type', type: 'string' }
            ]
        },
        snippets: {
            condition: 'type: condition'
        }
    };

    beforeEach(() => {
        vi.clearAllMocks();

        // 创建 mock logger
        mockLogger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            fatal: vi.fn(),
            createChild: vi.fn().mockReturnThis(),
            setLevel: vi.fn(),
            getLevel: vi.fn().mockReturnValue('INFO')
        };

        // Mock ServiceContainer
        vi.spyOn(ServiceContainer, 'getService').mockImplementation(((token: symbol) => {
            if (token === SERVICE_TOKENS.Logger) {
                return mockLogger;
            }
            throw new Error(`Unknown service token: ${String(token)}`);
        }) as typeof ServiceContainer.getService);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('loadDataSourcesConfig', () => {
        it('should load data sources config from file', async () => {
            // 动态导入以确保 mock 生效
            const { DataConfigLoader } = await import(
                '../../../../infrastructure/data/DataConfigLoader.js'
            );

            vi.mocked(fs.promises.access).mockResolvedValue(undefined);
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                JSON.stringify(mockDataSourcesConfig)
            );

            const loader = new DataConfigLoader(mockLogger as any, '/test/extension');
            const config = await loader.loadDataSourcesConfig();

            expect(config.version).toBe('1.0.0');
            expect(config.sources.minecraftAssets.primary).toBe('https://example.com/primary');
            expect(config.builtinSource.identifier).toBe('<test:builtin>');
        });

        it('should throw error when file not found', async () => {
            const { DataConfigLoader, ConfigLoadError } = await import(
                '../../../../infrastructure/data/DataConfigLoader.js'
            );

            vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('ENOENT'));

            const loader = new DataConfigLoader(mockLogger as any, '/test/extension');

            // 应该抛出 ConfigLoadError
            await expect(loader.loadDataSourcesConfig()).rejects.toThrow(ConfigLoadError);
        });

        it('should cache config after first load', async () => {
            const { DataConfigLoader } = await import(
                '../../../../infrastructure/data/DataConfigLoader.js'
            );

            vi.mocked(fs.promises.access).mockResolvedValue(undefined);
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                JSON.stringify(mockDataSourcesConfig)
            );

            const loader = new DataConfigLoader(mockLogger as any, '/test/extension');

            // 第一次加载
            await loader.loadDataSourcesConfig();
            // 第二次加载（应该从缓存读取）
            await loader.loadDataSourcesConfig();

            // readFile 应该只被调用一次
            expect(fs.promises.readFile).toHaveBeenCalledTimes(1);
        });
    });

    describe('loadCompletionPrioritiesConfig', () => {
        it('should load completion priorities config', async () => {
            const { DataConfigLoader } = await import(
                '../../../../infrastructure/data/DataConfigLoader.js'
            );

            vi.mocked(fs.promises.access).mockResolvedValue(undefined);
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                JSON.stringify(mockCompletionPrioritiesConfig)
            );

            const loader = new DataConfigLoader(mockLogger as any, '/test/extension');
            const config = await loader.loadCompletionPrioritiesConfig();

            expect(config.strategies.main.schemaAware.priority).toBe(90);
            expect(config.strategies.delegates.templateName.priority).toBe(80);
        });
    });

    describe('loadPerformanceConfig', () => {
        it('should load performance config', async () => {
            const { DataConfigLoader } = await import(
                '../../../../infrastructure/data/DataConfigLoader.js'
            );

            vi.mocked(fs.promises.access).mockResolvedValue(undefined);
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                JSON.stringify(mockPerformanceConfig)
            );

            const loader = new DataConfigLoader(mockLogger as any, '/test/extension');
            const config = await loader.loadPerformanceConfig();

            expect(config.network.requestTimeout).toBe(5000);
            expect(config.logging.maxFileSize).toBe(5242880);
        });
    });

    describe('loadExtendedTypesConfig', () => {
        it('should load extended types config', async () => {
            const { DataConfigLoader } = await import(
                '../../../../infrastructure/data/DataConfigLoader.js'
            );

            vi.mocked(fs.promises.access).mockResolvedValue(undefined);
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                JSON.stringify(mockExtendedTypesConfig)
            );

            const loader = new DataConfigLoader(mockLogger as any, '/test/extension');
            const config = await loader.loadExtendedTypesConfig();

            expect(config.types.condition.name).toBe('condition');
            expect(config.snippets.condition).toBe('type: condition');
        });
    });

    describe('getDataSourceUrls', () => {
        it('should build URLs with version parameter', async () => {
            const { DataConfigLoader } = await import(
                '../../../../infrastructure/data/DataConfigLoader.js'
            );

            vi.mocked(fs.promises.access).mockResolvedValue(undefined);
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                JSON.stringify(mockDataSourcesConfig)
            );

            const loader = new DataConfigLoader(mockLogger as any, '/test/extension');
            const urls = await loader.getDataSourceUrls(
                'minecraftAssets',
                'builtinItems',
                { version: '1.21.4' }
            );

            expect(urls).toHaveLength(3); // primary + 2 mirrors
            expect(urls[0]).toBe('https://example.com/primary/1.21.4/items.json');
            expect(urls[1]).toBe('https://mirror1.com/1.21.4/items.json');
            expect(urls[2]).toBe('https://mirror2.com/1.21.4/items.json');
        });

        it('should return empty array for unknown source', async () => {
            const { DataConfigLoader } = await import(
                '../../../../infrastructure/data/DataConfigLoader.js'
            );

            vi.mocked(fs.promises.access).mockResolvedValue(undefined);
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                JSON.stringify(mockDataSourcesConfig)
            );

            const loader = new DataConfigLoader(mockLogger as any, '/test/extension');
            const urls = await loader.getDataSourceUrls('unknownSource', 'endpoint');

            expect(urls).toHaveLength(0);
            expect(mockLogger.warn).toHaveBeenCalled();
        });
    });

    describe('getCompletionPriority', () => {
        it('should return priority for main strategy', async () => {
            const { DataConfigLoader } = await import(
                '../../../../infrastructure/data/DataConfigLoader.js'
            );

            vi.mocked(fs.promises.access).mockResolvedValue(undefined);
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                JSON.stringify(mockCompletionPrioritiesConfig)
            );

            const loader = new DataConfigLoader(mockLogger as any, '/test/extension');
            const priority = await loader.getCompletionPriority('schemaAware', false);

            expect(priority).toBe(90);
        });

        it('should return priority for delegate strategy', async () => {
            const { DataConfigLoader } = await import(
                '../../../../infrastructure/data/DataConfigLoader.js'
            );

            vi.mocked(fs.promises.access).mockResolvedValue(undefined);
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                JSON.stringify(mockCompletionPrioritiesConfig)
            );

            const loader = new DataConfigLoader(mockLogger as any, '/test/extension');
            const priority = await loader.getCompletionPriority('templateName', true);

            expect(priority).toBe(80);
        });

        it('should return default priority for unknown strategy', async () => {
            const { DataConfigLoader } = await import(
                '../../../../infrastructure/data/DataConfigLoader.js'
            );

            vi.mocked(fs.promises.access).mockResolvedValue(undefined);
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                JSON.stringify(mockCompletionPrioritiesConfig)
            );

            const loader = new DataConfigLoader(mockLogger as any, '/test/extension');
            const priority = await loader.getCompletionPriority('unknownStrategy', true);

            expect(priority).toBe(75); // 默认委托策略优先级
        });
    });

    describe('getRequestTimeout', () => {
        it('should return request timeout from config', async () => {
            const { DataConfigLoader } = await import(
                '../../../../infrastructure/data/DataConfigLoader.js'
            );

            vi.mocked(fs.promises.access).mockResolvedValue(undefined);
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                JSON.stringify(mockPerformanceConfig)
            );

            const loader = new DataConfigLoader(mockLogger as any, '/test/extension');
            const timeout = await loader.getRequestTimeout();

            expect(timeout).toBe(5000);
        });
    });

    describe('clearCache', () => {
        it('should clear all cached configs', async () => {
            const { DataConfigLoader } = await import(
                '../../../../infrastructure/data/DataConfigLoader.js'
            );

            vi.mocked(fs.promises.access).mockResolvedValue(undefined);
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                JSON.stringify(mockDataSourcesConfig)
            );

            const loader = new DataConfigLoader(mockLogger as any, '/test/extension');

            // 加载配置（会被缓存）
            await loader.loadDataSourcesConfig();
            expect(fs.promises.readFile).toHaveBeenCalledTimes(1);

            // 清除缓存
            loader.clearCache();

            // 再次加载（应该重新读取文件）
            await loader.loadDataSourcesConfig();
            expect(fs.promises.readFile).toHaveBeenCalledTimes(2);
        });
    });
});
