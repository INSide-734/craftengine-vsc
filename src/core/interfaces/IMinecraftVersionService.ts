/**
 * Minecraft 版本服务接口
 * 
 * 提供 Minecraft 版本数据的获取和管理功能，
 * 支持动态从 Mojang API 获取最新版本列表，静态数据作为 fallback
 */

/**
 * Minecraft 版本信息
 */
export interface IMinecraftVersion {
    /** 版本号 (如 "1.21.4") */
    version: string;
    
    /** 发布时间 */
    releaseTime: Date;
    
    /** 是否为最新正式版 */
    isLatest?: boolean;
}

/**
 * Minecraft 版本服务接口
 * 
 * 提供版本数据的获取、缓存和验证功能
 */
export interface IMinecraftVersionService {
    /**
     * 获取所有可用版本（只返回正式版）
     * 
     * 优先从缓存获取，缓存过期后从 Mojang API 获取，
     * API 不可用时返回静态 fallback 数据
     * 
     * @returns 版本列表，按发布时间倒序排列
     */
    getVersions(): Promise<IMinecraftVersion[]>;
    
    /**
     * 获取最新正式版版本号
     * 
     * @returns 最新正式版版本号（如 "1.21.4"）
     */
    getLatestRelease(): Promise<string>;
    
    /**
     * 刷新版本缓存
     * 
     * 强制从 API 重新获取版本列表
     */
    refresh(): Promise<void>;
    
    /**
     * 检查版本是否有效
     * 
     * @param version 版本号
     * @returns 如果版本存在于列表中返回 true
     */
    isValidVersion(version: string): Promise<boolean>;
    
    /**
     * 比较两个版本号
     * 
     * @param a 版本 A
     * @param b 版本 B
     * @returns 正数表示 a > b，负数表示 a < b，0 表示相等
     */
    compareVersions(a: string, b: string): number;
    
    /**
     * 检查版本格式是否有效
     * 
     * @param version 版本号
     * @returns 如果格式有效返回 true
     */
    isValidVersionFormat(version: string): boolean;
    
    /**
     * 获取最接近的有效版本建议
     * 
     * @param invalidVersion 无效的版本号
     * @returns 最接近的有效版本列表
     */
    getSuggestedVersions(invalidVersion: string): Promise<string[]>;
}

