#!/usr/bin/env node

/**
 * 平台工具模块
 * 提供平台检测、配置和命名功能
 */

import { platform, arch } from 'os';

/**
 * 支持的平台配置
 */
export const SUPPORTED_PLATFORMS = [
  {
    id: 'win32-x64',
    os: 'win32',
    arch: 'x64',
    displayName: 'Windows x64',
    sharpPackage: '@img/sharp-win32-x64',
  },
  {
    id: 'win32-ia32',
    os: 'win32',
    arch: 'ia32',
    displayName: 'Windows ia32',
    sharpPackage: '@img/sharp-win32-ia32',
  },
  {
    id: 'darwin-x64',
    os: 'darwin',
    arch: 'x64',
    displayName: 'macOS x64',
    sharpPackage: '@img/sharp-darwin-x64',
  },
  {
    id: 'darwin-arm64',
    os: 'darwin',
    arch: 'arm64',
    displayName: 'macOS arm64 (Apple Silicon)',
    sharpPackage: '@img/sharp-darwin-arm64',
  },
  {
    id: 'linux-x64',
    os: 'linux',
    arch: 'x64',
    displayName: 'Linux x64',
    sharpPackage: '@img/sharp-linux-x64',
  },
  {
    id: 'linux-arm64',
    os: 'linux',
    arch: 'arm64',
    displayName: 'Linux arm64',
    sharpPackage: '@img/sharp-linux-arm64',
  },
];

/**
 * 获取当前平台信息
 * @returns {{id: string, os: string, arch: string, displayName: string, sharpPackage: string} | null}
 */
export function getCurrentPlatform() {
  const currentOs = platform();
  const currentArch = arch();

  return SUPPORTED_PLATFORMS.find(
    (p) => p.os === currentOs && p.arch === currentArch
  ) || null;
}

/**
 * 根据平台 ID 获取平台信息
 * @param {string} platformId - 平台 ID (如 'win32-x64')
 * @returns {{id: string, os: string, arch: string, displayName: string, sharpPackage: string} | null}
 */
export function getPlatformById(platformId) {
  return SUPPORTED_PLATFORMS.find((p) => p.id === platformId) || null;
}

/**
 * 生成平台特定的 VSIX 文件名
 * @param {string} packageName - 包名
 * @param {string} version - 版本号
 * @param {string} platformId - 平台 ID
 * @returns {string} VSIX 文件名
 */
export function getVsixFileName(packageName, version, platformId) {
  return `${packageName}-${platformId}-${version}.vsix`;
}

/**
 * 验证平台 ID 是否有效
 * @param {string} platformId - 平台 ID
 * @returns {boolean}
 */
export function isValidPlatform(platformId) {
  return SUPPORTED_PLATFORMS.some((p) => p.id === platformId);
}

/**
 * 获取所有平台 ID 列表
 * @returns {string[]}
 */
export function getAllPlatformIds() {
  return SUPPORTED_PLATFORMS.map((p) => p.id);
}
