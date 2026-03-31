/**
 * YAML 路径解析器性能测试
 *
 * 测试 YamlPathParser 在不同场景下的性能表现，包括：
 * - AST 精确解析
 * - 基于缩进的回退解析
 * - 不同深度的路径解析
 * - 包含数组索引的路径解析
 * - 大文档中的路径解析
 *
 * 性能基准目标:
 * | 操作 | 目标时间 |
 * |------|----------|
 * | 小型文档路径解析（<50行） | < 1ms |
 * | 中等文档路径解析（100-500行） | < 5ms |
 * | 大型文档路径解析（1000行） | < 10ms |
 */
import { describe, bench } from 'vitest';
import { Position, type TextDocument } from 'vscode';
import { YamlPathParser } from '../../infrastructure/yaml/YamlPathParser';
import { defaultBenchOptions, fastBenchOptions, slowBenchOptions } from './bench-options';

// ========================================
// Mock TextDocument 实现
// ========================================

interface IMockLine {
    text: string;
    lineNumber: number;
}

function createMockDocument(content: string): TextDocument {
    const lines = content.split('\n');
    const lineData: IMockLine[] = lines.map((text, index) => ({
        text,
        lineNumber: index,
    }));

    // 计算每行的起始偏移量
    const lineOffsets: number[] = [0];
    for (let i = 0; i < lines.length - 1; i++) {
        lineOffsets.push(lineOffsets[i] + lines[i].length + 1); // +1 for newline
    }

    return {
        getText: () => content,
        lineAt: (line: number) => ({
            text: lineData[line]?.text ?? '',
            lineNumber: line,
            range: {
                start: { line, character: 0 },
                end: { line, character: lineData[line]?.text.length ?? 0 },
            },
            rangeIncludingLineBreak: {
                start: { line, character: 0 },
                end: { line: line + 1, character: 0 },
            },
            firstNonWhitespaceCharacterIndex: lineData[line]?.text.search(/\S/) ?? 0,
            isEmptyOrWhitespace: !lineData[line]?.text.trim(),
        }),
        lineCount: lines.length,
        offsetAt: (position: Position) => {
            const line = position.line;
            const char = position.character;
            if (line >= lineOffsets.length) {
                return content.length;
            }
            return lineOffsets[line] + Math.min(char, lines[line]?.length ?? 0);
        },
        positionAt: (offset: number) => {
            let line = 0;
            let remaining = offset;
            while (line < lines.length - 1 && remaining > lines[line].length) {
                remaining -= lines[line].length + 1;
                line++;
            }
            return new Position(line, remaining);
        },
        uri: { fsPath: '/test/mock.yml' },
        fileName: '/test/mock.yml',
        isUntitled: false,
        languageId: 'yaml',
        version: 1,
        isDirty: false,
        isClosed: false,
        eol: 1,
        save: async () => true,
        validateRange: (range: any) => range,
        validatePosition: (position: any) => position,
        getWordRangeAtPosition: () => undefined,
    } as unknown as TextDocument;
}

// ========================================
// 测试数据生成函数
// ========================================

/**
 * 生成简单的键值对 YAML（浅层嵌套）
 */
function generateSimpleYaml(lineCount: number): string {
    return Array.from({ length: lineCount }, (_, i) => `key${i}: value${i}`).join('\n');
}

/**
 * 生成嵌套结构 YAML
 */
function generateNestedYaml(depth: number, breadth: number): string {
    function generateLevel(currentDepth: number, indent: string): string {
        if (currentDepth >= depth) {
            return `${indent}value: leaf`;
        }

        const children = Array.from({ length: breadth }, (_, i) => {
            return `${indent}child${i}:\n${generateLevel(currentDepth + 1, indent + '  ')}`;
        });

        return children.join('\n');
    }

    return `root:\n${generateLevel(0, '  ')}`;
}

/**
 * 生成带数组的 YAML
 */
