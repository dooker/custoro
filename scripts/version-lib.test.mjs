// node --test "scripts/*.test.mjs"   (npm run test:scripts; CI runs it in the version job)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    commonVersion,
    compareVersions,
    nextVersion,
    parseVersion,
    releaseChangelog,
    releaseNotes,
    suggestBump,
    withVersion,
} from './version-lib.mjs';

const pkg = (version) => `{\n    "name": "custoro",\n    "version": "${version}",\n    "private": true\n}\n`;
const lock = (version, dependency = '1.0.0') =>
    `{\n    "name": "custoro",\n    "version": "${version}",\n    "lockfileVersion": 3,\n    "packages": {\n        "": {\n            "name": "custoro",\n            "version": "${version}"\n        },\n        "node_modules/x": {\n            "version": "${dependency}"\n        }\n    }\n}\n`;

const changelog = (unreleased) =>
    `# Changelog\n\nIntro.\n\n## Unreleased\n${unreleased}\n## 4.0.0 - 2026-10-02\n\n### Changed\n\n- The first release\n\n## Pre-monorepo history\n\nOld.\n`;

test('parseVersion takes x.y.z and its pre-releases', () => {
    assert.deepEqual(parseVersion('4.0.12'), { major: 4, minor: 0, patch: 12, pre: null });
    assert.deepEqual(parseVersion('5.0.0-rc.1'), { major: 5, minor: 0, patch: 0, pre: 'rc.1' });
    for (const text of ['4.0', 'v4.0.0', '4.0.0-', '4.0.0+build', '', undefined]) {
        assert.equal(parseVersion(text), null, String(text));
    }
});

test('versions are ordered as semantic versions', () => {
    const ordered = ['4.0.0', '5.0.0-beta.1', '5.0.0-rc.1', '5.0.0-rc.2', '5.0.0-rc.10', '5.0.0', '5.0.1'];

    for (let index = 1; index < ordered.length; index++) {
        assert.ok(compareVersions(ordered[index - 1], ordered[index]) < 0, ordered[index]);
    }
});

test('nextVersion bumps one part and resets the ones after it', () => {
    assert.equal(nextVersion('4.2.3', 'major'), '5.0.0');
    assert.equal(nextVersion('4.2.3', 'minor'), '4.3.0');
    assert.equal(nextVersion('4.2.3', 'patch'), '4.2.4');
    assert.equal(nextVersion('4.2.3', '4.10.0'), '4.10.0');
});

test('nextVersion starts, counts and ends a pre-release', () => {
    assert.equal(nextVersion('4.0.0', 'premajor'), '5.0.0-rc.1');
    assert.equal(nextVersion('4.0.0', 'preminor'), '4.1.0-rc.1');
    assert.equal(nextVersion('4.0.0', 'prepatch'), '4.0.1-rc.1');
    assert.equal(nextVersion('4.0.0', 'premajor', 'beta'), '5.0.0-beta.1');
    assert.equal(nextVersion('5.0.0-rc.1', 'prerelease'), '5.0.0-rc.2');
    assert.equal(nextVersion('5.0.0-rc.9', 'prerelease'), '5.0.0-rc.10');
    assert.equal(nextVersion('5.0.0-beta.3', 'prerelease'), '5.0.0-rc.1');
    // Going live: the release the pre-release leads to
    assert.equal(nextVersion('5.0.0-rc.2', 'release'), '5.0.0');
    assert.equal(nextVersion('5.0.0-rc.2', 'major'), '5.0.0');
    assert.equal(nextVersion('5.0.0-rc.2', '5.0.0'), '5.0.0');
});

test('nextVersion refuses a version that is not above the current one, or nonsense', () => {
    for (const bump of ['4.2.3', '4.2.2', '3.9.9', '4.2.3-rc.1', 'huge', '5.0']) {
        assert.throws(() => nextVersion('4.2.3', bump), undefined, bump);
    }
    assert.throws(() => nextVersion('5.0.0-rc.2', '5.0.0-rc.1'), /not above/);
    assert.throws(() => nextVersion('4.0.0', 'release'), /not a pre-release/);
    assert.throws(() => nextVersion('4.0.0', 'prerelease'), /not a pre-release/);
});

test('commonVersion finds the one version of every package file', () => {
    const files = { 'package.json': pkg('4.0.0'), 'apps/api/package-lock.json': lock('4.0.0', '9.9.9') };

    assert.equal(commonVersion(files), '4.0.0');
});

test('commonVersion lists every file when they differ', () => {
    const files = { 'package.json': pkg('0.0.0'), 'apps/api/package-lock.json': lock('4.0.0') };

    assert.throws(() => commonVersion(files), /package\.json version: 0\.0\.0[\s\S]*packages\[""\]\.version: 4\.0\.0/);
});

