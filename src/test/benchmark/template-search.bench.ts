/**
 * 模板搜索性能测试
 * 
 * 测试模板搜索相关算法的性能
 */
import { describe, bench } from 'vitest';
import { defaultBenchOptions, fastBenchOptions } from './bench-options';

// ========================================
// 模拟模板数据
// ========================================

interface MockTemplate {
    id: string;
    name: string;
    usageCount: number;
    description: string;
}

/**
 * 生成符合 CraftEngine 格式的模板
 * 
 * 模板名称使用 namespace:category/type 格式
 */
function generateTemplates(count: number): MockTemplate[] {
    const categories = ['model', 'settings', 'sound', 'loot_table', 'recipe', 'block_state'];
    const types = ['generated', 'handheld', 'layered', 'ore', 'wood', 'stone', 'planks', 'button'];
    const templates: MockTemplate[] = [];
    
    for (let i = 0; i < count; i++) {
        const category = categories[i % categories.length];
        const type = types[i % types.length];
        const suffix = i >= types.length ? `_${Math.floor(i / types.length)}` : '';
        templates.push({
            id: `template_${i}`,
            name: `default:${category}/${type}${suffix}`,
            usageCount: Math.floor(Math.random() * 100),
            description: `Template for ${category} ${type}${suffix}`,
        });
    }
    
    return templates;
}

// 预生成测试数据
const templates100 = generateTemplates(100);
const templates500 = generateTemplates(500);
const templates1000 = generateTemplates(1000);
const templates2000 = generateTemplates(2000);
const templates5000 = generateTemplates(5000);

// ========================================
// 搜索算法
// ========================================

function prefixMatch(templates: MockTemplate[], prefix: string): MockTemplate[] {
    const lowerPrefix = prefix.toLowerCase();
    return templates.filter(t => t.name.toLowerCase().startsWith(lowerPrefix));
}

// function containsMatch(templates: MockTemplate[], query: string): MockTemplate[] {
//     const lowerQuery = query.toLowerCase();
//     return templates.filter(t => t.name.toLowerCase().includes(lowerQuery));
// }

function fuzzyMatch(templates: MockTemplate[], query: string): MockTemplate[] {
    const lowerQuery = query.toLowerCase();
    return templates.filter(t => {
        const name = t.name.toLowerCase();
        let queryIndex = 0;
        for (let i = 0; i < name.length && queryIndex < lowerQuery.length; i++) {
            if (name[i] === lowerQuery[queryIndex]) {
                queryIndex++;
            }
        }
        return queryIndex === lowerQuery.length;
    });
}

function calculateScore(template: MockTemplate, query: string): number {
    const name = template.name.toLowerCase();
    const lowerQuery = query.toLowerCase();
    
    let score = 0;
    
    if (name === lowerQuery) {
        score += 100;
    } else if (name.startsWith(lowerQuery)) {
        score += 80;
    } else if (name.includes(lowerQuery)) {
        score += 60;
    } else {
        let queryIndex = 0;
        for (let i = 0; i < name.length && queryIndex < lowerQuery.length; i++) {
            if (name[i] === lowerQuery[queryIndex]) {
                queryIndex++;
            }
        }
        if (queryIndex === lowerQuery.length) {
            score += 40;
        }
    }
    
    score += Math.min(template.usageCount / 10, 20);
    
    return score;
}

function sortByRelevance(templates: MockTemplate[], query: string): MockTemplate[] {
    return [...templates].sort((a, b) => {
        const scoreA = calculateScore(a, query);
        const scoreB = calculateScore(b, query);
        return scoreB - scoreA;
    });
}

function sortByUsage(templates: MockTemplate[]): MockTemplate[] {
    return [...templates].sort((a, b) => b.usageCount - a.usageCount);
}

function sortByName(templates: MockTemplate[]): MockTemplate[] {
    return [...templates].sort((a, b) => a.name.localeCompare(b.name));
}

