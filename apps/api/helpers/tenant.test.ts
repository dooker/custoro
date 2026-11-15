import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { tenantOf } from "./tenant";
import { isOwner, requireOwner } from "./authorize";

const request = (user: unknown) => ({ user }) as unknown as Request;

describe("tenantOf", () => {
    it("gives the company the session has", () => {
        expect(tenantOf(request({ id: 1, role: "user", tv: 0, tenantId: 3, owner: false }))).toBe(
            3
        );
    });

    it.each([
        ["no caller (no authenticate on the route)", undefined],
        ["a caller without a company", { id: 1, role: "user", tv: 0 }],
        ["a company id that is not a whole number", { id: 1, tenantId: "3" }],
        ["company 0", { id: 1, tenantId: 0 }]
    ])("throws for %s instead of reading every company", (_case, user) => {
        expect(() => tenantOf(request(user))).toThrow(/no company/);
    });
});

describe("requireOwner", () => {
    const run = (user: unknown) => {
        let status = 200;
        let nextCalled = false;
        const res = {
            status: (code: number) => {
                status = code;
                return { json: () => undefined };
            }
        };
        requireOwner(request(user), res as never, () => {
            nextCalled = true;
        });
        return { status, nextCalled };
    };

    it("lets the owner through", () => {
        expect(run({ id: 1, role: "admin", tenantId: 1, owner: true })).toEqual({
            status: 200,
            nextCalled: true
        });
        expect(isOwner(request({ owner: true }))).toBe(true);
    });

    it.each([
        ["an admin who is not the owner", { id: 2, role: "admin", tenantId: 1, owner: false }],
        ["a regular user", { id: 3, role: "user", tenantId: 1, owner: false }],
        ["no caller", undefined],
        ["an owner flag that is not true", { id: 4, owner: 1 }]
    ])("refuses %s with 403", (_case, user) => {
        expect(run(user)).toEqual({ status: 403, nextCalled: false });
    });
});
