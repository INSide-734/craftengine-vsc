import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpUtils } from '../../../../infrastructure/utils/HttpUtils';
import { EventEmitter } from 'events';

// 使用 vi.mock 替代 vi.spyOn 以兼容 ESM
vi.mock('https', () => {
    return {
        get: vi.fn(),
    };
});

import * as https from 'https';

const mockedGet = vi.mocked(https.get);

describe('HttpUtils', () => {
    describe('maskUrl', () => {
        it('should mask URL keeping last 2 path segments by default', () => {
            const masked = HttpUtils.maskUrl('https://example.com/a/b/c/file.json');
            expect(masked).toBe('example.com/.../c/file.json');
        });

        it('should keep specified number of path segments', () => {
            const masked = HttpUtils.maskUrl('https://example.com/a/b/c/d/file.json', 3);
            expect(masked).toBe('example.com/.../c/d/file.json');
        });

        it('should not mask when path segments <= keepPathSegments', () => {
            const masked = HttpUtils.maskUrl('https://example.com/a/b', 2);
            expect(masked).toBe('example.com/a/b');
        });

        it('should handle single path segment', () => {
            const masked = HttpUtils.maskUrl('https://example.com/file.json', 2);
            expect(masked).toBe('example.com/file.json');
        });

        it('should return original string for invalid URL', () => {
            const masked = HttpUtils.maskUrl('not-a-url');
            expect(masked).toBe('not-a-url');
        });

        it('should handle root path', () => {
            const masked = HttpUtils.maskUrl('https://example.com/');
            expect(masked).toBe('example.com/');
        });
    });

    describe('fetchJson - response size limit', () => {
        beforeEach(() => {
            mockedGet.mockReset();
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        /**
         * 创建模拟的 HTTP 响应和请求对象
         */
        function createMockResponse(statusCode: number, headers: Record<string, string> = {}) {
            const res = new EventEmitter() as EventEmitter & {
                statusCode: number;
                statusMessage: string;
                headers: Record<string, string>;
                resume: () => void;
                destroy: () => void;
            };
            res.statusCode = statusCode;
            res.statusMessage = 'OK';
            res.headers = headers;
            res.resume = vi.fn();
            res.destroy = vi.fn();
            return res;
        }

        function createMockRequest() {
            const req = new EventEmitter() as EventEmitter & {
                destroy: () => void;
            };
            req.destroy = vi.fn();
            return req;
        }

        it('should reject when Content-Length exceeds limit', async () => {
            const mockReq = createMockRequest();
            const mockRes = createMockResponse(200, { 'content-length': '1000' });

            mockedGet.mockImplementation((_url: unknown, _opts: unknown, cb: unknown) => {
                (cb as (res: typeof mockRes) => void)(mockRes);
                return mockReq as unknown as ReturnType<typeof https.get>;
            });

            const promise = HttpUtils.fetchJson('https://example.com/data.json', 5000, 500);
            await expect(promise).rejects.toThrow('Response too large: Content-Length 1000 exceeds limit of 500 bytes');
        });

        it('should reject when streamed data exceeds limit', async () => {
            const mockReq = createMockRequest();
            const mockRes = createMockResponse(200);

            mockedGet.mockImplementation((_url: unknown, _opts: unknown, cb: unknown) => {
                (cb as (res: typeof mockRes) => void)(mockRes);
                setTimeout(() => {
                    mockRes.emit('data', Buffer.alloc(300));
                    mockRes.emit('data', Buffer.alloc(300));
                }, 0);
                return mockReq as unknown as ReturnType<typeof https.get>;
            });

            const promise = HttpUtils.fetchJson('https://example.com/data.json', 5000, 500);
            await expect(promise).rejects.toThrow('Response too large: exceeded limit of 500 bytes');
        });

        it('should accept response within size limit', async () => {
            const mockReq = createMockRequest();
            const mockRes = createMockResponse(200);
            const jsonData = JSON.stringify({ key: 'value' });

            mockedGet.mockImplementation((_url: unknown, _opts: unknown, cb: unknown) => {
                (cb as (res: typeof mockRes) => void)(mockRes);
                setTimeout(() => {
                    mockRes.emit('data', Buffer.from(jsonData));
                    mockRes.emit('end');
                }, 0);
                return mockReq as unknown as ReturnType<typeof https.get>;
            });

            const result = await HttpUtils.fetchJson<{ key: string }>('https://example.com/data.json', 5000, 1024);
            expect(result).toEqual({ key: 'value' });
        });
    });

    describe('fetchJson - URL validation', () => {
        it('should reject non-HTTPS URLs', () => {
            expect(() => HttpUtils.fetchJson('http://example.com/data.json', 5000)).toThrow('Unsupported URL scheme');
        });

        it('should reject invalid URLs', () => {
            expect(() => HttpUtils.fetchJson('not-a-url', 5000)).toThrow('Invalid URL');
        });
    });

    describe('fetchJson - HTTP errors and redirects', () => {
        beforeEach(() => {
            mockedGet.mockReset();
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        function createMockRes(statusCode: number, headers: Record<string, string> = {}) {
            const res = new EventEmitter() as EventEmitter & {
                statusCode: number;
                statusMessage: string;
                headers: Record<string, string>;
                resume: () => void;
                destroy: () => void;
            };
            res.statusCode = statusCode;
            res.statusMessage = statusCode === 404 ? 'Not Found' : 'Error';
            res.headers = headers;
            res.resume = vi.fn();
            res.destroy = vi.fn();
            return res;
        }

        function createMockReq() {
            const req = new EventEmitter() as EventEmitter & { destroy: () => void };
            req.destroy = vi.fn();
            return req;
        }

        it('should reject on non-200 status code', async () => {
            const mockReq = createMockReq();
            const mockRes = createMockRes(404);

            mockedGet.mockImplementation((_url: unknown, _opts: unknown, cb: unknown) => {
                (cb as (res: typeof mockRes) => void)(mockRes);
                return mockReq as unknown as ReturnType<typeof https.get>;
            });

            await expect(HttpUtils.fetchJson('https://example.com/data.json', 5000)).rejects.toThrow('HTTP 404');
        });

        it('should reject on request error', async () => {
            const mockReq = createMockReq();

            mockedGet.mockImplementation((_url: unknown, _opts: unknown, _cb: unknown) => {
                setTimeout(() => mockReq.emit('error', new Error('ECONNREFUSED')), 0);
                return mockReq as unknown as ReturnType<typeof https.get>;
            });

            await expect(HttpUtils.fetchJson('https://example.com/data.json', 5000)).rejects.toThrow('ECONNREFUSED');
        });

        it('should reject on JSON parse failure', async () => {
            const mockReq = createMockReq();
            const mockRes = createMockRes(200);
            mockRes.statusMessage = 'OK';

            mockedGet.mockImplementation((_url: unknown, _opts: unknown, cb: unknown) => {
                (cb as (res: typeof mockRes) => void)(mockRes);
                setTimeout(() => {
                    mockRes.emit('data', Buffer.from('not json'));
                    mockRes.emit('end');
                }, 0);
                return mockReq as unknown as ReturnType<typeof https.get>;
            });

            await expect(HttpUtils.fetchJson('https://example.com/data.json', 5000)).rejects.toThrow(
                'Failed to parse JSON response',
            );
        });

        it('should handle redirect (301)', async () => {
            const mockReq = createMockReq();
            const jsonData = JSON.stringify({ redirected: true });

            let callCount = 0;
            mockedGet.mockImplementation((_url: unknown, _opts: unknown, cb: unknown) => {
                callCount++;
                if (callCount === 1) {
                    const redirectRes = createMockRes(301, { location: 'https://example.com/new.json' });
                    (cb as (res: typeof redirectRes) => void)(redirectRes);
                } else {
                    const finalRes = createMockRes(200);
                    finalRes.statusMessage = 'OK';
                    (cb as (res: typeof finalRes) => void)(finalRes);
                    setTimeout(() => {
                        finalRes.emit('data', Buffer.from(jsonData));
                        finalRes.emit('end');
                    }, 0);
                }
                return mockReq as unknown as ReturnType<typeof https.get>;
            });

            const result = await HttpUtils.fetchJson<{ redirected: boolean }>('https://example.com/old.json', 5000);
            expect(result).toEqual({ redirected: true });
        });

        it('should reject on too many redirects', async () => {
            const mockReq = createMockReq();
            HttpUtils.configure({ maxRedirects: 2 });

            mockedGet.mockImplementation((_url: unknown, _opts: unknown, cb: unknown) => {
                const res = createMockRes(301, { location: 'https://example.com/loop' });
                (cb as (res: typeof res) => void)(res);
                return mockReq as unknown as ReturnType<typeof https.get>;
            });

            await expect(HttpUtils.fetchJson('https://example.com/start', 5000)).rejects.toThrow('Too many redirects');

            HttpUtils.configure({ maxRedirects: 5 });
        });
    });

    describe('configure', () => {
        it('should accept configuration without error', () => {
            expect(() => HttpUtils.configure({ maxRedirects: 10 })).not.toThrow();
            expect(() => HttpUtils.configure({ maxResponseSize: 1024 })).not.toThrow();
            // 恢复默认
            HttpUtils.configure({ maxRedirects: 5, maxResponseSize: 10 * 1024 * 1024 });
        });
    });

    describe('fetchFromMultipleSources', () => {
        beforeEach(() => {
            mockedGet.mockReset();
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        function createMockRes2(statusCode: number) {
            const res = new EventEmitter() as EventEmitter & {
                statusCode: number;
                statusMessage: string;
                headers: Record<string, string>;
                resume: () => void;
                destroy: () => void;
            };
            res.statusCode = statusCode;
            res.statusMessage = 'OK';
            res.headers = {};
            res.resume = vi.fn();
            res.destroy = vi.fn();
            return res;
        }

        function createMockReq2() {
            const req = new EventEmitter() as EventEmitter & { destroy: () => void };
            req.destroy = vi.fn();
            return req;
        }

        it('should return data from first successful source', async () => {
            const mockReq = createMockReq2();
            const mockRes = createMockRes2(200);
            const jsonData = JSON.stringify({ source: 'primary' });

            mockedGet.mockImplementation((_url: unknown, _opts: unknown, cb: unknown) => {
                (cb as (res: typeof mockRes) => void)(mockRes);
                setTimeout(() => {
                    mockRes.emit('data', Buffer.from(jsonData));
                    mockRes.emit('end');
                }, 0);
                return mockReq as unknown as ReturnType<typeof https.get>;
            });

            const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
            const result = await HttpUtils.fetchFromMultipleSources<{ source: string }>(
                ['https://primary.com/data.json'],
                5000,
                mockLogger,
            );
            expect(result).toEqual({ source: 'primary' });
        });

        it('should return null when all sources fail', async () => {
            const mockReq = createMockReq2();

            mockedGet.mockImplementation((_url: unknown, _opts: unknown, _cb: unknown) => {
                setTimeout(() => mockReq.emit('error', new Error('fail')), 0);
                return mockReq as unknown as ReturnType<typeof https.get>;
            });

            const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
            const result = await HttpUtils.fetchFromMultipleSources(
                ['https://a.com/data.json', 'https://b.com/data.json'],
                5000,
                mockLogger,
            );
            expect(result).toBeNull();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'All data sources failed',
                expect.objectContaining({ attemptedSources: 2 }),
            );
        });
    });
});
