import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom', // Simulates a browser in Node
        globals: true,        // Allows using 'describe' and 'it' without importing them
        setupFiles: './src/test/setup.ts', // Runs before every test
        // Unit tests live next to the source; tests/ holds the Playwright suites
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
        passWithNoTests: true,
    },
});
