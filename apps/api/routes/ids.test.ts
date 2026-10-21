import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Every route that takes an id in its path refuses an id that is not a positive whole number
// before its service runs: MySQL reads "1 OR 1=1" and "1e3" as numbers when it compares them with
// an INT column. The services are replaced here, so a test fails when a route lets a bad id
// through to one.
const services = vi.hoisted(() => {
    const make = (...names: string[]) =>
        Object.fromEntries(
            names.map((name) => [name, vi.fn(async () => ({ success: true, ran: name }))])
        );

    return {
        customer: make("getSingle", "postSingle", "putSingle", "deleteSingle"),
        product: make("getSingle", "getByCode", "postSingle", "putSingle", "deleteSingle"),
        worksheet: make("getSingle", "postSingle", "putSingle", "deleteSingle"),
        user: make("getSingle", "postSingle", "putSingle", "deleteSingle"),
        invoice: make(
            "getLast",
            "getMultiplePerCustomer",
            "getSingle",
            "postSingle",
            "putSingle",
            "putSingleData",
            "putSingleItem",
            "deleteSingleItem",
            "markAsPaid"
        ),
        pdf: make("getSingle", "putSingle"),
        helpers: make("deleteImage")
    };
});

vi.mock("../services/customer", () => services.customer);
vi.mock("../services/product", () => services.product);
vi.mock("../services/worksheet", () => services.worksheet);
vi.mock("../services/user", () => services.user);
vi.mock("../services/invoice", () => services.invoice);
vi.mock("../services/pdf", () => services.pdf);
vi.mock("../services/_helpers", () => services.helpers);
vi.mock("../helpers/imageUpload", () => ({ imageUpload: () => [] }));
vi.mock("../helpers/authenticate", () => ({
    authenticate: (_req: unknown, _res: unknown, next: () => void) => next()
}));
vi.mock("../helpers/authorize", () => ({
    authorize: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    authUser: () => undefined,
    isAdmin: () => true
}));

const routers = {
    "/customer": (await import("./customer")).default,
    "/product": (await import("./product")).default,
    "/worksheet": (await import("./worksheet")).default,
    "/user": (await import("./user")).default,
    "/invoice": (await import("./invoice")).default,
    "/pdf": (await import("./pdf")).default
};

let server: Server;
let base: string;

beforeAll(async () => {
    const app = express();

    app.use(express.json());

    for (const [path, router] of Object.entries(routers)) {
        app.use(path, router);
    }

    await new Promise<void>((resolve) => {
        server = app.listen(0, "127.0.0.1", resolve);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    for (const group of Object.values(services)) {
        for (const handler of Object.values(group)) {
            handler.mockClear();
        }
    }
});

const call = async (method: string, path: string) => {
    const response = await fetch(`${base}${path}`, {
        method,
        ...(method === "GET" || method === "DELETE"
            ? {}
            : { headers: { "Content-Type": "application/json" }, body: "{}" })
    });

    return response.json();
};

const refused = { success: false, message: "error" };

const badIds = [
    "0",
    "-1",
    "abc",
    "1e3",
    "1.5",
    "01",
    "1%20OR%201=1",
    "1;DROP%20TABLE%20users",
    "1%27",
    "%20",
    "99999999999",
    "2147483648"
];

// [method, path with {id}, service group, service]
const idRoutes: [string, string, keyof typeof services, string][] = [
    ["GET", "/customer/{id}", "customer", "getSingle"],
    ["PUT", "/customer/{id}", "customer", "putSingle"],
    ["DELETE", "/customer/{id}", "customer", "deleteSingle"],
    ["GET", "/product/{id}", "product", "getSingle"],
    ["PUT", "/product/{id}", "product", "putSingle"],
    ["DELETE", "/product/{id}", "product", "deleteSingle"],
    ["GET", "/worksheet/{id}", "worksheet", "getSingle"],
    ["PUT", "/worksheet/{id}", "worksheet", "putSingle"],
    ["DELETE", "/worksheet/{id}", "worksheet", "deleteSingle"],
    ["GET", "/user/{id}", "user", "getSingle"],
    ["PUT", "/user/{id}", "user", "putSingle"],
    ["DELETE", "/user/{id}", "user", "deleteSingle"],
    ["DELETE", "/user/avatar/{id}", "helpers", "deleteImage"],
    ["PUT", "/pdf/{id}", "pdf", "putSingle"],
    ["GET", "/invoice/{id}", "invoice", "getSingle"],
    ["GET", "/invoice/{id}/7", "invoice", "getSingle"],
    ["GET", "/invoice/all/{id}", "invoice", "getMultiplePerCustomer"],
    ["PUT", "/invoice/paid/{id}", "invoice", "markAsPaid"],
    ["PUT", "/invoice/12/{id}", "invoice", "putSingleItem"],
    ["PUT", "/invoice/{id}/99", "invoice", "putSingleItem"],
    ["DELETE", "/invoice/12/{id}", "invoice", "deleteSingleItem"],
    ["DELETE", "/invoice/{id}/99", "invoice", "deleteSingleItem"]
];

describe("an id in the path", () => {
    it.each(idRoutes)("%s %s runs for an id", async (method, template, group, name) => {
        const body = await call(method, template.replace("{id}", "5"));

        expect(body).toEqual({ success: true, ran: name });
        expect(services[group][name]).toHaveBeenCalledOnce();
    });

    it.each(idRoutes)(
        "%s %s refuses what is not an id, without running",
        async (method, template, group, name) => {
            for (const id of badIds) {
                expect(await call(method, template.replace("{id}", id)), id).toEqual(refused);
            }

            expect(services[group][name]).not.toHaveBeenCalled();
        }
    );
});

describe("the invoice routes", () => {
    it("answer /invoice/last/ and /invoice/all/<customer> before they read :page as an id", async () => {
        expect(await call("GET", "/invoice/last/")).toEqual({ success: true, ran: "getLast" });
        expect(await call("GET", "/invoice/all/5")).toEqual({
            success: true,
            ran: "getMultiplePerCustomer"
        });
    });

    it('need a customer after "all"', async () => {
        expect(await call("GET", "/invoice/all")).toEqual(refused);
        expect(await call("GET", "/invoice/all/abc")).toEqual(refused);
        expect(services.invoice.getMultiplePerCustomer).not.toHaveBeenCalled();
    });

    it('take "paid" in place of an invoice id only when marking an invoice as paid', async () => {
        expect(await call("PUT", "/invoice/paid/5")).toEqual({ success: true, ran: "markAsPaid" });
        expect(await call("DELETE", "/invoice/paid/5")).toEqual(refused);
        expect(await call("PUT", "/invoice/other/5")).toEqual(refused);
    });

    it("leave the id of 'add a line' alone: the web app sends 0, the invoice is in the body", async () => {
        expect(await call("PUT", "/invoice/0/")).toEqual({ success: true, ran: "putSingle" });
        expect(await call("PUT", "/invoice/12/")).toEqual({ success: true, ran: "putSingle" });
    });

    it("do not look at ids on routes that have none", async () => {
        expect(await call("POST", "/invoice")).toEqual({ success: true, ran: "postSingle" });
        expect(await call("PUT", "/invoice")).toEqual({ success: true, ran: "putSingleData" });
        expect(await call("POST", "/customer")).toEqual({ success: true, ran: "postSingle" });
        expect(await call("GET", "/product")).toEqual({ success: true, ran: "getByCode" });
    });
});
