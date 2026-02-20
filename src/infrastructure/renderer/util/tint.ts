import type { ImageData } from '../types/index';
import type { TintSource, RenderContext } from '../types/item-definition';

/**
 * 解析 Minecraft 的 ARGB 整数颜色值
 * Minecraft 使用有符号 32 位整数存储颜色，格式为 ARGB
 */
export function parseArgbColor(value: number): { r: number; g: number; b: number; a: number } {
    // 将有符号整数转换为无符号
    const unsigned = value >>> 0;
    return {
        a: (unsigned >>> 24) & 0xff,
        r: (unsigned >>> 16) & 0xff,
        g: (unsigned >>> 8) & 0xff,
        b: unsigned & 0xff,
    };
}

/**
 * 解析 tint source 获取颜色值
 */
export function resolveTintColor(tint: TintSource, context: RenderContext = {}): number | null {
    const type = tint.type.replace(/^minecraft:/, '');

    switch (type) {
        case 'constant':
            return (tint as { value: number }).value;

        case 'dye':
            return context.dyeColor ? parseInt(context.dyeColor, 16) : (tint as { default: number }).default;

        case 'grass':
            // 草方块着色 - 使用默认绿色
            // 实际游戏中基于温度和湿度计算，这里使用固定值
            return 0xff7cbe4e; // 默认草地绿色

        case 'potion':
            return context.potionColor ?? (tint as { default: number }).default;

        case 'firework':
            return context.fireworkColor ?? (tint as { default: number }).default;

        case 'map_color':
            return context.mapColor ?? (tint as { default: number }).default;

        case 'team':
            return (tint as { default: number }).default;

        case 'custom_model_data': {
            const cmd = tint as { index?: number; default: number };
            const colors = context.customModelData?.colors;
            const idx = cmd.index ?? 0;
            if (colors && colors[idx] !== undefined) {
                return colors[idx];
            }
            return cmd.default;
        }

        default:
            return null;
    }
}

/**
 * 对 ImageData 应用着色
 * 使用乘法混合：结果 = 原色 * tint / 255
 */
export function applyTintToImageData(imageData: ImageData, tintColor: number): ImageData {
    const { r: tintR, g: tintG, b: tintB } = parseArgbColor(tintColor);

    // 创建新的 buffer 避免修改原数据
    const newData = Buffer.alloc(imageData.data.length);
    imageData.data.copy(newData);

    for (let i = 0; i < newData.length; i += 4) {
        // 只处理非透明像素
        if (newData[i + 3] > 0) {
            newData[i] = Math.round((newData[i] * tintR) / 255); // R
            newData[i + 1] = Math.round((newData[i + 1] * tintG) / 255); // G
            newData[i + 2] = Math.round((newData[i + 2] * tintB) / 255); // B
        }
    }

    return {
        width: imageData.width,
        height: imageData.height,
        data: newData,
    };
}
