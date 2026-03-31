/**
 * Minecraft 原版数据服务接口
 *
 * 提供 Minecraft 游戏数据的加载、查询和验证功能
 * 数据来源：PrismarineJS/minecraft-data 和 InventivetalentDev/minecraft-assets
 */

// 重新导出所有数据类型（向后兼容）
export type {
    IAttribute,
    IBiome,
    IBlock,
    IBlockState,
    IDamageType,
    IEnchantment,
    IEntity,
    IGameEvent,
    IMinecraftItem,
    IMinecraftTag,
    IParticle,
    IPotionEffect,
    ISound,
} from '../types/MinecraftDataTypes';

// 导出子接口
export type { IMinecraftDataLoader } from './IMinecraftDataLoader';
export type { IMinecraftDataQuery } from './IMinecraftDataQuery';
export type { IMinecraftDataValidator } from './IMinecraftDataValidator';

import type { IMinecraftDataLoader } from './IMinecraftDataLoader';
import type { IMinecraftDataQuery } from './IMinecraftDataQuery';
import type { IMinecraftDataValidator } from './IMinecraftDataValidator';

/**
 * Minecraft 数据服务接口
 *
 * 提供 Minecraft 原版数据的统一访问入口
 *
 * ## 功能
 *
 * - **数据加载**：从远程仓库动态加载游戏数据
 * - **缓存管理**：内存缓存 + 1小时 TTL
 * - **版本同步**：自动获取最新 Minecraft 版本数据
 * - **快速验证**：O(1) 时间复杂度的数据验证
 *
 * ## 使用示例
 *
 * ```typescript
 * const service = ServiceContainer.getService<IMinecraftDataService>(
 *   SERVICE_TOKENS.MinecraftDataService
 * );
 *
 * // 确保数据已加载
 * await service.ensureLoaded();
 *
 * // 获取所有附魔
 * const enchantments = service.getEnchantments();
 *
 * // 验证实体名称
 * if (service.isValidEntity('zombie')) {
 *   console.log('Valid entity!');
 * }
 * ```
 */
export interface IMinecraftDataService extends IMinecraftDataLoader, IMinecraftDataQuery, IMinecraftDataValidator {}
