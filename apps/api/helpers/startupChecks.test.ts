import { describe, expect, it } from "vitest";
import { jwtSecretProblem } from "./startupChecks";

const good = "0123456789abcdef0123456789abcdef";

describe("jwtSecretProblem", () => {
    it("accepts a secret of 32 characters or more in production", () => {
        expect(jwtSecretProblem(good, true)).toBeNull();
        expect(jwtSecretProblem(`${good}${good}`, true)).toBeNull();
    });

    it("refuses a missing or empty secret in production", () => {
        expect(jwtSecretProblem(undefined, true)).toMatch(/JWT_SECRET is not set/);
        expect(jwtSecretProblem("", true)).toMatch(/JWT_SECRET is not set/);
    });

    it("refuses a short secret in production, and says how long it was", () => {
        expect(jwtSecretProblem(good.slice(1), true)).toMatch(/too short \(31 characters/);
        expect(jwtSecretProblem("dev-only-insecure-secret", true)).toMatch(/too short/);
    });

    it("leaves development alone, where Docker sets a throwaway secret", () => {
        expect(jwtSecretProblem(undefined, false)).toBeNull();
        expect(jwtSecretProblem("dev-only-insecure-secret", false)).toBeNull();
    });
});
