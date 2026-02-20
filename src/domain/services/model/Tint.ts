/**
 * Tint（着色）系统实现
 *
 * 移植自 craft-engine 的 Tint 系统，支持多种着色类型。
 */

import { type TintConfig, type TintType, type TintValue } from '../../../core/interfaces/IModelGenerator';

// ============================================
// Tint 接口
// ============================================

/**
 * Tint 接口
 *
 * 所有着色类型的基础接口
 */
export interface Tint {
    /** 着色类型 */
    readonly type: TintType | string;

    /**
     * 生成 JSON 对象
     *
     * @returns Tint JSON 对象
     */
    toJson(): Record<string, unknown>;
}

// ============================================
// Tint 工具函数
// ============================================

/**
 * 解析 Tint 值
 *
 * @param value - 原始值（整数或 RGB 数组）
 * @returns 解析后的 TintValue
 */
export function parseTintValue(value: unknown): TintValue {
    if (typeof value === 'number') {
        return value;
    }
    if (Array.isArray(value) && value.length === 3) {
        return [Number(value[0]), Number(value[1]), Number(value[2])] as [number, number, number];
    }
    // 默认返回 0
    return 0;
}

/**
 * 将 TintValue 转换为 JSON 值
 *
 * 注意：TintValue 本身就是有效的 JSON 值，此函数保留用于类型明确性
 */
export function tintValueToJson(value: TintValue): TintValue {
    return value;
}

// ============================================
// Tint 实现类
// ============================================

/**
 * 常量 Tint
 */
export class ConstantTint implements Tint {
    readonly type = 'minecraft:constant' as const;
    private readonly value: TintValue;

    constructor(value: TintValue) {
        this.value = value;
    }

    toJson(): Record<string, unknown> {
        return {
            type: this.type,
            value: tintValueToJson(this.value),
        };
    }

    static fromConfig(config: Record<string, unknown>): ConstantTint {
        const value = config['value'] ?? config['default'] ?? 0;
        return new ConstantTint(parseTintValue(value));
    }
}

/**
 * 自定义模型数据 Tint
 */
export class CustomModelDataTint implements Tint {
    readonly type = 'minecraft:custom_model_data' as const;
    private readonly defaultValue: TintValue;
    private readonly index: number;

    constructor(defaultValue: TintValue, index: number = 0) {
        this.defaultValue = defaultValue;
        this.index = index;
    }

    toJson(): Record<string, unknown> {
        const json: Record<string, unknown> = {
            type: this.type,
        };
        if (this.index !== 0) {
            json['index'] = this.index;
        }
        json['default'] = tintValueToJson(this.defaultValue);
        return json;
    }

    static fromConfig(config: Record<string, unknown>): CustomModelDataTint {
        const value = config['default'] ?? config['value'] ?? 0;
        const index = Number(config['index'] ?? 0);
        return new CustomModelDataTint(parseTintValue(value), index);
    }
}

/**
 * 草地 Tint
 */
export class GrassTint implements Tint {
    readonly type = 'minecraft:grass' as const;

    toJson(): Record<string, unknown> {
        return {
            type: this.type,
        };
    }

    static fromConfig(_config: Record<string, unknown>): GrassTint {
        return new GrassTint();
    }
}

/**
 * 简单默认 Tint（用于染料、烟火、地图颜色、药水、队伍）
 */
export class SimpleDefaultTint implements Tint {
    readonly type: TintType;
    private readonly defaultValue?: TintValue;

    constructor(type: TintType, defaultValue?: TintValue) {
        this.type = type;
        this.defaultValue = defaultValue;
    }

    toJson(): Record<string, unknown> {
        const json: Record<string, unknown> = {
            type: this.type,
        };
        if (this.defaultValue !== undefined) {
            json['default'] = tintValueToJson(this.defaultValue);
        }
        return json;
    }

    static fromConfig(type: TintType, config: Record<string, unknown>): SimpleDefaultTint {
        const value = config['default'];
        return new SimpleDefaultTint(type, value !== undefined ? parseTintValue(value) : undefined);
    }
}

// ============================================
// Tint 工厂
// ============================================

/**
 * Tint 工厂类型映射（延迟初始化）
 */
