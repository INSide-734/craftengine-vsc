import * as esbuild from 'esbuild';
import { copy } from 'esbuild-plugin-copy';
import { cpSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createBuildConfig, paths } from './esbuild.config.mjs';
import { logger } from './scripts/logger.js';
import {
  shouldCopyDependencies,
  writeCache,
  calculateDependencyHash,
} from './scripts/cache-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * 获取当前平台的 sharp 平台依赖包名
 * 支持通过 TARGET_PLATFORM 环境变量指定目标平台
 * 支持通过 BUILD_ALL_PLATFORMS 环境变量构建所有平台
 */
function getSharpPlatformPackages() {
  const platformMap = {
    'win32-x64': '@img/sharp-win32-x64',
    'win32-ia32': '@img/sharp-win32-ia32',
    'darwin-x64': '@img/sharp-darwin-x64',
    'darwin-arm64': '@img/sharp-darwin-arm64',
    'linux-x64': '@img/sharp-linux-x64',
    'linux-arm64': '@img/sharp-linux-arm64',
    'linux-arm': '@img/sharp-linux-arm',
  };

  // 如果设置了 BUILD_ALL_PLATFORMS，返回所有平台
  if (process.env.BUILD_ALL_PLATFORMS === 'true') {
    logger.info('Building for all platforms (universal build)');
    return Object.values(platformMap);
  }

  // 如果设置了 TARGET_PLATFORM 环境变量，使用指定的平台
  const targetPlatform = process.env.TARGET_PLATFORM;
  if (targetPlatform) {
    const sharpPackage = platformMap[targetPlatform];
    if (sharpPackage) {
      logger.info(`Building for target platform: ${targetPlatform}`);
      return [sharpPackage];
    }
  }

  // 否则使用当前运行平台
  const platform = process.platform;
  const arch = process.arch;
  const currentPlatformPackage = platformMap[`${platform}-${arch}`];

  return currentPlatformPackage ? [currentPlatformPackage] : [];
}

/**
 * 解析 pnpm 包路径（处理符号链接和 .pnpm 目录）
 * @param {string} packageName - 包名
 * @param {string|null} versionRange - 版本范围（如 '^7.0.0'），null 表示任意版本
 * @returns {string|null} - 包的相对路径
 */
function resolvePackagePath(packageName, versionRange = null) {
  const nodeModules = join(__dirname, 'node_modules');
  const directPath = join(nodeModules, packageName);

  // 尝试直接路径（仅在未指定版本时）
  if (!versionRange && existsSync(directPath)) {
    return packageName;
  }

  // 在 .pnpm 目录中查找
  const pnpmDir = join(nodeModules, '.pnpm');
  if (existsSync(pnpmDir)) {
    const pnpmPackageName = packageName.replace('/', '+');
    const entries = readdirSync(pnpmDir);

    // 查找所有匹配的包版本
    const matchedEntries = entries
      .filter((entry) => entry.startsWith(pnpmPackageName + '@'))
      .map((entry) => {
        // 提取版本号（格式：packageName@version）
        const versionMatch = entry.match(new RegExp(`^${pnpmPackageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@(.+?)(?:_|$)`));
        const version = versionMatch ? versionMatch[1] : '';
        return { entry, version };
      })
      .filter(({ version }) => {
        if (!versionRange) return true;

        // 简单的版本范围匹配
        if (versionRange.startsWith('^')) {
          const majorVersion = versionRange.slice(1).split('.')[0];
          return version.startsWith(majorVersion + '.');
        } else if (versionRange.startsWith('~')) {
          const minorVersion = versionRange.slice(1).split('.').slice(0, 2).join('.');
          return version.startsWith(minorVersion + '.');
        } else {
          // 精确匹配
          return version === versionRange;
        }
      })
      .sort((a, b) => {
        // 按版本号降序排序（选择最新版本）
        const aParts = a.version.split('.').map(Number);
        const bParts = b.version.split('.').map(Number);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
          const aNum = aParts[i] || 0;
          const bNum = bParts[i] || 0;
          if (aNum !== bNum) return bNum - aNum;
        }
        return 0;
      });

    if (matchedEntries.length > 0) {
      const selectedEntry = matchedEntries[0];
      logger.info(`Resolved ${packageName}${versionRange ? ` (${versionRange})` : ''} -> ${selectedEntry.version}`);
      return `.pnpm/${selectedEntry.entry}/node_modules/${packageName}`;
    }
  }

  return null;
}

/** 复制静态资源到 out/assets/ */
function copyAssets() {
  logger.info('Copying assets...');
  cpSync(paths.assets, join(paths.out, 'assets'), { recursive: true });
  logger.success('Assets copied');
}

/** esbuild 问题匹配插件（用于 VS Code 终端问题匹配） */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        logger.error(text);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      }
      copyAssets();
      console.log('[watch] build finished');
    });
  },
};

/**
 * 获取依赖信息用于缓存
 * @returns {Map<string, {version: string, path: string}>}
 */
