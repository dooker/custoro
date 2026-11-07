#!/usr/bin/env node
// Custoro's one version: check it, suggest the next one, prepare a release, print release notes.
// Plain Node, no dependencies (runs on the host's Node 22 too). The rules are in version-lib.mjs.
//
//   node scripts/version.mjs check [--tag v5.0.0]   every package file has the same version (CI)
//   node scripts/version.mjs suggest                major, minor or patch, from CHANGELOG Unreleased
//   node scripts/version.mjs prepare <major|minor|patch|x.y.z> [--date 2026-11-07]
//                                                   sets the version everywhere and dates the
//                                                   changelog section; commit it as a release PR
//   node scripts/version.mjs notes [x.y.z]          the changelog entries of a release
//
// npm scripts: version:check, version:suggest, release:prepare, release:notes. After the release PR
// is merged, .github/workflows/release.yml tags it, publishes the GitHub release and the images.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    commonVersion,
    nextVersion,
    releaseChangelog,
    releaseNotes,
    suggestBump,
    withVersion,
} from './version-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageFiles = [
    'package.json',
    'package-lock.json',
    'apps/api/package.json',
    'apps/api/package-lock.json',
    'apps/web/package.json',
    'apps/web/package-lock.json',
];
const read = (path) => readFileSync(join(root, path), 'utf8');
const readPackages = () => Object.fromEntries(packageFiles.map((path) => [path, read(path)]));
const option = (args, name) => {
    const index = args.indexOf(name);

    return index === -1 ? undefined : args[index + 1];
};

const commands = {
    check: (args) => {
        const version = commonVersion(readPackages());
        const tag = option(args, '--tag');

        if (tag !== undefined && tag !== `v${version}`) {
            throw new Error(`The tag ${tag} does not match the version ${version} (v${version})`);
        }

        console.log(version);
    },

    suggest: () => {
        const current = commonVersion(readPackages());
        const { bump, reasons } = suggestBump(read('CHANGELOG.md'));

        console.log(
            bump === 'none'
                ? `Nothing to release (${current}): ${reasons[0]}`
                : `${bump}: ${current} -> ${nextVersion(current, bump)}`
        );

        if (bump !== 'none') reasons.forEach((reason) => console.log(`  - ${reason.replace(/^- /, '')}`));
    },

    prepare: (args) => {
        const bump = args[0];

        if (!bump) throw new Error('Say which: prepare <major|minor|patch|x.y.z>');

        const files = readPackages();
        const current = commonVersion(files);
        const version = nextVersion(current, bump);
        const date = option(args, '--date') ?? new Date().toISOString().slice(0, 10);
        const changelog = releaseChangelog(read('CHANGELOG.md'), version, date);

        // Every check is done before the first file is written
        const updated = Object.entries(files).map(([path, text]) => [
            path,
            withVersion(path, text, version),
        ]);

        updated.forEach(([path, text]) => writeFileSync(join(root, path), text));
        writeFileSync(join(root, 'CHANGELOG.md'), changelog);

        console.log(`${current} -> ${version} (${date}): ${packageFiles.length} package files and CHANGELOG.md`);
        console.log(`Next: commit "Release ${version}" on a branch (chore/release-${version}), open the PR,`);
        console.log('merge it, and the Release workflow tags it and publishes the release and the images.');
    },

    notes: (args) => {
        process.stdout.write(releaseNotes(read('CHANGELOG.md'), args[0] ?? commonVersion(readPackages())));
    },
};

const [command, ...args] = process.argv.slice(2);

if (!commands[command]) {
    console.error('Usage: node scripts/version.mjs <check [--tag vX.Y.Z] | suggest | prepare <bump> | notes [x.y.z]>');
    process.exit(2);
}

try {
    commands[command](args);
} catch (error) {
    console.error(`version: ${error.message}`);
    process.exit(1);
}
