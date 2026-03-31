import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

/**
 * 构建脚本集成测试
 * 测试 scripts/ 目录下的构建脚本在不同场景下的行为
 */

// Vitest 提供 __dirname 全局变量
const rootDir = resolve(__dirname, '..', '..', '..', '..');
const scriptsDir = join(rootDir, 'scripts');
const testOutputDir = join(rootDir, 'test-output');

describe('Build Scripts Integration Tests', () => {
    beforeEach(() => {
        // 创建测试输出目录
        if (!existsSync(testOutputDir)) {
            mkdirSync(testOutputDir, { recursive: true });
        }
    });

    afterEach(() => {
        // 清理测试输出目录
        if (existsSync(testOutputDir)) {
            rmSync(testOutputDir, { recursive: true, force: true });
        }
    });

    describe('verify-build.js', () => {
        it('should fail when out directory does not exist', () => {
            // 确保 out 目录不存在
            const outDir = join(rootDir, 'out');
            const outDirExists = existsSync(outDir);

            if (outDirExists) {
                // 如果 out 目录存在，跳过此测试
                console.log('Skipping test: out directory exists');
                return;
            }

            expect(() => {
                execSync('node scripts/verify-build.js', {
                    cwd: rootDir,
                    stdio: 'pipe',
                });
            }).toThrow();
        });

        it('should fail when out directory exists but dependencies are missing', () => {
            // 创建空的 out 目录
            const outDir = join(testOutputDir, 'out');
            mkdirSync(outDir, { recursive: true });

            // 创建临时的 verify-build.js 副本，修改 outDir 路径
            const verifyBuildScript = readFileSync(join(scriptsDir, 'verify-build.js'), 'utf-8');
            const modifiedScript = verifyBuildScript.replace(
                "const outDir = join(rootDir, 'out');",
                `const outDir = '${outDir.replace(/\\/g, '\\\\')}';`,
            );
            const tempScriptPath = join(testOutputDir, 'verify-build-test.js');
            writeFileSync(tempScriptPath, modifiedScript);

            expect(() => {
                execSync(`node "${tempScriptPath}"`, {
                    cwd: rootDir,
                    stdio: 'pipe',
                });
            }).toThrow();
        });
    });

    describe('release-notes-wrapper.js', () => {
        it('should read package.json version number', () => {
            const output = execSync('node scripts/release-notes-wrapper.js', {
                cwd: rootDir,
                stdio: 'pipe',
                encoding: 'utf-8',
            }).toString();

            // 检查输出是否包含版本号
            expect(output).toContain('Generating release notes for version');
        });

        it('should fail when CHANGELOG.md does not exist', () => {
            // 临时重命名 CHANGELOG.md
            const changelogPath = join(rootDir, 'CHANGELOG.md');
            const changelogBackupPath = join(rootDir, 'CHANGELOG.md.backup');
            const changelogExists = existsSync(changelogPath);

            if (changelogExists) {
                execSync(`mv "${changelogPath}" "${changelogBackupPath}"`, {
                    cwd: rootDir,
                    shell: 'bash',
                });
            }

            try {
                expect(() => {
                    execSync('node scripts/release-notes-wrapper.js', {
                        cwd: rootDir,
                        stdio: 'pipe',
                    });
                }).toThrow();
            } finally {
                // 恢复 CHANGELOG.md
                if (changelogExists) {
                    execSync(`mv "${changelogBackupPath}" "${changelogPath}"`, {
                        cwd: rootDir,
                        shell: 'bash',
                    });
                }
            }
        });
    });

    describe('generate-release-notes.js', () => {
        it('should show usage instructions when arguments are missing', () => {
            expect(() => {
                execSync('node scripts/generate-release-notes.js', {
                    cwd: rootDir,
                    stdio: 'pipe',
                });
            }).toThrow();
        });

        it('should generate release notes', () => {
            // 创建临时 CHANGELOG.md
            const tempChangelog = join(testOutputDir, 'CHANGELOG.md');
            writeFileSync(
                tempChangelog,
                `# Changelog

## [1.0.0] - 2024-01-01

### Added
- New feature A
- New feature B

### Fixed
- Bug fix C
`,
            );

            const output = execSync(`node scripts/generate-release-notes.js 1.0.0 "${tempChangelog}"`, {
                cwd: rootDir,
                stdio: 'pipe',
                encoding: 'utf-8',
            }).toString();

            // 检查输出是否包含版本号和更新内容
            expect(output).toContain('1.0.0');
            expect(output).toContain('New feature A');
        });
    });

    describe('analyze-dependencies.js', () => {
        it('should analyze package dependencies', async () => {
            // 动态导入 analyze-dependencies.js
            const { analyzeMultiplePackages } = await import(join(scriptsDir, 'analyze-dependencies.js'));

            // 分析一个简单的包（如 semver）
            const dependencies = await analyzeMultiplePackages(['semver']);

            // 验证返回的依赖映射
            expect(dependencies).toBeDefined();
            expect(dependencies.size).toBeGreaterThan(0);
            expect(dependencies.has('semver')).toBe(true);
        });
    });

    describe('copy-dependencies.js', () => {
        it('should show usage instructions when arguments are missing', () => {
            expect(() => {
                execSync('node scripts/copy-dependencies.js', {
                    cwd: rootDir,
                    stdio: 'pipe',
                });
            }).toThrow();
        });

        it('should copy dependencies to specified directory', () => {
            const outputDir = join(testOutputDir, 'node_modules');

            execSync(`node scripts/copy-dependencies.js semver --output "${outputDir}"`, {
                cwd: rootDir,
                stdio: 'inherit',
            });

            // 验证 semver 包已复制
            const semverPath = join(outputDir, 'semver');
            expect(existsSync(semverPath)).toBe(true);
            expect(existsSync(join(semverPath, 'package.json'))).toBe(true);
        });
    });
});
