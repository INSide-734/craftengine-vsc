import type * as vscode from 'vscode';

/**
 * 文档变更追踪信息
 */
export interface IDocumentChangeInfo {
    /** 变更的行范围 */
    changedLines: Set<number>;
    /** 变更时间戳 */
    timestamp: number;
    /** 文档版本 */
    version: number;
}

/**
 * 文档变更追踪器
 *
 * 追踪文档的变更行范围和执行版本，
 * 支持增量诊断更新判断。
 * 从 DocumentDiagnosticHandler 中提取的变更追踪职责。
 */
export class DocumentChangeTracker {
    /** 文档变更追踪 */
    private readonly documentChanges = new Map<string, IDocumentChangeInfo>();

    /** 诊断执行版本追踪（用于取消过时的诊断任务） */
    private readonly executionVersions = new Map<string, number>();

    /**
     * 追踪文档变更事件
     */
    trackChanges(event: vscode.TextDocumentChangeEvent): void {
        const uri = event.document.uri.toString();
        let changeInfo = this.documentChanges.get(uri);

        if (!changeInfo || changeInfo.version !== event.document.version - 1) {
            changeInfo = {
                changedLines: new Set<number>(),
                timestamp: Date.now(),
                version: event.document.version,
            };
        } else {
            changeInfo.version = event.document.version;
            changeInfo.timestamp = Date.now();
        }

        for (const change of event.contentChanges) {
            const startLine = change.range.start.line;
            const endLine = change.range.end.line;

            for (let line = startLine; line <= endLine; line++) {
                changeInfo.changedLines.add(line);
            }

            const newLines = change.text.split('\n').length - 1;
            if (newLines > 0) {
                for (let i = 1; i <= newLines; i++) {
                    changeInfo.changedLines.add(startLine + i);
                }
            }
        }

        this.documentChanges.set(uri, changeInfo);
    }

    /**
     * 获取文档的变更信息
     */
    getChangeInfo(uri: string): IDocumentChangeInfo | undefined {
        return this.documentChanges.get(uri);
    }

    /**
     * 清除文档的变更追踪
     */
    clearChanges(uri: string): void {
        this.documentChanges.delete(uri);
    }

    /**
     * 递增并返回文档的执行版本
     */
    incrementVersion(uri: string): number {
        const current = (this.executionVersions.get(uri) || 0) + 1;
        this.executionVersions.set(uri, current);
        return current;
    }

    /**
     * 检查执行版本是否仍然有效
     */
    isVersionCurrent(uri: string, version: number): boolean {
        return this.executionVersions.get(uri) === version;
    }

    /**
     * 清除文档的执行版本
     */
    clearVersion(uri: string): void {
        this.executionVersions.delete(uri);
    }

    /**
     * 清理所有资源
     */
    dispose(): void {
        this.documentChanges.clear();
        this.executionVersions.clear();
    }
}
