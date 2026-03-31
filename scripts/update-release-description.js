#!/usr/bin/env node

/**
 * 更新 GitHub Release 描述
 *
 * 用途：手动工具，用于在 Release 创建后更新其描述内容
 * 使用场景：当需要修改已发布的 Release 描述时使用
 *
 * 注意：此脚本未集成到自动化工作流中，仅供手动使用
 *
 * 使用方法:
 *   1. 先运行 generate-release-notes.js 生成 release-notes.md
 *   2. node scripts/update-release-description.js <version> <release-id>
 *
 * 环境变量要求：
 *   - GITHUB_TOKEN: GitHub Personal Access Token (需要 repo 权限)
 *   - GITHUB_REPOSITORY: 仓库名称 (格式: owner/repo)
 *
 * 示例:
 *   GITHUB_TOKEN=ghp_xxx GITHUB_REPOSITORY=owner/repo \
 *   node scripts/update-release-description.js 1.0.0 123456789
 */

const fs = require('fs');
const path = require('path');

// 获取命令行参数
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node scripts/update-release-description.js <version> <release-id>');
  process.exit(1);
}

const releaseId = args[1];

// 读取生成的发布说明
const releaseNotesPath = path.join(__dirname, '..', 'release-notes.md');
let releaseNotes;
try {
  releaseNotes = fs.readFileSync(releaseNotesPath, 'utf8');
} catch {
  console.error('Release notes file does not exist, please run the generation script first');
  process.exit(1);
}

// 使用 GitHub API 更新 Release 描述
async function updateReleaseDescription() {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    console.error('GITHUB_TOKEN environment variable is not set');
    process.exit(1);
  }

  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) {
    console.error('GITHUB_REPOSITORY environment variable is not set');
    process.exit(1);
  }

  const url = `https://api.github.com/repos/${repository}/releases/${releaseId}`;
  
  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'CraftEngine-VSC-Release-Bot'
      },
      body: JSON.stringify({
        body: releaseNotes
      })
    });

    if (response.ok) {
      console.log('✅ Release description updated successfully');
    } else {
      const error = await response.text();
      console.error('❌ Failed to update Release description:', error);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Network error:', error.message);
    process.exit(1);
  }
}

// 执行更新
updateReleaseDescription();
