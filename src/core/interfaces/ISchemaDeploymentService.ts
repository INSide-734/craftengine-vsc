/**
 * Schema 部署服务接口
 *
 * 定义 Schema 文件从扩展包部署到工作区的服务契约。
 * 支持版本管理、增量更新和强制重部署。
 *
 * @remarks
 * **核心功能**：
 *
 * 1. **Schema 部署**
 *    - 将扩展内置的 Schema 文件复制到工作区
 *    - 支持首次部署和版本更新
 *    - 维护目录结构
 *
 * 2. **版本管理**
 *    - 跟踪已部署的 Schema 版本
 *    - 检测版本差异
 *    - 支持自动更新和手动更新
 *
 * 3. **用户自定义**
 *    - 保护用户修改的 Schema 文件
 *    - 提供强制重部署选项
 *    - 支持单文件恢复
 *
 * **使用场景**：
 * - 扩展激活时自动部署 Schema
 * - 扩展更新后升级工作区 Schema
 * - 用户手动触发部署或重置
 */

import { type EditorDisposable } from '../types/EditorTypes';

/**
 * 部署结果
 */
export interface IDeploymentResult {
    /** 是否成功 */
    success: boolean;
    /** 部署的文件数量 */
    deployedCount: number;
    /** 跳过的文件数量（已存在且未变更） */
    skippedCount: number;
    /** 失败的文件数量 */
    failedCount: number;
    /** 失败的文件列表及原因 */
    failures?: Array<{ file: string; reason: string }>;
    /** 部署的版本 */
    version: string;
    /** 部署目录 */
    targetDir: string;
}

/**
 * 版本信息
 */
export interface ISchemaVersionInfo {
    /** 扩展版本 */
    version: string;
    /** 部署时间 */
    deployedAt: string;
    /** 文件哈希（用于检测变更） */
    files: Record<string, string>;
}

/**
 * Schema 源类型
 */
export type SchemaSource = 'workspace' | 'extension';

/**
 * Schema 部署服务接口
 */
export interface ISchemaDeploymentService extends EditorDisposable {
    /**
     * 初始化部署服务
     *
     * @param extensionPath - 扩展的安装路径
     */
    initialize(extensionPath: string): Promise<void>;

    /**
     * 部署 Schema 到工作区
     *
     * 将扩展包中的 Schema 文件复制到工作区的 `.craftengine/schemas/` 目录。
     * 仅在需要时执行部署（首次或版本更新）。
     *
     * @returns 部署结果
     */
    deploySchemas(): Promise<IDeploymentResult>;

    /**
     * 检查是否需要部署
     *
     * 比较当前扩展版本与工作区中已部署的版本，
     * 确定是否需要执行部署操作。
     *
     * @returns true 如果需要部署
     */
    needsDeployment(): Promise<boolean>;

    /**
     * 强制重新部署
     *
     * 忽略版本检查，覆盖工作区中的所有 Schema 文件。
     * 用于重置用户修改或修复损坏的文件。
     *
     * @returns 部署结果
     */
    forceRedeploy(): Promise<IDeploymentResult>;

    /**
     * 获取工作区 Schema 目录路径
     *
     * @returns 工作区 Schema 目录的绝对路径，如果没有工作区则返回 undefined
     */
    getWorkspaceSchemaDir(): string | undefined;

    /**
     * 获取当前 Schema 源
     *
     * @returns 'workspace' 如果使用工作区 Schema，'extension' 如果使用扩展内置
     */
    getSchemaSource(): Promise<SchemaSource>;

    /**
     * 获取工作区 Schema 版本信息
     *
     * @returns 版本信息，如果未部署则返回 undefined
     */
    getWorkspaceVersionInfo(): Promise<ISchemaVersionInfo | undefined>;

    /**
     * 检查指定的 Schema 文件是否存在于工作区
     *
     * @param filename - Schema 文件名（相对路径）
     * @returns true 如果文件存在于工作区
     */
    hasWorkspaceSchema(filename: string): Promise<boolean>;

    /**
     * 获取 Schema 文件的完整路径
     *
     * 优先返回工作区路径，如果不存在则返回扩展路径。
     *
     * @param filename - Schema 文件名（相对路径）
     * @returns Schema 文件的绝对路径
     */
    getSchemaPath(filename: string): Promise<string>;
}
