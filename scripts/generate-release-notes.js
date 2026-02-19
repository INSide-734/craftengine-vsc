#!/usr/bin/env node

/**
 * 自动生成美化的 GitHub Release 发布说明
 * 使用方法: node scripts/generate-release-notes.js <version> <changelog-file>
 */

const fs = require("fs");
const path = require("path");

// 获取命令行参数
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error(
    "Usage: node scripts/generate-release-notes.js <version> <changelog-file>"
  );
  process.exit(1);
}

const version = args[0];
const changelogFile = args[1];

// 读取模板文件
const templatePath = path.join(__dirname, "release-template.md");
const template = fs.readFileSync(templatePath, "utf8");

// 读取 CHANGELOG 文件
const changelog = fs.readFileSync(changelogFile, "utf8");

// 解析 CHANGELOG 内容
function parseChangelog(changelogContent, targetVersion) {
  const lines = changelogContent.split("\n");
  let currentVersion = null;
  let inTargetVersion = false;
  let parsedChangelogContent = "";
  let majorFeatures = [];
  let newFeatures = [];
  let improvements = [];
  let bugFixes = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 检测版本标题
    const versionMatch = line.match(/^## \[([^\]]+)\]/);
    if (versionMatch) {
      currentVersion = versionMatch[1];
      inTargetVersion = currentVersion === targetVersion;
      if (inTargetVersion) {
        parsedChangelogContent += line + "\n";
      }
      continue;
    }

    // 如果不在目标版本中，跳过
    if (!inTargetVersion) {
      continue;
    }

    // 如果遇到下一个版本，停止解析
    if (line.startsWith("## [") && currentVersion !== targetVersion) {
      break;
    }

    parsedChangelogContent += line + "\n";

    // 解析不同类型的更改
    if (line.startsWith("### Added")) {
      // 解析 Added 部分
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith("###")) {
        const featureLine = lines[j].trim();
        if (featureLine.startsWith("-")) {
          const feature = featureLine.substring(1).trim();
          if (feature.includes("**")) {
            // 提取主要功能（包含 ** 标记的）
            const majorFeature = feature.replace(/\*\*(.*?)\*\*/g, "$1");
            majorFeatures.push(majorFeature);
          }
          newFeatures.push(feature);
        }
        j++;
      }
    } else if (line.startsWith("### Changed")) {
      // 解析 Changed 部分
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith("###")) {
        const improvementLine = lines[j].trim();
        if (improvementLine.startsWith("-")) {
          improvements.push(improvementLine.substring(1).trim());
        }
        j++;
      }
    } else if (line.startsWith("### Fixed")) {
      // 解析 Fixed 部分
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith("###")) {
        const fixLine = lines[j].trim();
        if (fixLine.startsWith("-")) {
          bugFixes.push(fixLine.substring(1).trim());
        }
        j++;
      }
    }
  }

  return {
    changelogContent: parsedChangelogContent.trim(),
    majorFeatures,
    newFeatures,
    improvements,
    bugFixes,
  };
}

// 生成发布说明
function generateReleaseNotes(version, changelogContent) {
  const parsed = parseChangelog(changelogContent, version);

  // 获取当前日期
  const releaseDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // 生成主要功能亮点
  const majorFeaturesText =
    parsed.majorFeatures.length > 0
      ? parsed.majorFeatures.map((feature) => `- ${feature}`).join("\n")
      : "- Performance optimizations and stability improvements";

  // 生成新功能列表
  const newFeaturesText =
    parsed.newFeatures.length > 0
      ? parsed.newFeatures.map((feature) => `- ${feature}`).join("\n")
      : "- No new features";

  // 生成改进列表
  const improvementsText =
    parsed.improvements.length > 0
      ? parsed.improvements.map((improvement) => `- ${improvement}`).join("\n")
      : "- No major improvements";

  // 生成修复列表
  const bugFixesText =
    parsed.bugFixes.length > 0
      ? parsed.bugFixes.map((fix) => `- ${fix}`).join("\n")
      : "- No bug fixes";

  // 替换模板中的占位符
  let releaseNotes = template
    .replace(/{VERSION}/g, version)
    .replace(/{RELEASE_DATE}/g, releaseDate)
    .replace(/{MAJOR_FEATURES}/g, majorFeaturesText)
    .replace(/{NEW_FEATURES}/g, newFeaturesText)
    .replace(/{IMPROVEMENTS}/g, improvementsText)
    .replace(/{BUG_FIXES}/g, bugFixesText)
    .replace(/{CHANGELOG_CONTENT}/g, parsed.changelogContent)
    .replace(
      /{RELEASE_URL}/g,
      `https://github.com/${
        process.env.GITHUB_REPOSITORY || "INSide-734/craftengine-vsc"
      }/releases/tag/v${version}`
    )
    .replace(
      /{DOWNLOAD_URL}/g,
      `https://github.com/${
        process.env.GITHUB_REPOSITORY || "INSide-734/craftengine-vsc"
      }/releases/download/v${version}/craftengine-vsc-${version}.vsix`
    )
    .replace(
      /{REPO_URL}/g,
      `https://github.com/${
        process.env.GITHUB_REPOSITORY || "INSide-734/craftengine-vsc"
      }`
    )
    .replace(
      /{ISSUES_URL}/g,
      `https://github.com/${
        process.env.GITHUB_REPOSITORY || "INSide-734/craftengine-vsc"
      }/issues`
    )
    .replace(
      /{DOCS_URL}/g,
      `https://github.com/${
        process.env.GITHUB_REPOSITORY || "INSide-734/craftengine-vsc"
      }#readme`
    );

  return releaseNotes;
}

// 生成发布说明
const releaseNotes = generateReleaseNotes(version, changelog);

// 输出到控制台
console.log(releaseNotes);

// 如果提供了输出文件参数，则写入文件
if (args[2]) {
  const outputFile = args[2];
  fs.writeFileSync(outputFile, releaseNotes, "utf8");
  console.error(`Release notes written to: ${outputFile}`);
}
