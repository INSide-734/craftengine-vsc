/**
 * 渲染 Worker 线程
 * 在独立线程中执行模型渲染任务
 */
import { parentPort, workerData } from 'worker_threads';
import { MinecraftModelRenderer } from '../core/MinecraftModelRenderer';
import type { RenderOptions } from '../types/index';

interface RenderTask {
    type: 'render';
    taskId: number;
    modelPath: string;
}

interface InitTask {
    type: 'init';
    options: RenderOptions;
}

type WorkerTask = RenderTask | InitTask;

interface RenderResult {
    type: 'result';
    taskId: number;
    success: boolean;
    buffer?: Buffer;
    error?: string;
}

interface InitResult {
    type: 'ready';
}

let renderer: MinecraftModelRenderer | null = null;

// 初始化渲染器（从 workerData 获取初始配置）
if (workerData?.options) {
    renderer = new MinecraftModelRenderer(workerData.options);
    parentPort?.postMessage({ type: 'ready' } as InitResult);
}

// 监听主线程消息
parentPort?.on('message', async (task: WorkerTask) => {
    if (task.type === 'init') {
        renderer = new MinecraftModelRenderer(task.options);
        parentPort?.postMessage({ type: 'ready' } as InitResult);
        return;
    }

    if (task.type === 'render') {
        if (!renderer) {
            parentPort?.postMessage({
                type: 'result',
                taskId: task.taskId,
                success: false,
                error: 'Renderer not initialized',
            } as RenderResult);
            return;
        }

        try {
            const buffer = await renderer.renderModel(task.modelPath);
            parentPort?.postMessage({
                type: 'result',
                taskId: task.taskId,
                success: true,
                buffer,
            } as RenderResult);
        } catch (error: unknown) {
            parentPort?.postMessage({
                type: 'result',
                taskId: task.taskId,
                success: false,
                error: error instanceof Error ? error.message : String(error),
            } as RenderResult);
        }
    }
});
