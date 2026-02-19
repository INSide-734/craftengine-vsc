const NAMESPACED_REGEX = /^(\w+):([\w/-]+)$/;
const NON_NAMESPACED_REGEX = /^[\w/-]+$/;

/**
 * 资源 ID，解析 Minecraft 命名空间格式
 * 例如: "minecraft:block/stone", "block/chest"
 */
export class ResourceId {
  private readonly id: string;

  constructor(
    public readonly namespace: string,
    public readonly path: string
  ) {
    this.id = `${namespace}:${path}`;
  }

  /**
   * 用于 Map 键的唯一标识
   */
  get key(): string {
    return this.id;
  }

  toString(): string {
    return this.id;
  }

  equals(other: ResourceId): boolean {
    return this.id === other.id;
  }

  /**
   * 从字符串解析 ResourceId
   * @param id 资源 ID 字符串
   * @param fallbackNamespace 未指定命名空间时的默认值
   */
  static of(id: string, fallbackNamespace = 'minecraft'): ResourceId {
    if (NON_NAMESPACED_REGEX.test(id)) {
      return new ResourceId(fallbackNamespace, id);
    }

    const match = NAMESPACED_REGEX.exec(id);
    if (!match) {
      throw new Error(`Invalid resource id: ${id}`);
    }

    return new ResourceId(match[1], match[2]);
  }
}
