// The rules behind scripts/version.mjs, without the file system, so they can be tested with
// `node --test "scripts/*.test.mjs"`. Custoro has one version for the whole repository: the root,
// the API and the web app (their package.json and package-lock.json files) always carry the same
// number, and CHANGELOG.md has an "## Unreleased" section on top that becomes
// "## <version> - <date>" when a release goes live.
//
// Versions are semantic versions, x.y.z, or a pre-release of one: 5.0.0-rc.1 is the first release
// candidate of 5.0.0, the build that is tested before 5.0.0 goes live. A pre-release keeps the
// changelog entries under Unreleased; the release of 5.0.0 itself dates them.

const semver = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

// The label of a new pre-release: rc.1, rc.2, ... ("release candidate")
export const defaultPreid = 'rc';

/** {major, minor, patch, pre} of x.y.z or x.y.z-<pre> (pre is null for a release), or null. */
export const parseVersion = (version) => {
    const match = semver.exec(String(version ?? '').trim());

    if (!match) return null;

    const [major, minor, patch] = match.slice(1, 4).map(Number);

    return { major, minor, patch, pre: match[4] ?? null };
};

/** The release a version is or leads to: 5.0.0 for 5.0.0-rc.2 and for 5.0.0. */
export const releaseOf = (version) => {
    const { major, minor, patch } = parseVersion(version);

    return `${major}.${minor}.${patch}`;
};

export const isPrerelease = (version) => parseVersion(version)?.pre != null;

// Semantic version order: 5.0.0-rc.2 < 5.0.0-rc.10 < 5.0.0 < 5.0.1
const comparePre = (a, b) => {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;

    const left = a.split('.');
    const right = b.split('.');

    for (let index = 0; index < Math.max(left.length, right.length); index++) {
        const [x, y] = [left[index], right[index]];

        if (x === undefined) return -1;
        if (y === undefined) return 1;
        if (x === y) continue;

        const [nx, ny] = [/^\d+$/.test(x), /^\d+$/.test(y)];

        if (nx && ny) return Number(x) - Number(y);
        if (nx !== ny) return nx ? -1 : 1;

        return x < y ? -1 : 1;
    }

    return 0;
};

export const compareVersions = (a, b) => {
    const [x, y] = [parseVersion(a), parseVersion(b)];

    return x.major - y.major || x.minor - y.minor || x.patch - y.patch || comparePre(x.pre, y.pre);
};

/**
 * The next version. `bump` is
 * - major, minor or patch: the next release of that kind. From a pre-release of a release of that
 *   kind (5.0.0-rc.2 and major), it is that release (5.0.0), as npm does
 * - premajor, preminor or prepatch: the first pre-release of the next such release (5.0.0-rc.1)
 * - prerelease: the next pre-release of the same release (5.0.0-rc.1 -> 5.0.0-rc.2)
 * - release: the release a pre-release leads to (5.0.0-rc.2 -> 5.0.0), when it goes live
 * - an exact version above the current one
 */
export const nextVersion = (current, bump, preid = defaultPreid) => {
    const parsed = parseVersion(current);

    if (!parsed) throw new Error(`The current version "${current}" is not x.y.z or x.y.z-<pre>`);

    // Checked first, so a wrong label stops before any file is written. Letters, digits and "-",
    // the characters a semantic version allows (5.0.0-rc.1, 5.0.0-beta-2.1)
    if (!/^[0-9A-Za-z-]+$/.test(preid)) {
        throw new Error(`The pre-release label "${preid}" may only have letters, digits and -`);
    }

    const { major, minor, patch, pre } = parsed;
    const core = `${major}.${minor}.${patch}`;
    const releases = {
        major: pre !== null && minor === 0 && patch === 0 ? core : `${major + 1}.0.0`,
        minor: pre !== null && patch === 0 ? core : `${major}.${minor + 1}.0`,
        patch: pre !== null ? core : `${major}.${minor}.${patch + 1}`,
    };

    if (releases[bump]) return releases[bump];

    if (['premajor', 'preminor', 'prepatch'].includes(bump)) {
        const next = {
            premajor: `${major + 1}.0.0`,
            preminor: `${major}.${minor + 1}.0`,
            prepatch: `${major}.${minor}.${patch + 1}`,
        }[bump];

        return `${next}-${preid}.1`;
    }

    if (bump === 'prerelease' || bump === 'release') {
        if (pre === null) {
            throw new Error(`${current} is not a pre-release: use premajor, preminor or prepatch to start one`);
        }

        if (bump === 'release') return core;

        const counted = new RegExp(`^${preid}\\.(\\d+)$`).exec(pre);

        return counted ? `${core}-${preid}.${Number(counted[1]) + 1}` : `${core}-${preid}.1`;
    }

    if (!parseVersion(bump)) {
        throw new Error(
            `"${bump}" is not major, minor, patch, premajor, preminor, prepatch, prerelease, ` +
                'release or a version like 5.0.0 or 5.0.0-rc.1'
        );
    }

    if (compareVersions(bump, current) <= 0) {
        throw new Error(`${bump} is not above the current version ${current}`);
    }

    return bump;
};

/**
 * The versions in every file that holds one, as [label, version] pairs: `files` maps a path to its
 * text. A package.json has one, a package-lock.json two (its own and the root package's).
 */
