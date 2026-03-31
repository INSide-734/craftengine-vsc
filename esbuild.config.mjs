import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * esbuild 构建配置
 * 提供统一的构建配置管理
 */

/**
 * 创建构建配置
 * @param {Object} options - 构建选项
 * @param {boolean} options.production - 是否为生产构建
 * @param {boolean} options.watch - 是否为监听模式
 * @param {string|boolean} options.sourcemap - sourcemap 配置
 * @returns {Object} 构建配置对象
 */
export const createBuildConfig = (options = {}) => {
  const {
    production = false,
    watch = false,
    sourcemap = !production ? 'inline' : 'external',
  } = options;

  // 基础配置
  const baseConfig = {
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap,
    sourcesContent: false,
    platform: 'node',
    logLevel: 'silent',
    external: ['vscode', 'sharp'],
  };

  return {
    main: {
      ...baseConfig,
      entryPoints: ['src/extension.ts'],
      outfile: 'out/extension.js',
    },
    worker: {
      ...baseConfig,
      entryPoints: ['src/infrastructure/renderer/worker/renderWorker.ts'],
      outfile: 'out/renderWorker.js',
    },
  };
};

/**
 * 项目路径配置
 */
export const paths = {
  root: resolve(__dirname),
  out: resolve(__dirname, 'out'),
  assets: resolve(__dirname, 'src/infrastructure/renderer/assets'),
  nodeModules: resolve(__dirname, 'node_modules'),
};
