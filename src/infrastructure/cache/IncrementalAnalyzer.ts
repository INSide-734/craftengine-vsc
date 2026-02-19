/**
 * 增量分析器
 *
 * 只分析文档中变更的部分，提高诊断性能
 */

import { Range, Position, TextDocument, TextDocumentContentChangeEvent, Diagnostic } from 'vscode';
import { ILogger } from '../../core/interfaces/ILogger';
import { IPositionInfo } from '../../core/interfaces/IParsedDocument';

/**
 * 分析范围
 */
export interface IAnalysisScope {
    /** 是否需要完整分析 */
    fullAnalysis: boolean;
    /** 受影响的行范围 */
    affectedLines: Set<number>;
    /** 受影响的 YAML 路径 */
    affectedPaths: string[];
    /** 变更类型 */
    changeType: 'insert' | 'delete' | 'replace' | 'mixed';
}

/**
 * 增量分析器
 *
 * 分析文档变更的影响范围，支持增量诊断更新
 */
export class IncrementalAnalyzer {
    /** 触发完整分析的变更行数阈值 */
    private readonly fullAnalysisThreshold: number;

    /** 触发完整分析的变更字符数阈值 */
    private readonly fullAnalysisCharThreshold: number;

    constructor(
        private readonly logger: ILogger,
        config?: { fullAnalysisLineThreshold?: number; fullAnalysisCharThreshold?: number }
    ) {
        this.fullAnalysisThreshold = config?.fullAnalysisLineThreshold ?? 50;
        this.fullAnalysisCharThreshold = config?.fullAnalysisCharThreshold ?? 1000;
    }

    /**
     * 分析变更影响的范围
     *
     * @param document 文档
     * @param changes 变更事件
     * @returns 分析范围
     */
    analyzeChangeImpact(
        document: TextDocument,
        changes: readonly TextDocumentContentChangeEvent[]
    ): IAnalysisScope {
        const affectedLines = new Set<number>();
        let totalCharsChanged = 0;
        let changeType: 'insert' | 'delete' | 'replace' | 'mixed' = 'replace';
        let hasInsert = false;
        let hasDelete = false;

        let lineCountChanged = false;

        for (const change of changes) {
            // 计算变更的字符数
            totalCharsChanged += Math.max(change.text.length, change.rangeLength);

            // 确定变更类型
            if (change.text.length > 0 && change.rangeLength === 0) {
                hasInsert = true;
            } else if (change.text.length === 0 && change.rangeLength > 0) {
                hasDelete = true;
            }

            // 收集受影响的行
            const startLine = change.range.start.line;
            const endLine = change.range.end.line;
            const newLines = change.text.split('\n').length - 1;

            // 添加变更范围内的所有行
            for (let line = startLine; line <= endLine; line++) {
                affectedLines.add(line);
            }

            // 添加新增的行
            for (let i = 1; i <= newLines; i++) {
                affectedLines.add(startLine + i);
            }

            // 行数变化时直接标记需要全量分析，而非枚举所有后续行
            if (newLines !== (endLine - startLine)) {
                lineCountChanged = true;
            }
        }

        // 确定变更类型
        if (hasInsert && hasDelete) {
            changeType = 'mixed';
        } else if (hasInsert) {
            changeType = 'insert';
        } else if (hasDelete) {
            changeType = 'delete';
        }

        // 行数变化时需要全量分析（后续行的诊断位置需要重新计算）
        const fullAnalysis = lineCountChanged || this.shouldDoFullAnalysis(affectedLines, totalCharsChanged, changes);

        this.logger.debug('Change impact analyzed', {
            affectedLineCount: affectedLines.size,
            totalCharsChanged,
            changeType,
            fullAnalysis
        });

        return {
            fullAnalysis,
            affectedLines,
            affectedPaths: [], // 将在 getAffectedPaths 中填充
            changeType
        };
    }

    /**
     * 判断是否需要完整分析
     */
    private shouldDoFullAnalysis(
        affectedLines: Set<number>,
        totalCharsChanged: number,
        changes: readonly TextDocumentContentChangeEvent[]
    ): boolean {
        // 变更行数超过阈值
        if (affectedLines.size > this.fullAnalysisThreshold) {
            return true;
        }

        // 变更字符数超过阈值
        if (totalCharsChanged > this.fullAnalysisCharThreshold) {
            return true;
        }

        // 检查是否有结构性变更（如缩进变化）
        for (const change of changes) {
            if (this.isStructuralChange(change)) {
                return true;
            }
        }

        return false;
    }

