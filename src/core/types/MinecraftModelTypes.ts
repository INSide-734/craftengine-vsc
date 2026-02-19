/**
 * Minecraft 模型类型定义
 *
 * 包含所有与 Minecraft 模型生成相关的数据类型定义，
 * 从 IModelGenerator 接口文件中提取，便于独立引用和复用。
 *
 * 涵盖以下类型分类：
 * - 基础类型（ResourceKey, Vector3）
 * - Minecraft 模型 JSON 结构类型
 * - CraftEngine 物品模型类型
 * - Tint（着色）类型系统
 * - 模型生成配置与结果
 * - ItemModel 运行时类型与配置类型
 */

// ============================================
// 基础类型定义
// ============================================

/**
 * 资源键类型
 *
 * 表示带命名空间的资源标识符，如 "minecraft:item/diamond_sword"
 */
export interface IResourceKey {
    /** 命名空间 */
    namespace: string;
    /** 路径 */
    path: string;
}

/**
 * Vector3 类型
 */
export type Vector3 = [number, number, number];

// ============================================
// Minecraft 模型 JSON 类型定义
// ============================================

/**
 * 显示变换配置
 *
 * 定义模型在不同显示位置（如 GUI、手持等）的变换参数。
 */
export interface IDisplayTransform {
    /** 旋转角度 [X, Y, Z]，单位为度 */
    rotation?: [number, number, number];
    /** 平移偏移 [X, Y, Z] */
    translation?: [number, number, number];
    /** 缩放比例 [X, Y, Z] */
    scale?: [number, number, number];
}

/**
 * 元素旋转配置
 */
export interface IElementRotation {
    /** 旋转中心点 [X, Y, Z] */
    origin: [number, number, number];
    /** 旋转轴 */
    axis: 'x' | 'y' | 'z';
    /** 旋转角度，必须是 -45, -22.5, 0, 22.5, 45 之一 */
    angle: number;
    /** 是否进行旋转补偿缩放 */
    rescale?: boolean;
}

/**
 * 模型面定义
 */
export interface IModelFace {
    /** 纹理引用（如 #texture 或完整路径） */
    texture: string;
    /** UV 坐标 [fromX, fromY, toX, toY]，范围 0-16 */
    uv?: [number, number, number, number];
    /** 纹理旋转角度，必须是 0, 90, 180, 270 之一 */
    rotation?: number;
    /** 着色索引 */
    tintindex?: number;
    /** 剔除面方向 */
    cullface?: 'down' | 'up' | 'north' | 'south' | 'west' | 'east';
}

/**
 * 模型元素定义
 *
 * 定义一个立方体元素的几何形状和纹理。
 */
export interface IModelElement {
    /** 起始坐标 [X, Y, Z]，范围 -16 到 32 */
    from: [number, number, number];
    /** 结束坐标 [X, Y, Z]，范围 -16 到 32 */
    to: [number, number, number];
    /** 元素旋转配置 */
    rotation?: IElementRotation;
    /** 是否启用阴影，默认 true */
    shade?: boolean;
    /** 六个面的纹理定义 */
    faces?: {
        down?: IModelFace;
        up?: IModelFace;
        north?: IModelFace;
        south?: IModelFace;
        west?: IModelFace;
        east?: IModelFace;
    };
}

/**
 * Minecraft 模型 JSON 结构
 *
 * 符合 Minecraft 资源包模型格式的 JSON 结构定义。
 */
export interface IMinecraftModelJson {
    /** 父模型路径（如 minecraft:item/generated） */
    parent?: string;
    /** 纹理映射表 */
    textures?: Record<string, string>;
    /** 3D 元素数组 */
    elements?: IModelElement[];
    /** 显示位置变换配置 */
    display?: {
        thirdperson_righthand?: IDisplayTransform;
        thirdperson_lefthand?: IDisplayTransform;
        firstperson_righthand?: IDisplayTransform;
        firstperson_lefthand?: IDisplayTransform;
        gui?: IDisplayTransform;
        head?: IDisplayTransform;
        ground?: IDisplayTransform;
        fixed?: IDisplayTransform;
        on_shelf?: IDisplayTransform;
    };
    /** 是否启用环境光遮蔽 */
    ambientocclusion?: boolean;
    /** GUI 光照模式 */
    gui_light?: 'front' | 'side';
}

// ============================================
// CraftEngine 物品模型类型
// ============================================

/**
 * 显示位置枚举
 *
 * 对应 Minecraft 模型的显示位置配置
 */
export type DisplayPosition =
    | 'thirdperson_righthand'
    | 'thirdperson_lefthand'
    | 'firstperson_righthand'
    | 'firstperson_lefthand'
    | 'gui'
    | 'head'
    | 'ground'
    | 'fixed'
    | 'on_shelf';

/**
 * GUI 光照模式
 */
export type GuiLight = 'front' | 'side';

