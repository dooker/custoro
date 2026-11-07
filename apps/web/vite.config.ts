import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import svgr from 'vite-plugin-svgr';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolveBuild, resolveBuiltAt } from './src/utils/buildInfo.ts';

// The checkout's commit, "-dirty" when tracked files have uncommitted changes. A Docker build has
// no .git and gets the commit as APP_BUILD instead (scripts/docker-build.sh).
const gitBuild = () => {
    const git = (command: string) =>
        execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
    const commit = git('git rev-parse --short HEAD');

    return git('git status --porcelain --untracked-files=no') ? `${commit}-dirty` : commit;
};

export default defineConfig({
    // Shown in the navigation and sent with error reports; one version for the whole monorepo,
    // and the commit and time of this build
    define: {
        __APP_VERSION__: JSON.stringify(
            JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
        ),
        __APP_BUILD__: JSON.stringify(resolveBuild(process.env.APP_BUILD, gitBuild)),
        __APP_BUILT_AT__: JSON.stringify(resolveBuiltAt(process.env.APP_BUILT_AT)),
    },
    plugins: [react(), svgr(), tailwindcss()],
    server: {
        port: 3000,
        proxy: {
            '/api': {
                target: 'http://localhost:3999',
                changeOrigin: true,
                secure: false,
            },
        },
    },
    resolve: {
        alias: {
            '@assets': path.resolve(import.meta.dirname, 'src/assets'),
            '@images': path.resolve(import.meta.dirname, 'src/assets/images'),
            '@css': path.resolve(import.meta.dirname, 'src/assets/stylesheets'),
            '@components': path.resolve(import.meta.dirname, 'src/components'),
            src: path.resolve(import.meta.dirname, 'src'),
        },
    },
});
