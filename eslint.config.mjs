import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default [
    {
        ignores: ["out/**", "dist/**", "node_modules/**", ".vscode-test/**"],
    },
    {
        files: ["src/**/*.ts"],

        plugins: {
            "@typescript-eslint": typescriptEslint,
        },

        languageOptions: {
            parser: tsParser,
            ecmaVersion: 2022,
            sourceType: "module",
            parserOptions: {
                project: join(__dirname, 'tsconfig.json'),
                tsconfigRootDir: __dirname,
            },
        },

        rules: {
            // ---- 命名规范 ----
            "@typescript-eslint/naming-convention": ["warn", {
                selector: "import",
                format: ["camelCase", "PascalCase"],
            }, {
                selector: "interface",
                format: ["PascalCase"],
                prefix: ["I"],
            }],

            // ---- 类型安全 ----
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-non-null-assertion": "warn",
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/no-misused-promises": "error",
            "@typescript-eslint/await-thenable": "warn",
            "@typescript-eslint/consistent-type-imports": ["warn", {
                prefer: "type-imports",
                fixStyle: "inline-type-imports",
            }],
            "@typescript-eslint/no-unused-vars": ["warn", {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
            }],

            // ---- 代码质量 ----
            curly: "warn",
            eqeqeq: "warn",
            "no-throw-literal": "warn",
            semi: "warn",
            "prefer-const": "warn",
            "no-var": "warn",
            "no-console": "warn",
            "no-eval": "error",
            "no-duplicate-imports": "warn",
            "no-return-await": "off",
            "@typescript-eslint/return-await": ["warn", "in-try-catch"],
        },
    },
    {
        files: ["src/test/**/*.ts"],

        rules: {
            // 测试文件放宽部分规则
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/no-floating-promises": "off",
            "no-console": "off",
        },
    },
    // 关闭与 Prettier 冲突的格式化规则
    prettierConfig,
];
