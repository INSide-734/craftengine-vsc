/**
 * Minecraft 原版数据类型定义
 *
 * 包含所有 Minecraft 游戏数据的基础类型接口，
 * 从 IMinecraftDataService 中提取，便于独立引用和复用。
 *
 * 涵盖以下数据类型：
 * - 方块（IBlock, IBlockState）
 * - 物品（IMinecraftItem）
 * - 属性（IAttribute）
 * - 伤害类型（IDamageType）
 * - 游戏事件（IGameEvent）
 * - 标签（IMinecraftTag）
 * - 附魔（IEnchantment）
 * - 实体（IEntity）
 * - 粒子效果（IParticle）
 * - 药水效果（IPotionEffect）
 * - 生物群系（IBiome）
 * - 声音事件（ISound）
 */

// ============================================================================
// 方块相关类型
// ============================================================================

/**
 * 方块数据接口
 *
 * @example
 * ```typescript
 * const stone: IBlock = {
 *   id: 1,
 *   name: 'stone',
 *   displayName: 'Stone',
 *   hardness: 1.5,
 *   resistance: 6,
 *   stackSize: 64,
 *   diggable: true,
 *   transparent: false
 * };
 * ```
 */
export interface IBlock {
    /** 数字 ID */
    id: number;
    /** 内部名称（不含命名空间） */
    name: string;
    /** 显示名称 */
    displayName: string;
    /** 硬度（挖掘时间因子） */
    hardness: number | null;
    /** 爆炸抗性 */
    resistance: number;
    /** 堆叠上限 */
    stackSize: number;
    /** 是否可挖掘 */
    diggable: boolean;
    /** 是否透明 */
    transparent: boolean;
    /** 发光等级 (0-15) */
    emitLight?: number;
    /** 过滤光线等级 (0-15) */
    filterLight?: number;
    /** 边界框类型 */
    boundingBox?: string;
    /** 默认状态 ID */
    defaultState?: number;
    /** 最小状态 ID */
    minStateId?: number;
    /** 最大状态 ID */
    maxStateId?: number;
    /** 可用状态列表 */
    states?: IBlockState[];
    /** 掉落物 ID */
    drops?: number[];
    /** 对应物品 ID */
    material?: string;
}

/**
 * 方块状态接口
 */
export interface IBlockState {
    /** 状态名称 */
    name: string;
    /** 状态类型 */
    type: 'bool' | 'int' | 'enum';
    /** 可用值列表 */
    values?: string[];
    /** 最小值（int 类型） */
    num_values?: number;
}

// ============================================================================
// 物品相关类型
// ============================================================================

/**
 * 物品数据接口
 *
 * @example
 * ```typescript
 * const diamond: IMinecraftItem = {
 *   id: 264,
 *   name: 'diamond',
 *   displayName: 'Diamond',
 *   stackSize: 64
 * };
 * ```
 */
export interface IMinecraftItem {
    /** 数字 ID */
    id: number;
    /** 内部名称（不含命名空间） */
    name: string;
    /** 显示名称 */
    displayName: string;
    /** 堆叠上限 */
    stackSize: number;
    /** 最大耐久 */
    durability?: number;
    /** 附魔能力（用于附魔台） */
    enchantCategories?: string[];
    /** 修复材料 */
    repairWith?: string[];
}

// ============================================================================
// 属性与伤害类型
// ============================================================================

/**
 * 属性数据接口
 *
 * @example
 * ```typescript
 * const maxHealth: IAttribute = {
 *   name: 'generic.max_health',
 *   resource: 'max_health',
 *   min: 1,
 *   max: 1024,
 *   default: 20
 * };
 * ```
 */
export interface IAttribute {
    /** 属性名称（完整路径，如 generic.max_health） */
    name: string;
    /** 资源名称（不含前缀） */
    resource: string;
    /** 最小值 */
    min: number;
    /** 最大值 */
    max: number;
    /** 默认值 */
    default: number;
}

/**
 * 伤害类型数据接口
 *
 * @example
 * ```typescript
 * const fireDamage: IDamageType = {
 *   name: 'in_fire',
 *   scaling: 'when_caused_by_living_non_player',
 *   exhaustion: 0.1,
 *   effects: 'burning'
 * };
 * ```
 */
export interface IDamageType {
    /** 伤害类型名称 */
    name: string;
    /** 伤害缩放类型 */
    scaling: string;
    /** 消耗饥饿值 */
    exhaustion: number;
    /** 伤害效果 */
    effects?: string;
    /** 死亡消息类型 */
    message_id?: string;
}

