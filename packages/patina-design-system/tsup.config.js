"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tsup_1 = require("tsup");
exports.default = (0, tsup_1.defineConfig)({
    entry: {
        index: 'src/index.ts',
        'tokens/index': 'src/tokens/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: {
        resolve: true,
    },
    sourcemap: true,
    clean: true,
    external: ['react', 'react-dom'],
    treeshake: true,
    splitting: false,
    minify: false,
    // Note: tsup/rollup warns about module-level directives during bundling
    // This is expected behavior - the directive IS included in output
    // The warning can be safely ignored as Next.js processes it correctly
    esbuildOptions(options) {
        options.banner = {
            js: '"use client";',
        };
    },
});
//# sourceMappingURL=tsup.config.js.map