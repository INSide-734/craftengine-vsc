/**
 * FileLogTarget 单元测试
 *
 * 测试文件日志目标的核心功能：
 * - 启动时轮转（Minecraft 风格）
 * - 日志写入和缓冲
 * - dispose 时 flush 完整性
 * - 旧备份清理
 * - 文件大小触发的运行时轮转
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileLogTarget } from '../../../../infrastructure/logging/FileLogTarget';
import { LogLevel, ILogEntry } from '../../../../core/interfaces/ILogger';

/** 创建测试用日志条目 */
function makeEntry(message: string, level: LogLevel = LogLevel.INFO): ILogEntry {
    return {
        level,
        message,
        timestamp: new Date(),
        category: 'Test',
    };
}

describe('FileLogTarget', () => {
    let tmpDir: string;
    let logFilePath: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flt-test-'));
        logFilePath = path.join(tmpDir, 'test.log');
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // ========================================================================
    // 启动时轮转（Minecraft 风格）
    // ========================================================================

    describe('启动时轮转', () => {
        it('启动时如果日志文件已存在且非空，应将其重命名为备份', async () => {
            // 模拟上一次会话遗留的日志文件
            fs.writeFileSync(logFilePath, 'previous session log content\n');

            const target = new FileLogTarget(logFilePath, {
                flushIntervalMs: 60_000,
                bufferSizeThreshold: 1024 * 1024,
            });

            // 上一次的日志应被重命名为备份
            const files = fs.readdirSync(tmpDir);
            const backups = files.filter(f => f.startsWith('test_') && f.endsWith('.log') && f !== 'test.log');
            expect(backups.length).toBe(1);

            // 备份文件应包含上一次会话的内容
            const backupContent = fs.readFileSync(path.join(tmpDir, backups[0]), 'utf8');
            expect(backupContent).toContain('previous session log content');

            // 当前日志文件应存在但为空（新会话）
            expect(fs.existsSync(logFilePath)).toBe(true);
            const currentSize = fs.statSync(logFilePath).size;
            expect(currentSize).toBe(0);

            await target.dispose();
        });

        it('启动时如果日志文件不存在，应直接创建新文件', async () => {
            // 不预先创建日志文件
            expect(fs.existsSync(logFilePath)).toBe(false);

            const target = new FileLogTarget(logFilePath, {
                flushIntervalMs: 60_000,
            });

            // 不应有备份文件
            const files = fs.readdirSync(tmpDir);
            const backups = files.filter(f => f.startsWith('test_') && f.endsWith('.log') && f !== 'test.log');
            expect(backups.length).toBe(0);

            // 日志文件应已创建
            expect(fs.existsSync(logFilePath)).toBe(true);

            await target.dispose();
        });

        it('启动时如果日志文件存在但为空，不应产生备份', async () => {
            // 创建空日志文件
            fs.writeFileSync(logFilePath, '');

            const target = new FileLogTarget(logFilePath, {
                flushIntervalMs: 60_000,
            });

            const files = fs.readdirSync(tmpDir);
            const backups = files.filter(f => f.startsWith('test_') && f.endsWith('.log') && f !== 'test.log');
            expect(backups.length).toBe(0);

            await target.dispose();
        });

        it('启动时轮转应清理超出 maxBackupCount 的旧备份', async () => {
            // 预先创建 3 个旧备份
            for (let i = 0; i < 3; i++) {
                const ts = `2026-01-0${i + 1}T00-00-00-000Z`;
                fs.writeFileSync(path.join(tmpDir, `test_${ts}.log`), `old backup ${i}`);
            }
            // 创建上一次会话的日志文件
            fs.writeFileSync(logFilePath, 'last session\n');

            const target = new FileLogTarget(logFilePath, {
                maxBackupCount: 2,
                flushIntervalMs: 60_000,
                bufferSizeThreshold: 1024 * 1024,
            });

            // 等待异步清理完成
            await new Promise(resolve => setTimeout(resolve, 100));

            const files = fs.readdirSync(tmpDir);
            const backups = files.filter(f => f.startsWith('test_') && f.endsWith('.log') && f !== 'test.log');
            // maxBackupCount=2，启动时轮转产生 1 个新备份 + 3 个旧备份 = 4 个，应清理到 2 个
            expect(backups.length).toBeLessThanOrEqual(2);

            await target.dispose();
        });

        it('新会话写入的日志不应包含上一次会话的内容', async () => {
            // 模拟上一次会话遗留的日志
            fs.writeFileSync(logFilePath, 'old session data\n');

            const target = new FileLogTarget(logFilePath, {
                flushIntervalMs: 60_000,
                bufferSizeThreshold: 10,
            });

            await target.write(makeEntry('new session message'));

            // 等待 flush
            await new Promise(resolve => setTimeout(resolve, 50));

            const currentContent = fs.readFileSync(logFilePath, 'utf8');
            expect(currentContent).not.toContain('old session data');
            expect(currentContent).toContain('new session message');

            await target.dispose();
        });
    });

    // ========================================================================
    // dispose 后 flush 完整性
    // ========================================================================

    describe('dispose 后 flush 完整性', () => {
        it('dispose 应 flush 所有缓冲内容到文件', async () => {
            const target = new FileLogTarget(logFilePath, {
                flushIntervalMs: 60_000,
                bufferSizeThreshold: 1024 * 1024,
            });

            await target.write(makeEntry('first line'));
            await target.write(makeEntry('second line'));
            await target.write(makeEntry('extension deactivated'));
            await target.dispose();

            // dispose 后日志文件应包含所有内容
            const content = fs.readFileSync(logFilePath, 'utf8');
            expect(content).toContain('first line');
            expect(content).toContain('second line');
            expect(content).toContain('extension deactivated');
        });
    });

    // ========================================================================
    // 旧备份清理
    // ========================================================================

    describe('旧备份清理', () => {
        it('运行时轮转后应清理超出 maxBackupCount 的旧备份', async () => {
            // 预先创建 3 个旧备份
            for (let i = 0; i < 3; i++) {
                const ts = `2026-01-0${i + 1}T00-00-00-000Z`;
                fs.writeFileSync(path.join(tmpDir, `test_${ts}.log`), `old backup ${i}`);
            }

            const target = new FileLogTarget(logFilePath, {
                maxBackupCount: 2,
                maxFileSize: 200,
                flushIntervalMs: 60_000,
                bufferSizeThreshold: 10,
            });

            // 写入足够多的数据触发运行时轮转
            for (let i = 0; i < 20; i++) {
                await target.write(makeEntry(`message ${i} with padding text`));
            }

            // 等待异步轮转和清理完成
            await new Promise(resolve => setTimeout(resolve, 200));
            await target.dispose();

            const files = fs.readdirSync(tmpDir);
            const backups = files.filter(f => f.startsWith('test_') && f.endsWith('.log') && f !== 'test.log');
            // maxBackupCount=2，所以最多保留 2 个备份
            expect(backups.length).toBeLessThanOrEqual(2);
        });
    });

    // ========================================================================
    // 写入和缓冲
    // ========================================================================

    describe('写入和缓冲', () => {
        it('缓冲区超过阈值时应立即 flush 到磁盘', async () => {
            const target = new FileLogTarget(logFilePath, {
                flushIntervalMs: 60_000,       // 禁用定时 flush
                bufferSizeThreshold: 50,        // 很小的阈值
            });

            // 写入足够大的消息触发 flush
            await target.write(makeEntry('a'.repeat(100)));

            // writeStream.write 是异步的，等一个 tick 让数据落盘
            await new Promise(resolve => setTimeout(resolve, 50));

            // 不等 dispose，文件应已有内容
            expect(fs.existsSync(logFilePath)).toBe(true);
            const size = fs.statSync(logFilePath).size;
            expect(size).toBeGreaterThan(0);

            await target.dispose();
        });
    });

    // ========================================================================
    // dispose 后写入丢失（模拟 deactivate 调用顺序 bug）
    // ========================================================================

    describe('dispose 后写入', () => {
        it('dispose 后调用 write 应丢弃消息（不崩溃）', async () => {
            const target = new FileLogTarget(logFilePath, {
                flushIntervalMs: 60_000,
                bufferSizeThreshold: 1024 * 1024,
            });

            await target.write(makeEntry('before dispose'));
            await target.dispose();

            // dispose 后写入不应抛异常
            await target.write(makeEntry('after dispose'));

            // 日志文件中不应包含 dispose 后的消息
            const content = fs.readFileSync(logFilePath, 'utf8');
            expect(content).toContain('before dispose');
            expect(content).not.toContain('after dispose');
        });
    });

    // ========================================================================
    // 文件大小触发的运行时轮转
    // ========================================================================

    describe('文件大小轮转', () => {
        it('写入超过 maxFileSize 时应触发轮转', async () => {
            const target = new FileLogTarget(logFilePath, {
                maxFileSize: 200,               // 很小的限制
                flushIntervalMs: 60_000,
                bufferSizeThreshold: 10,
            });

            // 写入多条日志超过 200 字节
            for (let i = 0; i < 20; i++) {
                await target.write(makeEntry(`message number ${i} with some padding text`));
            }

            // 等待异步轮转完成
            await new Promise(resolve => setTimeout(resolve, 100));
            await target.dispose();

            const files = fs.readdirSync(tmpDir);
            const backups = files.filter(f => f.startsWith('test_') && f.endsWith('.log'));
            // 至少应有 1 个运行时轮转产生的备份 + dispose 轮转的备份
            expect(backups.length).toBeGreaterThanOrEqual(1);
        });
    });
});