function generateArrayYaml(arrayDepth: number, itemsPerArray: number): string {
    let yaml = 'root:\n';
    let indent = '  ';

    for (let d = 0; d < arrayDepth; d++) {
        yaml += `${indent}level${d}:\n`;
        indent += '  ';

        for (let i = 0; i < itemsPerArray; i++) {
            yaml += `${indent}- name: item${d}_${i}\n`;
            yaml += `${indent}  value: ${d * 100 + i}\n`;
        }
    }

    return yaml;
}

/**
 * 生成 CraftEngine 模板风格的 YAML
 *
 * 模板使用 ${param} 格式的参数占位符，定义可复用的配置
 */
function generateTemplateYaml(templateCount: number): string {
    const templates: string[] = [];
    const templateNames = ['model/generated', 'model/handheld', 'model/layered', 'settings/ore', 'sound/wood'];

    for (let i = 0; i < templateCount; i++) {
        const templateName = templateNames[i % templateNames.length];
        const suffix = i >= templateNames.length ? `_${Math.floor(i / templateNames.length)}` : '';
        templates.push(`
  default:${templateName}${suffix}:
    type: minecraft:model
    path: \${model}
    generation:
      parent: minecraft:item/generated
      textures:
        layer0: \${texture}`);
    }

    return `templates#models#2d:${templates.join('')}`;
}

/**
 * 生成 items 配置风格的 YAML
 *
 * 物品使用 template + arguments 模式，或完整的 material/data 配置
 */
function generateItemsYaml(itemCount: number): string {
    const items: string[] = [];
    const itemNames = ['ruby', 'sapphire', 'emerald', 'topaz', 'jade_sword', 'phoenix_staff', 'dragon_blade'];
    const templates = ['default:model/generated', 'default:model/handheld', 'default:model/layered'];

    for (let i = 0; i < itemCount; i++) {
        const itemName = itemNames[i % itemNames.length];
        const suffix = i >= itemNames.length ? `_${Math.floor(i / itemNames.length)}` : '';
        const template = templates[i % templates.length];
        items.push(`
  ${itemName}${suffix}:
    template: ${template}
    arguments:
      model: minecraft:item/${itemName}${suffix}
      texture: minecraft:item/${itemName}${suffix}`);
    }

    return `items:${items.join('')}`;
}

// ========================================
// 预生成测试数据
// ========================================

// 小型文档
const smallSimple = generateSimpleYaml(20);
const smallNested = generateNestedYaml(3, 2);

// 中型文档
const mediumSimple = generateSimpleYaml(100);
const mediumNested = generateNestedYaml(5, 3);
const mediumArray = generateArrayYaml(3, 10);
const mediumTemplates = generateTemplateYaml(10);
const mediumItems = generateItemsYaml(20);

// 大型文档
const largeSimple = generateSimpleYaml(500);
const largeNested = generateNestedYaml(8, 2);
const largeArray = generateArrayYaml(5, 20);
const largeTemplates = generateTemplateYaml(30);
const largeItems = generateItemsYaml(50);

// 超大型文档
const veryLargeSimple = generateSimpleYaml(1000);
const veryLargeItems = generateItemsYaml(100);

// ========================================
// 创建 Mock 文档
// ========================================

const smallSimpleDoc = createMockDocument(smallSimple);
const smallNestedDoc = createMockDocument(smallNested);
const mediumSimpleDoc = createMockDocument(mediumSimple);
const mediumNestedDoc = createMockDocument(mediumNested);
const mediumArrayDoc = createMockDocument(mediumArray);
const mediumTemplatesDoc = createMockDocument(mediumTemplates);
const mediumItemsDoc = createMockDocument(mediumItems);
const largeSimpleDoc = createMockDocument(largeSimple);
const largeNestedDoc = createMockDocument(largeNested);
const largeArrayDoc = createMockDocument(largeArray);
const largeTemplatesDoc = createMockDocument(largeTemplates);
const largeItemsDoc = createMockDocument(largeItems);
const veryLargeSimpleDoc = createMockDocument(veryLargeSimple);
const veryLargeItemsDoc = createMockDocument(veryLargeItems);

// 创建解析器实例
const parser = new YamlPathParser();

