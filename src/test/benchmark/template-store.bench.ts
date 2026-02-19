/**
 * 模板存储性能测试
 * 
 * 测试模板存储相关数据结构的性能（Map 操作）
 */
import { describe, bench } from 'vitest';
import { ITemplate, ITemplateParameter } from '../../core/interfaces/ITemplate';
import { Uri } from 'vscode';
import { defaultBenchOptions, fastBenchOptions, slowBenchOptions } from './bench-options';

// ========================================
// 模拟数据生成
// ========================================

/**
 * 生成符合 CraftEngine 格式的模板
 * 
 * 模板名称使用 namespace:category/name 格式
 * 参数使用 model、texture 等真实参数名
 */
function generateTemplate(index: number, fileIndex: number = 0): ITemplate {
    const templateCategories = ['model', 'settings', 'sound', 'loot'];
    const templateTypes = ['generated', 'handheld', 'layered', 'ore', 'wood'];
    
    const category = templateCategories[index % templateCategories.length];
    const type = templateTypes[index % templateTypes.length];
    
    const parameters: ITemplateParameter[] = [
        {
            name: 'model',
            type: 'string',
            required: true,
            description: 'Model path',
        },
        {
            name: 'texture',
            type: 'string',
            required: true,
            description: 'Texture path',
        },
        {
            name: 'overlay',
            type: 'string',
            required: false,
            description: 'Overlay texture path',
        }
    ];

    return {
        id: `template_${index}`,
        name: `default:${category}/${type}${index >= templateTypes.length ? `_${Math.floor(index / templateTypes.length)}` : ''}`,
        parameters,
        content: {
            type: 'minecraft:model',
            path: '${model}',
            generation: {
                parent: 'minecraft:item/generated',
                textures: { layer0: '${texture}' }
            }
        },
        sourceFile: Uri.file(`/test/templates/file${fileIndex}.yml`),
        createdAt: new Date(),
        updatedAt: new Date(),
        usageCount: Math.floor(Math.random() * 100),
        lastUsedAt: new Date(),
        getRequiredParameters: () => parameters.filter(p => p.required),
        getOptionalParameters: () => parameters.filter(p => !p.required),
        hasParameter: (name: string) => parameters.some(p => p.name === name),
        getParameter: (name: string) => parameters.find(p => p.name === name),
        validateParameters: () => ({ isValid: true, errors: [], warnings: [] }),
        recordUsage: function() { return this; },
    };
}

// 预生成测试数据
const templates100 = Array.from({ length: 100 }, (_, i) => generateTemplate(i, Math.floor(i / 10)));
const templates1000 = Array.from({ length: 1000 }, (_, i) => generateTemplate(i, Math.floor(i / 50)));

