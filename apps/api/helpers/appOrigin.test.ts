import { describe, expect, it } from "vitest";
import { getAppOrigin, isAllowedOrigin } from "./appOrigin";

describe("getAppOrigin", () => {
    it("is the configured origin", () => {
        expect(getAppOrigin({ APP_ORIGIN: "https://custoro.example.com" })).toBe(
            "https://custoro.example.com"
        );
    });

    it("drops trailing slashes and surrounding spaces, so links get one slash", () => {
        expect(getAppOrigin({ APP_ORIGIN: " https://custoro.example.com/ " })).toBe(
            "https://custoro.example.com"
        );
        expect(getAppOrigin({ APP_ORIGIN: "https://custoro.example.com//" })).toBe(
            "https://custoro.example.com"
        );
    });

    it("falls back to the local development app", () => {
        expect(getAppOrigin({})).toBe("http://localhost:3000");
        expect(getAppOrigin({ APP_ORIGIN: "" })).toBe("http://localhost:3000");
        expect(getAppOrigin({ APP_ORIGIN: "  " })).toBe("http://localhost:3000");
    });
});

describe("isAllowedOrigin", () => {
    const app = "https://custoro.example.com";

    it("allows the app and requests without an Origin, in every environment", () => {
        for (const production of [true, false]) {
            expect(isAllowedOrigin(app, app, production)).toBe(true);
            expect(isAllowedOrigin(undefined, app, production)).toBe(true);
        }
    });

    it("allows any localhost port in development only", () => {
        expect(isAllowedOrigin("http://localhost:5173", app, false)).toBe(true);
        expect(isAllowedOrigin("http://localhost", app, false)).toBe(true);
        expect(isAllowedOrigin("http://localhost:5173", app, true)).toBe(false);
        expect(isAllowedOrigin("http://localhost", app, true)).toBe(false);
    });

    it("refuses other sites and look-alikes of localhost", () => {
        for (const production of [true, false]) {
            for (const origin of [
                "https://other-site.example",
                "http://localhost.attacker.example",
                "http://localhost:3000.attacker.example",
                "https://custoro.example.com.attacker.example",
                "null"
            ]) {
                expect(isAllowedOrigin(origin, app, production), origin).toBe(false);
            }
        }
    });

    it("allows the local app in production when it is the configured one", () => {
        expect(isAllowedOrigin("http://localhost:3000", "http://localhost:3000", true)).toBe(true);
    });
});
