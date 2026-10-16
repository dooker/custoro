import { describe, expect, it } from "vitest";
import { getAppOrigin } from "./appOrigin";

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
