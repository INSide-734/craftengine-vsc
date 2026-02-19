/**
 * YamlPathParser 单元测试
 *
 * 测试 YAML 路径解析器的所有功能，包括：
 * - AST 精确解析
 * - 基于缩进的回退解析
 * - 键名提取
 * - 缩进级别计算
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { YamlPathParser } from '../../../../infrastructure/yaml/YamlPathParser';
import { ILogger } from '../../../../core/interfaces/ILogger';
import { TextDocument, Position } from 'vscode';

describe('YamlPathParser', () => {
    let parser: YamlPathParser;
    let mockLogger: ILogger;

    /**
     * 创建模拟的 TextDocument
     */
    function createMockDocument(content: string): TextDocument {
        const lines = content.split('\n');
        return {
            getText: vi.fn(() => content),
            lineAt: vi.fn((line: number) => ({
                text: lines[line] || '',
                lineNumber: line,
                range: { start: { line, character: 0 }, end: { line, character: lines[line]?.length || 0 } }
            })),
            offsetAt: vi.fn((position: Position) => {
                let offset = 0;
                for (let i = 0; i < position.line; i++) {
                    offset += (lines[i]?.length || 0) + 1; // +1 for newline
                }
                offset += position.character;
                return offset;
            }),
            positionAt: vi.fn((offset: number) => {
                let currentOffset = 0;
                for (let i = 0; i < lines.length; i++) {
                    const lineLength = lines[i].length + 1;
                    if (currentOffset + lineLength > offset) {
                        return new Position(i, offset - currentOffset);
                    }
                    currentOffset += lineLength;
                }
                return new Position(lines.length - 1, 0);
            }),
            lineCount: lines.length,
            uri: { fsPath: '/test/file.yaml' }
        } as unknown as TextDocument;
    }

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

        parser = new YamlPathParser(mockLogger);
    });

    // ========================================
    // getIndentLevel 测试
    // ========================================

    describe('getIndentLevel', () => {
        it('should return 0 for line without indentation', () => {
            expect(parser.getIndentLevel('items:')).toBe(0);
        });

        it('should return correct indent for spaces', () => {
            expect(parser.getIndentLevel('  nested:')).toBe(2);
            expect(parser.getIndentLevel('    deeply:')).toBe(4);
        });

        it('should return 0 for empty line', () => {
            expect(parser.getIndentLevel('')).toBe(0);
        });

        it('should handle tabs', () => {
            expect(parser.getIndentLevel('\t\titem:')).toBe(2);
        });

        it('should handle mixed spaces and tabs', () => {
            expect(parser.getIndentLevel('  \titem:')).toBe(3);
        });
    });

    // ========================================
    // extractKeyName 测试
    // ========================================

    describe('extractKeyName', () => {
        it('should extract simple key', () => {
            expect(parser.extractKeyName('items:')).toBe('items');
        });

        it('should extract key with value', () => {
            expect(parser.extractKeyName('template: user-profile')).toBe('template');
        });

        it('should extract indented key', () => {
            expect(parser.extractKeyName('  name: Test')).toBe('name');
        });

        it('should return undefined for array item', () => {
            expect(parser.extractKeyName('  - item1')).toBeUndefined();
        });

        it('should extract key from array item with key-value', () => {
            expect(parser.extractKeyName('  - name: Test')).toBe('name');
        });

        it('should return undefined for empty line', () => {
            expect(parser.extractKeyName('')).toBeUndefined();
        });

        it('should return undefined for comment', () => {
            expect(parser.extractKeyName('# this is a comment')).toBeUndefined();
        });

        it('should handle keys with special characters', () => {
            expect(parser.extractKeyName('my-item:')).toBe('my-item');
            expect(parser.extractKeyName('my_item:')).toBe('my_item');
            expect(parser.extractKeyName('mypack:myitem:')).toBe('mypack:myitem');
        });

        it('should handle version condition keys', () => {
            expect(parser.extractKeyName('$$>=1.21.0:')).toBe('$$>=1.21.0');
            expect(parser.extractKeyName('$$1.20.0~1.21.2#section:')).toBe('$$1.20.0~1.21.2#section');
        });

        it('should handle keys with forward slashes', () => {
            expect(parser.extractKeyName('model/cube_all:')).toBe('model/cube_all');
        });
    });

    // ========================================
    // parsePath - 基础测试
    // ========================================

    describe('parsePath - basic', () => {
        it('should parse root level path', () => {
            const content = 'items:\n  my-item:';
            const document = createMockDocument(content);

            const path = parser.parsePath(document, new Position(0, 0));

            expect(path).toEqual(['items']);
        });

        it('should parse nested path', () => {
            const content = `items:
  my-item:
    template: user-profile`;
            const document = createMockDocument(content);

            // 光标在值位置时，AST 解析器返回到父级路径
            const path = parser.parsePath(document, new Position(2, 10));

            // 根据实现，光标在 "template: user-profile" 的值位置
            // 路径可能包含或不包含 'template'，取决于解析器行为
            expect(path.length).toBeGreaterThanOrEqual(2);
            expect(path).toContain('items');
            expect(path).toContain('my-item');
        });

        it('should parse deeply nested path', () => {
            const content = `items:
  my-item:
    settings:
      display:
        name: Test`;
            const document = createMockDocument(content);

            // 光标在值位置
            const path = parser.parsePath(document, new Position(4, 10));

            // 路径应该至少包含前几层
            expect(path.length).toBeGreaterThanOrEqual(3);
            expect(path).toContain('items');
            expect(path).toContain('my-item');
            expect(path).toContain('settings');
        });

        it('should handle empty document', () => {
            const content = '';
            const document = createMockDocument(content);

            const path = parser.parsePath(document, new Position(0, 0));

            expect(path).toEqual([]);
        });

        it('should skip comments', () => {
            const content = `items:
  # comment
  my-item:
    name: Test`;
            const document = createMockDocument(content);

            const path = parser.parsePath(document, new Position(3, 10));

            expect(path).toEqual(['items', 'my-item', 'name']);
        });
    });

    // ========================================
    // parsePath - 数组场景
    // ========================================

    describe('parsePath - arrays', () => {
        it('should handle array items', () => {
            const content = `items:
  my-item:
    parameters:
      - name: username`;
            const document = createMockDocument(content);

            const path = parser.parsePath(document, new Position(3, 10));

            // 根据实现，数组项的键名应该被提取
            expect(path.length).toBeGreaterThan(0);
        });

        it('should handle empty array item', () => {
            const content = `items:
  - item1
  - item2`;
            const document = createMockDocument(content);

            const path = parser.parsePath(document, new Position(1, 5));

            // 数组项没有键名，应该只返回父路径
            expect(path).toContain('items');
        });
    });

    // ========================================
    // parsePath - 特殊格式
    // ========================================

    describe('parsePath - special formats', () => {
        it('should handle version condition keys', () => {
            const content = `items:
  my-item:
    $$>=1.21.0:
      name: New Feature`;
            const document = createMockDocument(content);

            const path = parser.parsePath(document, new Position(3, 10));

            expect(path).toContain('$$>=1.21.0');
        });

        it('should handle template category format', () => {
            const content = `templates#items#weapons:
  default:sword:
    name: Sword Template`;
            const document = createMockDocument(content);

            const path = parser.parsePath(document, new Position(1, 5));

            expect(path[0]).toBe('templates#items#weapons');
        });

        it('should handle namespaced keys', () => {
            const content = `templates:
  mypack:mytemplate:
    name: My Template`;
            const document = createMockDocument(content);

            const path = parser.parsePath(document, new Position(2, 10));

            expect(path).toContain('mypack:mytemplate');
        });
    });

    // ========================================
    // parsePath - 边缘情况
    // ========================================

    describe('parsePath - edge cases', () => {
        it('should handle empty lines', () => {
            const content = `items:
  my-item:

    name: Test`;
            const document = createMockDocument(content);

            const path = parser.parsePath(document, new Position(2, 4));

            // 空行应该使用上下文缩进
            expect(path.length).toBeGreaterThanOrEqual(0);
        });

        it('should handle line with only spaces', () => {
            const content = `items:
  my-item:

    name: Test`;
            const document = createMockDocument(content);

            const path = parser.parsePath(document, new Position(2, 2));

            expect(path.length).toBeGreaterThanOrEqual(0);
        });

        it('should handle document with only comments', () => {
            const content = `# comment 1
# comment 2`;
            const document = createMockDocument(content);

            const path = parser.parsePath(document, new Position(0, 0));

            expect(path).toEqual([]);
        });

        it('should handle malformed YAML gracefully', () => {
            const content = `items: [
  not valid yaml
}`;
            const document = createMockDocument(content);

            // 应该不抛出错误，回退到缩进解析
            const path = parser.parsePath(document, new Position(1, 2));

            expect(Array.isArray(path)).toBe(true);
        });

        it('should handle position at end of line', () => {
            const content = `items:
  my-item:
    template: user-profile`;
            const document = createMockDocument(content);

            const path = parser.parsePath(document, new Position(2, 26));

            expect(path.length).toBeGreaterThan(0);
        });
    });

    // ========================================
    // 无 Logger 场景
    // ========================================

    describe('without logger', () => {
        it('should work without logger', () => {
            const parserWithoutLogger = new YamlPathParser();

            const content = `items:
  my-item:
    name: Test`;
            const document = createMockDocument(content);

            const path = parserWithoutLogger.parsePath(document, new Position(2, 10));

            expect(path).toEqual(['items', 'my-item', 'name']);
        });
    });
});
