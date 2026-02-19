/**
 * ID 生成工具函数
 *
 * 提供各种 ID 生成功能，包括事件 ID、UUID、随机字符串等。
 *
 * generateEventId 和 generateRandomId 已迁移至 Core 层，
 * 此处重导出以保持现有导入兼容。
 */

// 从 Core 层导入基础 ID 生成函数（本文件内部使用 + 重导出）
import { generateEventId, generateRandomId } from '../../core/utils';
export { generateEventId, generateRandomId };

/**
 * 生成 UUID v4
 *
 * 生成符合 UUID v4 规范的唯一标识符。
 *
 * @returns UUID 字符串
 *
 * @example
 * ```typescript
 * generateUUID(); // 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5'
 * ```
 */
export function generateUUID(): string {
    // 使用 crypto API（如果可用）
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    // 回退到手动生成
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * 生成短 ID
 *
 * 生成较短的唯一标识符，适用于对长度有限制的场景。
 *
 * @param length - ID 长度，默认为 8
 * @returns 短 ID 字符串
 *
 * @example
 * ```typescript
 * generateShortId(); // 'Ab1Cd2Ef'
 * ```
 */
export function generateShortId(length: number = 8): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * 生成时间戳 ID
 *
 * 生成基于时间戳的 ID，格式为 `{timestamp}_{randomPart}`。
 *
 * @param randomLength - 随机部分长度，默认为 6
 * @returns 时间戳 ID
 *
 * @example
 * ```typescript
 * generateTimestampId(); // '1704067200000_abc123'
 * ```
 */
export function generateTimestampId(randomLength: number = 6): string {
    return `${Date.now()}_${generateRandomId(randomLength)}`;
}

/**
 * 生成带前缀的序列 ID
 *
 * 生成带有前缀和序号的 ID，适用于需要顺序标识的场景。
 *
 * @param prefix - ID 前缀
 * @param sequence - 序号
 * @param padding - 序号填充长度，默认为 4
 * @returns 序列 ID
 *
 * @example
 * ```typescript
 * generateSequenceId('item', 1); // 'item_0001'
 * generateSequenceId('item', 42, 6); // 'item_000042'
 * ```
 */
export function generateSequenceId(
    prefix: string,
    sequence: number,
    padding: number = 4
): string {
    return `${prefix}_${sequence.toString().padStart(padding, '0')}`;
}

/**
 * ID 生成器类
 *
 * 提供递增 ID 生成功能，带有可选的前缀。
 *
 * @example
 * ```typescript
 * const generator = new IdGenerator('task');
 * generator.next(); // 'task_1'
 * generator.next(); // 'task_2'
 * generator.reset();
 * generator.next(); // 'task_1'
 * ```
 */
export class IdGenerator {
    private counter = 0;

    /**
     * 构造 ID 生成器
     *
     * @param prefix - ID 前缀，默认为空
     * @param startFrom - 起始值，默认为 1
     */
    constructor(
        private readonly prefix: string = '',
        startFrom: number = 1
    ) {
        this.counter = startFrom - 1;
    }

    /**
     * 生成下一个 ID
     *
     * @returns 新的 ID
     */
    next(): string {
        this.counter++;
        return this.prefix ? `${this.prefix}_${this.counter}` : String(this.counter);
    }

    /**
     * 获取当前计数值
     *
     * @returns 当前计数值
     */
    current(): number {
        return this.counter;
    }

    /**
     * 重置计数器
     *
     * @param startFrom - 重置后的起始值，默认为 1
     */
    reset(startFrom: number = 1): void {
        this.counter = startFrom - 1;
    }

    /**
     * 预览下一个 ID（不递增计数器）
     *
     * @returns 下一个 ID
     */
    peek(): string {
        const nextValue = this.counter + 1;
        return this.prefix ? `${this.prefix}_${nextValue}` : String(nextValue);
    }
}

/**
 * 唯一 ID 生成器
 *
 * 确保生成的 ID 在整个生命周期内唯一，使用 Set 跟踪已生成的 ID。
 *
 * @example
 * ```typescript
 * const generator = new UniqueIdGenerator();
 * const id1 = generator.generate(); // 保证唯一
 * const id2 = generator.generate(); // 保证与 id1 不同
 * ```
 */
export class UniqueIdGenerator {
    private generated = new Set<string>();
    private maxAttempts = 100;

    /**
     * 构造唯一 ID 生成器
     *
     * @param idLength - 生成的 ID 长度，默认为 8
     */
    constructor(private readonly idLength: number = 8) {}

    /**
     * 生成唯一 ID
     *
     * @returns 唯一的 ID
     * @throws 如果多次尝试后仍无法生成唯一 ID
     */
    generate(): string {
        for (let i = 0; i < this.maxAttempts; i++) {
            const id = generateShortId(this.idLength);
            if (!this.generated.has(id)) {
                this.generated.add(id);
                return id;
            }
        }

        // 如果多次尝试失败，增加长度后重试
        const longerLength = this.idLength + 2;
        const id = generateShortId(longerLength);
        this.generated.add(id);
        return id;
    }

    /**
     * 检查 ID 是否已被使用
     *
     * @param id - 要检查的 ID
     * @returns 是否已被使用
     */
    isUsed(id: string): boolean {
        return this.generated.has(id);
    }

    /**
     * 注册外部 ID（标记为已使用）
     *
     * @param id - 要注册的 ID
     */
    register(id: string): void {
        this.generated.add(id);
    }

    /**
     * 清空已生成的 ID 记录
     */
    clear(): void {
        this.generated.clear();
    }

    /**
     * 获取已生成的 ID 数量
     *
     * @returns ID 数量
     */
    count(): number {
        return this.generated.size;
    }
}

/**
 * 获取当前时间戳
 *
 * @returns 当前时间的 Date 对象
 */
export function getCurrentTimestamp(): Date {
    return new Date();
}

/**
 * 计算运行时间
 *
 * @param startTime - 开始时间
 * @returns 运行时间（毫秒）
 */
export function calculateUptime(startTime: Date): number {
    return Date.now() - startTime.getTime();
}

/**
 * 格式化持续时间
 *
 * 将毫秒数格式化为人类可读的时间字符串。
 *
 * @param ms - 毫秒数
 * @returns 格式化的时间字符串
 *
 * @example
 * ```typescript
 * formatDuration(1500); // '1.5s'
 * formatDuration(65000); // '1m 5s'
 * formatDuration(3665000); // '1h 1m 5s'
 * ```
 */
export function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${ms}ms`;
    }

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        const remainingMinutes = minutes % 60;
        const remainingSeconds = seconds % 60;
        return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
    }

    if (minutes > 0) {
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    }

    if (ms % 1000 === 0) {
        return `${seconds}s`;
    }

    return `${(ms / 1000).toFixed(1)}s`;
}
