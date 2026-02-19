import { Model } from '../Model';
import { ResourceId } from '../resource/ResourceId';
import { LRUCache } from '../../../../core/utils/LRUCache';
import type { ModelCache } from './ModelCache';

/**
 * 已解析模型缓存
 * 缓存 resolve() 后的 GeometricalModel/LayeredModel
 * 避免重复解析继承链和纹理
 */
export class ResolvedModelCache {
  /** 默认缓存容量 */
  private static readonly DEFAULT_CACHE_SIZE = 300;
  private readonly models: LRUCache<string, Model>;

  constructor(private readonly modelCache: ModelCache, cacheSize?: number) {
    this.models = new LRUCache(cacheSize ?? ResolvedModelCache.DEFAULT_CACHE_SIZE);
  }

  /**
   * 获取已解析的模型
   * 如果缓存中不存在，则解析并缓存
   */
  async get(id: string): Promise<Model> {
    const resourceId = ResourceId.of(id);
    const key = resourceId.key;

    const cached = this.models.get(key);
    if (cached) {
      return cached;
    }

    const unresolved = await this.modelCache.get(id);
    const resolved = await unresolved.resolve();

    this.models.set(key, resolved);
    return resolved;
  }

  /**
   * 获取带着色的模型（不缓存）
   * @param id 模型路径
   * @param tints 着色颜色数组，索引对应 tintindex
   */
  async getWithTints(id: string, tints: number[]): Promise<Model> {
    const unresolved = await this.modelCache.get(id);
    return unresolved.resolve(tints);
  }

  /**
   * 清除缓存
   */
  clear(): void {
    this.models.clear();
  }

  /**
   * 获取缓存大小
   */
  get size(): number {
    return this.models.size();
  }
}
