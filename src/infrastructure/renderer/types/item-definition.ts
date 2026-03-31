/**
 * Minecraft 1.21+ 物品模型定义格式
 * 位置: assets/{namespace}/items/{item_id}.json
 */

// ============= 基础类型 =============

/**
 * 物品定义根结构
 */
export interface IItemDefinition {
    model: ItemModel;
}

// ============= 模型类型 (联合类型) =============

/**
 * 所有模型类型的联合
 */
export type ItemModel =
    | ISimpleItemModel
    | ISpecialItemModel
    | ICompositeItemModel
    | ISelectItemModel
    | IConditionItemModel
    | IRangeDispatchItemModel
    | IEmptyItemModel
    | IBundleSelectedItemModel;

// ============= 类型1: 简单模型引用 =============

/**
 * 简单模型引用
 * {"type": "minecraft:model", "model": "minecraft:item/diamond_sword"}
 */
export interface ISimpleItemModel {
    type: 'minecraft:model' | 'model';
    model: string;
    tints?: TintSource[];
}

// ============= 类型2: 特殊模型 =============

/**
 * 特殊模型 (箱子、床、旗帜等)
 */
export interface ISpecialItemModel {
    type: 'minecraft:special' | 'special';
    base: string;
    model: SpecialModelConfig;
    tints?: TintSource[];
}

/**
 * 特殊模型配置
 */
export type SpecialModelConfig =
    | IChestSpecialModel
    | IBedSpecialModel
    | IBannerSpecialModel
    | IShulkerBoxSpecialModel
    | IHeadSpecialModel
    | IConduitSpecialModel
    | IDecoratedPotSpecialModel
    | IShieldSpecialModel
    | ITridentSpecialModel
    | IStandingSignSpecialModel
    | IHangingSignSpecialModel;

export interface IChestSpecialModel {
    type: 'minecraft:chest' | 'chest';
    texture: string;
    openness?: number;
}

export interface IBedSpecialModel {
    type: 'minecraft:bed' | 'bed';
    texture: string;
}

export interface IBannerSpecialModel {
    type: 'minecraft:banner' | 'banner';
    color: string;
}

export interface IShulkerBoxSpecialModel {
    type: 'minecraft:shulker_box' | 'shulker_box';
    texture: string;
    openness?: number;
    orientation?: string;
}

export interface IHeadSpecialModel {
    type: 'minecraft:head' | 'head';
    kind: string;
    texture?: string;
    animation?: number;
}

export interface IConduitSpecialModel {
    type: 'minecraft:conduit' | 'conduit';
}

export interface IDecoratedPotSpecialModel {
    type: 'minecraft:decorated_pot' | 'decorated_pot';
}

export interface IShieldSpecialModel {
    type: 'minecraft:shield' | 'shield';
}

export interface ITridentSpecialModel {
    type: 'minecraft:trident' | 'trident';
}

export interface IStandingSignSpecialModel {
    type: 'minecraft:standing_sign' | 'standing_sign';
    wood_type: string;
}

export interface IHangingSignSpecialModel {
    type: 'minecraft:hanging_sign' | 'hanging_sign';
    wood_type: string;
}

// ============= 类型3: 条件选择 (select) =============

/**
 * 条件选择模型
 */
export interface ISelectItemModel {
    type: 'minecraft:select' | 'select';
    property: string;
    cases: ISelectCase[];
    fallback?: ItemModel;
    pattern?: string;
    locale?: string;
    source?: string;
    block_state_map?: Record<string, string>;
    block_state_property?: string;
    tints?: TintSource[];
}

export interface ISelectCase {
    when: string | string[];
    model: ItemModel;
}

// ============= 类型4: 条件判断 (condition) =============

/**
 * 布尔条件模型
 */
export interface IConditionItemModel {
    type: 'minecraft:condition' | 'condition';
    property: string;
    on_true: ItemModel;
    on_false: ItemModel;
    index?: number;
    slot_id?: string;
    tints?: TintSource[];
}

// ============= 类型5: 范围分发 (range_dispatch) =============

/**
 * 数值范围分发模型
 */
