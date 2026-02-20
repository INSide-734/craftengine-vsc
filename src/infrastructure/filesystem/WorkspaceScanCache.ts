import { type IYamlScanner, type IYamlScanResult, type IYamlScanOptions } from '../../core/interfaces/IYamlScanner';
import { type ILogger } from '../../core/interfaces/ILogger';

/**
 * 工作区扫描缓存服务
 *
 * 缓存工作区扫描结果，避免多个服务重复扫描
 *
 * 优化特点：
 * - 使用更长的缓存 TTL（5分钟）
 * - 扫描锁定机制，防止并发扫描
 * - 支持等待队列，多个请求共享同一次扫描结果
 */
export class WorkspaceScanCache {
    private cachedResult: IYamlScanResult | null = null;
    private scanPromise: Promise<IYamlScanResult> | null = null;
    private lastScanTime: number = 0;
    private readonly cacheTTL = 300000; // 缓存有效期 5 分钟（原来是 60 秒）
    private scanRequestCount: number = 0; // 跟踪扫描请求次数
    private cacheHits: number = 0; // 缓存命中次数

    constructor(
        private readonly yamlScanner: IYamlScanner,
        private readonly logger: ILogger,
    ) {}

    /**
     * 获取工作区扫描结果（使用缓存）
     *
     * 如果缓存有效则直接返回缓存结果，否则执行新扫描。
     * 多个并发请求会共享同一次扫描结果，避免重复扫描。
     */
    async getScanResult(options: IYamlScanOptions = {}): Promise<IYamlScanResult> {
        this.scanRequestCount++;
        const requestId = this.scanRequestCount;
        const now = Date.now();

        // 如果缓存有效，直接返回
        if (this.cachedResult && now - this.lastScanTime < this.cacheTTL) {
            this.cacheHits++;
            this.logger.debug('Using cached workspace scan result', {
                requestId,
                cacheAge: now - this.lastScanTime,
                documentsCount: this.cachedResult.documents.length,
                cacheHitRate: `${((this.cacheHits / this.scanRequestCount) * 100).toFixed(1)}%`,
            });
            return this.cachedResult;
        }

        // 如果正在扫描，等待现有扫描完成（共享扫描结果）
        if (this.scanPromise) {
            this.logger.debug('Waiting for existing scan to complete (request queued)', {
                requestId,
            });
            const result = await this.scanPromise;
            this.cacheHits++; // 共享的扫描结果也算缓存命中
            return result;
        }

        // 执行新扫描
        this.logger.debug('Starting new workspace scan', { requestId });
        return this.performScan(options);
    }

    /**
     * 强制刷新扫描结果
     */
    async refresh(options: IYamlScanOptions = {}): Promise<IYamlScanResult> {
        this.invalidate();
        return this.performScan(options);
    }

    /**
     * 使缓存失效
     */
    invalidate(): void {
        this.cachedResult = null;
        this.lastScanTime = 0;
        this.logger.debug('Workspace scan cache invalidated');
    }

    /**
     * 执行扫描并缓存结果
     */
    private async performScan(options: IYamlScanOptions): Promise<IYamlScanResult> {
        const startTime = performance.now();

        try {
            this.logger.info('Starting workspace scan');

            this.scanPromise = this.yamlScanner.scanWorkspace({
                exclude: options.exclude || '**/node_modules/**',
                skipInvalid: options.skipInvalid ?? true,
                ...options,
            });

            this.cachedResult = await this.scanPromise;
            this.lastScanTime = Date.now();

            const duration = performance.now() - startTime;
            this.logger.info('Workspace scan completed', {
                totalFiles: this.cachedResult.statistics.totalFiles,
                successCount: this.cachedResult.statistics.successCount,
                duration: `${duration.toFixed(2)}ms`,
            });

            return this.cachedResult;
        } finally {
            this.scanPromise = null;
        }
    }

    /**
     * 检查缓存是否有效
     */
    isCacheValid(): boolean {
        return this.cachedResult !== null && Date.now() - this.lastScanTime < this.cacheTTL;
    }

    /**
     * 获取缓存的文档数量
     */
    getCachedDocumentCount(): number {
        return this.cachedResult?.documents.length ?? 0;
    }

    /**
     * 获取缓存统计信息
     */
    getStatistics(): {
        totalRequests: number;
        cacheHits: number;
        cacheHitRate: number;
        cachedDocuments: number;
        cacheAge: number;
        isValid: boolean;
    } {
        const now = Date.now();
        return {
            totalRequests: this.scanRequestCount,
            cacheHits: this.cacheHits,
            cacheHitRate: this.scanRequestCount > 0 ? (this.cacheHits / this.scanRequestCount) * 100 : 0,
            cachedDocuments: this.cachedResult?.documents.length ?? 0,
            cacheAge: this.lastScanTime > 0 ? now - this.lastScanTime : 0,
            isValid: this.isCacheValid(),
        };
    }

    /**
     * 预热缓存（用于启动时主动扫描）
     */
    async warmup(options: IYamlScanOptions = {}): Promise<void> {
        if (!this.isCacheValid() && !this.scanPromise) {
            this.logger.info('Warming up workspace scan cache');
            await this.performScan(options);
        }
    }
}
