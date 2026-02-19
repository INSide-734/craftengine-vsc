import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';

/**
 * 资源包接口
 */
export interface ResourcePack {
  /**
   * 获取资源的 Buffer
   * @param resourcePath 资源路径
   * @returns Buffer 或 null（如果资源不存在）
   */
  getResourceBuffer(resourcePath: string): Buffer | null;
}

/**
 * 目录资源包
 * 支持多种目录结构:
 * 1. 标准资源包: <pack>/assets/<namespace>/...
 * 2. 命名空间目录: <namespace>/models/..., <namespace>/textures/...
 */
export class DirectoryResourcePack implements ResourcePack {
  private readonly dir: string;
  private readonly structureType: 'standard' | 'namespace';
  private readonly detectedNamespace: string | null;

  constructor(dir: string) {
    this.dir = dir;

    // 检测目录结构类型
    if (fs.existsSync(path.join(dir, 'assets'))) {
      // 标准资源包结构: <pack>/assets/<namespace>/...
      this.structureType = 'standard';
      this.detectedNamespace = null;
    } else if (fs.existsSync(path.join(dir, 'models')) || fs.existsSync(path.join(dir, 'textures'))) {
      // 命名空间目录结构: <namespace>/models/..., <namespace>/textures/...
      // 从目录名推断命名空间
      this.structureType = 'namespace';
      this.detectedNamespace = path.basename(dir);
    } else {
      // 默认为标准结构
      this.structureType = 'standard';
      this.detectedNamespace = null;
    }
  }

  getResourceBuffer(resourcePath: string): Buffer | null {
    let fullPath: string;

    if (this.structureType === 'namespace' && this.detectedNamespace) {
      // 命名空间目录结构
      // 请求路径格式: assets/minecraft/models/block/stone.json
      // 需要转换为: models/block/stone.json (如果命名空间匹配)
      const match = resourcePath.match(/^assets\/([^/]+)\/(.+)$/);
      if (match) {
        const [, namespace, subPath] = match;
        if (namespace === this.detectedNamespace) {
          fullPath = path.join(this.dir, subPath);
        } else {
          return null; // 命名空间不匹配
        }
      } else {
        fullPath = path.join(this.dir, resourcePath);
      }
    } else {
      // 标准资源包结构
      fullPath = path.join(this.dir, resourcePath);
    }

    try {
      if (fs.existsSync(fullPath)) {
        return fs.readFileSync(fullPath);
      }
      return null;
    } catch {
      return null;
    }
  }
}

/**
 * ZIP 资源包
 */
export class ZipResourcePack implements ResourcePack {
  private readonly zip: AdmZip;

  constructor(file: string) {
    this.zip = new AdmZip(file);
  }

  getResourceBuffer(resourcePath: string): Buffer | null {
    try {
      const entry = this.zip.getEntry(resourcePath);
      if (entry) {
        return this.zip.readFile(entry);
      }
      return null;
    } catch {
      return null;
    }
  }
}

/**
 * 内部资源包
 * 从项目内置的 assets/ 目录加载资源
 */
export class InternalResourcePack implements ResourcePack {
  private readonly rootDir: string;

  constructor() {
    // esbuild 打包后 __dirname = <root>/out/，assets 复制到 out/assets/
    this.rootDir = path.resolve(__dirname);
  }

  getResourceBuffer(resourcePath: string): Buffer | null {
    // resourcePath 格式: assets/minecraft/models/block/stone.json
    const fullPath = path.join(this.rootDir, resourcePath);

    try {
      if (fs.existsSync(fullPath)) {
        return fs.readFileSync(fullPath);
      }
      return null;
    } catch {
      return null;
    }
  }
}
