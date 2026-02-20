import * as fs from 'fs';
import { type ResourceId } from './ResourceId';
import { type ResourcePack, DirectoryResourcePack, InternalResourcePack, ZipResourcePack } from './ResourcePack';
import type { ModelCache } from '../cache/ModelCache';
import type { TextureCache } from '../cache/TextureCache';

/**
 * 资源加载器
 * 管理多个资源包，按优先级搜索资源
 */
export class ResourceLoader {
    private readonly resourcePacks: ResourcePack[] = [];

    // 缓存实例（延迟初始化，避免循环依赖）
    private _modelCache: ModelCache | null = null;
    private _textureCache: TextureCache | null = null;

    constructor(packPaths: string[], useInternalResources = true) {
        // 外部资源包优先级最高（用户自定义纹理覆盖内部资源）
        for (const packPath of packPaths) {
            const stat = fs.statSync(packPath);
            if (stat.isDirectory()) {
                this.resourcePacks.push(new DirectoryResourcePack(packPath));
            } else if (packPath.toLowerCase().endsWith('.zip')) {
                this.resourcePacks.push(new ZipResourcePack(packPath));
            } else {
                throw new Error(
                    `Unsupported resource pack format: ${packPath}. Only directories and .zip files are supported.`,
                );
            }
        }

        // 内部资源作为后备（基础模型如 cube_all.json）
        if (useInternalResources) {
            this.resourcePacks.push(new InternalResourcePack());
        }
    }

    /**
     * 设置 ModelCache（由 ModelCache 构造函数调用）
     */
    setModelCache(cache: ModelCache): void {
        this._modelCache = cache;
    }

    /**
     * 设置 TextureCache（由 TextureCache 构造函数调用）
     */
    setTextureCache(cache: TextureCache): void {
        this._textureCache = cache;
    }

    /**
     * 获取 ModelCache
     */
    get modelCache(): ModelCache {
        if (!this._modelCache) {
            throw new Error('ModelCache not initialized');
        }
        return this._modelCache;
    }

    /**
     * 获取 TextureCache
     */
    get textureCache(): TextureCache {
        if (!this._textureCache) {
            throw new Error('TextureCache not initialized');
        }
        return this._textureCache;
    }

    /**
     * 获取模型 JSON 的 Buffer
     */
    getModelBuffer(id: ResourceId): Buffer {
        const resourcePath = `assets/${id.namespace}/models/${id.path}.json`;
        const buffer = this.getBuffer(resourcePath);
        if (!buffer) {
            throw new Error(`Model not found: ${id}`);
        }
        return buffer;
    }

    /**
     * 获取纹理 PNG 的 Buffer
     */
    getTextureBuffer(id: ResourceId): Buffer {
        const resourcePath = `assets/${id.namespace}/textures/${id.path}.png`;
        const buffer = this.getBuffer(resourcePath);
        if (!buffer) {
            throw new Error(`Texture not found: ${id}`);
        }
        return buffer;
    }

    /**
     * 获取物品定义 JSON 的 Buffer
     * @param id 物品 ResourceId
     * @returns Buffer 或 null（如果不存在）
     */
    getItemDefinitionBuffer(id: ResourceId): Buffer | null {
        const resourcePath = `assets/${id.namespace}/items/${id.path}.json`;
        return this.getBuffer(resourcePath);
    }

    /**
     * 从资源包中获取资源（按优先级搜索）
     */
    private getBuffer(resourcePath: string): Buffer | null {
        for (const pack of this.resourcePacks) {
            const buffer = pack.getResourceBuffer(resourcePath);
            if (buffer) {
                return buffer;
            }
        }
        return null;
    }
}
