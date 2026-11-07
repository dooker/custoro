// The rules behind scripts/version.mjs, without the file system, so they can be tested with
// `node --test "scripts/*.test.mjs"`. Custoro has one version for the whole repository: the root, the API and
// the web app (their package.json and package-lock.json files) always carry the same number, and
// CHANGELOG.md has an "## Unreleased" section on top that becomes "## <version> - <date>".

const semver = /^(\d+)\.(\d+)\.(\d+)$/;

/** [major, minor, patch] of a plain x.y.z version, or null. */
export const parseVersion = (version) => {
    const match = semver.exec(String(version ?? '').trim());

    return match ? match.slice(1).map(Number) : null;
};

/** The next version: `bump` is major, minor, patch or an exact x.y.z above the current one. */
export const nextVersion = (current, bump) => {
    const parts = parseVersion(current);

    if (!parts) throw new Error(`The current version "${current}" is not x.y.z`);

    const [major, minor, patch] = parts;
    const next = {
        major: `${major + 1}.0.0`,
        minor: `${major}.${minor + 1}.0`,
        patch: `${major}.${minor}.${patch + 1}`,
    }[bump];

    if (next) return next;

    const exact = parseVersion(bump);

    if (!exact) throw new Error(`"${bump}" is not major, minor, patch or a version like 5.0.0`);

    const [a, b, c] = exact;

    if ((a - major || b - minor || c - patch) <= 0) {
        throw new Error(`${bump} is not above the current version ${current}`);
    }

    return exact.join('.');
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

/** The changelog with Unreleased turned into the release, and a new empty Unreleased on top. */
export const releaseChangelog = (changelog, version, date) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`"${date}" is not a date like 2026-11-07`);
    if (new RegExp(`^## ${version.replace(/\./g, '\\.')}\\b`, 'm').test(changelog)) {
        throw new Error(`CHANGELOG.md already has a section for ${version}`);
    }
    if (!/^- /m.test(unreleasedBody(changelog))) {
        throw new Error('Unreleased has no entries: nothing to release');
    }

    return changelog.replace(/^## Unreleased[ \t]*\n/m, `## Unreleased\n\n## ${version} - ${date}\n`);
};

/** The entries of one release, for its GitHub release page. */
export const releaseNotes = (changelog, version) => {
    const heading = new RegExp(`^## ${version.replace(/\./g, '\\.')} - .*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm');
    const match = heading.exec(changelog);

    if (!match) throw new Error(`CHANGELOG.md has no section "## ${version} - <date>"`);

    return `${match[1].trim()}\n`;
};
