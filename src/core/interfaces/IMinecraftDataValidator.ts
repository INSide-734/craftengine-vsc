/**
 * Minecraft 数据验证接口
 *
 * 提供 O(1) 时间复杂度的数据有效性验证功能
 */

import type { IMinecraftTag } from '../types/MinecraftDataTypes';

/**
 * Minecraft 数据验证器接口
 *
 * 所有验证方法均支持带或不带命名空间的名称格式，
 * 内部使用 Set 实现 O(1) 时间复杂度的查找。
 */
export interface IMinecraftDataValidator {
    /**
     * 验证附魔名称是否有效
     *
     * @param name 附魔名称（支持带或不带命名空间）
     * @returns 是否为有效的附魔名称
     */
    isValidEnchantment(name: string): boolean;

    /**
     * 验证实体名称是否有效
     *
     * @param name 实体名称（支持带或不带命名空间）
     * @returns 是否为有效的实体名称
     */
    isValidEntity(name: string): boolean;

    /**
     * 验证粒子效果名称是否有效
     *
     * @param name 粒子效果名称（支持带或不带命名空间）
     * @returns 是否为有效的粒子效果名称
     */
    isValidParticle(name: string): boolean;

    /**
     * 验证药水效果名称是否有效
     *
     * @param name 药水效果名称（支持带或不带命名空间）
     * @returns 是否为有效的药水效果名称
     */
    isValidPotionEffect(name: string): boolean;

    /**
     * 验证生物群系名称是否有效
     *
     * @param name 生物群系名称（支持带或不带命名空间）
     * @returns 是否为有效的生物群系名称
     */
    isValidBiome(name: string): boolean;

    /**
     * 验证声音事件名称是否有效
     *
     * @param name 声音事件名称
     * @returns 是否为有效的声音事件名称
     */
    isValidSound(name: string): boolean;

    /**
     * 验证方块名称是否有效
     *
     * @param name 方块名称（支持带或不带命名空间）
     * @returns 是否为有效的方块名称
     */
    isValidBlock(name: string): boolean;

    /**
     * 验证物品名称是否有效
     *
     * @param name 物品名称（支持带或不带命名空间）
     * @returns 是否为有效的物品名称
     */
    isValidItem(name: string): boolean;

    /**
     * 验证属性名称是否有效
     *
     * @param name 属性名称
     * @returns 是否为有效的属性名称
     */
    isValidAttribute(name: string): boolean;

    /**
     * 验证伤害类型名称是否有效
     *
     * @param name 伤害类型名称
     * @returns 是否为有效的伤害类型名称
     */
    isValidDamageType(name: string): boolean;

    /**
     * 验证游戏事件名称是否有效
     *
     * @param name 游戏事件名称
     * @returns 是否为有效的游戏事件名称
     */
    isValidGameEvent(name: string): boolean;

    /**
     * 验证标签名称是否有效
     *
     * @param type 标签类型
     * @param name 标签名称（支持带 # 前缀和命名空间）
     * @returns 是否为有效的标签名称
     */
    isValidTag(type: IMinecraftTag['type'], name: string): boolean;

    /**
     * 检查方块/物品/实体是否属于指定标签
     *
     * @param type 标签类型
     * @param tagName 标签名称
     * @param value 要检查的值（方块/物品/实体名称）
     * @returns 是否属于标签
     */
    isInTag(type: IMinecraftTag['type'], tagName: string, value: string): boolean;
}