export const versionsIn = (files) =>
    Object.entries(files).flatMap(([path, text]) => {
        const json = JSON.parse(text);

        return path.endsWith('package-lock.json')
            ? [
                  [`${path} version`, json.version],
                  [`${path} packages[""].version`, json.packages?.['']?.version],
              ]
            : [[`${path} version`, json.version]];
    });

/** The one version all files agree on, or an error that lists each file and what it has. */
export const commonVersion = (files) => {
    const found = versionsIn(files);
    const distinct = [...new Set(found.map(([, version]) => version))];

    if (distinct.length !== 1 || !parseVersion(distinct[0])) {
        const list = found.map(([label, version]) => `  ${label}: ${version}`).join('\n');

        throw new Error(`The versions differ or are not x.y.z:\n${list}`);
    }

    return distinct[0];
};

/**
 * The file with its own version (and, in a lock file, the root package's) set to `version`, and
 * nothing else touched: only those "version" lines change, so the formatting stays as npm wrote it.
 */
export const withVersion = (path, text, version) => {
    const before = JSON.parse(text);
    const current = before.version;
    const count = path.endsWith('package-lock.json') ? 2 : 1;
    let replaced = 0;
    const result = text.replace(
        new RegExp(`("version":\\s*")${current.replace(/\./g, '\\.')}(")`, 'g'),
        (line, start, end) => (replaced++ < count ? `${start}${version}${end}` : line)
    );
    const after = JSON.parse(result);

    // Exactly the expected fields changed, whatever the order of the keys
    before.version = version;
    if (count === 2) before.packages[''].version = version;

    if (JSON.stringify(after) !== JSON.stringify(before)) {
        throw new Error(`${path}: could not change only its version`);
    }

    return result;
};

// The text under "## Unreleased" up to the next "## " heading
const unreleasedBody = (changelog) => {
    const match = /^## Unreleased[ \t]*\n([\s\S]*?)(?=^## )/m.exec(changelog);

    if (!match) throw new Error('CHANGELOG.md has no "## Unreleased" section above a release');

    return match[1];
};

// The lines under each "### " heading of a section
const subsections = (body) => {
    const found = {};
    let current = null;

    for (const line of body.split('\n')) {
        const heading = /^### (.+?)\s*$/.exec(line);

        if (heading) {
            current = heading[1];
            found[current] ??= [];
        } else if (current) {
            found[current].push(line);
        }
    }

    return found;
};

const hasEntries = (lines = []) => lines.some((line) => line.startsWith('- '));

// What makes a release major, minor or a patch, read from the Unreleased entries. Major: an
// existing install must change its configuration or it stops working (a setting it must add, an
// API that refuses to start, everyone logged out), or an entry says **Breaking**. Minor: anything
// added or changed, or a migration. Patch: fixes and security fixes only.
const majorSigns = [
    /\*\*Breaking/i,
    /must add `[^`]+` to `?\.env/i,
    /refuses to start/i,
    /everyone logs in (once more|again)/i,
];
const migrationSign = /must run the new migration/i;

/** major, minor, patch or none, with the lines that decided it. */
export const suggestBump = (changelog) => {
    const body = unreleasedBody(changelog);

    if (!/^- /m.test(body)) return { bump: 'none', reasons: ['Unreleased has no entries'] };

    const lines = body.split('\n').map((line) => line.trim());
    const major = lines.filter((line) => majorSigns.some((sign) => sign.test(line)));

    if (major.length) return { bump: 'major', reasons: major };

    const sections = subsections(body);
    const minor = [
        ...['Added', 'Changed']
            .filter((name) => hasEntries(sections[name]))
            .map((name) => `has entries under ### ${name}`),
        ...lines.filter((line) => migrationSign.test(line)),
    ];

    if (minor.length) return { bump: 'minor', reasons: minor };

    return { bump: 'patch', reasons: ['only ### Fixed and ### Security entries'] };
};

/**
 * The changelog with Unreleased turned into the release, and a new empty Unreleased on top. A
 * pre-release leaves it as it is: its entries stay under Unreleased until the release goes live.
 */
export const releaseChangelog = (changelog, version, date) => {
    if (!parseVersion(version)) throw new Error(`"${version}" is not a version`);

    if (isPrerelease(version)) {
        if (!/^- /m.test(unreleasedBody(changelog))) {
            throw new Error('Unreleased has no entries: nothing to release');
        }

        return changelog;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`"${date}" is not a date like 2026-11-07`);
    if (new RegExp(`^## ${version.replace(/\./g, '\\.')}\\b`, 'm').test(changelog)) {
        throw new Error(`CHANGELOG.md already has a section for ${version}`);
    }
    if (!/^- /m.test(unreleasedBody(changelog))) {
        throw new Error('Unreleased has no entries: nothing to release');
    }

    return changelog.replace(/^## Unreleased[ \t]*\n/m, `## Unreleased\n\n## ${version} - ${date}\n`);
};

/** The entries of one release, for its GitHub release page; a pre-release's are under Unreleased. */
export const releaseNotes = (changelog, version) => {
    if (isPrerelease(version)) {
        const body = unreleasedBody(changelog).trim();

        if (!body) throw new Error('Unreleased has no entries for the pre-release notes');

        return `Pre-release of ${releaseOf(version)}: the build tested before it goes live.\n\n${body}\n`;
    }

    const heading = new RegExp(`^## ${version.replace(/\./g, '\\.')} - .*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm');
    const match = heading.exec(changelog);

    if (!match) throw new Error(`CHANGELOG.md has no section "## ${version} - <date>"`);

    return `${match[1].trim()}\n`;
};