/**
 * 模型类型标识
 *
 * 对应 CraftEngine 支持的 8 种模型类型
 */
export type ItemModelType =
    | 'minecraft:empty'
    | 'minecraft:model'
    | 'minecraft:composite'
    | 'minecraft:condition'
    | 'minecraft:range_dispatch'
    | 'minecraft:select'
    | 'minecraft:special'
    | 'minecraft:bundle/selected_item';

// ============================================
// Tint（着色）类型系统
// ============================================

/**
 * Tint 类型标识
 */
export type TintType =
    | 'minecraft:constant'
    | 'minecraft:custom_model_data'
    | 'minecraft:dye'
    | 'minecraft:firework'
    | 'minecraft:grass'
    | 'minecraft:map_color'
    | 'minecraft:potion'
    | 'minecraft:team';

/**
 * Tint 值类型
 *
 * 可以是整数颜色值或 RGB 浮点数组
 */
export type TintValue = number | [number, number, number];

/**
 * 基础 Tint 配置
 */
export interface IBaseTintConfig {
    /** 色调类型 */
    type: TintType | string;
}

/**
 * 常量 Tint 配置
 */
export interface IConstantTintConfig extends IBaseTintConfig {
    type: 'minecraft:constant';
    /** 颜色值（整数或 RGB 浮点数组） */
    value: TintValue;
}

/**
 * 自定义模型数据 Tint 配置
 */
export interface ICustomModelDataTintConfig extends IBaseTintConfig {
    type: 'minecraft:custom_model_data';
    /** 索引 */
    index?: number;
    /** 默认颜色值 */
    default?: TintValue;
}

/**
 * 草地 Tint 配置
 */
export interface IGrassTintConfig extends IBaseTintConfig {
    type: 'minecraft:grass';
    /** 温度 */
    temperature?: number;
    /** 降水量 */
    downfall?: number;
}

/**
 * 简单默认 Tint 配置（用于染料、烟火、地图颜色、药水、队伍）
 */
export interface ISimpleDefaultTintConfig extends IBaseTintConfig {
    type: 'minecraft:dye' | 'minecraft:firework' | 'minecraft:map_color' | 'minecraft:potion' | 'minecraft:team';
    /** 默认颜色值 */
    default?: TintValue;
}

/**
 * Tint 配置联合类型
 */
export type TintConfig =
    | IConstantTintConfig
    | ICustomModelDataTintConfig
    | IGrassTintConfig
    | ISimpleDefaultTintConfig
    | IBaseTintConfig;

/**
 * 模型生成配置
 *
 * 对应 CraftEngine 的 generation 配置节点
 */
export interface IModelGenerationConfig {
    /** 父模型路径 */
    parent?: string;
    /** 纹理覆盖映射 */
    textures?: Record<string, string>;
    /** 显示位置配置 */
    display?: Partial<Record<DisplayPosition, IDisplayTransform>>;
    /** GUI 光照模式 */
    'gui-light'?: GuiLight;
    /** 环境光遮蔽 */
    'ambient-occlusion'?: boolean;
}

// ============================================
// 模型生成结果
// ============================================

/**
 * 模型生成结果
 */
export interface IModelGenerationResult {
    /** 是否成功 */
    success: boolean;
    /** 生成的模型 JSON */
    modelJson?: IMinecraftModelJson;
    /** 模型路径（如果是引用现有模型） */
    modelPath?: string;
    /** 错误信息 */
    error?: string;
}

// ============================================
// ItemModel 类型系统
// ============================================

/**
 * 显示元数据
 *
 * 定义模型在特定显示位置的变换参数
 */
export interface IDisplayMeta {
    /** 旋转角度 [X, Y, Z] */
    rotation?: Vector3;
    /** 平移偏移 [X, Y, Z] */
    translation?: Vector3;
    /** 缩放比例 [X, Y, Z] */
    scale?: Vector3;
}

/**
 * 模型生成数据
 *
 * 对应 craft-engine 的 ModelGeneration 类
 */
export interface IModelGeneration {
    /** 模型路径 */
    path: string;
    /** 父模型路径 */
    parentModelPath: string;
    /** 纹理覆盖映射 */
    texturesOverride?: Record<string, string>;
    /** 显示位置配置 */
    displays?: Partial<Record<DisplayPosition, IDisplayMeta>>;
    /** GUI 光照模式 */
    guiLight?: GuiLight;
    /** 环境光遮蔽 */
    ambientOcclusion?: boolean;
}

/**
 * ItemModel 接口
 *
 * 所有物品模型类型的基础接口
 */
export interface IItemModel {
    /** 模型类型标识 */
    readonly type: ItemModelType | string;

    /**
     * 根据版本生成模型 JSON
     *
     * @param version - Minecraft 版本（可选）
     * @returns Minecraft 模型 JSON 对象
     */
    apply(version?: IMinecraftVersionInfo): Record<string, unknown>;

