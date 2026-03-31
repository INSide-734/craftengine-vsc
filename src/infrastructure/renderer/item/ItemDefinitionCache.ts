import { ResourceId } from '../model/resource/ResourceId';
import { type ResourceLoader } from '../model/resource/ResourceLoader';
import type { IItemDefinition } from '../types/item-definition';

/**
 * 物品定义缓存
 * 缓存解析后的 ItemDefinition
 */
export class ItemDefinitionCache {
    private readonly definitions = new Map<string, IItemDefinition | null>();

    constructor(private readonly loader: ResourceLoader) {}

    /**
     * 获取物品定义
     * @param itemId 物品 ID，如 "minecraft:diamond_sword" 或 "diamond_sword"
     * @returns IItemDefinition 或 null（如果物品定义不存在）
     */
    get(itemId: string): IItemDefinition | null {
        const resourceId = ResourceId.of(itemId);
        const key = resourceId.key;

        if (this.definitions.has(key)) {
            const cached = this.definitions.get(key);
            return cached !== undefined ? cached : null;
        }

        const buffer = this.loader.getItemDefinitionBuffer(resourceId);
        if (!buffer) {
            this.definitions.set(key, null);
            return null;
        }

        const definition = JSON.parse(buffer.toString('utf-8')) as IItemDefinition;
        this.definitions.set(key, definition);
        return definition;
    }

    /**
     * 检查物品定义是否存在
     */
    has(itemId: string): boolean {
        const definition = this.get(itemId);
        return definition !== null;
    }

    /**
     * 清除缓存
     */
    clear(): void {
        this.definitions.clear();
    }
}