export interface IRangeDispatchItemModel {
    type: 'minecraft:range_dispatch' | 'range_dispatch';
    property: string;
    scale?: number;
    entries: IRangeDispatchEntry[];
    fallback?: ItemModel;
    normalize?: boolean;
    source?: string;
    tints?: TintSource[];
}

export interface IRangeDispatchEntry {
    threshold: number;
    model: ItemModel;
}

// ============= 类型6: 复合模型 =============

/**
 * 复合模型
 */
export interface ICompositeItemModel {
    type: 'minecraft:composite' | 'composite';
    models: ItemModel[];
    tints?: TintSource[];
}

// ============= 类型7: 空模型 =============

export interface IEmptyItemModel {
    type: 'minecraft:empty' | 'empty';
    tints?: TintSource[];
}

// ============= 类型8: 收纳袋选中物品 =============

export interface IBundleSelectedItemModel {
    type: 'minecraft:bundle/selected_item' | 'bundle/selected_item';
    tints?: TintSource[];
}

// ============= 着色源 (Tint Sources) =============

export type TintSource =
    | IConstantTintSource
    | IDyeTintSource
    | IGrassTintSource
    | IFireworkTintSource
    | IPotionTintSource
    | IMapColorTintSource
    | ITeamTintSource
    | ICustomModelDataTintSource;

export interface IConstantTintSource {
    type: 'minecraft:constant' | 'constant';
    value: number;
}

export interface IDyeTintSource {
    type: 'minecraft:dye' | 'dye';
    default: number;
}

export interface IGrassTintSource {
    type: 'minecraft:grass' | 'grass';
    temperature?: number;
    downfall?: number;
}

export interface IFireworkTintSource {
    type: 'minecraft:firework' | 'firework';
    default: number;
}

export interface IPotionTintSource {
    type: 'minecraft:potion' | 'potion';
    default: number;
}

export interface IMapColorTintSource {
    type: 'minecraft:map_color' | 'map_color';
    default: number;
}

export interface ITeamTintSource {
    type: 'minecraft:team' | 'team';
    default: number;
}

export interface ICustomModelDataTintSource {
    type: 'minecraft:custom_model_data' | 'custom_model_data';
    index?: number;
    default: number;
}

// ============= 渲染上下文 =============

/**
 * 渲染条件上下文
 * 用户通过 API 传入，用于解析 select/condition/range_dispatch
 */
export interface IRenderContext {
    // 时间相关
    localTime?: Date;
    timeOfDay?: number;

    // 方块状态 (select: block_state)
    blockState?: Record<string, string>;

    // 显示上下文 (select: display_context)
    displayContext?:
        | 'none'
        | 'thirdperson_lefthand'
        | 'thirdperson_righthand'
        | 'firstperson_lefthand'
        | 'firstperson_righthand'
        | 'head'
        | 'gui'
        | 'ground'
        | 'fixed';

    // 维度 (select: context_dimension)
    dimension?: string;

    // 物品使用相关 (condition/range_dispatch)
    usingItem?: boolean;
    useDuration?: number;
    useCycle?: number;

    // 损坏值 (range_dispatch: damage)
    damage?: number;

    // 装填状态 (弩)
    charged?: boolean;
    chargeType?: 'none' | 'arrow' | 'rocket';

    // 拉弓进度
    pull?: number;
    pulling?: boolean;

    // 盾牌
    blocking?: boolean;

    // 指南针
    compassAngle?: number;

    // 鱼竿
    cast?: boolean;

    // 三叉戟
    throwing?: boolean;

    // 捆绑包 (bundle)
    bundleFullness?: number;
    selectedItem?: string;

    // 自定义模型数据
    customModelData?: {
        floats?: number[];
        flags?: boolean[];
        strings?: string[];
        colors?: number[];
    };

    // 组件检查
    components?: Record<string, unknown>;

    // 附魔光泽
    hasGlint?: boolean;

    // 破损状态
    broken?: boolean;

    // 装甲纹饰
    trimMaterial?: string;
    trimPattern?: string;

    // 染色
    dyeColor?: string;

    // 药水颜色
    potionColor?: number;

    // 烟花颜色
    fireworkColor?: number;

    // 地图颜色
    mapColor?: number;
}