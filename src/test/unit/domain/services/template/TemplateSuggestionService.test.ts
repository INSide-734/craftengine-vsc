import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TemplateSuggestionService } from '../../../../../domain/services/template/TemplateSuggestionService';
import { type IDataStoreService } from '../../../../../core/interfaces/IDataStoreService';
import { type ILogger } from '../../../../../core/interfaces/ILogger';
import { type ITemplate } from '../../../../../core/interfaces/ITemplate';
import { type ITemplateUsageContext } from '../../../../../core/interfaces/ITemplateService';
import { type TemplateSearchService } from '../../../../../domain/services/template/TemplateSearchService';

function createMockLogger(): ILogger {
    return {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        createChild: vi.fn().mockReturnThis(),
        setLevel: vi.fn(),
        getLevel: vi.fn().mockReturnValue('DEBUG'),
        isDebugEnabled: vi.fn().mockReturnValue(true),
    } as unknown as ILogger;
}

function createMockTemplate(name: string, params: string[] = []): ITemplate {
    return {
        name,
        parameters: params.map((p) => ({ name: p, required: true })),
        getRequiredParameters: vi.fn().mockReturnValue(params.slice(0, 1).map((p) => ({ name: p }))),
        getOptionalParameters: vi.fn().mockReturnValue(params.slice(1).map((p) => ({ name: p }))),
    } as unknown as ITemplate;
}

describe('TemplateSuggestionService', () => {
    let service: TemplateSuggestionService;
    let repository: IDataStoreService;
    let logger: ILogger;
    let searchService: TemplateSearchService;

    beforeEach(() => {
        logger = createMockLogger();
        repository = {
            getTemplateByName: vi.fn(),
            getAllTemplates: vi.fn().mockReturnValue([]),
        } as unknown as IDataStoreService;
        searchService = {
            searchTemplates: vi.fn().mockResolvedValue([]),
        } as unknown as TemplateSearchService;
        service = new TemplateSuggestionService(repository, logger, searchService);
    });
    describe('getTemplateSuggestions', () => {
        it('should return filtered and scored suggestions', async () => {
            const template1 = createMockTemplate('ns:my-template');
            const template2 = createMockTemplate('ns:other-template');

            (searchService.searchTemplates as ReturnType<typeof vi.fn>).mockResolvedValue([
                { template: template1, score: 0.8, reason: 'prefix' },
                { template: template2, score: 0.6, reason: 'fuzzy' },
            ]);

            const context: ITemplateUsageContext = {
                lineText: '  template: my',
                position: { line: 5, character: 14 },
                indentLevel: 2,
            } as unknown as ITemplateUsageContext;

            const results = await service.getTemplateSuggestions(context);
            expect(results).toHaveLength(1);
            expect(results[0].template.name).toBe('ns:my-template');
        });

        it('should return all templates when no prefix', async () => {
            const template1 = createMockTemplate('ns:a');
            const template2 = createMockTemplate('ns:b');

            (searchService.searchTemplates as ReturnType<typeof vi.fn>).mockResolvedValue([
                { template: template1, score: 0.8, reason: 'prefix' },
                { template: template2, score: 0.6, reason: 'fuzzy' },
            ]);

            const context: ITemplateUsageContext = {
                lineText: '  ',
                position: { line: 5, character: 2 },
                indentLevel: 2,
            } as unknown as ITemplateUsageContext;

            const results = await service.getTemplateSuggestions(context);
            expect(results).toHaveLength(2);
        });

        it('should boost score for longer prefix input', async () => {
            const template = createMockTemplate('ns:my-long-template');

            (searchService.searchTemplates as ReturnType<typeof vi.fn>).mockResolvedValue([
                { template, score: 0.8, reason: 'prefix' },
            ]);

            const context: ITemplateUsageContext = {
                lineText: '  template: my-long',
                position: { line: 5, character: 19 },
                indentLevel: 2,
            } as unknown as ITemplateUsageContext;

            const results = await service.getTemplateSuggestions(context);
            expect(results).toHaveLength(1);
            expect(results[0].score).toBeCloseTo(0.8 * 1.2);
        });

        it('should extract prefix from template: keyword', async () => {
            const template = createMockTemplate('ns:foo');

            (searchService.searchTemplates as ReturnType<typeof vi.fn>).mockResolvedValue([
                { template, score: 0.8, reason: 'prefix' },
            ]);

            const context: ITemplateUsageContext = {
                lineText: 'template: foo',
                position: { line: 5, character: 13 },
                indentLevel: 0,
            } as unknown as ITemplateUsageContext;

            const results = await service.getTemplateSuggestions(context);
            expect(results).toHaveLength(1);
        });
    });

    describe('getParameterSuggestions', () => {
        it('should return unused parameters', async () => {
            const template = createMockTemplate('ns:test', ['required1', 'optional1', 'optional2']);
            vi.mocked(repository.getTemplateByName).mockResolvedValue(template);

            const suggestions = await service.getParameterSuggestions('ns:test', ['required1']);
            expect(suggestions).toContain('optional1');
            expect(suggestions).toContain('optional2');
            expect(suggestions).not.toContain('required1');
        });

        it('should return empty array for unknown template', async () => {
            vi.mocked(repository.getTemplateByName).mockResolvedValue(undefined);

            const suggestions = await service.getParameterSuggestions('ns:unknown', []);
            expect(suggestions).toEqual([]);
        });

        it('should prioritize required parameters', async () => {
            const template = createMockTemplate('ns:test', ['req', 'opt1', 'opt2']);
            vi.mocked(repository.getTemplateByName).mockResolvedValue(template);

            const suggestions = await service.getParameterSuggestions('ns:test', []);
            // 必需参数应该在前面
            expect(suggestions[0]).toBe('req');
        });
    });
});
