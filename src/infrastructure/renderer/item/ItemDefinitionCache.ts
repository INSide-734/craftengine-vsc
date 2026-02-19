import { ResourceId } from '../model/resource/ResourceId';
import { ResourceLoader } from '../model/resource/ResourceLoader';
import type { ItemDefinition } from '../types/item-definition';

/**
 * 物品定义缓存
 * 缓存解析后的 ItemDefinition
 */
export class ItemDefinitionCache {
  private readonly definitions = new Map<string, ItemDefinition | null>();

  constructor(private readonly loader: ResourceLoader) {}

  /**
   * 获取物品定义
   * @param itemId 物品 ID，如 "minecraft:diamond_sword" 或 "diamond_sword"
   * @returns ItemDefinition 或 null（如果物品定义不存在）
   */
  get(itemId: string): ItemDefinition | null {
    const resourceId = ResourceId.of(itemId);
    const key = resourceId.key;

    if (this.definitions.has(key)) {
      return this.definitions.get(key)!;
    }

    const buffer = this.loader.getItemDefinitionBuffer(resourceId);
    if (!buffer) {
      this.definitions.set(key, null);
      return null;
    }

    const definition = JSON.parse(buffer.toString('utf-8')) as ItemDefinition;
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
