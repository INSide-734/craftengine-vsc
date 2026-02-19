/**
 * TemplateStore 单元测试
 * 
 * 测试模板存储服务的所有功能，包括：
 * - 模板的 CRUD 操作
 * - 索引管理
 * - 查询功能
 * - 事件发布
 * - 统计信息
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemplateStore } from '../../../../domain/services/stores/TemplateStore';
import { Template } from '../../../../domain/entities/Template';
import { ITemplate, ITemplateParameter } from '../../../../core/interfaces/ITemplate';
import { ILogger } from '../../../../core/interfaces/ILogger';
import { IEventBus } from '../../../../core/interfaces/IEventBus';
import { EVENT_TYPES } from '../../../../core/constants/ServiceTokens';
import { Uri, Position } from 'vscode';

describe('TemplateStore', () => {
    let store: TemplateStore;
    let mockLogger: ILogger;
    let mockEventBus: IEventBus;

    // 辅助函数：创建测试模板
    const createTestTemplate = (overrides: Partial<{
        id: string;
        name: string;
        parameters: ITemplateParameter[];
        sourceFile: Uri;
        definitionPosition: Position;
    }> = {}): ITemplate => {
        return new Template({
            id: overrides.id ?? `tpl-${Date.now()}-${Math.random()}`,
            name: overrides.name ?? 'test-template',
            parameters: overrides.parameters ?? [
                { name: 'param1', required: true },
                { name: 'param2', required: false },
            ],
            sourceFile: overrides.sourceFile ?? Uri.file('/test/templates.yaml'),
            definitionPosition: overrides.definitionPosition ?? new Position(0, 0),
        });
    };

    beforeEach(() => {
        mockLogger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            fatal: vi.fn(),
            createChild: vi.fn(() => mockLogger),
            setLevel: vi.fn(),
            getLevel: vi.fn(() => 0),
        } as unknown as ILogger;

        mockEventBus = {
            publish: vi.fn(() => Promise.resolve()),
            subscribe: vi.fn(() => ({ 
                unsubscribe: vi.fn(),
                isActive: () => true,
            })),
            unsubscribeAll: vi.fn(),
            getSubscriptionCount: vi.fn(() => 0),
            dispose: vi.fn(),
        } as unknown as IEventBus;

        store = new TemplateStore(mockLogger, mockEventBus);
    });

    describe('add', () => {
        it('should add template to store', async () => {
            const template = createTestTemplate({ id: 'tpl-001', name: 'my-template' });

            await store.add(template);

            const retrieved = await store.getById('tpl-001');
            expect(retrieved).toBeDefined();
            expect(retrieved?.name).toBe('my-template');
        });

        it('should publish TemplateCreated event', async () => {
            const template = createTestTemplate();

            await store.add(template);

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                EVENT_TYPES.TemplateCreated,
                expect.objectContaining({
                    type: EVENT_TYPES.TemplateCreated,
                    template,
                })
            );
        });

        it('should throw error for duplicate name', async () => {
            const template1 = createTestTemplate({ id: 'tpl-001', name: 'same-name' });
            const template2 = createTestTemplate({ id: 'tpl-002', name: 'same-name' });

            await store.add(template1);

            await expect(store.add(template2)).rejects.toThrow(/already exists/);
        });

        it('should allow update with same ID', async () => {
            const template1 = createTestTemplate({ id: 'tpl-001', name: 'name-v1' });
            const template2 = createTestTemplate({ id: 'tpl-001', name: 'name-v1' }); // 相同 ID 和名称

            await store.add(template1);
            await store.add(template2); // 应该允许，因为 ID 相同

            const count = await store.count();
            expect(count).toBe(1);
        });

        it('should update indexes', async () => {
            const template = createTestTemplate({ name: 'indexed-template' });

            await store.add(template);

            const retrieved = await store.getByName('indexed-template');
            expect(retrieved).toBeDefined();
        });
    });

    describe('addMany', () => {
        it('should add multiple templates', async () => {
            const templates = [
                createTestTemplate({ id: 'tpl-001', name: 'template-1' }),
                createTestTemplate({ id: 'tpl-002', name: 'template-2' }),
                createTestTemplate({ id: 'tpl-003', name: 'template-3' }),
            ];

            await store.addMany(templates);

            expect(await store.count()).toBe(3);
        });

        it('should publish events for all templates', async () => {
            const templates = [
                createTestTemplate({ id: 'tpl-001', name: 'template-1' }),
                createTestTemplate({ id: 'tpl-002', name: 'template-2' }),
            ];

            await store.addMany(templates);

            expect(mockEventBus.publish).toHaveBeenCalledTimes(2);
        });

        it('should log count of added templates', async () => {
            const templates = [
                createTestTemplate({ id: 'tpl-001', name: 'template-1' }),
                createTestTemplate({ id: 'tpl-002', name: 'template-2' }),
            ];

            await store.addMany(templates);

            expect(mockLogger.info).toHaveBeenCalledWith('Templates added', { count: 2 });
        });
    });

    describe('getById', () => {
        it('should return template by ID', async () => {
            const template = createTestTemplate({ id: 'tpl-specific' });
            await store.add(template);

            const retrieved = await store.getById('tpl-specific');

            expect(retrieved).toBeDefined();
            expect(retrieved?.id).toBe('tpl-specific');
        });

        it('should return undefined for non-existing ID', async () => {
            const retrieved = await store.getById('non-existing');

            expect(retrieved).toBeUndefined();
        });
    });

    describe('getByName', () => {
        it('should return template by name', async () => {
            const template = createTestTemplate({ name: 'unique-name' });
            await store.add(template);

            const retrieved = await store.getByName('unique-name');

            expect(retrieved).toBeDefined();
            expect(retrieved?.name).toBe('unique-name');
        });

        it('should return undefined for non-existing name', async () => {
            const retrieved = await store.getByName('non-existing');

            expect(retrieved).toBeUndefined();
        });

        it('should be case-sensitive', async () => {
            const template = createTestTemplate({ name: 'CaseSensitive' });
            await store.add(template);

            expect(await store.getByName('casesensitive')).toBeUndefined();
            expect(await store.getByName('CASESENSITIVE')).toBeUndefined();
            expect(await store.getByName('CaseSensitive')).toBeDefined();
        });
    });

    describe('query', () => {
        beforeEach(async () => {
            // 准备测试数据
            const templates = [
                createTestTemplate({ 
                    id: 'tpl-1', 
                    name: 'user-profile',
                    parameters: [{ name: 'userId', required: true }],
                    sourceFile: Uri.file('/project/templates/user.yaml'),
                }),
                createTestTemplate({ 
                    id: 'tpl-2', 
                    name: 'user-settings',
                    parameters: [{ name: 'userId', required: true }, { name: 'theme', required: false }],
                    sourceFile: Uri.file('/project/templates/user.yaml'),
                }),
                createTestTemplate({ 
                    id: 'tpl-3', 
                    name: 'product-card',
                    parameters: [{ name: 'productId', required: true }],
                    sourceFile: Uri.file('/project/templates/product.yaml'),
                }),
            ];

            for (const t of templates) {
                await store.add(t);
            }
        });

        it('should query by name pattern', async () => {
            const result = await store.query({ namePattern: 'user-.*' });

            expect(result.templates).toHaveLength(2);
            expect(result.templates.every(t => t.name.startsWith('user-'))).toBe(true);
        });

        it('should query by parameter name', async () => {
            const result = await store.query({ hasParameter: 'userId' });

            expect(result.templates).toHaveLength(2);
        });

        it('should query by source file', async () => {
            const sourceFile = Uri.file('/project/templates/user.yaml');
            const result = await store.query({ sourceFile });

            expect(result.templates).toHaveLength(2);
        });

        it('should support pagination with skip', async () => {
            const result = await store.query({ skip: 1 });

            expect(result.templates).toHaveLength(2);
            expect(result.total).toBe(3);
        });

        it('should support pagination with limit', async () => {
            const result = await store.query({ limit: 2 });

            expect(result.templates).toHaveLength(2);
            expect(result.total).toBe(3);
            expect(result.hasMore).toBe(true);
        });

        it('should sort by name', async () => {
            const result = await store.query({});

            const names = result.templates.map(t => t.name);
            expect(names).toEqual([...names].sort());
        });

        it('should return empty result for no matches', async () => {
            const result = await store.query({ namePattern: 'nonexistent-.*' });

            expect(result.templates).toHaveLength(0);
            expect(result.total).toBe(0);
        });
    });

    describe('getAll', () => {
        it('should return all templates', async () => {
            await store.add(createTestTemplate({ name: 'template-1' }));
            await store.add(createTestTemplate({ name: 'template-2' }));
            await store.add(createTestTemplate({ name: 'template-3' }));

            const all = await store.getAll();

            expect(all).toHaveLength(3);
        });

        it('should return empty array when store is empty', async () => {
            const all = await store.getAll();

            expect(all).toEqual([]);
        });
    });

    describe('count', () => {
        it('should return 0 for empty store', async () => {
            expect(await store.count()).toBe(0);
        });

        it('should return correct count', async () => {
            await store.add(createTestTemplate({ name: 'template-1' }));
            await store.add(createTestTemplate({ name: 'template-2' }));

            expect(await store.count()).toBe(2);
        });
    });

    describe('exists', () => {
        it('should return true for existing template', async () => {
            const template = createTestTemplate({ id: 'existing-id' });
            await store.add(template);

            expect(await store.exists('existing-id')).toBe(true);
        });

        it('should return false for non-existing template', async () => {
            expect(await store.exists('non-existing')).toBe(false);
        });
    });

    describe('update', () => {
        it('should update existing template', async () => {
            const template = createTestTemplate({ id: 'tpl-001', name: 'original-name' });
            await store.add(template);

            const updated = new Template({
                id: template.id,
                name: template.name,
                parameters: [{ name: 'newParam', required: true }],
                sourceFile: template.sourceFile,
            });
            await store.update(updated);

            const retrieved = await store.getById('tpl-001');
            expect(retrieved?.parameters[0].name).toBe('newParam');
        });

        it('should throw error for non-existing template', async () => {
            const template = createTestTemplate({ id: 'non-existing' });

            await expect(store.update(template)).rejects.toThrow(/not found/);
        });

        it('should throw error when updating to existing name', async () => {
            const template1 = createTestTemplate({ id: 'tpl-001', name: 'name-1' });
            const template2 = createTestTemplate({ id: 'tpl-002', name: 'name-2' });
            await store.add(template1);
            await store.add(template2);

            // 尝试将 template1 的名称改为 template2 的名称
            // 由于 Template 是不可变的，需要创建新实例
            const conflicting = new Template({
                id: 'tpl-001',
                name: 'name-2', // 冲突的名称
                parameters: [],
                sourceFile: Uri.file('/test.yaml'),
            });

            await expect(store.update(conflicting)).rejects.toThrow(/already exists/);
        });

        it('should publish TemplateUpdated event', async () => {
            const template = createTestTemplate({ id: 'tpl-001' });
            await store.add(template);
            vi.clearAllMocks();

            const updated = new Template({
                id: template.id,
                name: template.name,
                parameters: [...template.parameters],
                sourceFile: template.sourceFile,
                content: { key: 'value' },
            });
            await store.update(updated);

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                EVENT_TYPES.TemplateUpdated,
                expect.objectContaining({
                    type: EVENT_TYPES.TemplateUpdated,
                    template: updated,
                })
            );
        });

        it('should update indexes', async () => {
            const template = createTestTemplate({ 
                id: 'tpl-001', 
                name: 'old-name',
                parameters: [{ name: 'oldParam', required: true }],
            });
            await store.add(template);

            // 创建带有新名称的更新版本
            const updated = new Template({
                id: 'tpl-001',
                name: 'new-name',
                parameters: [{ name: 'newParam', required: true }],
                sourceFile: template.sourceFile,
            });
            await store.update(updated);

            // 旧名称应该找不到
            expect(await store.getByName('old-name')).toBeUndefined();
            // 新名称应该能找到
            expect(await store.getByName('new-name')).toBeDefined();
        });
    });

    describe('remove', () => {
        it('should remove template by ID', async () => {
            const template = createTestTemplate({ id: 'to-remove' });
            await store.add(template);

            await store.remove('to-remove');

            expect(await store.getById('to-remove')).toBeUndefined();
        });

        it('should do nothing for non-existing ID', async () => {
            // 不应该抛出异常
            await expect(store.remove('non-existing')).resolves.not.toThrow();
        });

        it('should publish TemplateDeleted event', async () => {
            const template = createTestTemplate({ id: 'to-remove', name: 'removed-template' });
            await store.add(template);
            vi.clearAllMocks();

            await store.remove('to-remove');

            expect(mockEventBus.publish).toHaveBeenCalledWith(
                EVENT_TYPES.TemplateDeleted,
                expect.objectContaining({
                    type: EVENT_TYPES.TemplateDeleted,
                    templateId: 'to-remove',
                    templateName: 'removed-template',
                })
            );
        });

        it('should update indexes', async () => {
            const template = createTestTemplate({ id: 'tpl-001', name: 'to-remove' });
            await store.add(template);

            await store.remove('tpl-001');

            expect(await store.getByName('to-remove')).toBeUndefined();
        });
    });

    describe('removeByFile', () => {
        it('should remove all templates from file', async () => {
            const sourceFile = Uri.file('/project/templates/batch.yaml');
            await store.add(createTestTemplate({ 
                id: 'tpl-1', 
                name: 'template-1', 
                sourceFile,
            }));
            await store.add(createTestTemplate({ 
                id: 'tpl-2', 
                name: 'template-2', 
                sourceFile,
            }));
            await store.add(createTestTemplate({ 
                id: 'tpl-3', 
                name: 'template-3', 
                sourceFile: Uri.file('/other/file.yaml'),
            }));

            await store.removeByFile(sourceFile);

            expect(await store.count()).toBe(1);
            expect(await store.getById('tpl-3')).toBeDefined();
        });

        it('should do nothing for file with no templates', async () => {
            await store.add(createTestTemplate({ name: 'template-1' }));

            await store.removeByFile(Uri.file('/no/templates/here.yaml'));

            expect(await store.count()).toBe(1);
        });

        it('should publish events for removed templates', async () => {
            const sourceFile = Uri.file('/project/templates/batch.yaml');
            await store.add(createTestTemplate({ 
                id: 'tpl-1', 
                name: 'template-1', 
                sourceFile,
            }));
            await store.add(createTestTemplate({ 
                id: 'tpl-2', 
                name: 'template-2', 
                sourceFile,
            }));
            vi.clearAllMocks();

            await store.removeByFile(sourceFile);

            // 应该为每个移除的模板发布事件
            expect(mockEventBus.publish).toHaveBeenCalledTimes(2);
        });
    });

    describe('clear', () => {
        it('should remove all templates', async () => {
            await store.add(createTestTemplate({ name: 'template-1' }));
            await store.add(createTestTemplate({ name: 'template-2' }));
            await store.add(createTestTemplate({ name: 'template-3' }));

            store.clear();

            expect(await store.count()).toBe(0);
        });

        it('should clear all indexes', async () => {
            await store.add(createTestTemplate({ name: 'template-1' }));
            store.clear();

            expect(await store.getByName('template-1')).toBeUndefined();
        });

        it('should not publish events', async () => {
            await store.add(createTestTemplate({ name: 'template-1' }));
            vi.clearAllMocks();

            store.clear();

            expect(mockEventBus.publish).not.toHaveBeenCalled();
        });
    });

    describe('clearTemplates', () => {
        it('should remove all templates with events', async () => {
            await store.add(createTestTemplate({ name: 'template-1' }));
            await store.add(createTestTemplate({ name: 'template-2' }));
            vi.clearAllMocks();

            await store.clearTemplates();

            expect(await store.count()).toBe(0);
            // 批量清除发布单个 TemplateCacheRebuilt 事件
            expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
        });
    });

    describe('getTemplateStatistics', () => {
        it('should return correct statistics', async () => {
            const file1 = Uri.file('/project/templates/file1.yaml');
            const file2 = Uri.file('/project/templates/file2.yaml');

            await store.add(createTestTemplate({ name: 'template-1', sourceFile: file1 }));
            await store.add(createTestTemplate({ name: 'template-2', sourceFile: file1 }));
            await store.add(createTestTemplate({ name: 'template-3', sourceFile: file2 }));

            const stats = await store.getTemplateStatistics();

            expect(stats.totalTemplates).toBe(3);
            expect(stats.totalFiles).toBe(2);
            expect(stats.lastUpdated).toBeInstanceOf(Date);
        });

        it('should return zero counts for empty store', async () => {
            const stats = await store.getTemplateStatistics();

            expect(stats.totalTemplates).toBe(0);
            expect(stats.totalFiles).toBe(0);
        });
    });

    describe('getLastUpdated', () => {
        it('should return last update time', async () => {
            const before = new Date();
            await store.add(createTestTemplate({ name: 'template-1' }));
            const after = new Date();

            const lastUpdated = store.getLastUpdated();

            expect(lastUpdated.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(lastUpdated.getTime()).toBeLessThanOrEqual(after.getTime());
        });

        it('should update on add', async () => {
            const initial = store.getLastUpdated();
            await new Promise(resolve => setTimeout(resolve, 10));
            await store.add(createTestTemplate({ name: 'template-1' }));

            expect(store.getLastUpdated().getTime()).toBeGreaterThan(initial.getTime());
        });

        it('should update on remove', async () => {
            const template = createTestTemplate({ id: 'to-remove' });
            await store.add(template);
            const afterAdd = store.getLastUpdated();
            await new Promise(resolve => setTimeout(resolve, 10));
            await store.remove('to-remove');

            expect(store.getLastUpdated().getTime()).toBeGreaterThan(afterAdd.getTime());
        });
    });

    describe('getFileCount', () => {
        it('should return number of unique files', async () => {
            const file1 = Uri.file('/project/templates/file1.yaml');
            const file2 = Uri.file('/project/templates/file2.yaml');

            await store.add(createTestTemplate({ name: 'template-1', sourceFile: file1 }));
            await store.add(createTestTemplate({ name: 'template-2', sourceFile: file1 }));
            await store.add(createTestTemplate({ name: 'template-3', sourceFile: file2 }));

            expect(store.getFileCount()).toBe(2);
        });

        it('should return 0 for empty store', () => {
            expect(store.getFileCount()).toBe(0);
        });
    });

    describe('event publish error handling', () => {
        it('should handle event publish errors gracefully', async () => {
            mockEventBus.publish = vi.fn().mockRejectedValue(new Error('Publish failed'));

            const template = createTestTemplate({ name: 'template-1' });
            
            // 不应该抛出异常
            await expect(store.add(template)).resolves.not.toThrow();

            // 模板仍然应该被添加
            expect(await store.count()).toBe(1);
        });

        it('should log warning on event publish failure', async () => {
            mockEventBus.publish = vi.fn().mockRejectedValue(new Error('Publish failed'));

            await store.add(createTestTemplate({ name: 'template-1' }));

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Failed to publish template event',
                expect.any(Object)
            );
        });
    });

    describe('queryTemplates', () => {
        it('should return IQueryResult format', async () => {
            await store.add(createTestTemplate({ name: 'template-1' }));
            await store.add(createTestTemplate({ name: 'template-2' }));

            const result = await store.queryTemplates({});

            expect(result).toHaveProperty('items');
            expect(result).toHaveProperty('total');
            expect(result).toHaveProperty('hasMore');
            expect(result.items).toHaveLength(2);
            expect(result.total).toBe(2);
        });
    });

    describe('addWithoutEvent', () => {
        it('should add template without publishing event', async () => {
            const template = createTestTemplate({ name: 'silent-add' });

            await store.addWithoutEvent(template);

            expect(mockEventBus.publish).not.toHaveBeenCalled();
            expect(await store.count()).toBe(1);
        });
    });
});

