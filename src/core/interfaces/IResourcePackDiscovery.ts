/**
 * 资源包信息
 */
export interface IResourcePackInfo {
    /** 资源包路径 */
    path: string;
    /** 资源包名称 */
    name?: string;
}

/**
 * 资源包发现服务接口
 *
 * 抽象工作区中 Minecraft 资源包的自动发现能力。
 */
export interface IResourcePackDiscovery {
    /** 在工作区中发现资源包 */
    discoverInWorkspace(): IResourcePackInfo[];
}
