#!/usr/bin/env node

/**
 * 通用 VSIX 构建脚本
 * 构建包含所有平台原生依赖的单一 VSIX 包
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import { SUPPORTED_PLATFORMS } from './platform-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

/**
 * 构建包含所有平台依赖的通用 VSIX
 * @param {boolean} preRelease - 是否为预发布版本
 */
async function buildUniversal(preRelease = false) {
  logger.info('Building universal VSIX with all platform dependencies...');

  // 读取 package.json
  const packageJsonPath = join(rootDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const { name, version } = packageJson;

  logger.info(`Package: ${name}@${version}`);
  logger.info(`Platforms: ${SUPPORTED_PLATFORMS.map(p => p.id).join(', ')}`);

  try {
    // 1. 清理构建目录
    logger.info('Cleaning build directory...');
    execSync('pnpm run clean', { cwd: rootDir, stdio: 'inherit' });

    // 2. 安装所有平台的 sharp 依赖
    logger.info('Installing all platform-specific sharp dependencies...');
    const sharpPackages = SUPPORTED_PLATFORMS.map(p => p.sharpPackage).join(' ');
    try {
      execSync(`pnpm add -D ${sharpPackages}`, { cwd: rootDir, stdio: 'inherit' });
    } catch (error) {
      logger.warn('Some platform packages may not be available, continuing...');
    }

    // 3. 设置环境变量以构建所有平台依赖
    process.env.BUILD_ALL_PLATFORMS = 'true';

    // 4. 运行构建
    logger.info('Building extension with all platform dependencies...');
    execSync('node esbuild.mjs --production', { cwd: rootDir, stdio: 'inherit' });

    // 5. 验证构建
    logger.info('Verifying build...');
    execSync('node scripts/verify-build.js', { cwd: rootDir, stdio: 'inherit' });

    // 6. 打包 VSIX（禁用 prepublish 钩子以避免重新构建）
    logger.info('Packaging universal VSIX...');
    const vsceCommand = preRelease
      ? 'pnpm exec vsce package --pre-release --no-dependencies --skip-license'
      : 'pnpm exec vsce package --no-dependencies --skip-license';

    // 设置环境变量禁用 prepublish 钩子
    const env = { ...process.env, VSCE_SKIP_PREPUBLISH: 'true' };
    execSync(vsceCommand, { cwd: rootDir, stdio: 'inherit', env });

    // 7. 验证 VSIX 文件
    const vsixFileName = `${name}-${version}.vsix`;
    const vsixPath = join(rootDir, vsixFileName);

    if (existsSync(vsixPath)) {
      logger.success(`Universal VSIX created: ${vsixFileName}`);

      // 8. 创建构建信息文件
      const buildInfoPath = join(rootDir, `${name}-universal-${version}.json`);
      const buildInfo = {
        name,
        version,
        type: 'universal',
        platforms: SUPPORTED_PLATFORMS.map(p => ({
          id: p.id,
          displayName: p.displayName,
          sharpPackage: p.sharpPackage,
        })),
        vsixFile: vsixFileName,
        buildDate: new Date().toISOString(),
      };
      writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));
      logger.success(`Build info created: ${buildInfoPath}`);
    } else {
      logger.error(`VSIX file not found: ${vsixFileName}`);
      process.exit(1);
    }

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
  const preRelease = args.includes('--pre-release');

  buildUniversal(preRelease);
}

// 如果直接运行脚本
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { buildUniversal };
