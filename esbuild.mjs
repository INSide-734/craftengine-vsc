import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** 复制静态资源到 out/assets/ */
function copyAssets() {
  cpSync(
    resolve(__dirname, 'src/infrastructure/renderer/assets'),
    resolve(__dirname, 'out/assets'),
    { recursive: true }
  );
}

/** esbuild 问题匹配插件（用于 VS Code 终端问题匹配） */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      }
      copyAssets();
      console.log('[watch] build finished');
    });
  },
};

/** 主入口构建配置 */
const mainConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  platform: 'node',
  outfile: 'out/extension.js',
  external: [
    'vscode',  // VS Code API，运行时由宿主提供
    'sharp',   // 原生模块，不可打包
  ],
  logLevel: 'silent',
  plugins: [esbuildProblemMatcherPlugin],
};

/** Worker 入口构建配置（独立打包） */
const workerConfig = {
  entryPoints: ['src/infrastructure/renderer/worker/renderWorker.ts'],
  bundle: true,
  format: 'cjs',
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  platform: 'node',
  outfile: 'out/renderWorker.js',
  external: [
    'vscode',
    'sharp',
  ],
  logLevel: 'silent',
};

async function main() {
  mkdirSync('out', { recursive: true });
  copyAssets();

  if (watch) {
    const [mainCtx, workerCtx] = await Promise.all([
      esbuild.context({ ...mainConfig, plugins: [esbuildProblemMatcherPlugin] }),
      esbuild.context(workerConfig),
    ]);
    await Promise.all([mainCtx.watch(), workerCtx.watch()]);
  } else {
    await Promise.all([
      esbuild.build(mainConfig),
      esbuild.build(workerConfig),
    ]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
