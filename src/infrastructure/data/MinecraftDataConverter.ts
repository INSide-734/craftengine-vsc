import {
    IEnchantment,
    IEntity,
    IParticle,
    IPotionEffect,
    IBiome,
    IBlock,
    IBlockState,
    IMinecraftItem,
    IAttribute,
    IDamageType,
    IGameEvent,
    IMinecraftTag
} from '../../core/interfaces/IMinecraftDataService';

/**
 * Minecraft 原始数据转换器
 *
 * 负责将从 PrismarineJS/minecraft-data 等数据源加载的原始数据
 * 转换为类型安全的内部数据结构。所有方法均为纯函数，无副作用。
 */
export class MinecraftDataConverter {

    /**
     * 转换附魔数据
     */
    convertEnchantments(raw: unknown[]): IEnchantment[] {
        if (!Array.isArray(raw)) { return []; }

        return raw.map((item) => {
            const obj = item as Record<string, unknown>;
            return {
                id: obj.id as number,
                name: obj.name as string,
                displayName: obj.displayName as string,
                maxLevel: obj.maxLevel as number,
                category: obj.category as string,
                treasureOnly: obj.treasureOnly as boolean,
                curse: obj.curse as boolean,
                weight: obj.weight as number | undefined,
                exclude: obj.exclude as string[] | undefined
            };
        });
    }

    /**
     * 转换实体数据
     */
    convertEntities(raw: unknown[]): IEntity[] {
        if (!Array.isArray(raw)) { return []; }

        return raw.map((item) => {
            const obj = item as Record<string, unknown>;
            return {
                id: obj.id as number,
                name: obj.name as string,
                displayName: obj.displayName as string,
                type: obj.type as string,
                category: obj.category as string | undefined,
                width: obj.width as number | undefined,
                height: obj.height as number | undefined
            };
        });
    }

    /**
     * 转换粒子数据
     */
    convertParticles(raw: unknown[]): IParticle[] {
        if (!Array.isArray(raw)) { return []; }

        return raw.map((item) => {
            const obj = item as Record<string, unknown>;
            return {
                id: obj.id as number,
                name: obj.name as string
            };
        });
    }

    /**
     * 转换药水效果数据
     */
    convertPotionEffects(raw: unknown[]): IPotionEffect[] {
        if (!Array.isArray(raw)) { return []; }

        return raw.map((item) => {
            const obj = item as Record<string, unknown>;
            return {
                id: obj.id as number,
                name: obj.name as string,
                displayName: obj.displayName as string,
                type: obj.type as 'good' | 'bad'
            };
        });
    }

    /**
     * 转换生物群系数据
     */
    convertBiomes(raw: unknown[]): IBiome[] {
        if (!Array.isArray(raw)) { return []; }

        return raw.map((item) => {
            const obj = item as Record<string, unknown>;
            return {
                id: obj.id as number,
                name: obj.name as string,
                displayName: obj.displayName as string,
                category: obj.category as string,
                temperature: obj.temperature as number | undefined,
                precipitation: obj.precipitation as string | undefined,
                color: obj.color as number | undefined
            };
        });
    }

    /**
     * 转换方块数据
     */
    convertBlocks(raw: unknown[]): IBlock[] {
        if (!Array.isArray(raw)) { return []; }

        return raw.map((item) => {
            const obj = item as Record<string, unknown>;
            return {
                id: obj.id as number,
                name: obj.name as string,
                displayName: obj.displayName as string,
                hardness: obj.hardness as number | null,
                resistance: obj.resistance as number,
                stackSize: obj.stackSize as number,
                diggable: obj.diggable as boolean,
                transparent: obj.transparent as boolean,
                emitLight: obj.emitLight as number | undefined,
                filterLight: obj.filterLight as number | undefined,
                boundingBox: obj.boundingBox as string | undefined,
                defaultState: obj.defaultState as number | undefined,
                minStateId: obj.minStateId as number | undefined,
                maxStateId: obj.maxStateId as number | undefined,
                states: this.convertBlockStates(obj.states as unknown[] | undefined),
                drops: obj.drops as number[] | undefined,
                material: obj.material as string | undefined
            };
        });
    }

    /**
     * 转换方块状态数据
     */
    convertBlockStates(raw: unknown[] | undefined): IBlockState[] | undefined {
        if (!raw || !Array.isArray(raw)) { return undefined; }

        return raw.map((item) => {
            const obj = item as Record<string, unknown>;
            return {
                name: obj.name as string,
                type: obj.type as 'bool' | 'int' | 'enum',
                values: obj.values as string[] | undefined,
                num_values: obj.num_values as number | undefined
            };
        });
    }

    /**
     * 转换物品数据
     */
    convertItems(raw: unknown[]): IMinecraftItem[] {
        if (!Array.isArray(raw)) { return []; }

        return raw.map((item) => {
            const obj = item as Record<string, unknown>;
            return {
                id: obj.id as number,
                name: obj.name as string,
                displayName: obj.displayName as string,
                stackSize: obj.stackSize as number,
                durability: obj.durability as number | undefined,
                enchantCategories: obj.enchantCategories as string[] | undefined,
                repairWith: obj.repairWith as string[] | undefined
            };
        });
    }

    /**
     * 转换属性数据
     */
    convertAttributes(raw: unknown[]): IAttribute[] {
        if (!Array.isArray(raw)) { return []; }

        return raw.map((item) => {
            const obj = item as Record<string, unknown>;
            return {
                name: obj.name as string,
                resource: obj.resource as string,
                min: obj.min as number,
                max: obj.max as number,
                default: obj.default as number
            };
        });
    }

    /**
     * 转换标签数据
     */
    convertTags(raw: Map<string, string[]>, type: IMinecraftTag['type']): IMinecraftTag[] {
        const tags: IMinecraftTag[] = [];

        for (const [name, values] of raw) {
            tags.push({
                name,
                type,
                values
            });
        }

        return tags;
    }

    /**
     * 转换伤害类型数据
     */
    convertDamageTypes(raw: unknown[]): IDamageType[] {
        if (!Array.isArray(raw)) { return []; }

        return raw.map((item) => {
            const obj = item as Record<string, unknown>;
            return {
                name: obj.name as string,
                scaling: obj.scaling as string,
                exhaustion: obj.exhaustion as number,
                effects: obj.effects as string | undefined,
                message_id: obj.message_id as string | undefined
            };
        });
    }

    /**
     * 转换游戏事件数据
     */
    convertGameEvents(raw: unknown[]): IGameEvent[] {
        if (!Array.isArray(raw)) { return []; }

        return raw.map((item) => {
            const obj = item as Record<string, unknown>;
            return {
                id: obj.id as number,
                name: obj.name as string
            };
        });
    }
}
