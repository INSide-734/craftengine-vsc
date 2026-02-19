/**
 * Worker 线程池
 * 管理多个渲染 Worker，实现真正的多线程并行渲染
 */
import { Worker } from 'worker_threads';
import * as path from 'path';
import * as os from 'os';
import type { RenderOptions } from '../types/index';

interface PendingTask {
  modelPath: string;
  resolve: (buffer: Buffer) => void;
  reject: (error: Error) => void;
  timeoutId?: NodeJS.Timeout;
}

interface WorkerInfo {
  worker: Worker;
  busy: boolean;
  currentTaskId: number | null;
}

interface RenderProgress {
  total: number;
  completed: number;
  successful: number;
  failed: number;
  currentModel?: string;
}

type ProgressCallback = (progress: RenderProgress) => void;

export interface BatchRenderResult {
  modelPath: string;
  success: boolean;
  buffer?: Buffer;
  error?: string;
}

/**
 * Worker 线程池
 */
export class WorkerPool {
  private workers: WorkerInfo[] = [];
  private taskQueue: Array<PendingTask & { taskId: number }> = [];
  private taskIdCounter = 0;
  private pendingTasks = new Map<number, PendingTask & { taskId: number }>();
  /** 默认任务超时（毫秒） */
  private static readonly DEFAULT_TASK_TIMEOUT = 30000;
  /** 默认 Worker 终止超时（毫秒） */
  private static readonly DEFAULT_WORKER_TERMINATE_TIMEOUT = 5000;
  /** Worker 终止超时（毫秒） */
  private readonly workerTerminateTimeout: number;

  private initialized = false;
  private terminated = false;

  constructor(
    private readonly options: RenderOptions,
    private readonly poolSize: number = Math.max(1, os.cpus().length - 1),
    private readonly taskTimeout: number = WorkerPool.DEFAULT_TASK_TIMEOUT,
    workerTerminateTimeout?: number
  ) {
    this.workerTerminateTimeout = workerTerminateTimeout ?? WorkerPool.DEFAULT_WORKER_TERMINATE_TIMEOUT;
  }

  /**
   * 初始化 Worker 池
   */
  async initialize(): Promise<void> {
    if (this.initialized) {return;}

    const workerPath = this.getWorkerPath();
    const initPromises: Promise<void>[] = [];

    for (let i = 0; i < this.poolSize; i++) {
      const initPromise = new Promise<void>((resolve, _reject) => {
        const worker = new Worker(workerPath, {
          workerData: { options: this.options }
        });

        const workerInfo: WorkerInfo = {
          worker,
          busy: false,
          currentTaskId: null
        };

        worker.on('message', (message: unknown) => {
          const msg = message as Record<string, unknown>;
          if (msg.type === 'ready') {
            resolve();
            return;
          }

          if (msg.type === 'result') {
            this.handleWorkerResult(workerInfo, msg);
          }
        });

        worker.on('error', (error) => {
          console.error(`Worker error: ${error.message}`);
          if (workerInfo.currentTaskId !== null) {
            const pending = this.pendingTasks.get(workerInfo.currentTaskId);
            if (pending) {
              pending.reject(error);
              this.pendingTasks.delete(workerInfo.currentTaskId);
            }
          }
          workerInfo.busy = false;
          this.processQueue();
        });

        worker.on('exit', (code) => {
          if (code !== 0) {
            console.error(`Worker exited with code ${code}`);
          }
        });

        this.workers.push(workerInfo);
      });

      initPromises.push(initPromise);
    }

    await Promise.all(initPromises);
    this.initialized = true;
  }

  /**
   * 获取 Worker 脚本路径
   */
  private getWorkerPath(): string {
    // esbuild 打包后 __dirname = <root>/out/，worker 打包到 out/renderWorker.js
    return path.join(__dirname, 'renderWorker.js');
  }

