/**
 * Minecraft 数据加载控制接口
 *
 * 提供数据的加载、刷新和状态查询功能
 */

/**
 * Minecraft 数据加载器接口
 *
 * 负责管理 Minecraft 游戏数据的加载生命周期，
 * 包括初始加载、缓存刷新和加载状态查询。
 */
export interface IMinecraftDataLoader {
    /**
     * 确保数据已加载
     *
     * 如果数据已缓存且未过期，立即返回
     * 否则从远程加载数据
     *
     * @returns Promise 在数据加载完成后 resolve
     */
    ensureLoaded(): Promise<void>;

    /**
     * 刷新数据缓存
     *
     * 强制重新从远程加载所有数据
     *
     * @returns Promise 在数据刷新完成后 resolve
     */
    refresh(): Promise<void>;

    /**
     * 获取当前加载的数据版本
     *
     * @returns Minecraft 版本号（如 "1.21.4"）
     */
    getDataVersion(): string;

    /**
     * 检查数据是否已加载
     *
     * @returns 是否已加载数据
     */
    isLoaded(): boolean;
}