describe('TemplateSearchService Performance', () => {
    // ========================================
    // 小数据集测试（100 个模板）
    // ========================================

    describe('Small Dataset (100 templates)', () => {
        bench('prefix search - short prefix', () => {
            prefixMatch(templates100, 'de');
        }, defaultBenchOptions);

        bench('prefix search - long prefix', () => {
            prefixMatch(templates100, 'default:model/');
        }, defaultBenchOptions);

        bench('prefix search with limit', () => {
            prefixMatch(templates100, 'de').slice(0, 10);
        }, defaultBenchOptions);

        bench('fuzzy search', () => {
            fuzzyMatch(templates100, 'mdl');
        }, defaultBenchOptions);

        bench('fuzzy search with limit', () => {
            fuzzyMatch(templates100, 'mdl').slice(0, 10);
        }, defaultBenchOptions);

        bench('search sorted by name', () => {
            const results = prefixMatch(templates100, 'de');
            sortByName(results);
        }, defaultBenchOptions);

        bench('search sorted by usage', () => {
            const results = prefixMatch(templates100, 'de');
            sortByUsage(results);
        }, defaultBenchOptions);

        bench('search sorted by relevance', () => {
            const results = prefixMatch(templates100, 'de');
            sortByRelevance(results, 'de');
        }, defaultBenchOptions);
    });

    // ========================================
    // 中等数据集测试（500 个模板）
    // ========================================

    describe('Medium Dataset (500 templates)', () => {
        bench('prefix search', () => {
            prefixMatch(templates500, 'default:model');
        }, defaultBenchOptions);

        bench('prefix search with limit', () => {
            prefixMatch(templates500, 'default:model').slice(0, 20);
        }, defaultBenchOptions);

        bench('fuzzy search', () => {
            fuzzyMatch(templates500, 'mdlgn');
        }, defaultBenchOptions);

        bench('fuzzy search with limit', () => {
            fuzzyMatch(templates500, 'mdlgn').slice(0, 20);
        }, defaultBenchOptions);

        bench('search sorted by usage', () => {
            const results = prefixMatch(templates500, 'default:model');
            sortByUsage(results);
        }, defaultBenchOptions);
    });

    // ========================================
    // 大数据集测试（2000 个模板）
    // ========================================

    describe('Large Dataset (2000 templates)', () => {
        bench('prefix search', () => {
            prefixMatch(templates2000, 'default:model');
        }, fastBenchOptions);

        bench('prefix search with limit', () => {
            prefixMatch(templates2000, 'default:model').slice(0, 20);
        }, fastBenchOptions);

        bench('fuzzy search', () => {
            fuzzyMatch(templates2000, 'mdlgn');
        }, fastBenchOptions);

        bench('fuzzy search with limit', () => {
            fuzzyMatch(templates2000, 'mdlgn').slice(0, 20);
        }, fastBenchOptions);

        bench('broad prefix search', () => {
            prefixMatch(templates2000, 'd');
        }, fastBenchOptions);
    });

    // ========================================
    // 超大数据集测试（5000 个模板）
    // ========================================

    describe('Very Large Dataset (5000 templates)', () => {
        bench('prefix search', () => {
            prefixMatch(templates5000, 'default:model');
        }, fastBenchOptions);

        bench('prefix search with limit', () => {
            prefixMatch(templates5000, 'default:model').slice(0, 20);
        }, fastBenchOptions);

        bench('fuzzy search with limit', () => {
            fuzzyMatch(templates5000, 'mdlgn').slice(0, 20);
        }, fastBenchOptions);

        bench('exact match search', () => {
            templates5000.find(t => t.name === 'default:model/generated_100');
        }, defaultBenchOptions);
    });

    // ========================================
    // 评分计算测试
    // ========================================

    describe('Score Calculation', () => {
        const template = templates100[0];

        bench('calculate match score - exact prefix', () => {
            calculateScore(template, 'default:model/generated');
        }, defaultBenchOptions);

        bench('calculate match score - partial prefix', () => {
            calculateScore(template, 'default:model');
        }, defaultBenchOptions);

        bench('calculate match score - fuzzy match', () => {
            calculateScore(template, 'mdl');
        }, defaultBenchOptions);

        bench('calculate match score - no match', () => {
            calculateScore(template, 'xyz');
        }, defaultBenchOptions);

        bench('calculate scores for 100 templates', () => {
            const query = 'default:model';
            for (const t of templates100) {
                calculateScore(t, query);
            }
        }, fastBenchOptions);
    });

    // ========================================
    // 典型使用模式测试
    // ========================================

    describe('Typical Usage Patterns', () => {
        bench('autocomplete - single character', () => {
            prefixMatch(templates1000, 'd').slice(0, 10);
        }, defaultBenchOptions);

        bench('autocomplete - two characters', () => {
            prefixMatch(templates1000, 'de').slice(0, 10);
        }, defaultBenchOptions);

        bench('autocomplete - three characters', () => {
            prefixMatch(templates1000, 'def').slice(0, 10);
        }, defaultBenchOptions);

        bench('autocomplete - namespace prefix', () => {
            prefixMatch(templates1000, 'default:').slice(0, 10);
        }, defaultBenchOptions);

        bench('autocomplete - full template name start', () => {
            prefixMatch(templates1000, 'default:model/gen').slice(0, 10);
        }, defaultBenchOptions);

        bench('fuzzy autocomplete - common word', () => {
            const results = fuzzyMatch(templates1000, 'mdlgn');
            sortByRelevance(results, 'mdlgn').slice(0, 10);
        }, fastBenchOptions);
    });

    // ========================================
    // 排序性能测试
    // ========================================

    describe('Sorting Performance', () => {
        bench('sort 500 templates by name', () => {
            sortByName(templates500);
        }, fastBenchOptions);

        bench('sort 500 templates by usage', () => {
            sortByUsage(templates500);
        }, fastBenchOptions);

        bench('sort 500 templates by relevance', () => {
            sortByRelevance(templates500, 'default:model');
        }, fastBenchOptions);

        bench('sort 100 results by relevance', () => {
            const results = prefixMatch(templates500, 'd').slice(0, 100);
            sortByRelevance(results, 'd');
        }, defaultBenchOptions);
    });

    // ========================================
    // 边界情况测试
    // ========================================

    describe('Edge Cases', () => {
        bench('empty query', () => {
            prefixMatch(templates100, '');
        }, defaultBenchOptions);

        bench('no matches', () => {
            prefixMatch(templates100, 'xyz_nonexistent');
        }, defaultBenchOptions);

        bench('all matches', () => {
            prefixMatch(templates100, '');
        }, defaultBenchOptions);

        bench('case insensitive search', () => {
            prefixMatch(templates100, 'DEFAULT:MODEL');
        }, defaultBenchOptions);

        bench('long query string', () => {
            prefixMatch(templates100, 'default:model/generated_with_very_long_name');
        }, defaultBenchOptions);
    });
});
