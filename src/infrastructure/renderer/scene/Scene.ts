import sharp from 'sharp';
import { Vector3d } from '../vector/Vector3d';
import { Camera } from './camera/Camera';
import { type GeometricalModel } from '../model/Model';
import { type Cuboid } from './geometry/Cuboid';
import { Axis } from '../types/index';
import { type IIntersection, type IRay } from './camera/Ray';

/**
 * 场景类
 * 管理几何对象和相机，执行光线追踪渲染
 */
export class Scene {
    readonly camera: Camera;
    private objects: Cuboid[] = [];

    constructor(
        private readonly model: GeometricalModel,
        private readonly width: number,
        private readonly height: number,
        cameraDistance: number,
        fov: number,
        private readonly cropVertical: number,
        private readonly cropHorizontal: number,
    ) {
        // 计算相机位置（根据模型旋转调整）
        const camPos = new Vector3d(0, 0, cameraDistance)
            .rotate(Vector3d.ZERO, Axis.X, -model.rotation.x)
            .rotate(Vector3d.ZERO, Axis.Y, -model.rotation.y);

        this.camera = new Camera(camPos, fov, Vector3d.ZERO, new Vector3d(0, 1, 0), width, height);
    }

    /**
     * 初始化场景几何体
     * 必须在渲染前调用
     */
    async init(): Promise<void> {
        this.objects = await this.model.toSceneGeometry(this);
    }

    /**
     * 渲染场景
     * @param scaleWidth 输出宽度
     * @param scaleHeight 输出高度
     * @returns PNG 格式的 Buffer
     */
    async render(scaleWidth: number, scaleHeight: number): Promise<Buffer> {
        // 确保几何体已初始化
        if (this.objects.length === 0) {
            await this.init();
        }

        // 创建图像缓冲区 (RGBA)
        const pixels = Buffer.alloc(this.width * this.height * 4);

        // 单线程光线追踪渲染
        // TODO(#PERF-001): 可以使用 worker_threads 优化为多线程
        for (let x = 0; x < this.width; x++) {
            for (let y = 0; y < this.height; y++) {
                const ray = this.camera.getRay(x, y);
                const color = this.trace(ray);

                const idx = (y * this.width + x) * 4;
                pixels[idx] = (color >> 16) & 0xff; // R
                pixels[idx + 1] = (color >> 8) & 0xff; // G
                pixels[idx + 2] = color & 0xff; // B
                pixels[idx + 3] = (color >> 24) & 0xff; // A
            }
        }

        // 使用 sharp 进行后处理
        let imageData: Buffer = pixels;
        let currentWidth = this.width;
        let currentHeight = this.height;

        // 平移
        const translateX = Math.floor((this.model.translation.x / 16.0) * this.width);
        const translateY = Math.floor((this.model.translation.y / 16.0) * this.height);

        if (translateX !== 0 || translateY !== 0) {
            // 通过 extend + extract 实现平移
            const extendTop = Math.max(0, -translateY);
            const extendBottom = Math.max(0, translateY);
            const extendLeft = Math.max(0, translateX);
            const extendRight = Math.max(0, -translateX);

            // 先执行 extend（需要分开执行，否则 sharp 链式调用会出错）
            const extendResult = await sharp(imageData, {
                raw: { width: currentWidth, height: currentHeight, channels: 4 },
            })
                .extend({
                    top: extendTop,
                    bottom: extendBottom,
                    left: extendLeft,
                    right: extendRight,
                    background: { r: 0, g: 0, b: 0, alpha: 0 },
                })
                .raw()
                .toBuffer({ resolveWithObject: true });

            currentWidth = extendResult.info.width;
            currentHeight = extendResult.info.height;

            // 计算裁剪参数并进行边界检查
            const extractLeft = Math.max(0, Math.min(translateX, currentWidth - 1));
            const extractTop = Math.max(0, Math.min(-translateY, currentHeight - 1));
            const extractWidth = Math.max(1, Math.min(this.width, currentWidth - extractLeft));
            const extractHeight = Math.max(1, Math.min(this.height, currentHeight - extractTop));

            // 再执行 extract
            const extractResult = await sharp(extendResult.data, {
                raw: { width: currentWidth, height: currentHeight, channels: 4 },
            })
                .extract({
                    left: extractLeft,
                    top: extractTop,
                    width: extractWidth,
                    height: extractHeight,
                })
                .raw()
                .toBuffer({ resolveWithObject: true });

            imageData = extractResult.data;
            currentWidth = extractResult.info.width;
            currentHeight = extractResult.info.height;
        }

        // 裁剪（带边界检查）
        const cropX = Math.max(0, Math.floor(currentWidth * this.cropHorizontal));
        const cropY = Math.max(0, Math.floor(currentHeight * this.cropVertical));
        const cropW = Math.max(
            1,
            Math.min(Math.floor(currentWidth * (1 - 2 * this.cropHorizontal)), currentWidth - cropX),
        );
        const cropH = Math.max(
            1,
            Math.min(Math.floor(currentHeight * (1 - 2 * this.cropVertical)), currentHeight - cropY),
        );

        let image = sharp(imageData, {
            raw: { width: currentWidth, height: currentHeight, channels: 4 },
        }).extract({
            left: cropX,
            top: cropY,
            width: cropW,
            height: cropH,
        });

        // 缩放
        if (scaleWidth !== cropW || scaleHeight !== cropH) {
            image = image.resize(scaleWidth, scaleHeight, {
                kernel: 'lanczos3',
            });
        }

        return image.png().toBuffer();
    }

    /**
     * 追踪光线，计算像素颜色
     * @param ray 光线
     * @returns ARGB 格式颜色
     */
    private trace(ray: IRay): number {
        // 收集所有交点
        const intersections: IIntersection[] = [];
        for (const obj of this.objects) {
            const hit = obj.trace(ray);
            if (hit) {
                intersections.push(hit);
            }
        }

        if (intersections.length === 0) {
            return 0; // 透明
        }

        // 按距离排序（从近到远）
        intersections.sort((a, b) => a.t - b.t);

        // Alpha 混合
        let alpha = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        let index = 0;

        while (alpha < 1 && index < intersections.length) {
            const next = intersections[index];
            const nextAlpha = ((next.color >> 24) & 0xff) / 255;
            const nextR = ((next.color >> 16) & 0xff) * nextAlpha * next.multiplier;
            const nextG = ((next.color >> 8) & 0xff) * nextAlpha * next.multiplier;
            const nextB = (next.color & 0xff) * nextAlpha * next.multiplier;

            r += nextR * (1 - alpha);
            g += nextG * (1 - alpha);
            b += nextB * (1 - alpha);
            alpha += nextAlpha;

            index++;
        }

        // 返回 ARGB 格式
        return (
            (((Math.floor(alpha * 255) & 0xff) << 24) |
                ((Math.floor(r) & 0xff) << 16) |
                ((Math.floor(g) & 0xff) << 8) |
                (Math.floor(b) & 0xff)) >>>
            0
        );
    }
}