describe('TemplateStore Performance (Data Structure)', () => {
    // ========================================
    // Map 操作测试（添加）
    // ========================================

    describe('Map Operations - Add', () => {
        bench('add single template to Map', () => {
            const templates = new Map<string, ITemplate>();
            const nameIndex = new Map<string, ITemplate>();
            const template = generateTemplate(0);
            templates.set(template.id, template);
            nameIndex.set(template.name, template);
        }, defaultBenchOptions);

        bench('add 10 templates to Map', () => {
            const templates = new Map<string, ITemplate>();
            const nameIndex = new Map<string, ITemplate>();
            for (let i = 0; i < 10; i++) {
                const template = generateTemplate(i);
                templates.set(template.id, template);
                nameIndex.set(template.name, template);
            }
        }, defaultBenchOptions);

        bench('add 100 templates to Map', () => {
            const templates = new Map<string, ITemplate>();
            const nameIndex = new Map<string, ITemplate>();
            for (let i = 0; i < 100; i++) {
                const template = templates100[i];
                templates.set(template.id, template);
                nameIndex.set(template.name, template);
            }
        }, fastBenchOptions);

        bench('add 1000 templates to Map', () => {
            const templates = new Map<string, ITemplate>();
            const nameIndex = new Map<string, ITemplate>();
            for (let i = 0; i < 1000; i++) {
                const template = templates1000[i];
                templates.set(template.id, template);
                nameIndex.set(template.name, template);
            }
        }, slowBenchOptions);
    });

    // ========================================
    // Map 查询测试（100 个模板）
    // ========================================

    describe('Map Operations - Query (100 templates)', () => {
        // 预填充的 Map
        const templatesMap = new Map<string, ITemplate>();
        const nameIndex = new Map<string, ITemplate>();
        templates100.forEach(t => {
            templatesMap.set(t.id, t);
            nameIndex.set(t.name, t);
        });

        bench('get by ID', () => {
            templatesMap.get('template_50');
        }, defaultBenchOptions);

        bench('get by name', () => {
            nameIndex.get('default:model/generated_5');
        }, defaultBenchOptions);

        bench('get all (Array.from)', () => {
            Array.from(templatesMap.values());
        }, defaultBenchOptions);

        bench('count (Map.size)', () => {
            templatesMap.size;
        }, defaultBenchOptions);

        bench('exists check (has)', () => {
            templatesMap.has('template_50');
        }, defaultBenchOptions);

        bench('iterate all templates', () => {
            for (const template of templatesMap.values()) {
                template.name;
            }
        }, defaultBenchOptions);
    });

    // ========================================
    // Map 查询测试（1000 个模板）
    // ========================================

    describe('Map Operations - Query (1000 templates)', () => {
        // 预填充的 Map
        const templatesMap = new Map<string, ITemplate>();
        const nameIndex = new Map<string, ITemplate>();
        templates1000.forEach(t => {
            templatesMap.set(t.id, t);
            nameIndex.set(t.name, t);
        });

        bench('get by ID in 1000', () => {
            templatesMap.get('template_500');
        }, defaultBenchOptions);

        bench('get by name in 1000', () => {
            nameIndex.get('default:model/generated_100');
        }, defaultBenchOptions);

        bench('get all in 1000', () => {
            Array.from(templatesMap.values());
        }, fastBenchOptions);

        bench('filter by pattern in 1000', () => {
            Array.from(templatesMap.values()).filter(t => 
                t.name.startsWith('default:model/')
            );
        }, fastBenchOptions);
    });

    // ========================================
    // 文件索引测试
    // ========================================

    describe('File Index Operations', () => {
        // 预填充的文件索引
        const fileIndex = new Map<string, Set<string>>();
        for (let fileIdx = 0; fileIdx < 10; fileIdx++) {
            const filePath = `/test/templates/file${fileIdx}.yml`;
            const templateIds = new Set<string>();
            for (let i = 0; i < 10; i++) {
                templateIds.add(`template_${fileIdx * 10 + i}`);
            }
            fileIndex.set(filePath, templateIds);
        }

        bench('get templates by file', () => {
            fileIndex.get('/test/templates/file5.yml');
        }, defaultBenchOptions);

        bench('add template to file index', () => {
            const existing = fileIndex.get('/test/templates/file0.yml');
            if (existing) {
                existing.add('new_template');
                existing.delete('new_template'); // 还原
            }
        }, defaultBenchOptions);

        bench('count templates in file', () => {
            const templates = fileIndex.get('/test/templates/file5.yml');
            templates?.size;
        }, defaultBenchOptions);
    });

    // ========================================
    // 更新操作测试
    // ========================================

    describe('Update Operations', () => {
        // 预填充的 Map
        const templatesMap = new Map<string, ITemplate>();
        templates100.forEach(t => templatesMap.set(t.id, t));

        bench('update single template', () => {
            const existing = templatesMap.get('template_50');
            if (existing) {
                const updated = { ...existing, updatedAt: new Date() };
                templatesMap.set('template_50', updated as ITemplate);
            }
        }, defaultBenchOptions);

        bench('update template content', () => {
            const existing = templatesMap.get('template_50');
            if (existing) {
                const updated = { 
                    ...existing, 
                    content: { display: { name: 'Updated Name' } },
                    updatedAt: new Date() 
                };
                templatesMap.set('template_50', updated as ITemplate);
            }
        }, defaultBenchOptions);
    });

    // ========================================
    // 删除操作测试
    // ========================================

    describe('Remove Operations', () => {
        bench('remove single template', () => {
            const templatesMap = new Map<string, ITemplate>();
            const nameIndex = new Map<string, ITemplate>();
            templates100.forEach(t => {
                templatesMap.set(t.id, t);
                nameIndex.set(t.name, t);
            });
            
            const template = templatesMap.get('template_50');
            if (template) {
                templatesMap.delete('template_50');
                nameIndex.delete(template.name);
            }
        }, defaultBenchOptions);

        bench('clear all templates', () => {
            const templatesMap = new Map<string, ITemplate>();
            const nameIndex = new Map<string, ITemplate>();
            templates100.forEach(t => {
                templatesMap.set(t.id, t);
                nameIndex.set(t.name, t);
            });
            
            templatesMap.clear();
            nameIndex.clear();
        }, fastBenchOptions);
    });

    // ========================================
    // 统计操作测试
    // ========================================

    describe('Statistics Operations', () => {
        // 预填充的 Map
        const templatesMap = new Map<string, ITemplate>();
        const fileIndex = new Map<string, Set<string>>();
        templates100.forEach(t => {
            templatesMap.set(t.id, t);
            const filePath = t.sourceFile.fsPath;
            if (!fileIndex.has(filePath)) {
                fileIndex.set(filePath, new Set());
            }
            fileIndex.get(filePath)!.add(t.id);
        });

        bench('get template count', () => {
            templatesMap.size;
        }, defaultBenchOptions);

        bench('get file count', () => {
            fileIndex.size;
        }, defaultBenchOptions);

        bench('get last updated template', () => {
            let latestTime = 0;
            for (const template of templatesMap.values()) {
                const time = template.updatedAt.getTime();
                if (time > latestTime) {
                    latestTime = time;
                }
            }
        }, fastBenchOptions);
    });

    // ========================================
    // 混合操作测试
    // ========================================

    describe('Mixed Operations', () => {
        // 预填充的 Map
        const templatesMap = new Map<string, ITemplate>();
        const nameIndex = new Map<string, ITemplate>();
        templates100.forEach(t => {
            templatesMap.set(t.id, t);
            nameIndex.set(t.name, t);
        });

        bench('query + get + update pattern', () => {
            const results = Array.from(templatesMap.values()).filter(t => 
                t.name.startsWith('default:model/generated')
            );
            if (results.length > 0) {
                const template = results[0];
                const updated = { ...template, usageCount: template.usageCount + 1 };
                templatesMap.set(template.id, updated as ITemplate);
            }
        }, defaultBenchOptions);

        bench('search and filter pattern', () => {
            const query = 'model/handheld';
            Array.from(templatesMap.values())
                .filter(t => t.name.includes(query))
                .slice(0, 10);
        }, defaultBenchOptions);
    });
});
