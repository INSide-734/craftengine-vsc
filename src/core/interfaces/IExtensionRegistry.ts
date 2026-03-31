/**
 * YAML Schema API 接口
 *
 * 抽象 Red Hat YAML 扩展的 Schema 注册 API。
 */
export interface IYamlSchemaApi {
    registerContributor(
        name: string,
        requestSchema: (uri: string) => Promise<string | null>,
        requestSchemaContent: (uri: string) => boolean,
    ): Promise<void>;
}

/**
 * 扩展信息接口
 */
export interface IExtensionInfo {
    /** 扩展是否已激活 */
    isActive: boolean;
    /** 扩展导出的 API */
    exports: unknown;
    /** 激活扩展 */
    activate(): Promise<unknown>;
}

/**
 * 扩展注册表接口
 *
 * 抽象编辑器的扩展查询功能，使 Application 层不直接依赖 vscode.extensions。
 */
export interface IExtensionRegistry {
    /**
     * 获取指定 ID 的扩展
     *
     * @param extensionId - 扩展 ID（如 'redhat.vscode-yaml'）
     * @returns 扩展信息，如果未安装则返回 undefined
     */
    getExtension(extensionId: string): IExtensionInfo | undefined;
}
