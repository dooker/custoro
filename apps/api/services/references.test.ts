import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";

// Products and customers are protected by unique keys and foreign keys; these tests check what
// the API tells the web app when the database refuses (see the 2026-10-19 migrations)
const queryMock = vi.fn();

vi.mock("../db", () => ({ getPool: () => ({}) }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("../helper/query", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../helper/query")>()),
    query: queryMock
}));

const product = await import("./product");
const customer = await import("./customer");

const failing = (code: string) =>
    queryMock.mockResolvedValue({ success: false, data: [], code, message: "error" });

const request = (parts: { params?: object; body?: object }) =>
    ({ database: "shop", params: {}, body: {}, ...parts }) as unknown as Request;

const newProduct = {
    code: "P-1",
    name: "Cable",
    price: "19,99",
    discountPrice: 0,
    unit: "pc",
    comment: ""
};

beforeEach(() => {
    queryMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("products", () => {
    it("tells a second product with the same code apart from other failures, when adding", async () => {
        failing("ER_DUP_ENTRY");

        expect(await product.postSingle(request({ body: newProduct }))).toEqual({
            success: false,
            message: "product.exists"
        });

        failing("ER_LOCK_DEADLOCK");

        expect(await product.postSingle(request({ body: newProduct }))).toMatchObject({
            success: false,
            message: "error"
        });
    });

    it("tells a duplicate code apart, when changing a product - and no longer reports a failed update as saved", async () => {
        failing("ER_DUP_ENTRY");

        expect(await product.putSingle(request({ params: { id: "1" }, body: newProduct }))).toEqual(
            {
                success: false,
                message: "product.exists"
            }
        );

        failing("ER_LOCK_DEADLOCK");

        expect(
            await product.putSingle(request({ params: { id: "1" }, body: newProduct }))
        ).toMatchObject({ success: false });
    });

    it("saves a product the database accepts", async () => {
        queryMock.mockResolvedValue({ success: true, data: [], message: "OK" });

        expect(await product.putSingle(request({ params: { id: "1" }, body: newProduct }))).toEqual(
            {
                success: true
            }
        );
        // the price goes to the database as a number
        expect(queryMock.mock.calls[0][0].params).toEqual(["P-1", "Cable", 19.99, 0, "pc", "", 1]);
    });

    it("says a product that worksheets still use cannot be deleted", async () => {
        failing("ER_ROW_IS_REFERENCED_2");

        expect(await product.deleteSingle(request({ params: { id: "1" } }))).toEqual({
            success: false,
            message: "product.inUse"
        });

        failing("ER_LOCK_DEADLOCK");

        expect(await product.deleteSingle(request({ params: { id: "1" } }))).toEqual({
            success: false,
            message: "delete.product"
        });
    });
});

describe("customers", () => {
    it("says a customer that has invoices or worksheets cannot be deleted", async () => {
        failing("ER_ROW_IS_REFERENCED_2");

        expect(await customer.deleteSingle(request({ params: { id: "1" } }))).toEqual({
            success: false,
            message: "customer.inUse"
        });
    });

    it("keeps the plain answer for any other failure and for a delete that worked", async () => {
        failing("ER_LOCK_DEADLOCK");

        expect(await customer.deleteSingle(request({ params: { id: "1" } }))).toEqual({
            success: false
        });

        queryMock.mockResolvedValue({ success: true, data: [] });

        expect(await customer.deleteSingle(request({ params: { id: "1" } }))).toEqual({
            success: true
        });
    });

    it("no longer reports a failed update as saved", async () => {
        failing("ER_LOCK_DEADLOCK");

        const body = { name: "Acme" };

        expect(await customer.putSingle(request({ params: { id: "1" }, body }))).toMatchObject({
            success: false
        });
    });
});
