import {
    IEnchantment,
    IEntity,
    IParticle,
    IPotionEffect,
    IBiome,
    ISound,
    IBlock,
    IMinecraftItem,
    IAttribute,
    IDamageType,
    IGameEvent
} from '../../core/interfaces/IMinecraftDataService';

/**
 * Minecraft 数据验证器
 *
 * 管理 O(1) 快速查找集合，提供数据验证方法。
 * 从 MinecraftDataService 中提取的验证职责。
 */
export class MinecraftDataValidator {
    private enchantmentSet = new Set<string>();
    private entitySet = new Set<string>();
    private particleSet = new Set<string>();
    private potionEffectSet = new Set<string>();
    private biomeSet = new Set<string>();
    private soundSet = new Set<string>();
    private blockSet = new Set<string>();
    private itemSet = new Set<string>();
    private attributeSet = new Set<string>();
    private damageTypeSet = new Set<string>();
    private gameEventSet = new Set<string>();

    /**
     * 从数据数组构建查找集合
     */
    buildLookupSets(data: {
        enchantments: IEnchantment[];
        entities: IEntity[];
        particles: IParticle[];
        potionEffects: IPotionEffect[];
        biomes: IBiome[];
        sounds: ISound[];
        blocks: IBlock[];
        items: IMinecraftItem[];
        attributes: IAttribute[];
        damageTypes: IDamageType[];
        gameEvents: IGameEvent[];
    }): void {
        this.enchantmentSet = new Set(data.enchantments.map(e => e.name));
        this.entitySet = new Set(data.entities.map(e => e.name));
        this.particleSet = new Set(data.particles.map(p => p.name));
        this.potionEffectSet = new Set(data.potionEffects.map(e => e.name));
        this.biomeSet = new Set(data.biomes.map(b => b.name));
        this.soundSet = new Set(data.sounds.map(s => s.name));
        this.blockSet = new Set(data.blocks.map(b => b.name));
        this.itemSet = new Set(data.items.map(i => i.name));
        this.damageTypeSet = new Set(data.damageTypes.map(d => d.name));
        this.gameEventSet = new Set(data.gameEvents.map(g => g.name));

        // 属性集合需要同时添加完整名称和资源名称
        this.attributeSet = new Set<string>();
        for (const a of data.attributes) {
            this.attributeSet.add(a.name);
            if (a.resource) {
                this.attributeSet.add(a.resource);
            }
        }
    }

    isValidEnchantment(name: string): boolean {
        return this.enchantmentSet.has(this.normalizeName(name));
    }

    isValidEntity(name: string): boolean {
        return this.entitySet.has(this.normalizeName(name));
    }

    isValidParticle(name: string): boolean {
        return this.particleSet.has(this.normalizeName(name));
    }

    isValidPotionEffect(name: string): boolean {
        return this.potionEffectSet.has(this.normalizeName(name));
    }

    isValidBiome(name: string): boolean {
        return this.biomeSet.has(this.normalizeName(name));
    }

    isValidSound(name: string): boolean {
        return this.soundSet.has(name);
    }

    isValidBlock(name: string): boolean {
        return this.blockSet.has(this.normalizeName(name));
    }

    isValidItem(name: string): boolean {
        return this.itemSet.has(this.normalizeName(name));
    }

    isValidAttribute(name: string): boolean {
        return this.attributeSet.has(this.normalizeName(name));
    }

    isValidDamageType(name: string): boolean {
        return this.damageTypeSet.has(this.normalizeName(name));
    }

    isValidGameEvent(name: string): boolean {
        return this.gameEventSet.has(this.normalizeName(name));
    }

    /**
     * 规范化名称（移除命名空间前缀）
     */
    private normalizeName(name: string): string {
        if (name.startsWith('minecraft:')) {
            return name.substring('minecraft:'.length);
        }
        return name;
    }
}
