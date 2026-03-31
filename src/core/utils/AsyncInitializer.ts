/**
 * 异步初始化器
 *
 * 提供异步初始化器接口和工厂函数，供 Domain 层和其他层使用。
 */

/**
 * 异步初始化器接口
 */
export interface IAsyncInitializer {
    /** 确保初始化完成（幂等，支持失败重试） */
    ensure: () => Promise<void>;
    /** 重置初始化状态 */
    reset: () => void;
    /** 是否已完成初始化 */
    isLoaded: () => boolean;
}

/**
 * 创建异步初始化器
 *
 * 封装常见的"确保配置已加载"模式，支持：
 * - 幂等调用（已加载时直接返回）
 * - 并发安全（多次调用共享同一个 Promise）
 * - 失败重试（加载失败后允许重新尝试）
 *
 * @param loadFn - 异步加载函数
 * @returns 异步初始化器
 */
export function createAsyncInitializer(loadFn: () => Promise<void>): IAsyncInitializer {
    let loaded = false;
    let loadPromise: Promise<void> | null = null;

    return {
        ensure: async () => {
            if (loaded) {
                return;
            }
            if (loadPromise) {
                return loadPromise;
            }
            loadPromise = loadFn()
                .then(() => {
                    loaded = true;
                })
                .catch((err) => {
                    loadPromise = null; // 允许重试
                    throw err;
                });
            await loadPromise;
        },
        reset: () => {
            loaded = false;
            loadPromise = null;
        },
        isLoaded: () => loaded,
    };
}