    /**
     * 生成模型 JSON（无版本参数，向后兼容）
     *
     * @returns Minecraft 模型 JSON 对象
     */
    toJson(): Record<string, unknown>;

    /**
     * 获取需要生成的模型列表
     *
     * @returns ModelGeneration 数组
     */
    modelsToGenerate(): IModelGeneration[];

    /**
     * 获取版本修订列表
     *
     * @returns Revision 数组
     */
    revisions(): IRevision[];
}

/**
 * Minecraft 版本信息接口
 */
export interface IMinecraftVersionInfo {
    /** 主版本号 */
    major: number;
    /** 次版本号 */
    minor: number;
    /** 修订版本号 */
    patch: number;

    /**
     * 检查是否大于等于指定版本
     */
    isAtOrAbove(other: IMinecraftVersionInfo): boolean;

    /**
     * 检查是否低于指定版本
     */
    isBelow(other: IMinecraftVersionInfo): boolean;
}

/**
 * 版本修订接口
 */
export interface IRevision {
    /** 检查版本是否适用 */
    isApplicable(version: IMinecraftVersionInfo): boolean;
}

// ============================================
// ItemModel 运行时类型（与配置类型区分）
// ============================================

/**
 * 选择模型 Case 运行时类型
 *
 * 用于 SelectItemModel 的运行时实例，model 字段是 ItemModel 接口
 */
export interface ISelectCase {
    /** 匹配条件 */
    when: unknown;
    /** 对应的模型实例 */
    model: IItemModel;
}

/**
 * 范围分发条目运行时类型
 *
 * 用于 RangeDispatchItemModel 的运行时实例，model 字段是 IItemModel 接口
 */
export interface IRangeDispatchEntry {
    /** 阈值 */
    threshold: number;
    /** 对应的模型实例 */
    model: IItemModel;
}

// ============================================
// ItemModel 配置类型
// ============================================

/**
 * 基础模型配置
 */
export interface IBaseItemModelConfig {
    type?: 'minecraft:model';
    /** 模型路径 */
    path: string;
    /** Tint 配置列表 */
    tints?: TintConfig[];
    /** 模型生成配置 */
    generation?: IModelGenerationConfig;
}

/**
 * 空模型配置
 */
export interface IEmptyItemModelConfig {
    type: 'minecraft:empty';
}

/**
 * 复合模型配置
 */
export interface ICompositeItemModelConfig {
    type: 'minecraft:composite';
    /** 子模型列表 */
    models: ItemModelConfig[];
}

/**
 * 条件模型配置
 */
export interface IConditionItemModelConfig {
    type: 'minecraft:condition';
    /** 条件属性 */
    property: string;
    /** 条件为真时的模型 */
    'on-true': ItemModelConfig;
    /** 条件为假时的模型 */
    'on-false': ItemModelConfig;
    /** 其他条件参数 */
    [key: string]: unknown;
}

/**
 * 选择模型 case 配置
 */
export interface ISelectCaseConfig {
    /** 匹配条件 */
    when: unknown;
    /** 对应的模型 */
    model: ItemModelConfig;
}

/**
 * 选择模型配置
 */
export interface ISelectItemModelConfig {
    type: 'minecraft:select';
    /** 选择属性 */
    property: string;
    /** 分支列表 */
    cases: ISelectCaseConfig[];
    /** 回退模型 */
    fallback?: ItemModelConfig;
    /** 其他属性参数 */
    [key: string]: unknown;
}

/**
 * 范围分发条目配置
 */
export interface IRangeDispatchEntryConfig {
    /** 阈值 */
    threshold: number;
    /** 对应的模型 */
    model: ItemModelConfig;
}

/**
 * 范围分发模型配置
 */
export interface IRangeDispatchItemModelConfig {
    type: 'minecraft:range_dispatch';
    /** 分发属性 */
    property: string;
    /** 缩放因子 */
    scale?: number;
    /** 条目列表 */
    entries: IRangeDispatchEntryConfig[];
    /** 回退模型 */
    fallback?: ItemModelConfig;
    /** 其他属性参数 */
    [key: string]: unknown;
}

/**
 * 特殊模型配置
 */
export interface ISpecialItemModelConfig {
    type: 'minecraft:special';
    /** 特殊模型类型 */
    model: Record<string, unknown>;
    /** 基础模型路径 */
    base?: string;
}

/**
 * 捆绑选中物品模型配置
 */
export interface IBundleSelectedItemModelConfig {
    type: 'minecraft:bundle/selected_item';
}

/**
 * ItemModel 配置联合类型
 */
export type ItemModelConfig =
    | string
    | IBaseItemModelConfig
    | IEmptyItemModelConfig
    | ICompositeItemModelConfig
    | IConditionItemModelConfig
    | ISelectItemModelConfig
    | IRangeDispatchItemModelConfig
    | ISpecialItemModelConfig
    | IBundleSelectedItemModelConfig;