  /**
   * 替换超时的 Worker
   *
   * 终止旧 worker 并创建新 worker 替代，避免超时后旧任务仍在执行导致数据竞争
   */
  private replaceWorker(workerInfo: WorkerInfo): void {
    const index = this.workers.indexOf(workerInfo);
    if (index === -1) { return; }

    // 终止旧 worker
    workerInfo.worker.terminate().catch(() => { /* 忽略终止错误 */ });

    // 创建新 worker
    const workerPath = this.getWorkerPath();
    const newWorker = new Worker(workerPath, {
      workerData: { options: this.options }
    });

    const newWorkerInfo: WorkerInfo = {
      worker: newWorker,
      busy: false,
      currentTaskId: null
    };

    newWorker.on('message', (message: unknown) => {
      const msg = message as Record<string, unknown>;
      if (msg.type === 'result') {
        this.handleWorkerResult(newWorkerInfo, msg);
      }
    });

    newWorker.on('error', (error) => {
      console.error(`Worker error: ${error.message}`);
      if (newWorkerInfo.currentTaskId !== null) {
        const pending = this.pendingTasks.get(newWorkerInfo.currentTaskId);
        if (pending) {
          pending.reject(error);
          this.pendingTasks.delete(newWorkerInfo.currentTaskId);
        }
      }
      newWorkerInfo.busy = false;
      this.processQueue();
    });

    newWorker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker exited with code ${code}`);
      }
    });

    this.workers[index] = newWorkerInfo;
  }

  /**
   * 处理 Worker 返回的结果
   */
  private handleWorkerResult(workerInfo: WorkerInfo, message: Record<string, unknown>): void {
    const { taskId, success, buffer, error } = message as {
      taskId: number;
      success: boolean;
      buffer?: Buffer;
      error?: string;
    };
    const pending = this.pendingTasks.get(taskId);

    if (pending) {
      // 清除超时计时器
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }

      if (success && buffer) {
        pending.resolve(buffer);
      } else if (success) {
        pending.reject(new Error('Worker returned success but no buffer'));
      } else {
        pending.reject(new Error(error));
      }
      this.pendingTasks.delete(taskId);
    }

    workerInfo.busy = false;
    workerInfo.currentTaskId = null;
    this.processQueue();
  }

  /**
   * 处理任务队列
   */
  private processQueue(): void {
    const availableWorker = this.workers.find(w => !w.busy);
    if (!availableWorker || this.taskQueue.length === 0) {return;}

    const task = this.taskQueue.shift()!;
    availableWorker.busy = true;
    availableWorker.currentTaskId = task.taskId;

    // 设置超时计时器
    task.timeoutId = setTimeout(() => {
      const pending = this.pendingTasks.get(task.taskId);
      if (pending) {
        pending.reject(new Error(`Render timeout after ${this.taskTimeout}ms: ${task.modelPath}`));
        this.pendingTasks.delete(task.taskId);
      }
      // 终止超时的 worker 并替换，避免旧任务仍在执行导致数据竞争
      this.replaceWorker(availableWorker);
      this.processQueue();
    }, this.taskTimeout);

    availableWorker.worker.postMessage({
      type: 'render',
      taskId: task.taskId,
      modelPath: task.modelPath
    });
  }

  /**
   * 渲染单个模型
   */
  async renderModel(modelPath: string): Promise<Buffer> {
    if (this.terminated) {
      throw new Error('WorkerPool has been terminated');
    }

    if (!this.initialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const taskId = this.taskIdCounter++;
      const task = { taskId, modelPath, resolve, reject };

      this.pendingTasks.set(taskId, task);
      this.taskQueue.push(task);
      this.processQueue();
    });
  }

  /**
   * 批量渲染模型
   * @param modelPaths 模型路径列表
   * @param onProgress 进度回调
   */
  async renderBatch(
    modelPaths: string[],
    onProgress?: ProgressCallback
  ): Promise<BatchRenderResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const results: BatchRenderResult[] = [];
    const progress: RenderProgress = {
      total: modelPaths.length,
      completed: 0,
      successful: 0,
      failed: 0
    };

    // 创建所有渲染任务的 Promise
    const renderPromises = modelPaths.map(async (modelPath) => {
      progress.currentModel = modelPath;

      try {
        const buffer = await this.renderModel(modelPath);
        progress.successful++;
        results.push({ modelPath, success: true, buffer });
      } catch (error: unknown) {
        progress.failed++;
        results.push({ modelPath, success: false, error: error instanceof Error ? error.message : String(error) });
      } finally {
        progress.completed++;
        onProgress?.(progress);
      }
    });

    await Promise.all(renderPromises);
    return results;
  }

  /**
   * 关闭所有 Worker
   *
   * 拒绝所有排队和进行中的任务，然后终止 Worker 线程。
   * 每个 Worker 有 5 秒超时，超时后强制终止。
   */
  async terminate(): Promise<void> {
    if (this.terminated) {
      return;
    }
    this.terminated = true;

    // 拒绝队列中未开始的任务
    for (const task of this.taskQueue) {
      if (task.timeoutId) {
        clearTimeout(task.timeoutId);
      }
      task.reject(new Error('WorkerPool terminated'));
    }
    this.taskQueue = [];

    // 拒绝正在执行的任务
    for (const [, task] of this.pendingTasks) {
      if (task.timeoutId) {
        clearTimeout(task.timeoutId);
      }
      task.reject(new Error('WorkerPool terminated'));
    }
    this.pendingTasks.clear();

    // 终止所有 Worker，每个有超时
    const terminatePromises = this.workers.map(({ worker }) =>
      Promise.race([
        worker.terminate(),
        new Promise<number>((resolve) =>
          setTimeout(() => resolve(-1), this.workerTerminateTimeout)
        ),
      ])
    );
    await Promise.all(terminatePromises);

    this.workers = [];
    this.initialized = false;
  }

  /**
   * 获取 Worker 池大小
   */
  getPoolSize(): number {
    return this.poolSize;
  }
}
