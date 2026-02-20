import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MinecraftBuiltinItemLoader } from '../../../../infrastructure/data/MinecraftBuiltinItemLoader';
import { type IMinecraftVersionService } from '../../../../core/interfaces/IMinecraftVersionService';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import { ServiceContainer } from '../../../../infrastructure/ServiceContainer';
import { SERVICE_TOKENS } from '../../../../core/constants/ServiceTokens';

// 使用 vi.hoisted 确保 mock 函数在 vi.mock 提升后可用
const { mockFetchJsonFn, mockMaskUrlFn } = vi.hoisted(() => {
    const mockFetchJsonFn = vi.fn();
    const mockMaskUrlFn = vi.fn((url: string) => {
        try {
            const urlObj = new URL(url);
            return `${urlObj.host}/.../${url.split('/').pop()}`;
        } catch {
            return url;
        }
    });
    return { mockFetchJsonFn, mockMaskUrlFn };
});

// Mock HttpUtils 模块
vi.mock('../../../../infrastructure/utils/HttpUtils.js', () => {
    return {
        HttpUtils: {
            fetchJson: mockFetchJsonFn,
            maskUrl: mockMaskUrlFn,
            fetchFromMultipleSources: async (urls: string[], timeout: number, logger?: any) => {
                const errors: Array<{ url: string; error: string }> = [];

                for (let i = 0; i < urls.length; i++) {
                    const url = urls[i];
                    const sourceType = i === 0 ? 'main' : `mirror-${i}`;

                    try {
                        logger?.debug('Attempting to fetch from source', {
                            sourceType,
                            url: mockMaskUrlFn(url),
                        });

                        const data = await mockFetchJsonFn(url, timeout);

                        logger?.debug('Successfully fetched from source', {
                            sourceType,
                            url: mockMaskUrlFn(url),
                        });

                        return data;
                    } catch (error: any) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        errors.push({ url: mockMaskUrlFn(url), error: errorMessage });

                        logger?.debug('Failed to fetch from source, trying next', {
                            sourceType,
                            url: mockMaskUrlFn(url),
                            error: errorMessage,
                            remainingSources: urls.length - i - 1,
                        });
                    }
                }

                logger?.warn('All data sources failed', {
                    attemptedSources: urls.length,
                    errors,
                });

                return null;
            },
        },
    };
});

/**
 * MinecraftBuiltinItemLoader 单元测试
 *
 * 测试场景：
 * 1. 成功从 GitHub 主站获取数据
 * 2. 主站失败，从镜像站获取数据
 * 3. 所有数据源都失败
 * 4. 数据格式转换
 * 5. 超时处理
 * 6. 网络错误处理
 */
