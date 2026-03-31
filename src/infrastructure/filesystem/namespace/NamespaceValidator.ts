/**
 * 命名空间验证器
 *
 * 提供 Minecraft 资源位置的验证和规范化功能。
 *
 * @remarks
 * 根据 Minecraft Wiki (https://minecraft.wiki/w/Resource_location)：
 * - **namespace**: 只能包含 `[a-z0-9_.-]`，必须以字母开头
 * - **path**: 可以包含 `[a-z0-9_.-/]`，斜杠作为目录分隔符
 */
export class NamespaceValidator {
    /**
     * 有效命名空间的正则表达式
     *
     * 根据 Minecraft Wiki：
     * - 必须以小写字母开头
     * - 只能包含小写字母、数字、下划线、连字符、点
     */
    private static readonly VALID_NAMESPACE_PATTERN = /^[a-z][a-z0-9_.-]*$/;

    /**
     * 有效资源路径的正则表达式
     *
     * 路径可以包含斜杠作为目录分隔符
     */
    private static readonly VALID_PATH_PATTERN = /^[a-z0-9_.-][a-z0-9_./-]*$/;

    /**
     * 检查名称是否是有效的 Minecraft 命名空间
     *
     * @param name - 命名空间名称
     * @returns 是否有效
     */
    isValidNamespace(name: string): boolean {
        if (!name || typeof name !== 'string') {
            return false;
        }
        return NamespaceValidator.VALID_NAMESPACE_PATTERN.test(name);
    }

    /**
     * 检查路径是否是有效的 Minecraft 资源路径
     *
     * @param resourcePath - 资源路径
     * @returns 是否有效
     */
    isValidPath(resourcePath: string): boolean {
        if (!resourcePath || typeof resourcePath !== 'string') {
            return false;
        }
        if (resourcePath.length === 0) {
            return false;
        }
        return NamespaceValidator.VALID_PATH_PATTERN.test(resourcePath);
    }

    /**
     * 规范化命名空间名称
     *
     * @param name - 命名空间名称
     * @returns 规范化后的命名空间，如果无法规范化则返回 null
     */
    normalizeNamespace(name: string): string | null {
        if (!name || typeof name !== 'string') {
            return null;
        }

        // 去除前后空格并转换为小写
        let normalized = name.trim().toLowerCase();

        // 替换空格和无效字符为下划线
        normalized = normalized.replace(/[\s]+/g, '_');
        normalized = normalized.replace(/[^a-z0-9_.-]/g, '_');

        // 确保以字母开头
        if (!/^[a-z]/.test(normalized)) {
            // 尝试添加前缀
            normalized = 'ns_' + normalized;
        }

        // 清理连续的下划线
        normalized = normalized.replace(/_+/g, '_');

        // 验证最终结果
        if (!this.isValidNamespace(normalized)) {
            return null;
        }

        return normalized;
    }

    /**
     * 规范化资源路径
     *
     * @param resourcePath - 资源路径
     * @returns 规范化后的路径，如果无法规范化则返回 null
     */
    normalizePath(resourcePath: string): string | null {
        if (!resourcePath || typeof resourcePath !== 'string') {
            return null;
        }

        // 去除前后空格并转换为小写
        let normalized = resourcePath.trim().toLowerCase();

        // 规范化路径分隔符
        normalized = normalized.replace(/\\/g, '/');

        // 移除开头和结尾的斜杠
        normalized = normalized.replace(/^\/+|\/+$/g, '');

        // 清理连续的斜杠
        normalized = normalized.replace(/\/+/g, '/');

        // 替换无效字符
        normalized = normalized.replace(/[^a-z0-9_./-]/g, '_');

        // 验证最终结果
        if (!normalized || !this.isValidPath(normalized)) {
            return null;
        }

        return normalized;
    }
}