function getDependencyInfo() {
  const dependencies = new Map();
  const sharpPackageJson = join(paths.nodeModules, 'sharp', 'package.json');

  if (existsSync(sharpPackageJson)) {
    const pkg = JSON.parse(readFileSync(sharpPackageJson, 'utf-8'));
    dependencies.set('sharp', {
      version: pkg.version,
      path: join(paths.nodeModules, 'sharp'),
    });
  }

  return dependencies;
}

/**
 * 复制 sharp 及其所有依赖（带缓存优化）
 * 使用自动化脚本分析和复制所有运行时依赖
 */
function copySharpDependencies() {
  const cacheDir = join(paths.out, 'node_modules', '.cache');
  const dependencies = getDependencyInfo();

  // 检查缓存
  if (!shouldCopyDependencies(cacheDir, dependencies)) {
    logger.info('Sharp dependencies are up-to-date (using cache)');
    return;
  }

  logger.info('Copying sharp and its dependencies...');

  try {
    // 调用依赖复制脚本
    execSync('node scripts/copy-dependencies.js sharp', {
      cwd: __dirname,
      stdio: 'inherit',
    });

    // 如果是通用构建，复制所有平台的 sharp 包
    if (process.env.BUILD_ALL_PLATFORMS === 'true') {
      logger.info('Copying all platform-specific sharp packages...');
      const sharpPackages = getSharpPlatformPackages();

      for (const sharpPackage of sharpPackages) {
        const platformPath = resolvePackagePath(sharpPackage);
        if (platformPath) {
          const sourcePath = join(paths.nodeModules, platformPath);
          const targetPath = join(paths.out, 'node_modules', sharpPackage);

          if (existsSync(sourcePath)) {
            logger.info(`Copying ${sharpPackage}...`);
            // 使用 recursive 和 dereference 选项确保复制实际文件而不是符号链接
            cpSync(sourcePath, targetPath, {
              recursive: true,
              dereference: true,
              force: true,
            });
          } else {
            logger.warn(`Platform package not found: ${sharpPackage}`);
          }
        }
      }
    }

    // 更新缓存
    const hash = calculateDependencyHash(dependencies);
    writeCache(cacheDir, hash);

    logger.success('Sharp dependencies copied');
  } catch (error) {
    logger.error('Failed to copy sharp dependencies', error);
    throw error;
  }
}

/**
 * Sharp 原生模块复制插件
 *
 * sharp 是原生模块，不能被 esbuild 打包，需要复制到 out/node_modules。
 * 使用自动化脚本复制 sharp 及其所有运行时依赖（包括传递依赖）。
 * 支持复制单个平台或所有平台的依赖。
 */
function createSharpCopyPlugin() {
  const sharpPackages = getSharpPlatformPackages();
  const assets = [];

  // 复制所有平台特定包（原生二进制文件）
  for (const sharpPackage of sharpPackages) {
    const platformPath = resolvePackagePath(sharpPackage);
    if (platformPath) {
      assets.push({
        from: [`node_modules/${platformPath}/**/*`],
        to: [`out/node_modules/${sharpPackage}`],
      });
      logger.info(`Will copy platform package: ${sharpPackage}`);
    } else {
      logger.warn(`Could not resolve sharp platform package: ${sharpPackage}`);
    }
  }

  if (assets.length === 0) {
    logger.warn('No sharp platform packages found to copy');
  }

  return copy({
    resolveFrom: 'cwd',
    assets,
    watch,
  });
}

/** 主入口构建配置 */
const mainConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  minify: production,
  sourcemap: production ? 'external' : 'inline',
  sourcesContent: false,
  platform: 'node',
  outfile: 'out/extension.js',
  external: [
    'vscode', // VS Code API，运行时由宿主提供
    'sharp', // 原生模块，不可打包
  ],
  logLevel: 'silent',
  plugins: [esbuildProblemMatcherPlugin, createSharpCopyPlugin()],
};

/** Worker 入口构建配置（独立打包） */
const workerConfig = {
  entryPoints: ['src/infrastructure/renderer/worker/renderWorker.ts'],
  bundle: true,
  format: 'cjs',
  minify: production,
  sourcemap: production ? 'external' : 'inline',
  sourcesContent: false,
  platform: 'node',
  outfile: 'out/renderWorker.js',
  external: ['vscode', 'sharp'],
  logLevel: 'silent',
};

async function main() {
  mkdirSync('out', { recursive: true });
  copyAssets();

  if (watch) {
    logger.info('Starting watch mode...');

    // watch 模式下，首次启动时检查是否需要复制 sharp 依赖
    if (!existsSync(join(paths.out, 'node_modules', 'sharp'))) {
      copySharpDependencies();
    } else {
      logger.info('Sharp dependencies already exist, skipping copy');
    }

    const [mainCtx, workerCtx] = await Promise.all([
      esbuild.context({ ...mainConfig, plugins: [esbuildProblemMatcherPlugin] }),
      esbuild.context(workerConfig),
    ]);
    await Promise.all([mainCtx.watch(), workerCtx.watch()]);
  } else {
    logger.info('Building extension...');

    // 构建前先复制 sharp 依赖（带缓存）
    copySharpDependencies();

    await Promise.all([esbuild.build(mainConfig), esbuild.build(workerConfig)]);

    logger.success('Build completed');
  }
}

main().catch((e) => {
  logger.error('Build failed', e);
  process.exit(1);
});
