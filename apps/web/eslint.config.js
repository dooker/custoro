import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import eslintReact from '@eslint-react/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import globals from 'globals';

export default defineConfig([
    globalIgnores(['dist/**', 'build/**', 'playwright-report/**', 'test-results/**']),
    {
        files: ['**/*.{ts,tsx}'],
        extends: [
            js.configs.recommended,
            tseslint.configs.recommended,
            // eslint-plugin-react does not run on ESLint 10 yet; @eslint-react is its maintained replacement
            eslintReact.configs['recommended-typescript'],
            reactHooks.configs.flat.recommended,
            // the hooks rules come from eslint-plugin-react-hooks; silence @eslint-react's copies
            eslintReact.configs['disable-conflict-eslint-plugin-react-hooks'],
        ],
        languageOptions: {
            globals: { ...globals.browser },
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
        },
    },
    eslintConfigPrettier,
]);
