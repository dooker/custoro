import { describe, expect, it } from "vitest";
import { getBuildInfo } from "./buildInfo";

describe("getBuildInfo", () => {
    it("names the version, the commit and the build time", () => {
        expect(
            getBuildInfo("5.0.0", { APP_BUILD: "38bdbcb", APP_BUILT_AT: "2026-11-07T06:40:00Z" })
        ).toEqual({
            version: "5.0.0",
            build: "38bdbcb",
            builtAt: "2026-11-07T06:40:00.000Z",
            release: "custoro@5.0.0+38bdbcb"
        });
    });

    it("keeps a full hash and the mark of uncommitted changes", () => {
        const full = "38bdbcb287f36b91c3edc74a5d74377e5b31559f";

        expect(getBuildInfo("5.0.0", { APP_BUILD: full }).build).toBe(full);
        expect(getBuildInfo("5.0.0", { APP_BUILD: "38bdbcb-dirty" }).build).toBe("38bdbcb-dirty");
    });

    it("is unknown for an image built without the script, or a value that is not a commit", () => {
        for (const APP_BUILD of [undefined, "", "  ", "main", "38BDBCB", "abc", "x; rm -rf /"]) {
            const info = getBuildInfo("5.0.0", { APP_BUILD, APP_BUILT_AT: "yesterday" });

            expect(info, String(APP_BUILD)).toMatchObject({
                build: "unknown",
                builtAt: null,
                release: "custoro@5.0.0+unknown"
            });
        }
    });
});
