#!/usr/bin/env node

/**
 * 平台特定构建脚本
 * 为指定平台构建 VSIX 包
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import { getPlatformById, getVsixFileName, isValidPlatform } from './platform-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

/**
 * 为指定平台构建 VSIX
 * @param {string} platformId - 平台 ID (如 'win32-x64')
 * @param {boolean} preRelease - 是否为预发布版本
 */
async function buildForPlatform(platformId, preRelease = false) {
  // 验证平台 ID
  if (!isValidPlatform(platformId)) {
    logger.error(`Invalid platform ID: ${platformId}`);
    process.exit(1);
  }

  const platformInfo = getPlatformById(platformId);
  logger.info(`Building for platform: ${platformInfo.displayName} (${platformId})`);

  // 读取 package.json
  const packageJsonPath = join(rootDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const { name, version } = packageJson;

  // 生成 VSIX 文件名
  const vsixFileName = getVsixFileName(name, version, platformId);
  logger.info(`Target VSIX: ${vsixFileName}`);

  // 设置环境变量指定目标平台
  process.env.TARGET_PLATFORM = platformId;

  try {
    // 1. 清理构建目录
    logger.info('Cleaning build directory...');
    execSync('pnpm run clean', { cwd: rootDir, stdio: 'inherit' });

    // 2. 运行构建
    logger.info('Building extension...');
    execSync('node esbuild.mjs --production', { cwd: rootDir, stdio: 'inherit' });

    // 3. 验证构建
    logger.info('Verifying build...');
    execSync('node scripts/verify-build.js', { cwd: rootDir, stdio: 'inherit' });

    // 4. 打包 VSIX
    logger.info('Packaging VSIX...');
    const vsceCommand = preRelease
      ? 'pnpm exec vsce package --pre-release --no-dependencies'
      : 'pnpm exec vsce package --no-dependencies';

    execSync(vsceCommand, { cwd: rootDir, stdio: 'inherit' });

    // 5. 重命名 VSIX 文件
    const defaultVsixName = `${name}-${version}.vsix`;
    const defaultVsixPath = join(rootDir, defaultVsixName);
    const targetVsixPath = join(rootDir, vsixFileName);

    if (existsSync(defaultVsixPath)) {
      execSync(`mv "${defaultVsixPath}" "${targetVsixPath}"`, { cwd: rootDir });
      logger.success(`VSIX created: ${vsixFileName}`);
    } else {
      logger.error(`VSIX file not found: ${defaultVsixName}`);
      process.exit(1);
    }

    // 6. 创建平台信息文件
    const platformInfoPath = join(rootDir, `${name}-${platformId}-${version}.json`);
    const platformInfoData = {
      name,
      version,
      platform: platformInfo,
      vsixFile: vsixFileName,
      buildDate: new Date().toISOString(),
    };
    writeFileSync(platformInfoPath, JSON.stringify(platformInfoData, null, 2));
    logger.success(`Platform info created: ${platformInfoPath}`);

  } catch (error) {
    logger.error('Build failed', error);
    process.exit(1);
  }
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    logger.error('Usage: node build-platform.js <platform-id> [--pre-release]');
    logger.info('Available platforms: win32-x64, win32-ia32, darwin-x64, darwin-arm64, linux-x64, linux-arm64');
    process.exit(1);
  }

  const platformId = args[0];
  const preRelease = args.includes('--pre-release');

  buildForPlatform(platformId, preRelease);
}

// 如果直接运行脚本
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { buildForPlatform };
