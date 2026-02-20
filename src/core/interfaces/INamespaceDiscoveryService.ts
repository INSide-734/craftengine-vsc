/**
 * 命名空间发现服务接口
 *
 * 提供 Minecraft 资源包命名空间的自动发现、验证和解析功能
 * 根据 https://minecraft.wiki/w/Resource_location 规范实现
 */

/**
 * 资源位置解析结果
 */
export interface IResourceLocation {
    /** 命名空间（如果未指定则为 null） */
    namespace: string | null;
    /** 资源路径 */
    path: string;
    /** 是否有效 */
    isValid: boolean;
    /** 错误信息（如果无效） */
    error?: string;
}

/**
 * 命名空间发现服务接口
 *
 * 提供 Minecraft 资源包命名空间的自动发现、验证和解析功能
 * 根据 https://minecraft.wiki/w/Resource_location 规范实现
 *
 * @remarks
 * **Minecraft 资源位置格式**：
 *
 * 格式: `namespace:path`
 * - **namespace**: 只能包含 `[a-z0-9_.-]`，必须以字母开头
 * - **path**: 可以包含 `[a-z0-9_.-/]`，斜杠作为目录分隔符
 *
 * @example
 * ```typescript
 * const service = container.resolve<INamespaceDiscoveryService>(
 *     SERVICE_TOKENS.NamespaceDiscoveryService
 * );
 *
 * // 发现命名空间
 * const namespaces = service.discoverNamespacesInWorkspace('assets/{namespace}/models');
 * // 返回: ['minecraft', 'custom_pack', 'mymod']
 *
 * // 验证命名空间
 * service.isValidNamespace('minecraft');     // true
 * service.isValidNamespace('MyMod');         // false (大写字母)
 *
 * // 解析资源位置
 * const location = service.parseResourceLocation('minecraft:item/sword');
 * // 返回: { namespace: 'minecraft', path: 'item/sword', isValid: true }
 * ```
 */
export interface INamespaceDiscoveryService {
    // ==================== 命名空间发现 ====================

    /**
     * 发现指定目录下的所有有效命名空间
     *
     * @param parentPath 父目录路径（如 assets/ 或 data/）
     * @returns 命名空间名称数组
     */
    discoverNamespaces(parentPath: string): string[];

    /**
     * 发现指定目录下的所有有效命名空间（异步版本）
     *
     * @param parentPath 父目录路径（如 assets/ 或 data/）
     * @returns 命名空间名称数组
     */
    discoverNamespacesAsync?(parentPath: string): Promise<string[]>;

    /**
     * 在工作区中发现所有命名空间
     *
     * @param basePathTemplate 基础路径模板，如 "assets/{namespace}/models"
     * @returns 发现的命名空间数组
     */
    discoverNamespacesInWorkspace(basePathTemplate: string): string[];

    /**
     * 检查命名空间是否存在于工作区中
     *
     * @param namespace 命名空间名称
     * @param basePathTemplate 基础路径模板，如 "assets/{namespace}/models"
     * @returns 如果命名空间存在返回 true
     */
    namespaceExists(namespace: string, basePathTemplate: string): boolean;

    /**
     * 获取命名空间在工作区中的绝对路径
     *
     * @param namespace 命名空间名称
     * @param basePathTemplate 基础路径模板
     * @returns 命名空间的绝对路径数组（可能在多个工作区文件夹中存在）
     */
    getNamespacePaths(namespace: string, basePathTemplate: string): string[];

    // ==================== 验证方法 ====================

    /**
     * 检查名称是否是有效的 Minecraft 命名空间
     *
     * 根据 Minecraft Wiki，命名空间只能包含：
     * - 小写字母 (a-z)
     * - 数字 (0-9)
     * - 下划线 (_)
     * - 连字符 (-)
     * - 点 (.)
     *
     * @param name 要检查的名称
     * @returns 如果是有效命名空间返回 true
     */
    isValidNamespace(name: string): boolean;

    /**
     * 检查路径是否是有效的 Minecraft 资源路径
     *
     * 资源路径只能包含：
     * - 小写字母 (a-z)
     * - 数字 (0-9)
     * - 下划线 (_)
     * - 连字符 (-)
     * - 点 (.)
     * - 斜杠 (/) 作为目录分隔符
     *
     * @param resourcePath 要检查的资源路径
     * @returns 如果是有效路径返回 true
     */
    isValidPath(resourcePath: string): boolean;

    /**
     * 检查资源位置字符串是否有效
     *
     * @param resourceLocation 资源位置字符串
     * @returns 如果有效返回 true
     */
    isValidResourceLocation(resourceLocation: string): boolean;

    // ==================== 资源位置操作 ====================

    /**
     * 解析资源位置字符串
     *
     * @param resourceLocation 资源位置字符串，如 "minecraft:item/sword"
     * @returns 解析结果，包含命名空间和路径
     */
    parseResourceLocation(resourceLocation: string): IResourceLocation;

    /**
     * 构建资源位置字符串
     *
     * @param namespace 命名空间
     * @param resourcePath 资源路径
     * @returns 完整的资源位置字符串
     */
    buildResourceLocation(namespace: string, resourcePath: string): string;

    /**
     * 规范化资源位置字符串
     *
     * - 去除前后空格
     * - 转换为小写
     * - 规范化路径分隔符
     * - 如果没有命名空间，添加默认命名空间
     *
     * @param resourceLocation 资源位置字符串
     * @param addDefaultNamespace 是否添加默认命名空间（默认 true）
     * @returns 规范化后的资源位置，如果无效则返回 null
     */
    normalizeResourceLocation(resourceLocation: string, addDefaultNamespace?: boolean): string | null;

    /**
     * 比较两个资源位置是否相等
     *
     * @param location1 第一个资源位置
     * @param location2 第二个资源位置
     * @returns 如果相等返回 true
     */
    compareResourceLocations(location1: string, location2: string): boolean;

    /**
     * 解析资源的完整文件系统路径
     *
     * @param resourceLocation 资源位置字符串
     * @param basePathTemplate 基础路径模板
     * @param fileExtension 可选的文件扩展名
     * @returns 资源的绝对路径数组（可能在多个位置存在）
     */
    resolveResourcePaths(resourceLocation: string, basePathTemplate: string, fileExtension?: string): string[];

    // ==================== 规范化方法 ====================

    /**
     * 规范化命名空间名称
     *
     * - 转换为小写
     * - 替换无效字符为下划线
     * - 去除前后空格
     *
     * @param name 原始名称
     * @returns 规范化后的命名空间，如果无法规范化则返回 null
     */
    normalizeNamespace(name: string): string | null;

    /**
     * 规范化资源路径
     *
     * - 转换为小写
     * - 规范化路径分隔符
     * - 去除前后空格
     *
     * @param resourcePath 原始路径
     * @returns 规范化后的路径，如果无法规范化则返回 null
     */
    normalizePath(resourcePath: string): string | null;

    // ==================== 默认值和缓存 ====================

    /**
     * 获取默认命名空间
     *
     * 根据 Minecraft 规范，默认命名空间是 "minecraft"
     *
     * @returns 默认命名空间名称
     */
    getDefaultNamespace(): string;

    /**
     * 清除命名空间缓存
     *
     * 当文件系统发生变化时调用此方法
     */
    clearCache(): void;
}
