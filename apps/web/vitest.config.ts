import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// The app's own config comes first, so the tests resolve the same aliases (@css, @components,
// @images) and SVG imports as the build does
export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            environment: 'jsdom', // Simulates a browser in Node
            globals: true, // Allows using 'describe' and 'it' without importing them
            setupFiles: './src/test/setup.ts', // Runs before every test
            // Unit tests live next to the source; tests/ holds the Playwright suites
            include: ['src/**/*.{test,spec}.{ts,tsx}'],
            passWithNoTests: true,
        },
    })
);
