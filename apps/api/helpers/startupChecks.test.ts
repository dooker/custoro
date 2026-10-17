import { describe, expect, it } from "vitest";
import { jwtSecretProblem, trustProxyWarning } from "./startupChecks";

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

describe("trustProxyWarning", () => {
    it("warns in production when TRUST_PROXY is missing or empty", () => {
        expect(trustProxyWarning(undefined, true)).toMatch(/TRUST_PROXY is not set/);
        expect(trustProxyWarning("", true)).toMatch(/TRUST_PROXY is not set/);
    });

    it("stays quiet in production once it is set, whatever the value", () => {
        expect(trustProxyWarning("1", true)).toBeNull();
        expect(trustProxyWarning("2", true)).toBeNull();
        expect(trustProxyWarning("0", true)).toBeNull();
        expect(trustProxyWarning("10.0.0.0/8", true)).toBeNull();
    });

    it("leaves development alone, where the tests log in from several made-up addresses", () => {
        expect(trustProxyWarning(undefined, false)).toBeNull();
    });
});
