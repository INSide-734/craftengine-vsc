import { TextDocument, Range } from 'vscode';
import { ILogger } from '../../../core/interfaces/ILogger';
import { IValidationError } from '../../../infrastructure/schema/SchemaValidator';
import { IPositionInfo } from '../../../core/interfaces/IParsedDocument';

/**
 * Schema 错误位置解析器
 *
 * 负责将 Schema 验证错误的路径映射到文档中的精确位置，
 * 包括模糊匹配、路径修复和范围精细化。
 */
export class SchemaPositionResolver {
    constructor(private readonly logger: ILogger) {}

    /**
     * 获取错误范围
     *
     * 根据错误类型返回更精确的范围
     */
    getErrorRange(
        error: IValidationError,
        document: TextDocument,
        positionMap?: Map<string, IPositionInfo>
    ): Range {
        if (error.path && positionMap) {
            let normalizedPath = error.path
                .replace(/^\//, '')
                .replace(/\//g, '.');

            normalizedPath = this.fixVersionNumbersInPath(normalizedPath);

            this.logger.debug('Finding position for error', {
                originalPath: error.path,
                normalizedPath,
                errorCode: error.code,
                availablePaths: Array.from(positionMap.keys()).slice(0, 10)
            });

            // 直接查找
            let position = positionMap.get(normalizedPath);
            if (position) {
                return this.refineErrorRange(error, position, document);
            }

            // 模糊匹配
            position = this.findFuzzyPosition(normalizedPath, positionMap);
            if (position) {
                return this.refineErrorRange(error, position, document);
            }

            // 查找父路径
            const pathParts = normalizedPath.split('.');
            while (pathParts.length > 0) {
                const parentPath = pathParts.join('.');
                position = positionMap.get(parentPath);
                if (position) {
                    return this.refineErrorRange(error, position, document);
                }
                pathParts.pop();
            }

            this.logger.warn('No position found for error path', {
                path: error.path,
                normalizedPath,
                message: error.message
            });
        }

        return new Range(0, 0, 0, 1);
    }

    /**
     * 模糊查找位置
     */
    private findFuzzyPosition(
        targetPath: string,
        positionMap: Map<string, IPositionInfo>
    ): IPositionInfo | undefined {
        const pathParts = targetPath.split('.');

        for (const [key, value] of positionMap.entries()) {
            const keyParts = key.split('.');
            if (keyParts.length !== pathParts.length) {
                continue;
            }

            let matches = true;
            for (let i = 0; i < pathParts.length; i++) {
                if (/[$#:~>=<]/.test(pathParts[i])) {
                    if (!keyParts[i].includes(pathParts[i]) && !pathParts[i].includes(keyParts[i])) {
                        matches = false;
                        break;
                    }
                } else if (pathParts[i] !== keyParts[i]) {
                    matches = false;
                    break;
                }
            }

            if (matches) {
                return value;
            }
        }

        return undefined;
    }

    /**
     * 修复路径中被错误格式化的版本号
     */
    private fixVersionNumbersInPath(path: string): string {
        return path.replace(/(\$\$|>=|<=|<|=|~)0*(\d+)\.0*(\d+)\.0*(\d+)/g, '$1$2.$3.$4');
    }

    /**
     * 精细化错误范围
     */
    private refineErrorRange(
        error: IValidationError,
        position: IPositionInfo,
        document: TextDocument
    ): Range {
        switch (error.code) {
            case 'required':
            case 'additionalProperties':
                if (position.keyRange) {
                    return position.keyRange;
                }
                return this.getFirstLineRange(position.range, document);

            case 'type':
            case 'enum':
            case 'pattern':
            case 'format':
            case 'minLength':
            case 'maxLength':
            case 'minimum':
            case 'maximum':
                return this.getValueRange(position.range, document);

            default:
                return this.getFirstLineRange(position.range, document);
        }
    }

    /**
     * 获取范围的第一行
     */
    private getFirstLineRange(range: Range, document: TextDocument): Range {
        if (range.start.line === range.end.line) {
            return range;
        }
        const firstLine = document.lineAt(range.start.line);
        return new Range(range.start, firstLine.range.end);
    }

    /**
     * 获取值的范围
     */
    private getValueRange(range: Range, document: TextDocument): Range {
        const startLine = document.lineAt(range.start.line);
        const text = startLine.text.substring(range.start.character);
        const trimmed = text.trim();

        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            const startChar = text.indexOf(trimmed[0]) + range.start.character;
            return new Range(range.start.line, startChar, range.start.line, startChar + 1);
        }

        if (trimmed === '' || text.includes(':')) {
            const colonIndex = text.indexOf(':');
            if (colonIndex !== -1) {
                return new Range(
                    range.start.line,
                    range.start.character + colonIndex,
                    range.start.line,
                    range.start.character + colonIndex + 1
                );
            }
            return this.getFirstLineRange(range, document);
        }

        return this.getFirstLineRange(range, document);
    }
}