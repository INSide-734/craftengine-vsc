import sharp from 'sharp';
import { ResourceId } from '../resource/ResourceId';
import { type ResourceLoader } from '../resource/ResourceLoader';
import { LRUCache } from '../../../../core/utils/LRUCache';
import type { IImageData } from '../../types/index';

/**
 * 纹理缓存选项
 */
interface ITextureOptions {
    id: string;
    rotation: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
}

/**
 * 纹理缓存
 * 管理纹理的加载、UV 截取和旋转
 */
export class TextureCache {
    // 默认缓存容量配置
    private static readonly DEFAULT_IMAGE_CACHE_SIZE = 200;
    private static readonly DEFAULT_TEXTURE_CACHE_SIZE = 500;

    // 原始图像缓存（LRU）
    private readonly imageCache: LRUCache<string, IImageData>;
    // 处理后的纹理缓存（LRU）
    private readonly textureCache: LRUCache<string, IImageData>;

    /**
     * 空纹理（1x1 透明）
     */
    static readonly EMPTY_TEXTURE: IImageData = {
        width: 1,
        height: 1,
        data: Buffer.from([0, 0, 0, 0]), // RGBA
    };

    constructor(
        private readonly loader: ResourceLoader,
        cacheConfig?: { imageCacheSize?: number; textureCacheSize?: number },
    ) {
        this.imageCache = new LRUCache(cacheConfig?.imageCacheSize ?? TextureCache.DEFAULT_IMAGE_CACHE_SIZE);
        this.textureCache = new LRUCache(cacheConfig?.textureCacheSize ?? TextureCache.DEFAULT_TEXTURE_CACHE_SIZE);
        // 注册到 loader
        loader.setTextureCache(this);
    }

    /**
     * 获取处理后的纹理
     * @param id 纹理资源 ID
     * @param rotation 旋转角度 (0, 90, 180, 270)
     * @param fromX UV 起始 X (0-1)
     * @param fromY UV 起始 Y (0-1)
     * @param toX UV 结束 X (0-1)
     * @param toY UV 结束 Y (0-1)
     */
    async get(
        id: string,
        rotation: number,
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
    ): Promise<IImageData> {
        // 检查纹理路径是否有效（跳过未解析的纹理变量）
        if (id.startsWith('#')) {
            return TextureCache.EMPTY_TEXTURE;
        }

        const resourceId = ResourceId.of(id);
        const cacheKey = this.getCacheKey({ id: resourceId.key, rotation, fromX, fromY, toX, toY });

        // 检查缓存
        const cached = this.textureCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        // 获取原始图像
        let image = await this.getRawImage(resourceId);

        // 处理动画纹理（取第一帧）
        if (image.height > image.width) {
            image = await this.cropImage(image, 0, 0, image.width, image.width);
        }

        // 空 UV 检查
        if (fromX === toX || fromY === toY) {
            return TextureCache.EMPTY_TEXTURE;
        }

        // 应用 UV 坐标截取
        image = await this.applyUV(image, fromX, fromY, toX, toY);

        // 应用旋转
        if (rotation !== 0) {
            image = await this.rotateImage(image, rotation);
        }

        this.textureCache.set(cacheKey, image);
        return image;
    }

    /**
     * 获取原始图像
     */
    private async getRawImage(id: ResourceId): Promise<IImageData> {
        const cached = this.imageCache.get(id.key);
        if (cached) {
            return cached;
        }

        const buffer = this.loader.getTextureBuffer(id);
        const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

        const image: IImageData = {
            width: info.width,
            height: info.height,
            data,
        };

        this.imageCache.set(id.key, image);
        return image;
    }

    /**
     * 裁剪图像（带边界检查）
     */
    private async cropImage(img: IImageData, x: number, y: number, w: number, h: number): Promise<IImageData> {
        // 边界检查和修正
        const safeX = Math.max(0, Math.min(x, img.width - 1));
        const safeY = Math.max(0, Math.min(y, img.height - 1));
        const safeW = Math.max(1, Math.min(w, img.width - safeX));
        const safeH = Math.max(1, Math.min(h, img.height - safeY));

        // 如果裁剪区域无效，返回空纹理
        if (safeW <= 0 || safeH <= 0) {
            return TextureCache.EMPTY_TEXTURE;
        }

        const { data, info } = await sharp(img.data, {
            raw: { width: img.width, height: img.height, channels: 4 },
        })
            .extract({ left: safeX, top: safeY, width: safeW, height: safeH })
            .raw()
            .toBuffer({ resolveWithObject: true });

        return { width: info.width, height: info.height, data };
    }

    /**
     * 应用 UV 坐标截取
     * 直接移植 Kotlin 的 getWithUV 算法
     */
    private async applyUV(img: IImageData, fromX: number, fromY: number, toX: number, toY: number): Promise<IImageData> {
        // 计算像素坐标
        const x1 = Math.ceil(fromX * img.width);
        const y1 = Math.ceil(fromY * img.height);
        const x2 = Math.ceil(toX * img.width);
        const y2 = Math.ceil(toY * img.height);

        const width = Math.max(Math.abs(x2 - x1), 1);
        const height = Math.max(Math.abs(y2 - y1), 1);
        const newData = Buffer.alloc(width * height * 4);

        const stepX = fromX < toX ? 1 : -1;
        const stepY = fromY < toY ? 1 : -1;

        let curX = Math.min(x1, Math.max(x2, x1) - 1);

        for (let x = 0; x < width; x++) {
            let curY = Math.min(y1, Math.max(y2, y1) - 1);

            for (let y = 0; y < height; y++) {
                // 边界检查
                const srcX = Math.max(0, Math.min(curX, img.width - 1));
                const srcY = Math.max(0, Math.min(curY, img.height - 1));

                const srcIdx = (srcY * img.width + srcX) * 4;
                const dstIdx = (y * width + x) * 4;

                newData[dstIdx] = img.data[srcIdx]; // R
                newData[dstIdx + 1] = img.data[srcIdx + 1]; // G
                newData[dstIdx + 2] = img.data[srcIdx + 2]; // B
                newData[dstIdx + 3] = img.data[srcIdx + 3]; // A

                curY += stepY;
            }

            curX += stepX;
        }

        return { width, height, data: newData };
    }

    /**
     * 旋转图像
     */
    private async rotateImage(img: IImageData, degrees: number): Promise<IImageData> {
        const { data, info } = await sharp(img.data, {
            raw: { width: img.width, height: img.height, channels: 4 },
        })
            .rotate(degrees)
            .raw()
            .toBuffer({ resolveWithObject: true });

        return { width: info.width, height: info.height, data };
    }

    /**
     * 生成缓存键
     */
    private getCacheKey(options: ITextureOptions): string {
        return `${options.id}:${options.rotation}:${options.fromX}:${options.fromY}:${options.toX}:${options.toY}`;
    }
}