describe('YamlPathParser Performance', () => {
    // ========================================
    // 小型文档解析测试
    // ========================================

    describe('Small Documents (<50 lines)', () => {
        bench(
            'parse path in simple YAML (20 lines) - middle',
            () => {
                parser.parsePath(smallSimpleDoc, new Position(10, 5));
            },
            defaultBenchOptions,
        );

        bench(
            'parse path in simple YAML (20 lines) - start',
            () => {
                parser.parsePath(smallSimpleDoc, new Position(0, 5));
            },
            defaultBenchOptions,
        );

        bench(
            'parse path in simple YAML (20 lines) - end',
            () => {
                parser.parsePath(smallSimpleDoc, new Position(19, 5));
            },
            defaultBenchOptions,
        );

        bench(
            'parse path in nested YAML (depth 3) - deep position',
            () => {
                parser.parsePath(smallNestedDoc, new Position(5, 10));
            },
            defaultBenchOptions,
        );
    });

    // ========================================
    // 中型文档解析测试
    // ========================================

    describe('Medium Documents (100-500 lines)', () => {
        bench(
            'parse path in simple YAML (100 lines)',
            () => {
                parser.parsePath(mediumSimpleDoc, new Position(50, 5));
            },
            defaultBenchOptions,
        );

        bench(
            'parse path in nested YAML (depth 5) - shallow',
            () => {
                parser.parsePath(mediumNestedDoc, new Position(2, 5));
            },
            defaultBenchOptions,
        );

        bench(
            'parse path in nested YAML (depth 5) - deep',
            () => {
                parser.parsePath(mediumNestedDoc, new Position(20, 15));
            },
            defaultBenchOptions,
        );

        bench(
            'parse path in array YAML - first item',
            () => {
                parser.parsePath(mediumArrayDoc, new Position(3, 10));
            },
            defaultBenchOptions,
        );

        bench(
            'parse path in array YAML - nested item',
            () => {
                parser.parsePath(mediumArrayDoc, new Position(15, 15));
            },
            defaultBenchOptions,
        );

        bench(
            'parse path in templates YAML (10 templates)',
            () => {
                parser.parsePath(mediumTemplatesDoc, new Position(25, 10));
            },
            defaultBenchOptions,
        );

        bench(
            'parse path in items YAML (20 items)',
            () => {
                parser.parsePath(mediumItemsDoc, new Position(40, 10));
            },
            defaultBenchOptions,
        );
    });

    // ========================================
    // 大型文档解析测试
    // ========================================

    describe('Large Documents (500+ lines)', () => {
        bench(
            'parse path in simple YAML (500 lines) - start',
            () => {
                parser.parsePath(largeSimpleDoc, new Position(10, 5));
            },
            fastBenchOptions,
        );

        bench(
            'parse path in simple YAML (500 lines) - middle',
            () => {
                parser.parsePath(largeSimpleDoc, new Position(250, 5));
            },
            fastBenchOptions,
        );

        bench(
            'parse path in simple YAML (500 lines) - end',
            () => {
                parser.parsePath(largeSimpleDoc, new Position(490, 5));
            },
            fastBenchOptions,
        );

        bench(
            'parse path in nested YAML (depth 8)',
            () => {
                parser.parsePath(largeNestedDoc, new Position(30, 20));
            },
            fastBenchOptions,
        );

        bench(
            'parse path in large array YAML (5 levels, 20 items)',
            () => {
                parser.parsePath(largeArrayDoc, new Position(80, 15));
            },
            fastBenchOptions,
        );

        bench(
            'parse path in templates YAML (30 templates)',
            () => {
                parser.parsePath(largeTemplatesDoc, new Position(100, 15));
            },
            fastBenchOptions,
        );

        bench(
            'parse path in items YAML (50 items)',
            () => {
                parser.parsePath(largeItemsDoc, new Position(150, 15));
            },
            fastBenchOptions,
        );
    });

    // ========================================
    // 超大型文档解析测试
    // ========================================

    describe('Very Large Documents (1000+ lines)', () => {
        bench(
            'parse path in simple YAML (1000 lines) - start',
            () => {
                parser.parsePath(veryLargeSimpleDoc, new Position(10, 5));
            },
            slowBenchOptions,
        );

        bench(
            'parse path in simple YAML (1000 lines) - middle',
            () => {
                parser.parsePath(veryLargeSimpleDoc, new Position(500, 5));
            },
            slowBenchOptions,
        );

        bench(
            'parse path in simple YAML (1000 lines) - end',
            () => {
                parser.parsePath(veryLargeSimpleDoc, new Position(990, 5));
            },
            slowBenchOptions,
        );

        bench(
            'parse path in items YAML (100 items) - deep',
            () => {
                parser.parsePath(veryLargeItemsDoc, new Position(400, 15));
            },
            slowBenchOptions,
        );
    });

    // ========================================
    // 路径深度对比测试
    // ========================================

    describe('Path Depth Comparison', () => {
        const deepNestedYaml = generateNestedYaml(10, 2);
        const deepNestedDoc = createMockDocument(deepNestedYaml);

        bench(
            'parse depth 1 path',
            () => {
                parser.parsePath(deepNestedDoc, new Position(1, 3));
            },
            defaultBenchOptions,
        );

        bench(
            'parse depth 3 path',
            () => {
                parser.parsePath(deepNestedDoc, new Position(5, 7));
            },
            defaultBenchOptions,
        );

        bench(
            'parse depth 5 path',
            () => {
                parser.parsePath(deepNestedDoc, new Position(15, 11));
            },
            defaultBenchOptions,
        );

        bench(
            'parse depth 8 path',
            () => {
                parser.parsePath(deepNestedDoc, new Position(30, 17));
            },
            defaultBenchOptions,
        );
    });

    // ========================================
    // 辅助方法性能测试
    // ========================================

    describe('Helper Methods', () => {
        const testLines = [
            '    template: user-profile',
            '  - name: item1',
            '      parameters:',
            'root:',
            '        deep-key: value',
        ];

        bench(
            'getIndentLevel',
            () => {
                for (const line of testLines) {
                    parser.getIndentLevel(line);
                }
            },
            defaultBenchOptions,
        );

        bench(
            'extractKeyName',
            () => {
                for (const line of testLines) {
                    parser.extractKeyName(line);
                }
            },
            defaultBenchOptions,
        );
    });

    // ========================================
    // 典型使用场景测试
    // ========================================

    describe('Typical Usage Patterns', () => {
        bench(
            'autocomplete scenario - parse then re-parse on edit',
            () => {
                // 模拟用户编辑时的多次解析
                parser.parsePath(mediumItemsDoc, new Position(20, 10));
                parser.parsePath(mediumItemsDoc, new Position(20, 11));
                parser.parsePath(mediumItemsDoc, new Position(20, 12));
            },
            defaultBenchOptions,
        );

        bench(
            'hover scenario - single position parse',
            () => {
                parser.parsePath(mediumTemplatesDoc, new Position(15, 8));
            },
            defaultBenchOptions,
        );

        bench(
            'diagnostic scenario - multiple positions in sequence',
            () => {
                for (let i = 0; i < 10; i++) {
                    parser.parsePath(mediumItemsDoc, new Position(i * 4, 5));
                }
            },
            fastBenchOptions,
        );
    });

    // ========================================
    // 边界情况测试
    // ========================================

    describe('Edge Cases', () => {
        const emptyDoc = createMockDocument('');
        const commentDoc = createMockDocument('# Just a comment\n# Another comment');
        const singleLineDoc = createMockDocument('key: value');

        bench(
            'empty document',
            () => {
                parser.parsePath(emptyDoc, new Position(0, 0));
            },
            defaultBenchOptions,
        );

        bench(
            'comment-only document',
            () => {
                parser.parsePath(commentDoc, new Position(0, 5));
            },
            defaultBenchOptions,
        );

        bench(
            'single line document',
            () => {
                parser.parsePath(singleLineDoc, new Position(0, 3));
            },
            defaultBenchOptions,
        );

        bench(
            'position at column 0',
            () => {
                parser.parsePath(mediumItemsDoc, new Position(20, 0));
            },
            defaultBenchOptions,
        );

        bench(
            'position past line end',
            () => {
                parser.parsePath(mediumItemsDoc, new Position(20, 100));
            },
            defaultBenchOptions,
        );
    });
});
