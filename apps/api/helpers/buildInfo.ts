// Which build of the API is running, without Express, so it can be unit tested. The version is the
// one in package.json (one version for both apps, see scripts/version.mjs); the build is the git
// commit the image was built from and when, passed in as APP_BUILD and APP_BUILT_AT by
// scripts/docker-build.sh. GET / answers with them and error reports carry them as the release.

export interface BuildInfoIF {
    version: string;
    // A commit hash, with "-dirty" when the checkout had uncommitted changes, or "unknown"
    build: string;
    builtAt: string | null;
    // What Sentry groups errors by: custoro@<version>+<build>
    release: string;
}

const buildPattern = /^[0-9a-f]{7,40}(-dirty)?$/;

export const getBuildInfo = (
    version: string,
    env: Record<string, string | undefined> = process.env
): BuildInfoIF => {
    const given = env.APP_BUILD?.trim() ?? "";
    const build = buildPattern.test(given) ? given : "unknown";
    const time = Date.parse(env.APP_BUILT_AT?.trim() ?? "");

    return {
        version,
        build,
        builtAt: Number.isNaN(time) ? null : new Date(time).toISOString(),
        release: `custoro@${version}+${build}`
    };
};
