#!/usr/bin/env node

/**
 * 构建验证脚本
 * 验证 out 目录中的依赖完整性，确保所有必需的运行时依赖都已正确复制
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const outDir = join(rootDir, 'out');

// 验证配置
const validations = [
  {
    name: 'semver',
    expectedVersion: '^7.0.0',
    requiredFiles: [
      'package.json',
      'index.js',
      'functions/coerce.js',
      'functions/parse.js',
      'classes/semver.js',
      'internal/constants.js',
      'ranges/min-version.js',
    ],
  },
  {
    name: 'sharp',
    requiredFiles: ['package.json', 'lib/index.js', 'lib/sharp.js', 'lib/libvips.js'],
  },
  {
    name: 'detect-libc',
    requiredFiles: ['package.json', 'lib/detect-libc.js'],
  },
  {
    name: '@img/colour',
    requiredFiles: ['package.json'],
  },
];

let hasErrors = false;

logger.info('Verifying build output...');

// 验证 out 目录存在
if (!existsSync(outDir)) {
  logger.error('out directory does not exist. Run build first.');
  process.exit(1);
}

// 验证每个依赖
for (const validation of validations) {
  const packageDir = join(outDir, 'node_modules', validation.name);
  const packageJsonPath = join(packageDir, 'package.json');

  logger.info(`Checking ${validation.name}...`);

  // 检查包目录是否存在
  if (!existsSync(packageDir)) {
    logger.error(`Package directory not found: ${packageDir}`);
    hasErrors = true;
    continue;
  }

  // 检查版本（如果指定）
  if (validation.expectedVersion) {
    if (!existsSync(packageJsonPath)) {
      logger.error('package.json not found');
      hasErrors = true;
      continue;
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const actualVersion = packageJson.version;

    // 简单的版本范围检查
    const expectedMajor = validation.expectedVersion.replace(/[^\d]/g, '').charAt(0);
    const actualMajor = actualVersion.split('.')[0];

    if (actualMajor !== expectedMajor) {
      logger.error(
        `Version mismatch: expected ${validation.expectedVersion}, got ${actualVersion}`
      );
      hasErrors = true;
      continue;
    }

    logger.debug(`Version: ${actualVersion}`);
  }

  // 检查必需文件
  let allFilesExist = true;
  for (const file of validation.requiredFiles) {
    const filePath = join(packageDir, file);
    if (!existsSync(filePath)) {
      logger.error(`Required file missing: ${file}`);
      allFilesExist = false;
      hasErrors = true;
    }
  }

  if (allFilesExist) {
    logger.success(`All required files present (${validation.requiredFiles.length} files)`);
  }
}

// 验证主入口文件
const mainEntry = join(outDir, 'extension.js');
if (!existsSync(mainEntry)) {
  logger.error('Main entry file not found: out/extension.js');
  hasErrors = true;
} else {
  logger.success('Main entry file exists: out/extension.js');
}

// 总结
if (hasErrors) {
  logger.error('Build verification failed. Please fix the errors above.');
  process.exit(1);
} else {
  logger.success('Build verification passed! All dependencies are correctly packaged.');
  process.exit(0);
}