describe('MinecraftBuiltinItemLoader', () => {
    let loader: MinecraftBuiltinItemLoader;
    let mockVersionService: IMinecraftVersionService;
    let mockLogger: ILogger;
    let mockFetchJson: ReturnType<typeof vi.fn>;

    // Mock 的物品列表响应
    const mockItemListResponse = {
        directories: [],
        files: ['diamond.json', 'diamond_sword.json', 'iron_ingot.json', 'gold_block.json'],
    };

    beforeEach(async () => {
        // 重置所有 Mock
        vi.clearAllMocks();

        // 使用顶层定义的 mockFetchJsonFn
        mockFetchJson = mockFetchJsonFn;

        // Mock Logger
        mockLogger = {
            info: vi.fn(),
            debug: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            createChild: vi.fn().mockReturnThis(),
        } as any;

        // Mock MinecraftVersionService
        mockVersionService = {
            getLatestRelease: vi.fn().mockResolvedValue('1.21.11'),
            getVersions: vi.fn(),
            refresh: vi.fn(),
            isValidVersion: vi.fn(),
            compareVersions: vi.fn(),
            isValidVersionFormat: vi.fn(),
            getSuggestedVersions: vi.fn(),
        };

        // Mock ServiceContainer
        vi.spyOn(ServiceContainer, 'getService').mockImplementation((token: string | symbol) => {
            if (token === SERVICE_TOKENS.Logger) {
                return mockLogger as any;
            }
            if (token === SERVICE_TOKENS.MinecraftVersionService) {
                return mockVersionService as any;
            }
            if (token === SERVICE_TOKENS.DataConfigLoader) {
                return {
                    getTimingConfigSync: vi.fn().mockReturnValue({
                        cache: {
                            minecraftDataCacheTTL: 3600000,
                        },
                        network: {
                            requestTimeout: 10000,
                        },
                    }),
                    getDataSourcesConfigSync: vi.fn().mockReturnValue({
                        sources: {
                            minecraftAssets: {
                                primary:
                                    'https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/refs/heads',
                                mirrors: [
                                    'https://gh.llkk.cc/https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/refs/heads',
                                ],
                                endpoints: {
                                    builtinItems: '{version}/assets/minecraft/items/_list.json',
                                },
                            },
                        },
                        builtinSource: {
                            identifier: '<minecraft:builtin>',
                        },
                    }),
                    loadPerformanceConfig: vi.fn().mockResolvedValue({
                        network: { requestTimeout: 10000 },
                    }),
                    loadDataSourcesConfig: vi.fn().mockResolvedValue({
                        sources: {
                            minecraftAssets: {
                                primary:
                                    'https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/refs/heads',
                                mirrors: [
                                    'https://gh.llkk.cc/https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/refs/heads',
                                ],
                                endpoints: {
                                    builtinItems: '{version}/assets/minecraft/items/_list.json',
                                },
                            },
                        },
                        builtinSource: {
                            identifier: '<minecraft:builtin>',
                        },
                    }),
                    getDataSourceUrls: vi
                        .fn()
                        .mockResolvedValue([
                            'https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/refs/heads/1.21.11/assets/minecraft/items/_list.json',
                            'https://gh.llkk.cc/https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/refs/heads/1.21.11/assets/minecraft/items/_list.json',
                        ]),
                } as any;
            }
            return null as any;
        });

        // 创建 loader 实例
        loader = new MinecraftBuiltinItemLoader();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * 辅助函数：Mock fetchJson 成功响应
     */
    function mockFetchJsonSuccess(data: any = mockItemListResponse) {
        mockFetchJson.mockResolvedValue(data);
    }

    /**
     * 辅助函数：Mock fetchJson 失败响应
     */
    function mockFetchJsonError(error: Error) {
        mockFetchJson.mockRejectedValue(error);
    }

    /**
     * 辅助函数：Mock fetchJson 多次调用（用于测试 fallback）
     */
    function mockFetchJsonFallback(responses: Array<{ success: boolean; data?: any; error?: Error }>) {
        let callCount = 0;

        mockFetchJson.mockImplementation(() => {
            const currentResponse = responses[callCount] || responses[responses.length - 1];
            callCount++;

            if (currentResponse.success) {
                return Promise.resolve(currentResponse.data);
            } else {
                return Promise.reject(currentResponse.error || new Error('Network error'));
            }
        });
    }

    describe('loadBuiltinItems', () => {
        it('should successfully load items from GitHub main source', async () => {
            mockFetchJsonSuccess();

            const items = await loader.loadBuiltinItems();

            // 验证返回的物品数量
            expect(items).toHaveLength(4);

            // 验证物品格式
            expect(items[0]).toMatchObject({
                id: 'minecraft:diamond',
                namespace: 'minecraft',
                name: 'diamond',
                sourceFile: '<minecraft:builtin>@1.21.11',
                lineNumber: 0,
            });

            expect(items[1]).toMatchObject({
                id: 'minecraft:diamond_sword',
                namespace: 'minecraft',
                name: 'diamond_sword',
            });
        });

        it('should fallback to mirror when main source fails', async () => {
            mockFetchJsonFallback([
                { success: false, error: new Error('Main source failed') },
                { success: true, data: mockItemListResponse },
            ]);

            const items = await loader.loadBuiltinItems();

            // 验证返回的物品数量
            expect(items).toHaveLength(4);

            // 验证 fetchJson 被调用了两次（主站 + 镜像站）
            expect(mockFetchJson).toHaveBeenCalledTimes(2);
        });

        it('should try all mirrors before giving up', async () => {
            mockFetchJsonFallback([
                { success: false, error: new Error('Failed') },
                { success: false, error: new Error('Failed') },
            ]);

            const items = await loader.loadBuiltinItems();

            expect(items).toEqual([]);
            // 验证警告日志被调用
            expect(mockLogger.warn).toHaveBeenCalled();
        });

        it('should return empty array when version service fails', async () => {
            vi.mocked(mockVersionService.getLatestRelease).mockRejectedValue(new Error('Version service error'));

            const items = await loader.loadBuiltinItems();

            expect(items).toEqual([]);
        });

        it('should handle network timeout', async () => {
            mockFetchJsonError(new Error('Request timeout after 10000ms'));

            const items = await loader.loadBuiltinItems();

            expect(items).toEqual([]);
        });

        it('should handle invalid JSON response', async () => {
            mockFetchJsonError(new Error('Failed to parse JSON response'));

            const items = await loader.loadBuiltinItems();

            expect(items).toEqual([]);
        });

        it('should handle HTTP error status codes', async () => {
            mockFetchJsonError(new Error('HTTP 404: Not Found'));

            const items = await loader.loadBuiltinItems();

            expect(items).toEqual([]);
        });

        it('should convert file names correctly', async () => {
            mockFetchJsonSuccess({
                directories: [],
                files: ['diamond_pickaxe.json', 'golden_apple.json', 'netherite_sword.json'],
            });

            const items = await loader.loadBuiltinItems();

            expect(items).toHaveLength(3);
            expect(items.map((i) => i.name)).toEqual(['diamond_pickaxe', 'golden_apple', 'netherite_sword']);
        });

        it('should skip non-json files', async () => {
            mockFetchJsonSuccess({
                directories: [],
                files: ['diamond.json', 'readme.txt', 'iron_ingot.json', 'config.yaml'],
            });

            const items = await loader.loadBuiltinItems();

            expect(items).toHaveLength(2);
            expect(items.map((i) => i.name)).toEqual(['diamond', 'iron_ingot']);
        });

        it('should handle empty file list', async () => {
            mockFetchJsonSuccess({
                directories: [],
                files: [],
            });

            const items = await loader.loadBuiltinItems();

            expect(items).toEqual([]);

            // 验证仍然记录成功日志
            expect(mockLogger.info).toHaveBeenCalledWith('Minecraft builtin items loaded successfully', {
                version: '1.21.11',
                count: 0,
            });
        });

        it('should use correct version in source file path', async () => {
            // Mock 不同的版本
            vi.mocked(mockVersionService.getLatestRelease).mockResolvedValue('1.20.4');

            mockFetchJsonSuccess();

            const items = await loader.loadBuiltinItems();

            // 验证源文件路径包含正确的版本
            expect(items[0].sourceFile).toBe('<minecraft:builtin>@1.20.4');
        });

        it('should log masked URLs for security', async () => {
            mockFetchJsonSuccess();

            await loader.loadBuiltinItems();

            // 验证日志中的 URL 是脱敏的
            const debugCalls = vi.mocked(mockLogger.debug).mock.calls;
            const urlLogs = debugCalls.filter((call) => call[0].includes('Attempting to fetch from source'));

            expect(urlLogs.length).toBeGreaterThan(0);

            // URL 应该被简化显示（maskUrl 返回格式: host/.../path）
            if (urlLogs.length > 0 && urlLogs[0][1]) {
                const loggedUrl = urlLogs[0][1].url;
                // 验证 URL 被脱敏（包含 ... 表示路径被简化）
                expect(loggedUrl).toContain('...');
            }
        });
    });

    describe('URL building', () => {
        it('should build correct GitHub raw URL', async () => {
            mockFetchJsonSuccess();

            await loader.loadBuiltinItems();

            // 验证 fetchJson 被调用时使用了正确的 URL
            expect(mockFetchJson).toHaveBeenCalled();
            const firstCallUrl = mockFetchJson.mock.calls[0][0] as string;

            // 验证主站 URL 格式
            expect(firstCallUrl).toContain('raw.githubusercontent.com');
            expect(firstCallUrl).toContain('InventivetalentDev/minecraft-assets');
            expect(firstCallUrl).toContain('1.21.11');
            expect(firstCallUrl).toContain('assets/minecraft/items/_list.json');
        });

        it('should build mirror URLs correctly', async () => {
            // 让主站失败，触发镜像
            mockFetchJsonFallback([
                { success: false, error: new Error('Main failed') },
                { success: true, data: mockItemListResponse },
            ]);

            await loader.loadBuiltinItems();

            const calls = mockFetchJson.mock.calls;

            // 第二次调用应该是镜像 URL
            expect(calls.length).toBeGreaterThanOrEqual(2);
            const mirrorUrl = calls[1][0] as string;

            // 验证镜像 URL 格式（应包含代理域名）
            expect(mirrorUrl).toContain('gh.llkk.cc');
        });
    });

    describe('Error handling', () => {
        it('should not throw error when all sources fail', async () => {
            mockFetchJsonFallback([
                { success: false, error: new Error('Failed') },
                { success: false, error: new Error('Failed') },
            ]);

            // 不应抛出异常，应返回空数组
            await expect(loader.loadBuiltinItems()).resolves.toEqual([]);
        });

        it('should handle connection refused error', async () => {
            const error = new Error('connect ECONNREFUSED');
            mockFetchJsonError(error);

            const items = await loader.loadBuiltinItems();

            expect(items).toEqual([]);
            expect(mockLogger.warn).toHaveBeenCalled();
        });

        it('should handle DNS lookup failure', async () => {
            const error = new Error('getaddrinfo ENOTFOUND');
            mockFetchJsonError(error);

            const items = await loader.loadBuiltinItems();

            expect(items).toEqual([]);
        });
    });

    describe('Performance', () => {
        it('should complete within reasonable time', async () => {
            mockFetchJsonSuccess();

            const startTime = Date.now();
            await loader.loadBuiltinItems();
            const duration = Date.now() - startTime;

            // 应该在 100ms 内完成（不包括网络请求）
            expect(duration).toBeLessThan(100);
        });
    });
});
