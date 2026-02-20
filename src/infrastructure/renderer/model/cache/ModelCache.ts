import { ResourceId } from '../resource/ResourceId';
import { type ResourceLoader } from '../resource/ResourceLoader';
import type { UnresolvedModel } from '../UnresolvedModel';
import type { ModelJson } from '../../types/index';

// 用于延迟导入，避免循环依赖
let UnresolvedModelClass: typeof UnresolvedModel | null = null;

/**
 * 模型缓存
 * 缓存已解析的 UnresolvedModel
 */
export class ModelCache {
    /** 默认最大缓存容量 */
    private static readonly DEFAULT_MAX_SIZE = 500;
    /** 最大缓存容量 */
    private readonly maxSize: number;
    private readonly models = new Map<string, UnresolvedModel>();

    constructor(
        private readonly loader: ResourceLoader,
        maxSize?: number,
    ) {
        this.maxSize = maxSize ?? ModelCache.DEFAULT_MAX_SIZE;
        // 注册到 loader
        loader.setModelCache(this);
    }

    /**
     * 延迟加载 UnresolvedModel 类
     */
    private async getUnresolvedModelClass(): Promise<typeof UnresolvedModel> {
        if (!UnresolvedModelClass) {
            const module = await import('../UnresolvedModel.js');
            UnresolvedModelClass = module.UnresolvedModel;
        }
        return UnresolvedModelClass;
    }

    /**
     * 通过字符串 ID 获取模型
     */
    async get(id: string): Promise<UnresolvedModel> {
        return this.getById(ResourceId.of(id));
    }

    /**
     * 通过 ResourceId 获取模型
     */
    async getById(id: ResourceId): Promise<UnresolvedModel> {
        const cached = this.models.get(id.key);
        if (cached) {
            return cached;
        }

        const buffer = this.loader.getModelBuffer(id);
        const json = JSON.parse(buffer.toString('utf-8')) as ModelJson;

        const UnresolvedModelCls = await this.getUnresolvedModelClass();
        const model = new UnresolvedModelCls(id, this.loader, json);

        // 容量限制：超出时淘汰最早的条目
        if (this.models.size >= this.maxSize) {
            const firstKey = this.models.keys().next().value;
            if (firstKey !== undefined) {
                this.models.delete(firstKey);
            }
        }

        this.models.set(id.key, model);
        return model;
    }

    /**
     * 从 JSON 创建模型（不缓存）
     * 用于动态生成的模型
     *
     * @param json - 模型 JSON 定义
     * @param virtualId - 虚拟 ID（用于标识）
     * @returns UnresolvedModel 实例
     */
    async createFromJson(json: ModelJson, virtualId?: string): Promise<UnresolvedModel> {
        const id = ResourceId.of(virtualId ?? `virtual:generated_${Date.now()}`);
        const UnresolvedModelCls = await this.getUnresolvedModelClass();
        return new UnresolvedModelCls(id, this.loader, json);
    }

    /**
     * 清除缓存
     */
    clear(): void {
        this.models.clear();
    }
}
