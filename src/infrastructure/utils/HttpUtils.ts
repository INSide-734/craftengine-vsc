import * as https from 'https';
import { ILogger } from '../../core/interfaces/ILogger';

/**
 * HTTP 工具类
 *
 * 提供 HTTPS 请求的通用功能
 *
 * ## 特性
 *
 * - **超时控制**：支持请求超时设置
 * - **JSON 解析**：自动解析 JSON 响应
 * - **错误处理**：统一的错误处理机制
 * - **多源 fallback**：支持从多个数据源依次获取数据
 *
 * @example
 * ```typescript
 * const data = await HttpUtils.fetchJson<MyData>('https://example.com/api', 10000);
 * ```
 */
export class HttpUtils {
    /**
     * 发起带超时的 HTTPS GET 请求并解析 JSON 响应
     *
     * @template T - 响应数据类型
     * @param url - 请求 URL
     * @param timeout - 超时时间（毫秒）
     * @returns 解析后的 JSON 数据
     * @throws {Error} 请求超时、HTTP 错误或 JSON 解析失败时抛出
     *
     * @example
     * ```typescript
     * interface ApiResponse {
     *   items: string[];
     * }
     *
     * const data = await HttpUtils.fetchJson<ApiResponse>(
     *   'https://api.example.com/data',
     *   10000
     * );
     * console.log(data.items);
     * ```
     */
    /** 默认最大重定向次数 */
    private static readonly DEFAULT_MAX_REDIRECTS = 5;

    /** 默认最大响应体大小（字节），默认 10MB */
    private static readonly DEFAULT_MAX_RESPONSE_SIZE = 10 * 1024 * 1024;

    /** 最大重定向次数（可通过 configure 设置） */
    private static MAX_REDIRECTS = HttpUtils.DEFAULT_MAX_REDIRECTS;

    /** 最大响应体大小（可通过 configure 设置） */
    private static MAX_RESPONSE_SIZE = HttpUtils.DEFAULT_MAX_RESPONSE_SIZE;

    /**
     * 从配置设置网络限制
     *
     * @param config 网络配置
     */
    static configure(config: { maxRedirects?: number; maxResponseSize?: number }): void {
        if (config.maxRedirects !== undefined) {
            HttpUtils.MAX_REDIRECTS = config.maxRedirects;
        }
        if (config.maxResponseSize !== undefined) {
            HttpUtils.MAX_RESPONSE_SIZE = config.maxResponseSize;
        }
    }

    static fetchJson<T>(url: string, timeout: number, maxResponseSize?: number): Promise<T> {
        HttpUtils.validateUrl(url);
        return HttpUtils.fetchJsonWithRedirects(url, timeout, 0, maxResponseSize ?? HttpUtils.MAX_RESPONSE_SIZE);
    }

