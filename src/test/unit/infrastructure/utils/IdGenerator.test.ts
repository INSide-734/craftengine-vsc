import { describe, it, expect } from 'vitest';
import {
    generateEventId,
    generateRandomId,
    generateUUID,
    generateShortId,
    generateTimestampId,
    generateSequenceId,
    IdGenerator,
    UniqueIdGenerator,
    getCurrentTimestamp,
    calculateUptime,
    formatDuration
} from '../../../../infrastructure/utils/IdGenerator';

describe('IdGenerator module', () => {
    describe('generateRandomId', () => {
        it('should generate string of default length', () => {
            const id = generateRandomId();
            expect(typeof id).toBe('string');
            expect(id.length).toBeLessThanOrEqual(9);
            expect(id.length).toBeGreaterThan(0);
        });

        it('should generate string of specified length', () => {
            const id = generateRandomId(6);
            expect(id.length).toBeLessThanOrEqual(6);
        });

        it('should generate different ids', () => {
            const ids = new Set(Array.from({ length: 10 }, () => generateRandomId()));
            expect(ids.size).toBeGreaterThan(1);
        });
    });

    describe('generateEventId', () => {
        it('should use default prefix', () => {
            const id = generateEventId();
            expect(id).toMatch(/^evt_\d+_.+$/);
        });

        it('should use custom prefix', () => {
            const id = generateEventId('ext');
            expect(id).toMatch(/^ext_\d+_.+$/);
        });
    });

    describe('generateUUID', () => {
        it('should generate valid UUID v4 format', () => {
            const uuid = generateUUID();
            expect(uuid).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
            );
        });

        it('should generate unique UUIDs', () => {
            const uuids = new Set(Array.from({ length: 10 }, () => generateUUID()));
            expect(uuids.size).toBe(10);
        });
    });

    describe('generateShortId', () => {
        it('should generate id of default length', () => {
            const id = generateShortId();
            expect(id.length).toBe(8);
        });

        it('should generate id of specified length', () => {
            const id = generateShortId(12);
            expect(id.length).toBe(12);
        });

        it('should only contain alphanumeric characters', () => {
            const id = generateShortId(20);
            expect(id).toMatch(/^[A-Za-z0-9]+$/);
        });
    });

    describe('generateTimestampId', () => {
        it('should contain timestamp', () => {
            const before = Date.now();
            const id = generateTimestampId();
            const after = Date.now();
            const timestamp = parseInt(id.split('_')[0]);
            expect(timestamp).toBeGreaterThanOrEqual(before);
            expect(timestamp).toBeLessThanOrEqual(after);
        });

        it('should have format timestamp_random', () => {
            const id = generateTimestampId();
            expect(id).toMatch(/^\d+_.+$/);
        });
    });

    describe('generateSequenceId', () => {
        it('should generate padded sequence id', () => {
            expect(generateSequenceId('item', 1)).toBe('item_0001');
            expect(generateSequenceId('item', 42, 6)).toBe('item_000042');
        });

        it('should handle large numbers', () => {
            expect(generateSequenceId('x', 99999, 4)).toBe('x_99999');
        });
    });

    describe('IdGenerator class', () => {
        it('should generate sequential ids with prefix', () => {
            const gen = new IdGenerator('task');
            expect(gen.next()).toBe('task_1');
            expect(gen.next()).toBe('task_2');
            expect(gen.next()).toBe('task_3');
        });

        it('should generate sequential ids without prefix', () => {
            const gen = new IdGenerator();
            expect(gen.next()).toBe('1');
            expect(gen.next()).toBe('2');
        });

        it('should support custom start value', () => {
            const gen = new IdGenerator('item', 10);
            expect(gen.next()).toBe('item_10');
        });

        it('should track current value', () => {
            const gen = new IdGenerator('t');
            gen.next();
            gen.next();
            expect(gen.current()).toBe(2);
        });

        it('should reset counter', () => {
            const gen = new IdGenerator('t');
            gen.next();
            gen.next();
            gen.reset();
            expect(gen.next()).toBe('t_1');
        });

        it('should reset to custom value', () => {
            const gen = new IdGenerator('t');
            gen.reset(5);
            expect(gen.next()).toBe('t_5');
        });

        it('should peek without incrementing', () => {
            const gen = new IdGenerator('t');
            expect(gen.peek()).toBe('t_1');
            expect(gen.peek()).toBe('t_1');
            expect(gen.next()).toBe('t_1');
            expect(gen.peek()).toBe('t_2');
        });
    });

    describe('UniqueIdGenerator class', () => {
        it('should generate unique ids', () => {
            const gen = new UniqueIdGenerator();
            const ids = new Set<string>();
            for (let i = 0; i < 20; i++) {
                ids.add(gen.generate());
            }
            expect(ids.size).toBe(20);
        });

        it('should track used ids', () => {
            const gen = new UniqueIdGenerator();
            const id = gen.generate();
            expect(gen.isUsed(id)).toBe(true);
            expect(gen.isUsed('nonexistent')).toBe(false);
        });

        it('should register external ids', () => {
            const gen = new UniqueIdGenerator();
            gen.register('external-id');
            expect(gen.isUsed('external-id')).toBe(true);
        });

        it('should count generated ids', () => {
            const gen = new UniqueIdGenerator();
            gen.generate();
            gen.generate();
            expect(gen.count()).toBe(2);
        });

        it('should clear all ids', () => {
            const gen = new UniqueIdGenerator();
            gen.generate();
            gen.generate();
            gen.clear();
            expect(gen.count()).toBe(0);
        });
    });

    describe('getCurrentTimestamp', () => {
        it('should return a Date object', () => {
            const ts = getCurrentTimestamp();
            expect(ts).toBeInstanceOf(Date);
        });

        it('should return current time', () => {
            const before = Date.now();
            const ts = getCurrentTimestamp();
            const after = Date.now();
            expect(ts.getTime()).toBeGreaterThanOrEqual(before);
            expect(ts.getTime()).toBeLessThanOrEqual(after);
        });
    });

    describe('calculateUptime', () => {
        it('should calculate elapsed time', () => {
            const start = new Date(Date.now() - 5000);
            const uptime = calculateUptime(start);
            expect(uptime).toBeGreaterThanOrEqual(4900);
            expect(uptime).toBeLessThanOrEqual(6000);
        });
    });

    describe('formatDuration', () => {
        it('should format milliseconds', () => {
            expect(formatDuration(500)).toBe('500ms');
            expect(formatDuration(0)).toBe('0ms');
        });

        it('should format exact seconds', () => {
            expect(formatDuration(1000)).toBe('1s');
            expect(formatDuration(3000)).toBe('3s');
        });

        it('should format fractional seconds', () => {
            expect(formatDuration(1500)).toBe('1.5s');
        });

        it('should format minutes and seconds', () => {
            expect(formatDuration(65000)).toBe('1m 5s');
        });

        it('should format hours, minutes and seconds', () => {
            expect(formatDuration(3665000)).toBe('1h 1m 5s');
        });
    });
});