let TINT_FACTORIES: Record<string, (config: Record<string, unknown>) => Tint> | null = null;

/**
 * 构建默认的 Tint 工厂映射（硬编码回退）
 */
function buildDefaultTintFactories(): Record<string, (config: Record<string, unknown>) => Tint> {
    return {
        'minecraft:constant': ConstantTint.fromConfig,
        constant: ConstantTint.fromConfig,
        'minecraft:custom_model_data': CustomModelDataTint.fromConfig,
        custom_model_data: CustomModelDataTint.fromConfig,
        'minecraft:grass': GrassTint.fromConfig,
        grass: GrassTint.fromConfig,
        'minecraft:dye': (c) => SimpleDefaultTint.fromConfig('minecraft:dye', c),
        dye: (c) => SimpleDefaultTint.fromConfig('minecraft:dye', c),
        'minecraft:firework': (c) => SimpleDefaultTint.fromConfig('minecraft:firework', c),
        firework: (c) => SimpleDefaultTint.fromConfig('minecraft:firework', c),
        'minecraft:map_color': (c) => SimpleDefaultTint.fromConfig('minecraft:map_color', c),
        map_color: (c) => SimpleDefaultTint.fromConfig('minecraft:map_color', c),
        'minecraft:potion': (c) => SimpleDefaultTint.fromConfig('minecraft:potion', c),
        potion: (c) => SimpleDefaultTint.fromConfig('minecraft:potion', c),
        'minecraft:team': (c) => SimpleDefaultTint.fromConfig('minecraft:team', c),
        team: (c) => SimpleDefaultTint.fromConfig('minecraft:team', c),
    };
}

/** 专用工厂类映射 */
const SPECIAL_FACTORY_MAP: Record<string, (config: Record<string, unknown>) => Tint> = {
    constant: ConstantTint.fromConfig,
    custom_model_data: CustomModelDataTint.fromConfig,
    grass: GrassTint.fromConfig,
};

/**
 * 从配置初始化 Tint 工厂映射
 *
 * @param tintTypesConfig - tintTypes 配置（specialFactories + simpleDefaultTypes）
 */
export function initializeTintFactories(tintTypesConfig: {
    specialFactories: string[];
    simpleDefaultTypes: string[];
}): void {
    const factories: Record<string, (config: Record<string, unknown>) => Tint> = {};

    // 注册专用工厂类型
    for (const typeName of tintTypesConfig.specialFactories) {
        const factory = SPECIAL_FACTORY_MAP[typeName];
        if (factory) {
            factories[`minecraft:${typeName}`] = factory;
            factories[typeName] = factory;
        }
    }

    // 注册 SimpleDefaultTint 类型
    for (const typeName of tintTypesConfig.simpleDefaultTypes) {
        const fullKey = `minecraft:${typeName}` as TintType;
        factories[fullKey] = (c) => SimpleDefaultTint.fromConfig(fullKey, c);
        factories[typeName] = (c) => SimpleDefaultTint.fromConfig(fullKey, c);
    }

    TINT_FACTORIES = factories;
}

/**
 * 获取 Tint 工厂映射（延迟初始化）
 */
function getTintFactories(): Record<string, (config: Record<string, unknown>) => Tint> {
    if (!TINT_FACTORIES) {
        TINT_FACTORIES = buildDefaultTintFactories();
    }
    return TINT_FACTORIES;
}

/**
 * 从配置创建 Tint 实例
 *
 * @param config - Tint 配置对象
 * @returns Tint 实例
 */
export function createTint(config: TintConfig | Record<string, unknown>): Tint {
    const type = String(config.type ?? 'minecraft:constant');
    const factory = getTintFactories()[type];

    if (!factory) {
        // 未知类型，返回常量 Tint
        return new ConstantTint(0);
    }

    return factory(config as Record<string, unknown>);
}

/**
 * 从配置列表创建 Tint 数组
 *
 * @param configs - Tint 配置列表
 * @returns Tint 数组
 */
export function createTints(configs: unknown[]): Tint[] {
    if (!Array.isArray(configs)) {
        return [];
    }
    return configs.filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null).map(createTint);
}
