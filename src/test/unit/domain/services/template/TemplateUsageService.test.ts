import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemplateUsageService } from '../../../../../domain/services/template/TemplateUsageService';
import { type ITemplate } from '../../../../../core/interfaces/ITemplate';
import { type IDataStoreService } from '../../../../../core/interfaces/IDataStoreService';
import { type ILogger } from '../../../../../core/interfaces/ILogger';
import { Template } from '../../../../../domain/entities/Template';
import { Uri, Position } from 'vscode';

describe('TemplateUsageService', () => {
    let service: TemplateUsageService;
    let mockRepository: IDataStoreService;
    let mockLogger: ILogger;

    const createTemplate = (name: string, usageCount = 0, lastUsedAt?: Date): ITemplate => {
        return new Template({
            id: `tpl-${name}`,
            name,
            parameters: [{ name: 'param1', required: true }],
            sourceFile: Uri.file('/test/templates.yaml'),
            definitionPosition: new Position(0, 0),
            usageCount,
            lastUsedAt,
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
        } as unknown as ILogger;

        mockRepository = {
            getTemplateByName: vi.fn(),
            updateTemplate: vi.fn(),
            queryTemplates: vi.fn(),
        } as unknown as IDataStoreService;

        service = new TemplateUsageService(mockRepository, mockLogger);
    });

    describe('recordTemplateUsage', () => {
        it('should record usage for existing template', async () => {
            const template = createTemplate('my:template', 5);
            vi.mocked(mockRepository.getTemplateByName).mockResolvedValue(template);
            vi.mocked(mockRepository.updateTemplate).mockResolvedValue(undefined);

            const result = await service.recordTemplateUsage('my:template');

            expect(result).toBe(true);
            expect(mockRepository.updateTemplate).toHaveBeenCalledTimes(1);
            const updatedTemplate = vi.mocked(mockRepository.updateTemplate).mock.calls[0][0];
            expect(updatedTemplate.usageCount).toBe(6);
            expect(updatedTemplate.lastUsedAt).toBeDefined();
        });

        it('should return false for non-existent template', async () => {
            vi.mocked(mockRepository.getTemplateByName).mockResolvedValue(undefined);

            const result = await service.recordTemplateUsage('nonexistent');

            expect(result).toBe(false);
            expect(mockRepository.updateTemplate).not.toHaveBeenCalled();
        });

        it('should return false on error', async () => {
            vi.mocked(mockRepository.getTemplateByName).mockRejectedValue(new Error('DB error'));

            const result = await service.recordTemplateUsage('my:template');

            expect(result).toBe(false);
        });
    });

    describe('getUsageStatistics', () => {
        it('should return usage stats for existing template', async () => {
            const lastUsed = new Date('2024-06-01');
            const template = createTemplate('my:template', 10, lastUsed);
            vi.mocked(mockRepository.getTemplateByName).mockResolvedValue(template);

            const stats = await service.getUsageStatistics('my:template');

            expect(stats).toEqual({
                usageCount: 10,
                lastUsedAt: lastUsed,
            });
        });

        it('should return undefined for non-existent template', async () => {
            vi.mocked(mockRepository.getTemplateByName).mockResolvedValue(undefined);

            const stats = await service.getUsageStatistics('nonexistent');
            expect(stats).toBeUndefined();
        });
    });

    describe('getMostUsedTemplates', () => {
        it('should return templates sorted by usage count', async () => {
            const templates = [
                createTemplate('low:usage', 1),
                createTemplate('high:usage', 100),
                createTemplate('mid:usage', 50),
                createTemplate('no:usage', 0),
            ];
            vi.mocked(mockRepository.queryTemplates).mockResolvedValue({
                items: templates,
                total: 4,
            });

            const result = await service.getMostUsedTemplates(3);

            expect(result).toHaveLength(3);
            expect(result[0].templateName).toBe('high:usage');
            expect(result[1].templateName).toBe('mid:usage');
            expect(result[2].templateName).toBe('low:usage');
        });

        it('should exclude templates with zero usage', async () => {
            const templates = [createTemplate('no:usage1', 0), createTemplate('no:usage2', 0)];
            vi.mocked(mockRepository.queryTemplates).mockResolvedValue({
                items: templates,
                total: 2,
            });

            const result = await service.getMostUsedTemplates();
            expect(result).toHaveLength(0);
        });
    });

    describe('getRecentlyUsedTemplates', () => {
        it('should return templates sorted by last used time', async () => {
            const templates = [
                createTemplate('old:template', 5, new Date('2024-01-01')),
                createTemplate('new:template', 3, new Date('2024-06-01')),
                createTemplate('mid:template', 8, new Date('2024-03-01')),
                createTemplate('never:used', 0),
            ];
            vi.mocked(mockRepository.queryTemplates).mockResolvedValue({
                items: templates,
                total: 4,
            });

            const result = await service.getRecentlyUsedTemplates(3);

            expect(result).toHaveLength(3);
            expect(result[0].templateName).toBe('new:template');
            expect(result[1].templateName).toBe('mid:template');
            expect(result[2].templateName).toBe('old:template');
        });

        it('should exclude templates without lastUsedAt', async () => {
            const templates = [createTemplate('never:used', 0)];
            vi.mocked(mockRepository.queryTemplates).mockResolvedValue({
                items: templates,
                total: 1,
            });

            const result = await service.getRecentlyUsedTemplates();
            expect(result).toHaveLength(0);
        });
    });
});
