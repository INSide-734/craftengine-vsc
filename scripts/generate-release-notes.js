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
  let inTargetVersion = false;
  let parsedChangelogContent = "";
  let majorFeatures = [];
  let newFeatures = [];
  let improvements = [];
  let bugFixes = [];
  let currentSection = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 检测版本标题
    const versionMatch = line.match(/^## \[([^\]]+)\]/);
    if (versionMatch) {
      if (inTargetVersion) break; // 遇到下一个版本，停止
      inTargetVersion = versionMatch[1] === targetVersion;
      if (inTargetVersion) {
        parsedChangelogContent += line + "\n";
      }
      continue;
    }

    if (!inTargetVersion) continue;

    parsedChangelogContent += line + "\n";

    // 检测章节
    if (line.startsWith("### Added")) {
      currentSection = "added";
    } else if (line.startsWith("### Changed")) {
      currentSection = "changed";
    } else if (line.startsWith("### Fixed")) {
      currentSection = "fixed";
    } else if (line.startsWith("### ") && !line.startsWith("#### ")) {
      currentSection = null;
    }

    // 提取内容
    if (currentSection === "added") {
      if (line.startsWith("####")) {
        majorFeatures.push(line.replace(/^####\s*/, "").trim());
      } else if (line.trim().startsWith("-")) {
        newFeatures.push(line.trim().substring(1).trim());
      }
    } else if (currentSection === "changed" && line.trim().startsWith("-")) {
      improvements.push(line.trim().substring(1).trim());
    } else if (currentSection === "fixed" && line.trim().startsWith("-")) {
      bugFixes.push(line.trim().substring(1).trim());
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

  // 使用函数替换避免特殊字符问题
  const replacements = {
    '{VERSION}': version,
    '{RELEASE_DATE}': releaseDate,
    '{MAJOR_FEATURES}': majorFeaturesText,
    '{NEW_FEATURES}': newFeaturesText,
    '{IMPROVEMENTS}': improvementsText,
    '{BUG_FIXES}': bugFixesText,
    '{CHANGELOG_CONTENT}': parsed.changelogContent,
    '{RELEASE_URL}': `https://github.com/${
      process.env.GITHUB_REPOSITORY || "INSide-734/craftengine-vsc"
    }/releases/tag/v${version}`,
    '{DOWNLOAD_URL}': `https://github.com/${
      process.env.GITHUB_REPOSITORY || "INSide-734/craftengine-vsc"
    }/releases/download/v${version}/craftengine-vsc-${version}.vsix`,
    '{REPO_URL}': `https://github.com/${
      process.env.GITHUB_REPOSITORY || "INSide-734/craftengine-vsc"
    }`,
    '{ISSUES_URL}': `https://github.com/${
      process.env.GITHUB_REPOSITORY || "INSide-734/craftengine-vsc"
    }/issues`,
    '{DOCS_URL}': `https://github.com/${
      process.env.GITHUB_REPOSITORY || "INSide-734/craftengine-vsc"
    }#readme`,
  };

  let releaseNotes = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    releaseNotes = releaseNotes.split(placeholder).join(value);
  }

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
