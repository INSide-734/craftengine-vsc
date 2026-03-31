#!/usr/bin/env node

/**
 * 依赖缓存管理器
 * 跟踪依赖版本变化，避免不必要的复制操作
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

/**
 * 计算依赖版本哈希
 * @param {Map<string, {version: string, path: string}>} dependencies - 依赖映射
 * @returns {string} SHA-256 哈希值
 */
export function calculateDependencyHash(dependencies) {
  // 将依赖按名称排序，确保哈希一致性
  const versions = Array.from(dependencies.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, info]) => `${name}@${info.version}`)
    .join('\n');

  return createHash('sha256').update(versions).digest('hex');
}

/**
 * 读取缓存信息
 * @param {string} cacheDir - 缓存目录路径
 * @returns {{hash: string, timestamp: number} | null} 缓存信息或 null
 */
export function readCache(cacheDir) {
  const cacheFile = join(cacheDir, '.dependency-cache.json');

  if (!existsSync(cacheFile)) {
    return null;
  }

  try {
    const content = readFileSync(cacheFile, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    // 缓存文件损坏，返回 null
    return null;
  }
}

/**
 * 写入缓存信息
 * @param {string} cacheDir - 缓存目录路径
 * @param {string} hash - 依赖哈希值
 */
export function writeCache(cacheDir, hash) {
  // 确保缓存目录存在
  mkdirSync(cacheDir, { recursive: true });

  const cacheFile = join(cacheDir, '.dependency-cache.json');
  const cacheData = {
    hash,
    timestamp: Date.now(),
  };

  writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), 'utf-8');
}

/**
 * 检查是否需要复制依赖
 * @param {string} cacheDir - 缓存目录路径
 * @param {Map<string, {version: string, path: string}>} dependencies - 依赖映射
 * @returns {boolean} 是否需要复制
 */
export function shouldCopyDependencies(cacheDir, dependencies) {
  const cache = readCache(cacheDir);

  // 没有缓存，需要复制
  if (!cache) {
    return true;
  }

  // 计算当前依赖哈希
  const currentHash = calculateDependencyHash(dependencies);

  // 哈希不匹配，需要复制
  return cache.hash !== currentHash;
}

/**
 * 清除缓存
 * @param {string} cacheDir - 缓存目录路径
 */
export async function clearCache(cacheDir) {
  const cacheFile = join(cacheDir, '.dependency-cache.json');

  if (existsSync(cacheFile)) {
    try {
      // 删除缓存文件
      const fs = await import('fs/promises');
      await fs.unlink(cacheFile);
    } catch (error) {
      // 忽略删除错误
    }
  }
}
