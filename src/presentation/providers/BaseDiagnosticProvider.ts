import {
    type TextDocument,
    type DiagnosticCollection,
    Diagnostic,
    type Range,
    type Uri,
    type Disposable,
    DiagnosticRelatedInformation,
    Location,
    languages,
} from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { type ILogger } from '../../core/interfaces/ILogger';
import { type IConfiguration } from '../../core/interfaces/IConfiguration';
import { type IPerformanceMonitor } from '../../core/interfaces/IPerformanceMonitor';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { DiagnosticSeverityConfig } from '../../infrastructure/config/DiagnosticSeverityConfig';
import { calculateSimilarity } from '../../infrastructure/utils';

/**
 * 诊断代码信息
 */
interface DiagnosticCodeInfo {
    /** 诊断代码 */
    code: string;
}

/**
 * 诊断提供者基类
 *
 * 封装所有诊断提供者的公共逻辑：
 * - 语言检查（仅处理 YAML）
 * - 启用状态检查（全局 + 独立配置开关）
 * - 性能计时
 * - 异常捕获与日志
 * - 诊断集合生命周期管理
 * - 严重程度配置
 * - 相似度建议生成
 * - 事件订阅生命周期管理
 */
export abstract class BaseDiagnosticProvider implements Disposable {
    protected readonly diagnosticCollection: DiagnosticCollection;
    protected readonly logger: ILogger;
    protected readonly configuration: IConfiguration;
    protected readonly performanceMonitor: IPerformanceMonitor;
    protected readonly severityConfig: DiagnosticSeverityConfig;

    /** 事件订阅句柄，dispose() 时自动清理 */
    protected readonly subscriptions: Array<{ unsubscribe: () => void }> = [];

    /** 配置 onChange 回调清理函数，dispose() 时自动调用 */
    protected readonly disposeFns: Array<() => void> = [];

    /**
     * @param collectionName 诊断集合名称（如 'craftengine-category'）
     * @param diagnosticSource 诊断源标识（如 'CraftEngine Category'）
     * @param timerName 性能计时器名称（如 'category-diagnostics.update'）
     * @param loggerName 日志子组件名称（如 'CategoryDiagnosticProvider'）
     * @param configKey 独立配置开关键（如 'craftengine.diagnostics.schemaValidation'），为空时仅检查全局开关
     */
    constructor(
        collectionName: string,
        protected readonly diagnosticSource: string,
        protected readonly timerName: string,
        loggerName: string,
        protected readonly configKey?: string,
    ) {
        this.diagnosticCollection = languages.createDiagnosticCollection(collectionName);
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild(loggerName);
        this.configuration = ServiceContainer.getService<IConfiguration>(SERVICE_TOKENS.Configuration);
        this.performanceMonitor = ServiceContainer.getService<IPerformanceMonitor>(SERVICE_TOKENS.PerformanceMonitor);
        this.severityConfig = new DiagnosticSeverityConfig();
    }

    /**
     * 更新文档的诊断信息（模板方法）
     *
     * 执行顺序：启用检查 → 语言检查 → 子类诊断逻辑 → 设置诊断 → 日志
     *
     * @param document 要验证的文档
     * @param parsedDoc 预解析的文档（可选）
     */
    async updateDiagnostics(document: TextDocument, parsedDoc?: unknown): Promise<void> {
        const timer = this.performanceMonitor.startTimer(this.timerName);

        try {
            // 检查全局功能是否启用
            if (!this.configuration.get('diagnostics.enabled', true)) {
                return;
            }

            // 检查独立配置开关
            if (this.configKey && !this.configuration.get(this.configKey, true)) {
                this.logger.debug(`${this.diagnosticSource} is disabled by config`);
                return;
            }

            // 只处理 YAML 文件
            if (document.languageId !== 'yaml') {
                return;
            }

            const diagnostics = await this.doUpdateDiagnostics(document, parsedDoc);
            this.diagnosticCollection.set(document.uri, diagnostics);

            this.logger.debug('Diagnostics updated', {
                file: document.fileName,
                diagnosticCount: diagnostics.length,
            });
        } catch (error) {
            this.logger.error('Error updating diagnostics', error as Error, {
                file: document.fileName,
            });
        } finally {
            timer.stop({ document: document.fileName });
        }
    }

    /**
     * 子类实现具体的诊断逻辑
     *
     * @param document 要验证的文档
     * @param parsedDoc 预解析的文档（可选）
     * @returns 诊断结果数组
     */
    protected abstract doUpdateDiagnostics(document: TextDocument, parsedDoc?: unknown): Promise<Diagnostic[]>;

    /**
     * 清除文档的诊断信息
     */
    clearDiagnostics(uri: Uri): void {
        this.diagnosticCollection.delete(uri);
    }

    /**
     * 释放资源
     *
     * 自动清理事件订阅和诊断集合。子类应调用 super.dispose()。
     */
    dispose(): void {
        for (const sub of this.subscriptions) {
            sub.unsubscribe();
        }
        this.subscriptions.length = 0;

        for (const fn of this.disposeFns) {
            fn();
        }
        this.disposeFns.length = 0;

        this.diagnosticCollection.dispose();
    }

    /**
     * 创建带严重程度配置的诊断对象
     *
     * 如果用户配置为忽略该诊断代码，返回 null
     *
     * @param range 诊断范围
     * @param message 诊断消息
     * @param codeInfo 诊断代码信息（含 code 和 href）
     * @param relatedInfo 关联信息（可选）
     * @returns 诊断对象，或 null（被用户配置忽略时）
     */
    protected createDiagnostic(
        range: Range,
        message: string,
        codeInfo: DiagnosticCodeInfo,
        relatedInfo?: DiagnosticRelatedInformation[],
    ): Diagnostic | null {
        const severity = this.severityConfig.getSeverity(codeInfo.code);
        if (severity === null) {
            return null;
        }

        const diagnostic = new Diagnostic(range, message, severity);
        diagnostic.source = this.diagnosticSource;
        diagnostic.code = codeInfo.code;
        if (relatedInfo) {
            diagnostic.relatedInformation = relatedInfo;
        }
        return diagnostic;
    }

    /**
     * 生成相似名称建议列表
     *
     * @param target 目标名称
     * @param candidates 候选名称列表
     * @param document 文档
     * @param range 诊断范围
     * @param messagePrefix 建议消息前缀（如 'Did you mean category:'）
     * @param threshold 相似度阈值（默认 0.5）
     * @param maxResults 最大结果数（默认 3）
     */
    protected createSimilaritySuggestions(
        target: string,
        candidates: string[],
        document: TextDocument,
        range: Range,
        messagePrefix: string,
        threshold = 0.5,
        maxResults = 3,
    ): DiagnosticRelatedInformation[] {
        const similar = candidates
            .map((name) => ({
                name,
                score: calculateSimilarity(target.toLowerCase(), name.toLowerCase()),
            }))
            .filter((item) => item.score > threshold)
            .sort((a, b) => b.score - a.score)
            .slice(0, maxResults);

        return similar.map(
            (item) =>
                new DiagnosticRelatedInformation(new Location(document.uri, range), `${messagePrefix} ${item.name}?`),
        );
    }
}
