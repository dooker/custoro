// Which build of the web app this is, without Vite, so the rules can be unit tested. vite.config.ts
// bakes the result into the bundle as __APP_BUILD__ and __APP_BUILT_AT__: the sidebar shows it next
// to the version, and error reports carry it as their release.

// A short or full commit hash, with "-dirty" when the checkout had uncommitted changes
const buildPattern = /^[0-9a-f]{7,40}(-dirty)?$/;

/**
 * The commit a build comes from: APP_BUILD when the Docker build was given one
 * (scripts/docker-build.sh), else the checkout's own (a build on a machine with git), else
 * "unknown". `fromGit` may throw or give null where there is no git.
 */
export const resolveBuild = (given: string | undefined, fromGit: () => string | null): string => {
    const value = given?.trim() ?? '';

    if (buildPattern.test(value)) return value;

    try {
        const git = fromGit()?.trim() ?? '';

        return buildPattern.test(git) ? git : 'unknown';
    } catch {
        return 'unknown';
    }
};

/** When it was built: APP_BUILT_AT when given and valid, else now. */
export const resolveBuiltAt = (given: string | undefined, now: () => Date = () => new Date()) => {
    const time = Date.parse(given?.trim() ?? '');

    return (Number.isNaN(time) ? now() : new Date(time)).toISOString();
};

/** What Sentry groups errors by, the same as the API's: custoro@<version>+<build> */
export const releaseName = (version: string, build: string) => `custoro@${version}+${build}`;

/** What the sidebar shows: "v 5.0.0 · 38bdbcb", or only the version for a build of unknown origin */
export const versionLabel = (version: string, build: string) =>
    build === 'unknown' ? `v ${version}` : `v ${version} · ${build}`;
