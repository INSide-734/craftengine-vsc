import { type IMinecraftTag } from '../../core/interfaces/IMinecraftDataService';

/**
 * Minecraft 标签数据缓存
 *
 * 管理标签数据的存储、查找和反向索引。
 * 从 MinecraftDataService 中提取的标签管理职责。
 */
export class MinecraftTagCache {
    // 标签数据缓存（按类型分组）
    private blockTags: IMinecraftTag[] = [];
    private itemTags: IMinecraftTag[] = [];
    private entityTags: IMinecraftTag[] = [];
    private fluidTags: IMinecraftTag[] = [];
    private gameEventTags: IMinecraftTag[] = [];

    // 标签名称快速查找集合
    private blockTagSet = new Set<string>();
    private itemTagSet = new Set<string>();
    private entityTagSet = new Set<string>();
    private fluidTagSet = new Set<string>();
    private gameEventTagSet = new Set<string>();

    // 标签值反向索引（用于 isInTag 查询）
    private tagValueIndex = new Map<string, Set<string>>();

    /**
     * 设置标签数据并构建查找索引
     */
    setTags(
        blockTags: IMinecraftTag[],
        itemTags: IMinecraftTag[],
        entityTags: IMinecraftTag[],
        fluidTags: IMinecraftTag[],
        gameEventTags: IMinecraftTag[],
    ): void {
        this.blockTags = blockTags;
        this.itemTags = itemTags;
        this.entityTags = entityTags;
        this.fluidTags = fluidTags;
        this.gameEventTags = gameEventTags;
        this.buildLookupSets();
    }
    getTags(type: IMinecraftTag['type']): IMinecraftTag[] {
        switch (type) {
            case 'blocks':
                return this.blockTags;
            case 'items':
                return this.itemTags;
            case 'entity_types':
                return this.entityTags;
            case 'fluids':
                return this.fluidTags;
            case 'game_events':
                return this.gameEventTags;
            default:
                return [];
        }
    }

    getAllTags(): IMinecraftTag[] {
        return [...this.blockTags, ...this.itemTags, ...this.entityTags, ...this.fluidTags, ...this.gameEventTags];
    }

    getTagNames(type: IMinecraftTag['type']): string[] {
        return this.getTags(type).map((t) => t.name);
    }

    isValidTag(type: IMinecraftTag['type'], name: string): boolean {
        const normalizedName = this.normalizeTagName(name);
        switch (type) {
            case 'blocks':
                return this.blockTagSet.has(normalizedName);
            case 'items':
                return this.itemTagSet.has(normalizedName);
            case 'entity_types':
                return this.entityTagSet.has(normalizedName);
            case 'fluids':
                return this.fluidTagSet.has(normalizedName);
            case 'game_events':
                return this.gameEventTagSet.has(normalizedName);
            default:
                return false;
        }
    }

    isInTag(type: IMinecraftTag['type'], tagName: string, value: string): boolean {
        const normalizedTagName = this.normalizeTagName(tagName);
        const indexKey = `${type}:${normalizedTagName}`;
        const valuesSet = this.tagValueIndex.get(indexKey);

        if (!valuesSet) {
            return false;
        }

        const normalizedValue = this.normalizeName(value);
        return valuesSet.has(normalizedValue);
    }

    // ========================================
    // 内部方法
    // ========================================

    private buildLookupSets(): void {
        this.tagValueIndex.clear();

        const tagSetMap: Array<{ tags: IMinecraftTag[]; set: Set<string>; type: string }> = [
            { tags: this.blockTags, set: (this.blockTagSet = new Set()), type: 'blocks' },
            { tags: this.itemTags, set: (this.itemTagSet = new Set()), type: 'items' },
            { tags: this.entityTags, set: (this.entityTagSet = new Set()), type: 'entity_types' },
            { tags: this.fluidTags, set: (this.fluidTagSet = new Set()), type: 'fluids' },
            { tags: this.gameEventTags, set: (this.gameEventTagSet = new Set()), type: 'game_events' },
        ];

        for (const { tags, set, type } of tagSetMap) {
            for (const tag of tags) {
                set.add(tag.name);
                this.buildTagValueIndex(type, tag);
            }
        }
    }

    private buildTagValueIndex(type: string, tag: IMinecraftTag): void {
        const indexKey = `${type}:${tag.name}`;
        const valuesSet = new Set<string>();

        for (const value of tag.values) {
            if (!value.startsWith('#')) {
                valuesSet.add(value);
            }
        }

        this.tagValueIndex.set(indexKey, valuesSet);
    }

    private normalizeName(name: string): string {
        if (name.startsWith('minecraft:')) {
            return name.substring('minecraft:'.length);
        }
        return name;
    }

    private normalizeTagName(name: string): string {
        let normalized = name;
        if (normalized.startsWith('#')) {
            normalized = normalized.substring(1);
        }
        return this.normalizeName(normalized);
    }
}
