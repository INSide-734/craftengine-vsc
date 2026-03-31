#!/usr/bin/env node

/**
 * Release Notes 生成包装脚本
 * 自动从 package.json 读取版本号并调用 generate-release-notes.js
 *
 * 使用方法:
 *   pnpm run release:notes
 *   或
 *   node scripts/release-notes-wrapper.js [changelog-file]
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// 读取 package.json 获取版本号
const packageJsonPath = join(rootDir, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version;

// 获取 CHANGELOG 文件路径（默认为 CHANGELOG.md）
const changelogFile = process.argv[2] || 'CHANGELOG.md';

console.log(`Generating release notes for version ${version}...`);

try {
  // 调用 generate-release-notes.js
  execSync(`node scripts/generate-release-notes.js ${version} ${changelogFile}`, {
    cwd: rootDir,
    stdio: 'inherit',
  });
} catch (error) {
  console.error('Failed to generate release notes:', error.message);
  process.exit(1);
}
