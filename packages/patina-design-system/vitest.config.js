"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
const plugin_react_1 = __importDefault(require("@vitejs/plugin-react"));
const path_1 = __importDefault(require("path"));
exports.default = (0, config_1.defineConfig)({
    plugins: [(0, plugin_react_1.default)()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./vitest.setup.ts'],
        // Prevent resource exhaustion with 60+ test files
        // Use limited parallelism instead of sequential to balance speed and memory
        pool: 'forks',
        poolOptions: {
            forks: {
                // Limit concurrent workers to prevent OOM (default would use all CPUs)
                maxForks: 2,
                minForks: 1,
            },
        },
        // Increase test timeout for complex component tests
        testTimeout: 10000,
        // Set a hookTimeout to prevent hanging tests
        hookTimeout: 10000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'dist/',
                '**/*.stories.tsx',
                '**/*.test.tsx',
                '**/*.spec.tsx',
                'vitest.setup.ts',
                'vitest.config.ts',
                'tailwind.config.ts',
                'postcss.config.mjs',
                'tsup.config.ts',
            ],
        },
    },
    resolve: {
        alias: {
            '@': path_1.default.resolve(__dirname, './src'),
        },
    },
});
//# sourceMappingURL=vitest.config.js.map