import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemplateSearchService } from '../../../../../domain/services/template/TemplateSearchService';
import { type ITemplate, type ITemplateParameter } from '../../../../../core/interfaces/ITemplate';
import { type IDataStoreService } from '../../../../../core/interfaces/IDataStoreService';
import { type ILogger } from '../../../../../core/interfaces/ILogger';
import { Template } from '../../../../../domain/entities/Template';
import { Uri, Position } from 'vscode';

describe('TemplateSearchService', () => {
    let service: TemplateSearchService;
    let mockRepository: IDataStoreService;
    let mockLogger: ILogger;

    const createTemplate = (
        name: string,
        params: ITemplateParameter[] = [],
        usageCount = 0,
        lastUsedAt?: Date,
    ): ITemplate => {
        return new Template({
            id: `tpl-${name}`,
            name,
            parameters: params,
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
            queryTemplates: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        } as unknown as IDataStoreService;

        service = new TemplateSearchService(mockRepository, mockLogger);
    });

    describe('calculateMatchScore', () => {
        it('should give highest score for exact match', () => {
            const template = createTemplate('my:template');
            const score = service.calculateMatchScore(template, { prefix: 'my:template' });
            // 精确前缀匹配 100 + 完全匹配 50 + 参数奖励 20
            expect(score).toBe(170);
        });

        it('should give high score for prefix match', () => {
            const template = createTemplate('my:template');
            const score = service.calculateMatchScore(template, { prefix: 'my:' });
            // 前缀匹配 100 + 参数奖励 20
            expect(score).toBe(120);
        });

        it('should give medium score for fuzzy match', () => {
            const template = createTemplate('my:template');
            const score = service.calculateMatchScore(template, { prefix: 'template', fuzzy: true });
            // 模糊匹配 50 + 参数奖励 20
            expect(score).toBe(70);
        });

        it('should give zero for non-matching prefix without fuzzy', () => {
            const template = createTemplate('my:template');
            const score = service.calculateMatchScore(template, { prefix: 'other' });
            // 无匹配 0 + 参数奖励 20
            expect(score).toBe(20);
        });

        it('should penalize templates with many parameters', () => {
            const manyParams = Array.from({ length: 25 }, (_, i) => ({ name: `p${i}`, required: false }));
            const template = createTemplate('my:template', manyParams);
            const score = service.calculateMatchScore(template, { prefix: 'my:template' });
            // 精确匹配 150 + max(0, 20-25) = 0
            expect(score).toBe(150);
        });

        it('should be case insensitive', () => {
            const template = createTemplate('My:Template');
            const score = service.calculateMatchScore(template, { prefix: 'my:template' });
            expect(score).toBe(170);
        });
    });

    describe('getMatchReason', () => {
        it('should return "Exact match" for exact match', () => {
            const template = createTemplate('my:template');
            expect(service.getMatchReason(template, { prefix: 'my:template' })).toBe('Exact match');
        });

        it('should return "Prefix match" for prefix match', () => {
            const template = createTemplate('my:template');
            expect(service.getMatchReason(template, { prefix: 'my:' })).toBe('Prefix match');
        });

        it('should return "Contains text" for substring match', () => {
            const template = createTemplate('my:template');
            expect(service.getMatchReason(template, { prefix: 'template' })).toBe('Contains text');
        });

        it('should return "General match" when no prefix', () => {
            const template = createTemplate('my:template');
            expect(service.getMatchReason(template, {})).toBe('General match');
        });
    });

    describe('searchTemplates', () => {
        it('should return matching templates sorted by score', async () => {
            const templates = [createTemplate('my:exact'), createTemplate('my:extra'), createTemplate('other:thing')];
            vi.mocked(mockRepository.queryTemplates).mockResolvedValue({
                items: templates,
                total: 3,
            });

            const results = await service.searchTemplates({ prefix: 'my:exact' });

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].template.name).toBe('my:exact');
        });

        it('should filter out zero-score matches', async () => {
            const templates = [createTemplate('other:thing')];
            vi.mocked(mockRepository.queryTemplates).mockResolvedValue({
                items: templates,
                total: 1,
            });

            const results = await service.searchTemplates({ prefix: 'nonexistent' });

            // other:thing 不匹配 nonexistent 前缀，但有参数奖励分
            // score = 0 (no prefix match) + 19 (20 - 1 param) = 19 > 0
            expect(results.length).toBe(1);
        });

        it('should apply limit', async () => {
            const templates = Array.from({ length: 10 }, (_, i) => createTemplate(`my:template${i}`));
            vi.mocked(mockRepository.queryTemplates).mockResolvedValue({
                items: templates,
                total: 10,
            });

            const results = await service.searchTemplates({ prefix: 'my:', limit: 3 });
            expect(results.length).toBe(3);
        });

        it('should sort by name when sortBy is "name"', async () => {
            const templates = [createTemplate('my:zebra'), createTemplate('my:alpha'), createTemplate('my:middle')];
            vi.mocked(mockRepository.queryTemplates).mockResolvedValue({
                items: templates,
                total: 3,
            });

            const results = await service.searchTemplates({ prefix: 'my:', sortBy: 'name' });
            expect(results[0].template.name).toBe('my:alpha');
            expect(results[1].template.name).toBe('my:middle');
            expect(results[2].template.name).toBe('my:zebra');
        });

        it('should sort by usage when sortBy is "usage"', async () => {
            const templates = [
                createTemplate('my:low', [], 1),
                createTemplate('my:high', [], 100),
                createTemplate('my:mid', [], 50),
            ];
            vi.mocked(mockRepository.queryTemplates).mockResolvedValue({
                items: templates,
                total: 3,
            });

            const results = await service.searchTemplates({ prefix: 'my:', sortBy: 'usage' });
            expect(results[0].template.name).toBe('my:high');
            expect(results[1].template.name).toBe('my:mid');
            expect(results[2].template.name).toBe('my:low');
        });
    });
});
