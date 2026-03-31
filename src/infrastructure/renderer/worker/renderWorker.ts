/**
 * 渲染 Worker 线程
 * 在独立线程中执行模型渲染任务
 */
import { parentPort, workerData } from 'worker_threads';
import { MinecraftModelRenderer } from '../core/MinecraftModelRenderer';
import type { IRenderOptions } from '../types/index';

interface IRenderTask {
    type: 'render';
    taskId: number;
    modelPath: string;
}

interface IInitTask {
    type: 'init';
    options: IRenderOptions;
}

type WorkerTask = IRenderTask | IInitTask;

interface IRenderResult {
    type: 'result';
    taskId: number;
    success: boolean;
    buffer?: Buffer;
    error?: string;
}

interface IInitResult {
    type: 'ready';
}

let renderer: MinecraftModelRenderer | null = null;

// 初始化渲染器（从 workerData 获取初始配置）
if (workerData?.options) {
    renderer = new MinecraftModelRenderer(workerData.options);
    parentPort?.postMessage({ type: 'ready' } as IInitResult);
}

// 监听主线程消息
parentPort?.on('message', (task: WorkerTask) => {
    if (task.type === 'init') {
        renderer = new MinecraftModelRenderer(task.options);
        parentPort?.postMessage({ type: 'ready' } as IInitResult);
        return;
    }

    if (task.type === 'render') {
        if (!renderer) {
            parentPort?.postMessage({
                type: 'result',
                taskId: task.taskId,
                success: false,
                error: 'Renderer not initialized',
            } as IRenderResult);
            return;
        }

        void (async () => {
            try {
                if (!renderer) {
                    throw new Error('Renderer not initialized');
                }
                const buffer = await renderer.renderModel(task.modelPath);
                parentPort?.postMessage({
                    type: 'result',
                    taskId: task.taskId,
                    success: true,
                    buffer,
                } as IRenderResult);
            } catch (error: unknown) {
                parentPort?.postMessage({
                    type: 'result',
                    taskId: task.taskId,
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                } as IRenderResult);
            }
        })();
    }
});
