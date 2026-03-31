import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // 测试环境
        globals: true,
        environment: 'node',

        // 测试文件配置
        include: [
            'src/test/unit/**/*.test.ts',
            'src/test/integration/**/*.test.ts',
        ],

        // 排除 E2E 测试（由 @vscode/test-electron 执行）
        exclude: [
            'src/test/e2e/**',
            'src/test/benchmark/**',
            'node_modules/**',
            'out/**',
        ],

        // 全局测试初始化（配置驱动的常量模块）
        setupFiles: ['./src/test/setup.ts'],

        // VSCode API Mock 别名
        alias: {
            'vscode': './src/test/__mocks__/vscode.ts',
        },

        // 覆盖率配置
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: [
                'src/test/**',
                'src/**/*.d.ts',
                'src/extension-complete.ts',
                'src/core/interfaces/**',
                'src/core/types/ConfigTypes.ts',
                'src/core/types/DomainEvents.ts',
                'src/core/types/MinecraftModelTypes.ts',
                'src/core/types/MinecraftDataTypes.ts',
                'src/core/types/JsonSchemaTypes.ts',
                'src/domain/services/model/ItemModelTypes.ts',
                'src/infrastructure/renderer/types/**',
            ],
            reporter: ['text', 'html', 'lcov', 'json-summary'],
            reportsDirectory: './coverage',
        },

        // 超时配置
        testTimeout: 10000,
        hookTimeout: 10000,

        // 日志
        reporters: ['verbose'],

        // 隔离模式
        isolate: true,

        // Benchmark 配置
        benchmark: {
            include: ['src/test/benchmark/**/*.bench.ts'],
            exclude: ['node_modules/**', 'out/**'],
            reporters: ['default'],
        },
    },
});

