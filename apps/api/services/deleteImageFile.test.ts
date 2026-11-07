import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// deleteImageFile gets its name from the database (an avatar, the logo); only a file directly in
// the upload folder may be removed, the same rule the PDFs have
const unlink = vi.fn();

vi.mock("node:fs", async (importOriginal) => {
    const fs = await importOriginal<typeof import("node:fs")>();

    return { ...fs, default: { ...fs, unlink } };
});
vi.mock("../db", () => ({ getPool: () => ({}) }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));

const { deleteImageFile } = await import("./_helpers");
const { uploadDir } = await import("../config/paths");

beforeEach(() => {
    unlink.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("deleteImageFile", () => {
    it("removes a file directly in the upload folder", () => {
        deleteImageFile("avatar-1.png");

        expect(unlink).toHaveBeenCalledOnce();
        expect(unlink.mock.calls[0][0]).toBe(path.join(uploadDir, "avatar-1.png"));
    });

    it.each([
        "../package.json",
        "../../etc/passwd",
        "a/b.png",
        "/etc/passwd",
        "x\0.png",
        ".",
        ".."
    ])("removes nothing for %j", (name) => {
        deleteImageFile(name);

        expect(unlink).not.toHaveBeenCalled();
    });

    it("does nothing without a name", () => {
        deleteImageFile("");

        expect(unlink).not.toHaveBeenCalled();
    });
});
