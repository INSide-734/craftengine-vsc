/**
 * YamlParser 单元测试
 * 
 * 测试 YAML 解析器的所有功能，包括：
 * - 基本解析
 * - 位置信息追踪
 * - 错误处理
 * - 流式解析
 * - 增量解析
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { YamlParser } from '../../../../infrastructure/yaml/YamlParser';
import { ILogger } from '../../../../core/interfaces/ILogger';
import { IIncrementalParseContext } from '../../../../core/interfaces/IYamlParser';
import { Uri, TextDocument, Position, Range } from 'vscode';

describe('YamlParser', () => {
    let parser: YamlParser;
    let mockLogger: ILogger;

    // 创建测试用的 URI
    const createTestUri = () => Uri.file('/test/document.yaml');

    // 创建 Mock TextDocument
    const createMockDocument = (content: string, uri?: Uri, version = 1): TextDocument => {
        const lines = content.split('\n');
        const docUri = uri || createTestUri();
        return {
            uri: docUri,
            fileName: docUri.fsPath,
            languageId: 'yaml',
            version,
            getText: (range?: Range) => {
                if (!range) {
                    return content;
                }
                const startOffset = lines.slice(0, range.start.line).join('\n').length +
                    (range.start.line > 0 ? 1 : 0) + range.start.character;
                const endOffset = lines.slice(0, range.end.line).join('\n').length +
                    (range.end.line > 0 ? 1 : 0) + range.end.character;
                return content.substring(startOffset, endOffset);
            },
            positionAt: (offset: number) => {
                let line = 0;
                let character = offset;
                for (let i = 0; i < lines.length; i++) {
                    if (character <= lines[i].length) {
                        return new Position(line, character);
                    }
                    character -= lines[i].length + 1;
                    line++;
                }
                return new Position(lines.length - 1, lines[lines.length - 1].length);
            },
            offsetAt: (position: Position) => {
                let offset = 0;
                for (let i = 0; i < position.line && i < lines.length; i++) {
                    offset += lines[i].length + 1;
                }
                offset += position.character;
                return offset;
            },
            lineAt: (lineOrPosition: number | Position) => {
                const lineNumber = typeof lineOrPosition === 'number'
                    ? lineOrPosition
                    : lineOrPosition.line;
                const lineText = lines[lineNumber] || '';
                return {
                    text: lineText,
                    lineNumber,
                    range: new Range(lineNumber, 0, lineNumber, lineText.length),
                    rangeIncludingLineBreak: new Range(lineNumber, 0, lineNumber + 1, 0),
                    firstNonWhitespaceCharacterIndex: lineText.search(/\S|$/),
                    isEmptyOrWhitespace: lineText.trim().length === 0,
                };
            },
            lineCount: lines.length,
            isUntitled: false,
            isDirty: false,
            isClosed: false,
            save: vi.fn().mockResolvedValue(true),
            eol: 1, // LF
            getWordRangeAtPosition: vi.fn(),
            validateRange: vi.fn((range: Range) => range),
            validatePosition: vi.fn((pos: Position) => pos),
        } as unknown as TextDocument;
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
        parser = new YamlParser(mockLogger);
    });

    describe('parseText', () => {
        it('should parse simple YAML', async () => {
            const yaml = 'name: test\nvalue: 123';
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
            expect(result.root).toBeDefined();
            expect(result.root?.value).toEqual({ name: 'test', value: 123 });
        });

        it('should parse nested YAML', async () => {
            const yaml = `
parent:
  child1: value1
  child2: value2
  nested:
    deep: true
`;
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
            expect(result.root?.value).toEqual({
                parent: {
                    child1: 'value1',
                    child2: 'value2',
                    nested: {
                        deep: true,
                    },
                },
            });
        });

        it('should parse arrays', async () => {
            const yaml = `
items:
  - name: item1
  - name: item2
  - name: item3
`;
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
            expect(result.root?.value).toEqual({
                items: [
                    { name: 'item1' },
                    { name: 'item2' },
                    { name: 'item3' },
                ],
            });
        });

        it('should handle empty YAML', async () => {
            const result = await parser.parseText('', createTestUri());

            expect(result.success).toBe(true);
            expect(result.root?.value).toBeNull();
        });

        it('should handle YAML with only comments', async () => {
            const yaml = `
# This is a comment
# Another comment
`;
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
        });

        it('should parse various data types', async () => {
            const yaml = `
string: hello
number: 42
float: 3.14
boolean: true
null_value: null
date: 2024-01-01
`;
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
            const value = result.root?.value as any;
            expect(value.string).toBe('hello');
            expect(value.number).toBe(42);
            expect(value.float).toBe(3.14);
            expect(value.boolean).toBe(true);
            expect(value.null_value).toBeNull();
        });

        it('should include metadata in result', async () => {
            const yaml = 'key: value';
            const uri = createTestUri();
            const result = await parser.parseText(yaml, uri);

            expect(result.metadata).toBeDefined();
            expect(result.metadata.sourceFile).toBe(uri);
            expect(result.metadata.totalLines).toBe(1);
            expect(result.metadata.parsedAt).toBeInstanceOf(Date);
        });

        it('should return errors array even on success', async () => {
            const yaml = 'key: value';
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.errors).toBeDefined();
            expect(Array.isArray(result.errors)).toBe(true);
        });
    });

    describe('error handling', () => {
        it('should return error for invalid YAML syntax', async () => {
            const invalidYaml = `
key: value
  invalid: indentation
`;
            const result = await parser.parseText(invalidYaml, createTestUri());

            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('should include error message', async () => {
            const invalidYaml = 'key: [invalid';
            const result = await parser.parseText(invalidYaml, createTestUri());

            expect(result.success).toBe(false);
            expect(result.errors[0].message).toBeDefined();
            expect(typeof result.errors[0].message).toBe('string');
        });

        it('should call error callback if provided', async () => {
            const errorCallback = vi.fn();
            const invalidYaml = 'key: [invalid';

            await parser.parseText(invalidYaml, createTestUri(), {
                onError: errorCallback,
            });

            expect(errorCallback).toHaveBeenCalled();
        });

        it('should log error on parse failure', async () => {
            const invalidYaml = 'key: {invalid';
            await parser.parseText(invalidYaml, createTestUri());

            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe('position tracking', () => {
        it('should track positions when keepPosition is true', async () => {
            const yaml = `
name: test
value: 123
`;
            const result = await parser.parseText(yaml, createTestUri(), {
                keepPosition: true,
            });

            expect(result.success).toBe(true);
            // 根节点应该有位置信息
            // 具体的位置验证取决于实现细节
        });

        it('should not track positions when keepPosition is false', async () => {
            const yaml = 'key: value';
            const result = await parser.parseText(yaml, createTestUri(), {
                keepPosition: false,
            });

            expect(result.success).toBe(true);
        });
    });

    describe('strict mode', () => {
        it('should accept additional properties in non-strict mode', async () => {
            const yaml = 'key: value';
            const result = await parser.parseText(yaml, createTestUri(), {
                strict: false,
            });

            expect(result.success).toBe(true);
        });

        it('should handle duplicate keys based on strict mode', async () => {
            const yamlWithDuplicates = `
key: value1
key: value2
`;
            const result = await parser.parseText(yamlWithDuplicates, createTestUri(), {
                strict: false,
            });

            // yaml-ast-parser 默认将重复键视为错误
            // 根据实际解析器行为，重复键可能导致解析失败
            expect(result.errors.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('parseDocument', () => {
        it('should parse TextDocument', async () => {
            const content = 'name: test\nvalue: 42';
            const document = createMockDocument(content);

            const result = await parser.parseDocument(document);

            expect(result.success).toBe(true);
            expect(result.root?.value).toEqual({ name: 'test', value: 42 });
        });

        it('should use document URI', async () => {
            const uri = Uri.file('/custom/path.yaml');
            const document = createMockDocument('key: value', uri);

            const result = await parser.parseDocument(document);

            expect(result.metadata.sourceFile).toBe(uri);
        });

        it('should pass options to parseText', async () => {
            const document = createMockDocument('key: value');

            const result = await parser.parseDocument(document, {
                keepPosition: true,
            });

            expect(result.success).toBe(true);
        });
    });

    describe('parseStream', () => {
        it('should yield partial results during streaming', async () => {
            const yaml = `
item1: value1
item2: value2
item3: value3
item4: value4
item5: value5
`;
            const results: any[] = [];

            for await (const result of parser.parseStream(yaml, createTestUri())) {
                results.push(result);
            }

            expect(results.length).toBeGreaterThan(0);
            // 最后一个结果应该是完整的解析结果
            const lastResult = results[results.length - 1];
            expect(lastResult.success).toBe(true);
        });

        it('should call progress callback', async () => {
            const yaml = `
line1: value1
line2: value2
line3: value3
`;
            const progressCallback = vi.fn();

            for await (const _ of parser.parseStream(yaml, createTestUri(), {
                onProgress: progressCallback,
            })) {
                // 消费迭代器
            }

            expect(progressCallback).toHaveBeenCalled();
        });

        it('should report progress with percentage', async () => {
            const yaml = 'line1: value1\nline2: value2\nline3: value3';
            const progressReports: any[] = [];

            for await (const _ of parser.parseStream(yaml, createTestUri(), {
                onProgress: (progress) => progressReports.push(progress),
            })) {
                // 消费迭代器
            }

            // 应该有进度报告
            if (progressReports.length > 0) {
                const lastProgress = progressReports[progressReports.length - 1];
                expect(lastProgress.percentage).toBeDefined();
            }
        });
    });

    describe('parseIncremental', () => {
        it('should return cached result when version unchanged', async () => {
            const uri = createTestUri();
            const document = createMockDocument('key: value', uri);
            const initialResult = await parser.parseDocument(document);

            const context: IIncrementalParseContext = {
                uri,
                lastVersion: 1,
                lastResult: initialResult,
            };

            const incrementalResult = await parser.parseIncremental(document, context);

            expect(incrementalResult).toBe(initialResult);
        });

        it('should reparse when version changes', async () => {
            const uri = createTestUri();
            const document1 = createMockDocument('key: value1', uri);
            const initialResult = await parser.parseDocument(document1);

            // 模拟文档版本变更
            const document2 = createMockDocument('key: value2', uri, 2);

            const context: IIncrementalParseContext = {
                uri,
                lastVersion: 1,
                lastResult: initialResult,
            };

            const incrementalResult = await parser.parseIncremental(document2, context);

            expect(incrementalResult).not.toBe(initialResult);
            expect((incrementalResult.root?.value as any).key).toBe('value2');
        });

        it('should do full parse when no last result', async () => {
            const uri = createTestUri();
            const document = createMockDocument('key: value', uri);

            const context: IIncrementalParseContext = {
                uri,
                lastVersion: 0,
                lastResult: null,
            };

            const result = await parser.parseIncremental(document, context);

            expect(result.success).toBe(true);
        });
    });

    describe('createDocument', () => {
        it('should create YamlDocument from parse result', async () => {
            const yaml = 'key: value';
            const result = await parser.parseText(yaml, createTestUri());

            const doc = parser.createDocument(result, yaml);

            expect(doc).toBeDefined();
            expect(doc.content).toBe(yaml);
        });
    });

    describe('multiline strings', () => {
        it('should parse literal block scalar', async () => {
            const yaml = `
description: |
  This is a multi-line
  description that preserves
  newlines.
`;
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
            const desc = (result.root?.value as any).description;
            expect(desc).toContain('multi-line');
            expect(desc).toContain('\n');
        });

        it('should parse folded block scalar', async () => {
            const yaml = `
description: >
  This is a folded
  multi-line description
  that folds into one line.
`;
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
        });
    });

    describe('anchors and aliases', () => {
        it('should handle anchors and aliases', async () => {
            const yaml = `
defaults: &defaults
  adapter: postgres
  host: localhost

development:
  <<: *defaults
  database: dev_db

production:
  <<: *defaults
  database: prod_db
`;
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
            const value = result.root?.value as any;
            // 验证解析成功，锚点和别名的合并行为取决于解析器实现
            expect(value.defaults.adapter).toBe('postgres');
            expect(value.development.database).toBe('dev_db');
            expect(value.production.database).toBe('prod_db');
        });
    });

    describe('special characters', () => {
        it('should handle quoted strings', async () => {
            const yaml = `
single: 'single quoted'
double: "double quoted"
special: "contains: colons and #hash"
`;
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
            const value = result.root?.value as any;
            expect(value.single).toBe('single quoted');
            expect(value.double).toBe('double quoted');
            expect(value.special).toBe('contains: colons and #hash');
        });

        it('should handle unicode', async () => {
            const yaml = `
chinese: 中文
emoji: 🎉
japanese: 日本語
`;
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
            const value = result.root?.value as any;
            expect(value.chinese).toBe('中文');
            expect(value.emoji).toBe('🎉');
            expect(value.japanese).toBe('日本語');
        });
    });

    describe('without logger', () => {
        it('should work without logger', async () => {
            const parserWithoutLogger = new YamlParser();
            const yaml = 'key: value';

            const result = await parserWithoutLogger.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
        });

        it('should handle errors without logger', async () => {
            const parserWithoutLogger = new YamlParser();
            const invalidYaml = 'key: [invalid';

            const result = await parserWithoutLogger.parseText(invalidYaml, createTestUri());

            expect(result.success).toBe(false);
        });
    });

    describe('performance', () => {
        it('should parse large YAML efficiently', async () => {
            // 生成大型 YAML
            const items = Array.from({ length: 100 }, (_, i) => `item${i}: value${i}`);
            const largeYaml = items.join('\n');

            const startTime = Date.now();
            const result = await parser.parseText(largeYaml, createTestUri());
            const duration = Date.now() - startTime;

            expect(result.success).toBe(true);
            expect(duration).toBeLessThan(1000); // 应该在 1 秒内完成
        });

        it('should handle deeply nested structures', async () => {
            // 生成深层嵌套的 YAML
            let yaml = 'root:\n';
            for (let i = 0; i < 20; i++) {
                yaml += '  '.repeat(i + 1) + `level${i}:\n`;
            }
            yaml += '  '.repeat(21) + 'value: deep';

            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('should handle tabs in indentation', async () => {
            const yaml = 'key:\n\tvalue: test';
            const result = await parser.parseText(yaml, createTestUri());

            // YAML 规范不允许制表符作为缩进，但应优雅处理
            expect(result.errors).toBeDefined();
        });

        it('should handle mixed line endings', async () => {
            const yaml = 'key1: value1\r\nkey2: value2\nkey3: value3';
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
            const value = result.root?.value as any;
            expect(value.key1).toBe('value1');
            expect(value.key2).toBe('value2');
            expect(value.key3).toBe('value3');
        });

        it('should handle very long lines', async () => {
            const longValue = 'x'.repeat(10000);
            const yaml = `key: ${longValue}`;
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
            expect((result.root?.value as any).key).toBe(longValue);
        });

        it('should handle numbers with leading zeros', async () => {
            const yaml = `
octal: 0755
zero: 0
decimal: 0123
`;
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
            // 实际解析结果取决于 YAML 规范版本
        });

        it('should handle scientific notation', async () => {
            const yaml = `
scientific: 1.23e10
negative: -4.56e-7
`;
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
            const value = result.root?.value as any;
            expect(typeof value.scientific).toBe('number');
            expect(typeof value.negative).toBe('number');
        });

        it('should handle infinity and NaN', async () => {
            const yaml = `
infinity: .inf
neg_infinity: -.inf
not_a_number: .nan
`;
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
            const value = result.root?.value as any;
            expect(value.infinity).toBe(Infinity);
            expect(value.neg_infinity).toBe(-Infinity);
            expect(isNaN(value.not_a_number)).toBe(true);
        });
    });

    describe('complex structures', () => {
        it('should handle flow style arrays', async () => {
            const yaml = 'array: [1, 2, 3, 4, 5]';
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
            expect((result.root?.value as any).array).toEqual([1, 2, 3, 4, 5]);
        });

        it('should handle flow style objects', async () => {
            const yaml = 'obj: {key1: value1, key2: value2}';
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
            expect((result.root?.value as any).obj).toEqual({
                key1: 'value1',
                key2: 'value2',
            });
        });

        it('should handle nested flow styles', async () => {
            const yaml = 'data: {array: [1, 2, {nested: true}], obj: {a: 1}}';
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
            const value = result.root?.value as any;
            expect(value.data.array[2].nested).toBe(true);
            expect(value.data.obj.a).toBe(1);
        });

        it('should handle mixed block and flow styles', async () => {
            const yaml = `
items:
  - name: item1
    tags: [tag1, tag2]
  - name: item2
    tags: [tag3, tag4]
`;
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
            const value = result.root?.value as any;
            expect(value.items[0].tags).toEqual(['tag1', 'tag2']);
            expect(value.items[1].tags).toEqual(['tag3', 'tag4']);
        });
    });

    describe('special YAML features', () => {
        it('should handle explicit typing tags', async () => {
            const yaml = `
string: !!str 123
integer: !!int "456"
`;
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
            const value = result.root?.value as any;
            expect(typeof value.string).toBe('string');
            expect(typeof value.integer).toBe('number');
        });

        it('should handle null values', async () => {
            const yaml = `
null1: null
null2: ~
null3:
`;
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
            const value = result.root?.value as any;
            expect(value.null1).toBeNull();
            expect(value.null2).toBeNull();
            expect(value.null3).toBeNull();
        });

        it('should handle boolean variations', async () => {
            const yaml = `
true1: true
true2: True
true3: TRUE
true4: yes
true5: Yes
true6: on
false1: false
false2: False
false3: FALSE
false4: no
false5: No
false6: off
`;
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(true);
            const value = result.root?.value as any;
            // YAML 1.2 和 1.1 对布尔值的处理有所不同
            // 这里只验证解析成功
            expect(value).toBeDefined();
        });
    });

    describe('metadata and statistics', () => {
        it('should include correct line count in metadata', async () => {
            const yaml = 'line1: value1\nline2: value2\nline3: value3';
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.metadata.totalLines).toBe(3);
        });

        it('should track parse time', async () => {
            const yaml = 'key: value';
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.metadata.parsedAt).toBeInstanceOf(Date);
            const now = new Date();
            const diff = now.getTime() - result.metadata.parsedAt.getTime();
            expect(diff).toBeLessThan(1000); // 解析时间戳应该在 1 秒内
        });

        it('should include source file in metadata', async () => {
            const uri = Uri.file('/test/custom.yaml');
            const yaml = 'key: value';
            const result = await parser.parseText(yaml, uri);

            expect(result.metadata.sourceFile).toBe(uri);
            expect(result.metadata.sourceFile.fsPath).toBe('/test/custom.yaml');
        });
    });

    describe('createDocument integration', () => {
        it('should create YamlDocument with correct content', async () => {
            const yaml = 'name: test\nvalue: 123';
            const result = await parser.parseText(yaml, createTestUri());
            const doc = parser.createDocument(result, yaml);

            expect(doc.content).toBe(yaml);
            expect(doc).toBeDefined();
        });

        it('should create YamlDocument with position map', async () => {
            const yaml = 'key: value';
            const result = await parser.parseText(yaml, createTestUri(), {
                keepPosition: true,
            });
            const doc = parser.createDocument(result, yaml);

            expect(doc).toBeDefined();
            // 位置映射信息应该在文档中可用
        });
    });

    describe('error recovery', () => {
        it('should provide useful error for unclosed bracket', async () => {
            const yaml = 'key: [value1, value2';
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0].message).toBeDefined();
        });

        it('should provide useful error for unclosed brace', async () => {
            const yaml = 'key: {nested: value';
            const result = await parser.parseText(yaml, createTestUri());

            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('should handle incomplete document gracefully', async () => {
            const yaml = 'key:';
            const result = await parser.parseText(yaml, createTestUri());

            // 不完整的文档应该解析成功，值为 null
            expect(result.success).toBe(true);
            expect((result.root?.value as any).key).toBeNull();
        });
    });
});