// ============================================================================
// 游戏事件与标签
// ============================================================================

/**
 * 游戏事件数据接口
 *
 * @example
 * ```typescript
 * const blockChange: IGameEvent = {
 *   id: 1,
 *   name: 'block_change'
 * };
 * ```
 */
export interface IGameEvent {
    /** 数字 ID */
    id: number;
    /** 事件名称 */
    name: string;
}

/**
 * 标签数据接口
 *
 * @example
 * ```typescript
 * const planksTag: IMinecraftTag = {
 *   name: 'planks',
 *   type: 'blocks',
 *   values: ['oak_planks', 'spruce_planks', 'birch_planks', ...]
 * };
 * ```
 */
export interface IMinecraftTag {
    /** 标签名称（不含命名空间） */
    name: string;
    /** 标签类型 */
    type: 'blocks' | 'items' | 'entity_types' | 'fluids' | 'game_events';
    /** 标签包含的值（ID 列表） */
    values: string[];
}

// ============================================================================
// 附魔与实体
// ============================================================================

/**
 * 附魔数据接口
 *
 * @example
 * ```typescript
 * const sharpness: IEnchantment = {
 *   id: 16,
 *   name: 'sharpness',
 *   displayName: 'Sharpness',
 *   maxLevel: 5,
 *   category: 'weapon',
 *   treasureOnly: false,
 *   curse: false
 * };
 * ```
 */
export interface IEnchantment {
    /** 数字 ID */
    id: number;
    /** 内部名称（不含命名空间） */
    name: string;
    /** 显示名称 */
    displayName: string;
    /** 最大等级 */
    maxLevel: number;
    /** 适用物品类别 */
    category: string;
    /** 是否仅宝藏物品获得 */
    treasureOnly: boolean;
    /** 是否为诅咒 */
    curse: boolean;
    /** 权重（影响出现概率） */
    weight?: number;
    /** 互斥附魔列表 */
    exclude?: string[];
}

/**
 * 实体类型数据接口
 *
 * @example
 * ```typescript
 * const zombie: IEntity = {
 *   id: 54,
 *   name: 'zombie',
 *   displayName: 'Zombie',
 *   type: 'mob',
 *   category: 'hostile'
 * };
 * ```
 */
export interface IEntity {
    /** 数字 ID */
    id: number;
    /** 内部名称（不含命名空间） */
    name: string;
    /** 显示名称 */
    displayName: string;
    /** 实体类型分类 */
    type: string;
    /** 实体类别 */
    category?: string;
    /** 宽度 */
    width?: number;
    /** 高度 */
    height?: number;
}

// ============================================================================
// 粒子效果与药水效果
// ============================================================================

/**
 * 粒子效果数据接口
 *
 * @example
 * ```typescript
 * const flame: IParticle = {
 *   id: 26,
 *   name: 'flame'
 * };
 * ```
 */
export interface IParticle {
    /** 数字 ID */
    id: number;
    /** 内部名称（不含命名空间） */
    name: string;
}

/**
 * 药水效果数据接口
 *
 * @example
 * ```typescript
 * const speed: IPotionEffect = {
 *   id: 1,
 *   name: 'speed',
 *   displayName: 'Speed',
 *   type: 'good'
 * };
 * ```
 */
export interface IPotionEffect {
    /** 数字 ID */
    id: number;
    /** 内部名称（不含命名空间） */
    name: string;
    /** 显示名称 */
    displayName: string;
    /** 效果类型：good（增益）或 bad（减益） */
    type: 'good' | 'bad';
}

// ============================================================================
// 生物群系与声音
// ============================================================================

/**
 * 生物群系数据接口
 *
 * @example
 * ```typescript
 * const plains: IBiome = {
 *   id: 1,
 *   name: 'plains',
 *   displayName: 'Plains',
 *   category: 'none',
 *   temperature: 0.8,
 *   precipitation: 'rain'
 * };
 * ```
 */
export interface IBiome {
    /** 数字 ID */
    id: number;
    /** 内部名称（不含命名空间） */
    name: string;
    /** 显示名称 */
    displayName: string;
    /** 生物群系类别 */
    category: string;
    /** 温度 */
    temperature?: number;
    /** 降水类型 */
    precipitation?: string;
    /** 颜色 */
    color?: number;
}

/**
 * 声音事件数据接口
 *
 * @example
 * ```typescript
 * const hurt: ISound = {
 *   name: 'entity.player.hurt'
 * };
 * ```
 */
export interface ISound {
    /** 声音事件名称（完整路径） */
    name: string;
}