    /**
     * 检查是否是结构性变更
     */
    private isStructuralChange(change: TextDocumentContentChangeEvent): boolean {
        const text = change.text;

        // 包含多个换行符的变更可能是结构性的
        const newLineCount = (text.match(/\n/g) || []).length;
        if (newLineCount > 5) {
            return true;
        }

        // 包含大量缩进变化
        if (/^\s+/.test(text) && text.trim() === '') {
            return true;
        }

        return false;
    }

    /**
     * 获取需要重新验证的路径
     *
     * @param positionMap 位置映射
     * @param changedLines 变更的行
     * @returns 受影响的 YAML 路径
     */
    getAffectedPaths(
        positionMap: Map<string, IPositionInfo>,
        changedLines: Set<number>
    ): string[] {
        const affectedPaths: string[] = [];

        for (const [path, position] of positionMap.entries()) {
            // 检查路径的范围是否与变更行重叠
            const startLine = position.start.line;
            const endLine = position.end.line;

            for (let line = startLine; line <= endLine; line++) {
                if (changedLines.has(line)) {
                    affectedPaths.push(path);
                    break;
                }
            }
        }

        this.logger.debug('Affected paths identified', {
            totalPaths: positionMap.size,
            affectedCount: affectedPaths.length
        });

        return affectedPaths;
    }

    /**
     * 合并增量诊断结果
     *
     * @param existing 现有诊断
     * @param updated 更新的诊断
     * @param affectedRange 受影响的范围
     * @returns 合并后的诊断
     */
    mergeDiagnostics(
        existing: Diagnostic[],
        updated: Diagnostic[],
        affectedRange: Range
    ): Diagnostic[] {
        // 过滤掉受影响范围内的旧诊断
        const retained = existing.filter(d => !this.isInRange(d.range, affectedRange));

        // 添加新诊断
        const merged = [...retained, ...updated];

        // 去重
        return this.deduplicateDiagnostics(merged);
    }

    /**
     * 检查范围是否在指定范围内
     */
    private isInRange(target: Range, container: Range): boolean {
        return target.start.line >= container.start.line &&
               target.end.line <= container.end.line;
    }

    /**
     * 诊断去重
     */
    private deduplicateDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
        const seen = new Set<string>();
        return diagnostics.filter(d => {
            const key = `${d.range.start.line}:${d.range.start.character}:${d.message}:${d.source}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    /**
     * 调整诊断位置
     *
     * 当文档行数变化时，调整现有诊断的位置
     *
     * @param diagnostics 现有诊断
     * @param changeStartLine 变更起始行
     * @param lineDelta 行数变化量（正数表示增加，负数表示减少）
     * @returns 调整后的诊断
     */
    adjustDiagnosticPositions(
        diagnostics: Diagnostic[],
        changeStartLine: number,
        lineDelta: number
    ): Diagnostic[] {
        if (lineDelta === 0) {
            return diagnostics;
        }

        return diagnostics.map(d => {
            // 只调整变更行之后的诊断
            if (d.range.start.line <= changeStartLine) {
                return d;
            }

            // 创建新的范围
            const newStart = new Position(
                d.range.start.line + lineDelta,
                d.range.start.character
            );
            const newEnd = new Position(
                d.range.end.line + lineDelta,
                d.range.end.character
            );

            // 创建新的诊断（保留其他属性）
            const adjusted = new Diagnostic(
                new Range(newStart, newEnd),
                d.message,
                d.severity
            );
            adjusted.source = d.source;
            adjusted.code = d.code;
            adjusted.tags = d.tags;
            adjusted.relatedInformation = d.relatedInformation;

            return adjusted;
        });
    }

    /**
     * 计算行数变化量
     *
     * @param changes 变更事件
     * @returns 行数变化量
     */
    calculateLineDelta(changes: readonly TextDocumentContentChangeEvent[]): number {
        let delta = 0;

        for (const change of changes) {
            const oldLines = change.range.end.line - change.range.start.line;
            const newLines = (change.text.match(/\n/g) || []).length;
            delta += newLines - oldLines;
        }

        return delta;
    }
}
