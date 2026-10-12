import { describe, expect, it } from "vitest";
import { hasImageSignature } from "./imageUpload";

// The first bytes of each format, padded to the 12 bytes the upload check reads
const head = (bytes: number[] | string) =>
    Buffer.concat([
        typeof bytes === "string" ? Buffer.from(bytes, "latin1") : Buffer.from(bytes),
        Buffer.alloc(12)
    ]).subarray(0, 12);

const png = head([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = head([0xff, 0xd8, 0xff, 0xe0]);
const gif = head("GIF89a");
const webp = head("RIFF\x24\x00\x00\x00WEBP");
const html = head("<!doctype ht");
const svg = head('<svg xmlns="');

describe("hasImageSignature", () => {
    it.each([
        ["image/png", png],
        ["image/jpeg", jpeg],
        ["image/gif", gif],
        ["image/webp", webp]
    ])("accepts a real %s", (mimetype, bytes) => {
        expect(hasImageSignature(bytes, mimetype)).toBe(true);
    });

    // A client can declare any MIME type; the bytes must match it
    it.each([
        ["HTML sent as image/png", html, "image/png"],
        ["SVG sent as image/png", svg, "image/png"],
        ["HTML sent as image/jpeg", html, "image/jpeg"],
        ["a JPEG sent as image/png", jpeg, "image/png"],
        ["a RIFF file that is not WebP", head("RIFF\x24\x00\x00\x00WAVE"), "image/webp"],
        ["an empty file", Buffer.alloc(0), "image/png"]
    ])("rejects %s", (_case, bytes, mimetype) => {
        expect(hasImageSignature(bytes, mimetype)).toBe(false);
    });

    it.each(["image/svg+xml", "text/html", "application/pdf", ""])(
        "rejects the type %j even with image bytes",
        (mimetype) => {
            expect(hasImageSignature(png, mimetype)).toBe(false);
        }
    );
});
