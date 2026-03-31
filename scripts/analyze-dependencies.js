#!/usr/bin/env node

/**
 * 依赖分析工具
 * 递归分析指定包的所有运行时依赖（排除 devDependencies 和 peerDependencies）
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

/**
 * 解析 pnpm 包路径
 * @param {string} packageName - 包名
 * @param {string} fromPath - 起始路径（用于解析相对依赖）
 * @returns {string|null} - 包的绝对路径
 */
function resolvePackagePath(packageName, fromPath = rootDir) {
  // 总是从根目录的 node_modules 开始查找
  const nodeModules = join(rootDir, 'node_modules');

  // 尝试直接路径
  const directPath = join(nodeModules, packageName);
  if (existsSync(join(directPath, 'package.json'))) {
    return directPath;
  }

  // 尝试 .pnpm 目录
  const pnpmDir = join(nodeModules, '.pnpm');
  if (existsSync(pnpmDir)) {
    const pnpmPackageName = packageName.replace('/', '+');
    const entries = readdirSync(pnpmDir);

    // 查找所有匹配的包版本
    const matchedEntries = entries
      .filter(entry => entry.startsWith(pnpmPackageName + '@'))
      .map(entry => {
        // 提取版本号
        const versionMatch = entry.match(new RegExp(`^${pnpmPackageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@(.+?)(?:_|$)`));
        const version = versionMatch ? versionMatch[1] : '';
        return { entry, version };
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

    // 选择最新版本
    if (matchedEntries.length > 0) {
      const selectedEntry = matchedEntries[0];
      const packagePath = join(pnpmDir, selectedEntry.entry, 'node_modules', packageName);
      if (existsSync(join(packagePath, 'package.json'))) {
        return packagePath;
      }
    }
  }

  return null;
}

/**
 * 读取包的 package.json
 * @param {string} packagePath - 包路径
 * @returns {object|null} - package.json 内容
 */
function readPackageJson(packagePath) {
  const packageJsonPath = join(packagePath, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  } catch (error) {
    console.error(`Failed to parse package.json at ${packageJsonPath}:`, error.message);
    return null;
  }
}

/**
 * 递归分析包的所有运行时依赖
 * @param {string} packageName - 包名
 * @param {Set<string>} visited - 已访问的包（避免循环依赖）
 * @param {Map<string, {version: string, path: string}>} result - 结果 Map
 * @param {string} fromPath - 起始路径
 * @returns {Map<string, {version: string, path: string}>}
 */
function analyzeDependencies(packageName, visited = new Set(), result = new Map(), fromPath = rootDir) {
  // 避免循环依赖
  if (visited.has(packageName)) {
    return result;
  }
  visited.add(packageName);

  // 解析包路径
  const packagePath = resolvePackagePath(packageName, fromPath);
  if (!packagePath) {
    console.warn(`Warning: Could not resolve package: ${packageName}`);
    return result;
  }

  // 读取 package.json
  const packageJson = readPackageJson(packagePath);
  if (!packageJson) {
    return result;
  }

  // 添加到结果
  result.set(packageName, {
    version: packageJson.version,
    path: packagePath,
  });

  // 递归分析 dependencies（排除 devDependencies 和 peerDependencies）
  const dependencies = packageJson.dependencies || {};
  for (const depName of Object.keys(dependencies)) {
    analyzeDependencies(depName, visited, result, packagePath);
  }

  return result;
}

/**
 * 分析多个包的依赖
 * @param {string[]} packageNames - 包名列表
 * @returns {Map<string, {version: string, path: string}>}
 */
export function analyzeMultiplePackages(packageNames) {
  const visited = new Set();
  const result = new Map();

  for (const packageName of packageNames) {
    analyzeDependencies(packageName, visited, result);
  }

  return result;
}

/**
 * 主函数（命令行调用）
 */
function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node analyze-dependencies.js <package-name> [<package-name> ...]');
    process.exit(1);
  }

  const dependencies = analyzeMultiplePackages(args);

  console.log(`\nFound ${dependencies.size} dependencies:\n`);
  for (const [name, info] of dependencies) {
    console.log(`  ${name}@${info.version}`);
    console.log(`    Path: ${info.path}`);
  }
}

// 如果直接运行脚本
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
