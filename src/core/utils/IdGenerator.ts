/**
 * 核心 ID 生成工具函数
 *
 * 提供事件 ID 和随机 ID 生成功能，供 Domain 层和其他层使用。
 */

/**
 * 生成事件 ID
 *
 * 生成用于事件追踪的唯一标识符，格式为 `{prefix}_{timestamp}_{randomId}`。
 *
 * @param prefix - ID 前缀，默认为 'evt'
 * @returns 唯一的事件 ID
 */
export function generateEventId(prefix: string = 'evt'): string {
    return `${prefix}_${Date.now()}_${generateRandomId(9)}`;
}

/**
 * 生成随机 ID
 *
 * 生成指定长度的随机字符串，由字母和数字组成。
 *
 * @param length - ID 长度，默认为 9
 * @returns 随机 ID 字符串
 */
export function generateRandomId(length: number = 9): string {
    return Math.random().toString(36).substring(2, 2 + length);
}