test('withVersion changes only the version lines, also when a dependency has the same version', () => {
    assert.equal(withVersion('package.json', pkg('4.0.0'), '5.0.0'), pkg('5.0.0'));
    assert.equal(
        withVersion('apps/web/package-lock.json', lock('4.0.0', '4.0.0'), '5.0.0'),
        lock('5.0.0', '4.0.0')
    );
});

test('suggestBump: major when an install must change its configuration', () => {
    const { bump, reasons } = suggestBump(
        changelog('\n### Security\n\n- **Existing production setups must add `TRUST_PROXY` to `.env`**\n\n### Fixed\n\n- A fix\n')
    );

    assert.equal(bump, 'major');
    assert.match(reasons[0], /TRUST_PROXY/);
    assert.equal(suggestBump(changelog('\n### Changed\n\n- **Breaking:** the API moved\n')).bump, 'major');
});

test('suggestBump: minor for anything added or changed, or a migration', () => {
    assert.equal(suggestBump(changelog('\n### Added\n\n- A new page\n')).bump, 'minor');
    assert.equal(suggestBump(changelog('\n### Changed\n\n- The list shows 20 rows\n')).bump, 'minor');
    assert.equal(
        suggestBump(changelog('\n### Fixed\n\n- Paid invoices. **Existing databases must run the new migration**\n')).bump,
        'minor'
    );
});

test('suggestBump: a patch for fixes only, nothing for an empty section', () => {
    assert.equal(suggestBump(changelog('\n### Fixed\n\n- A fix\n\n### Security\n\n- Another\n')).bump, 'patch');
    assert.equal(suggestBump(changelog('\n')).bump, 'none');
    assert.equal(suggestBump(changelog('\n### Added\n\n')).bump, 'none');
});

test('suggestBump does not read past Unreleased', () => {
    // "### Changed" of 4.0.0 below must not make an Unreleased with only a fix minor
    assert.equal(suggestBump(changelog('\n### Fixed\n\n- A fix\n')).bump, 'patch');
});

test('releaseChangelog dates the section and opens a new empty Unreleased', () => {
    const released = releaseChangelog(changelog('\n### Fixed\n\n- A fix\n'), '4.0.1', '2026-11-07');

    assert.match(released, /## Unreleased\n\n## 4\.0\.1 - 2026-11-07\n\n### Fixed\n\n- A fix\n\n## 4\.0\.0 - 2026-10-02/);
    assert.equal(suggestBump(released).bump, 'none');
});

test('releaseChangelog refuses an empty Unreleased, a version released before or a bad date', () => {
    assert.throws(() => releaseChangelog(changelog('\n'), '4.0.1', '2026-11-07'), /nothing to release/);
    assert.throws(() => releaseChangelog(changelog('\n- x\n'), '4.0.0', '2026-11-07'), /already has a section/);
    assert.throws(() => releaseChangelog(changelog('\n- x\n'), '4.0.1', '07.11.2026'), /not a date/);
});

test('releaseNotes gives the entries of one release, not the ones after it', () => {
    const released = releaseChangelog(changelog('\n### Fixed\n\n- A fix\n'), '4.0.1', '2026-11-07');

    assert.equal(releaseNotes(released, '4.0.1'), '### Fixed\n\n- A fix\n');
    assert.equal(releaseNotes(released, '4.0.0'), '### Changed\n\n- The first release\n');
    assert.throws(() => releaseNotes(released, '9.9.9'), /no section/);
});

test('a pre-release leaves the entries under Unreleased, and its notes are those entries', () => {
    const log = changelog('\n### Fixed\n\n- A fix\n');

    assert.equal(releaseChangelog(log, '4.0.1-rc.1', '2026-11-07'), log);
    assert.equal(
        releaseNotes(log, '4.0.1-rc.1'),
        'Pre-release of 4.0.1: the build tested before it goes live.\n\n### Fixed\n\n- A fix\n'
    );
    assert.throws(() => releaseChangelog(changelog('\n'), '4.0.1-rc.1', '2026-11-07'), /nothing to release/);
});

test('going live after pre-releases dates the entries as the release', () => {
    const released = releaseChangelog(changelog('\n### Fixed\n\n- A fix\n'), '4.0.1', '2026-11-08');

    assert.match(released, /## Unreleased\n\n## 4\.0\.1 - 2026-11-08\n\n### Fixed\n\n- A fix\n/);
});

test('commonVersion takes a pre-release too', () => {
    assert.equal(commonVersion({ 'package.json': pkg('5.0.0-rc.1'), 'package-lock.json': lock('5.0.0-rc.1') }), '5.0.0-rc.1');
});

test('withVersion writes a pre-release and the release after it', () => {
    const pre = withVersion('package-lock.json', lock('4.0.0'), '5.0.0-rc.1');

    assert.equal(pre, lock('5.0.0-rc.1'));
    assert.equal(withVersion('package-lock.json', pre, '5.0.0'), lock('5.0.0'));
});
