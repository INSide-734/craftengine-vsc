import type { IResourceLocation } from '../../../core/interfaces/INamespaceDiscoveryService';
import { type NamespaceValidator } from './NamespaceValidator';

/**
 * 资源位置解析器
 *
 * 提供 Minecraft 资源位置字符串的解析、构建和规范化功能。
 *
 * @remarks
 * 资源位置格式: `namespace:path`
 * - 如果没有命名空间，使用默认命名空间 `minecraft`
 */
export class ResourceLocationParser {
    /**
     * 资源位置解析正则表达式
     *
     * 格式: namespace:path
     */
    private static readonly RESOURCE_LOCATION_PATTERN = /^([a-z][a-z0-9_.-]*):(.+)$/;

    /**
     * 默认命名空间
     */
    private static readonly DEFAULT_NAMESPACE = 'minecraft';

    /**
     * 构造函数
     *
     * @param validator - 命名空间验证器
     */
    constructor(private readonly validator: NamespaceValidator) {}

    /**
     * 解析资源位置字符串
     *
     * @param resourceLocation - 资源位置字符串
     * @returns 解析结果
     */
    parseResourceLocation(resourceLocation: string): IResourceLocation {
        if (!resourceLocation || typeof resourceLocation !== 'string') {
            return {
                namespace: null,
                path: '',
                isValid: false,
                error: 'Resource location is empty or not a string',
            };
        }

        const trimmed = resourceLocation.trim();

        // 检查是否包含命名空间
        const match = trimmed.match(ResourceLocationParser.RESOURCE_LOCATION_PATTERN);

        if (match) {
            const namespace = match[1];
            const resourcePath = match[2];

            // 验证命名空间
            if (!this.validator.isValidNamespace(namespace)) {
                return {
                    namespace,
                    path: resourcePath,
                    isValid: false,
                    error: `Invalid namespace: "${namespace}". Namespace must start with a lowercase letter and contain only [a-z0-9_.-]`,
                };
            }

            // 验证路径
            if (!this.validator.isValidPath(resourcePath)) {
                return {
                    namespace,
                    path: resourcePath,
                    isValid: false,
                    error: `Invalid path: "${resourcePath}". Path must contain only [a-z0-9_./-]`,
                };
            }

            return {
                namespace,
                path: resourcePath,
                isValid: true,
            };
        }

        // 没有命名空间，只有路径
        if (!this.validator.isValidPath(trimmed)) {
            return {
                namespace: null,
                path: trimmed,
                isValid: false,
                error: `Invalid path: "${trimmed}". Path must contain only [a-z0-9_./-]`,
            };
        }

        return {
            namespace: null,
            path: trimmed,
            isValid: true,
        };
    }

    /**
     * 构建资源位置字符串
     *
     * @param namespace - 命名空间
     * @param resourcePath - 资源路径
     * @returns 资源位置字符串
     */
    buildResourceLocation(namespace: string, resourcePath: string): string {
        if (!namespace) {
            return resourcePath;
        }
        return `${namespace}:${resourcePath}`;
    }

    /**
     * 规范化资源位置字符串
     *
     * @param resourceLocation - 资源位置字符串
     * @param addDefaultNamespace - 是否添加默认命名空间
     * @returns 规范化后的资源位置，如果无法规范化则返回 null
     */
    normalizeResourceLocation(resourceLocation: string, addDefaultNamespace: boolean = true): string | null {
        if (!resourceLocation || typeof resourceLocation !== 'string') {
            return null;
        }

        const trimmed = resourceLocation.trim().toLowerCase();

        // 规范化路径分隔符（将反斜杠转换为斜杠）
        const normalized = trimmed.replace(/\\/g, '/');

        // 解析资源位置
        const colonIndex = normalized.indexOf(':');

        let namespace: string;
        let resourcePath: string;

        if (colonIndex !== -1) {
            namespace = normalized.substring(0, colonIndex);
            resourcePath = normalized.substring(colonIndex + 1);
        } else {
            namespace = addDefaultNamespace ? this.getDefaultNamespace() : '';
            resourcePath = normalized;
        }

        // 规范化命名空间
        const normalizedNamespace = this.validator.normalizeNamespace(namespace);
        if (namespace && !normalizedNamespace) {
            return null;
        }

        // 规范化路径
        const normalizedPath = this.validator.normalizePath(resourcePath);
        if (!normalizedPath) {
            return null;
        }

        return this.buildResourceLocation(normalizedNamespace || '', normalizedPath);
    }

    /**
     * 比较两个资源位置是否相等
     *
     * @param location1 - 资源位置1
     * @param location2 - 资源位置2
     * @returns 是否相等
     */
    compareResourceLocations(location1: string, location2: string): boolean {
        const normalized1 = this.normalizeResourceLocation(location1, true);
        const normalized2 = this.normalizeResourceLocation(location2, true);

        if (!normalized1 || !normalized2) {
            return false;
        }

        return normalized1 === normalized2;
    }

    /**
     * 检查资源位置字符串是否有效
     *
     * @param resourceLocation - 资源位置字符串
     * @returns 是否有效
     */
    isValidResourceLocation(resourceLocation: string): boolean {
        const parsed = this.parseResourceLocation(resourceLocation);
        return parsed.isValid;
    }

    /**
     * 获取默认命名空间
     *
     * @returns 默认命名空间
     */
    getDefaultNamespace(): string {
        return ResourceLocationParser.DEFAULT_NAMESPACE;
    }
}
