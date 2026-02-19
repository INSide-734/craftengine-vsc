/**
 * Minecraft 数据查询接口
 *
 * 提供所有 Minecraft 游戏数据的获取和名称列表查询功能
 */

import type {
    IAttribute,
    IBiome,
    IBlock,
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

/**
 * Minecraft 数据查询接口
 *
 * 提供两类查询方法：
 * - 完整对象查询（getXXX）：返回完整数据对象数组
 * - 名称列表查询（getXXXNames）：返回名称字符串数组，用于补全
 */
export interface IMinecraftDataQuery {
    // ========================================================================
    // 数据获取（返回完整对象）
    // ========================================================================

    /**
     * 获取所有附魔数据
     *
     * @returns 附魔数据数组
     */
    getEnchantments(): IEnchantment[];

    /**
     * 获取所有实体数据
     *
     * @returns 实体数据数组
     */
    getEntities(): IEntity[];

    /**
     * 获取所有粒子效果数据
     *
     * @returns 粒子效果数据数组
     */
    getParticles(): IParticle[];

    /**
     * 获取所有药水效果数据
     *
     * @returns 药水效果数据数组
     */
    getPotionEffects(): IPotionEffect[];

    /**
     * 获取所有生物群系数据
     *
     * @returns 生物群系数据数组
     */
    getBiomes(): IBiome[];

    /**
     * 获取所有声音事件数据
     *
     * @returns 声音事件数据数组
     */
    getSounds(): ISound[];

    /**
     * 获取所有方块数据
     *
     * @returns 方块数据数组
     */
    getBlocks(): IBlock[];

    /**
     * 获取所有物品数据
     *
     * @returns 物品数据数组
     */
    getItems(): IMinecraftItem[];

    /**
     * 获取所有属性数据
     *
     * @returns 属性数据数组
     */
    getAttributes(): IAttribute[];

    /**
     * 获取所有伤害类型数据
     *
     * @returns 伤害类型数据数组
     */
    getDamageTypes(): IDamageType[];

    /**
     * 获取所有游戏事件数据
     *
     * @returns 游戏事件数据数组
     */
    getGameEvents(): IGameEvent[];

    /**
     * 获取指定类型的所有标签
     *
     * @param type 标签类型（blocks/items/entity_types/fluids/game_events）
     * @returns 标签数据数组
     */
    getTags(type: IMinecraftTag['type']): IMinecraftTag[];

    /**
     * 获取所有标签（所有类型）
     *
     * @returns 标签数据数组
     */
    getAllTags(): IMinecraftTag[];

    // ========================================================================
    // 快速查找（返回名称列表，用于补全）
    // ========================================================================

    /**
     * 获取所有附魔名称列表
     *
     * @returns 附魔名称数组（不含命名空间）
     */
    getEnchantmentNames(): string[];

    /**
     * 获取所有实体名称列表
     *
     * @returns 实体名称数组（不含命名空间）
     */
    getEntityNames(): string[];

    /**
     * 获取所有粒子效果名称列表
     *
     * @returns 粒子效果名称数组（不含命名空间）
     */
    getParticleNames(): string[];

    /**
     * 获取所有药水效果名称列表
     *
     * @returns 药水效果名称数组（不含命名空间）
     */
    getPotionEffectNames(): string[];

    /**
     * 获取所有生物群系名称列表
     *
     * @returns 生物群系名称数组（不含命名空间）
     */
    getBiomeNames(): string[];

    /**
     * 获取所有声音事件名称列表
     *
     * @returns 声音事件名称数组
     */
    getSoundNames(): string[];

    /**
     * 获取所有方块名称列表
     *
     * @returns 方块名称数组（不含命名空间）
     */
    getBlockNames(): string[];

    /**
     * 获取所有物品名称列表
     *
     * @returns 物品名称数组（不含命名空间）
     */
    getItemNames(): string[];

    /**
     * 获取所有属性名称列表
     *
     * @returns 属性名称数组
     */
    getAttributeNames(): string[];

    /**
     * 获取所有伤害类型名称列表
     *
     * @returns 伤害类型名称数组
     */
    getDamageTypeNames(): string[];

    /**
     * 获取所有游戏事件名称列表
     *
     * @returns 游戏事件名称数组
     */
    getGameEventNames(): string[];

    /**
     * 获取指定类型的标签名称列表
     *
     * @param type 标签类型
     * @returns 标签名称数组
     */
    getTagNames(type: IMinecraftTag['type']): string[];
}
