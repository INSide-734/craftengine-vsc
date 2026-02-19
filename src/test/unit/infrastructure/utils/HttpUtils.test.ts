import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpUtils } from '../../../../infrastructure/utils/HttpUtils';
import { EventEmitter } from 'events';

// 使用 vi.mock 替代 vi.spyOn 以兼容 ESM
vi.mock('https', () => {
    return {
        get: vi.fn()
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
});
