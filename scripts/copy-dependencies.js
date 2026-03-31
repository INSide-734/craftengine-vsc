#!/usr/bin/env node

/**
 * 依赖复制工具
 * 复制指定包的所有运行时依赖到输出目录
 */

import { cpSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { analyzeMultiplePackages } from './analyze-dependencies.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

/**
 * 判断是否应该忽略的文件/目录
 * @param {string} name - 文件/目录名
 * @returns {boolean}
 */
function shouldIgnore(name) {
  const ignorePatterns = [
    'node_modules', // 子依赖的 node_modules（已经在依赖树中）
    '.bin',         // 可执行文件链接
    'test',         // 测试文件
    'tests',
    '__tests__',
    '*.test.js',
    '*.test.ts',
    '*.spec.js',
    '*.spec.ts',
    'coverage',     // 覆盖率报告
    '.nyc_output',
    'docs',         // 文档
    'examples',     // 示例
    'benchmark',    // 基准测试
    'benchmarks',
    '.github',      // GitHub 配置
    '.vscode',      // VS Code 配置
    '.idea',        // IDE 配置
    '*.md',         // Markdown 文件（保留 README.md）
    'LICENSE',
    'CHANGELOG',
  ];

  // 精确匹配
  if (ignorePatterns.includes(name)) {
    return true;
  }

  // 通配符匹配
  for (const pattern of ignorePatterns) {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      if (regex.test(name)) {
        return true;
      }
    }
  }

  // 保留 README.md
  if (name === 'README.md') {
    return false;
  }

  return false;
}

/**
 * 复制单个包到输出目录
 * @param {string} packageName - 包名
 * @param {string} sourcePath - 源路径
 * @param {string} outputDir - 输出目录
 */
function copyPackage(packageName, sourcePath, outputDir) {
  const targetPath = join(outputDir, packageName);

  // 创建目标目录
  mkdirSync(targetPath, { recursive: true });

  // 复制文件（排除忽略的文件）
  const entries = readdirSync(sourcePath);
  for (const entry of entries) {
    if (shouldIgnore(entry)) {
      continue;
    }

    const sourceFile = join(sourcePath, entry);
    const targetFile = join(targetPath, entry);

    try {
      const stat = statSync(sourceFile);
      if (stat.isDirectory()) {
        // 递归复制目录
        cpSync(sourceFile, targetFile, {
          recursive: true,
          filter: (src) => !shouldIgnore(basename(src)),
        });
      } else {
        // 复制文件
        cpSync(sourceFile, targetFile);
      }
    } catch (error) {
      logger.error(`Failed to copy ${sourceFile}`, error);
    }
  }
}

/**
 * 复制多个包的所有依赖到输出目录
 * @param {string[]} packageNames - 包名列表
 * @param {string} outputDir - 输出目录（默认：out/node_modules）
 */
export function copyDependencies(packageNames, outputDir = join(rootDir, 'out', 'node_modules')) {
  logger.info(`Analyzing dependencies for: ${packageNames.join(', ')}`);

  // 分析依赖树
  const dependencies = analyzeMultiplePackages(packageNames);

  logger.info(`Found ${dependencies.size} dependencies to copy`);

  // 创建输出目录
  mkdirSync(outputDir, { recursive: true });

  // 复制每个依赖
  let copiedCount = 0;
  for (const [name, info] of dependencies) {
    logger.progress(copiedCount + 1, dependencies.size, `Copying ${name}@${info.version}`);
    copyPackage(name, info.path, outputDir);
    copiedCount++;
  }

  logger.success(`Successfully copied ${copiedCount} dependencies to ${outputDir}`);
}

/**
 * 主函数（命令行调用）
 */
function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node copy-dependencies.js <package-name> [<package-name> ...] [--output <dir>]');
    process.exit(1);
  }

  // 解析参数
  let outputDir = join(rootDir, 'out', 'node_modules');
  const packageNames = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && i + 1 < args.length) {
      outputDir = args[i + 1];
      i++;
    } else {
      packageNames.push(args[i]);
    }
  }

  if (packageNames.length === 0) {
    console.error('Error: No package names specified');
    process.exit(1);
  }

  copyDependencies(packageNames, outputDir);
}

// 如果直接运行脚本
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