    /**
     * 验证 URL scheme 是否安全（仅允许 HTTPS）
     *
     * @param url - 要验证的 URL
     * @throws {Error} 如果 URL scheme 不是 https
     */
    private static validateUrl(url: string): void {
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'https:') {
                throw new Error(`Unsupported URL scheme: ${parsed.protocol}. Only HTTPS is allowed`);
            }
        } catch (error) {
            if (error instanceof Error && error.message.startsWith('Unsupported URL scheme')) {
                throw error;
            }
            throw new Error(`Invalid URL: ${url}`);
        }
    }

    /**
     * 内部方法：支持重定向的 HTTPS GET 请求
     *
     * @param url - 请求 URL
     * @param timeout - 超时时间（毫秒）
     * @param redirectCount - 当前重定向次数
     * @param maxResponseSize - 最大响应体大小（字节）
     */
    private static fetchJsonWithRedirects<T>(url: string, timeout: number, redirectCount: number, maxResponseSize: number): Promise<T> {
        return new Promise((resolve, reject) => {
            // 创建超时定时器
            const timer = setTimeout(() => {
                req.destroy();
                reject(new Error(`Request timeout after ${timeout}ms`));
            }, timeout);

            const req = https.get(url, { timeout }, (res) => {
                const statusCode = res.statusCode ?? 0;

                // 处理重定向 (301/302/307/308)
                if ([301, 302, 307, 308].includes(statusCode) && res.headers.location) {
                    clearTimeout(timer);
                    res.resume(); // 消费响应体以释放内存

                    if (redirectCount >= HttpUtils.MAX_REDIRECTS) {
                        reject(new Error(`Too many redirects (max ${HttpUtils.MAX_REDIRECTS})`));
                        return;
                    }

                    // 解析相对 URL 并验证 scheme
                    const redirectUrl = new URL(res.headers.location, url).href;
                    HttpUtils.validateUrl(redirectUrl);
                    resolve(HttpUtils.fetchJsonWithRedirects<T>(redirectUrl, timeout, redirectCount + 1, maxResponseSize));
                    return;
                }

                // 检查响应状态码
                if (statusCode !== 200) {
                    clearTimeout(timer);
                    reject(new Error(`HTTP ${statusCode}: ${res.statusMessage || 'Unknown error'}`));
                    return;
                }

                // 检查 Content-Length 是否超限
                const contentLength = parseInt(res.headers['content-length'] ?? '', 10);
                if (!isNaN(contentLength) && contentLength > maxResponseSize) {
                    clearTimeout(timer);
                    res.destroy();
                    reject(new Error(`Response too large: Content-Length ${contentLength} exceeds limit of ${maxResponseSize} bytes`));
                    return;
                }

                // 使用 Buffer 数组收集数据，避免多字节字符跨 chunk 损坏
                const chunks: Buffer[] = [];
                let totalSize = 0;

                res.on('data', (chunk: Buffer) => {
                    totalSize += chunk.length;
                    if (totalSize > maxResponseSize) {
                        clearTimeout(timer);
                        req.destroy();
                        reject(new Error(`Response too large: exceeded limit of ${maxResponseSize} bytes`));
                        return;
                    }
                    chunks.push(chunk);
                });

                res.on('end', () => {
                    clearTimeout(timer);

                    try {
                        const data = Buffer.concat(chunks).toString('utf8');
                        const parsed = JSON.parse(data) as T;
                        resolve(parsed);
                    } catch (error) {
                        reject(new Error(`Failed to parse JSON response: ${error}`));
                    }
                });
            });

            req.on('error', (error) => {
                clearTimeout(timer);
                reject(error);
            });

            req.on('timeout', () => {
                clearTimeout(timer);
                req.destroy();
                reject(new Error(`Request timeout after ${timeout}ms`));
            });
        });
    }

    /**
     * 从多个数据源依次获取数据（fallback 机制）
     *
     * 依次尝试每个 URL，直到成功或全部失败。
     * 使用 debug 级别记录成功和单个失败，warn 级别记录全部失败。
     *
     * @template T - 响应数据类型
     * @param urls - 数据源 URL 列表（按优先级排序）
     * @param timeout - 请求超时时间（毫秒）
     * @param logger - 可选的日志记录器
     * @returns 成功获取的数据，或 null（全部失败时）
     *
     * @example
     * ```typescript
     * const data = await HttpUtils.fetchFromMultipleSources<MyData>(
     *   ['https://primary.com/data', 'https://mirror.com/data'],
     *   10000,
     *   logger
     * );
     * ```
     */
    static async fetchFromMultipleSources<T>(
        urls: string[],
        timeout: number,
        logger?: ILogger
    ): Promise<T | null> {
        const errors: Array<{ url: string; error: string }> = [];

        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const sourceType = i === 0 ? 'main' : `mirror-${i}`;

            try {
                logger?.debug('Attempting to fetch from source', {
                    sourceType,
                    url: HttpUtils.maskUrl(url)
                });

                const data = await HttpUtils.fetchJson<T>(url, timeout);

                logger?.debug('Successfully fetched from source', {
                    sourceType,
                    url: HttpUtils.maskUrl(url)
                });

                return data;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                errors.push({ url: HttpUtils.maskUrl(url), error: errorMessage });

                logger?.debug('Failed to fetch from source, trying next', {
                    sourceType,
                    url: HttpUtils.maskUrl(url),
                    error: errorMessage,
                    remainingSources: urls.length - i - 1
                });
            }
        }

        // 所有源都失败
        logger?.warn('All data sources failed', {
            attemptedSources: urls.length,
            errors
        });

        return null;
    }

    /**
     * 隐藏 URL 中的完整路径（用于日志）
     *
     * @param url - 完整 URL
     * @param keepPathSegments - 保留的路径段数（从末尾开始），默认 2
     * @returns 脱敏后的 URL
     *
     * @example
     * ```typescript
     * const masked = HttpUtils.maskUrl(
     *   'https://example.com/a/b/c/file.json',
     *   2
     * );
     * // 返回: "example.com/.../c/file.json"
     * ```
     */
    static maskUrl(url: string, keepPathSegments: number = 2): string {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(Boolean);

            if (pathParts.length <= keepPathSegments) {
                return `${urlObj.host}${urlObj.pathname}`;
            }

            const keptParts = pathParts.slice(-keepPathSegments);
            return `${urlObj.host}/.../${keptParts.join('/')}`;
        } catch {
            return url;
        }
    }
}
