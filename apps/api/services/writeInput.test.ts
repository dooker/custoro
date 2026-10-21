import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";

// The write routes refuse a body whose values are not text, numbers or enum values, before any SQL
// is built: {"a":1} as a customer name was stored as "[object Object]" and [["x"]] as a product code
// was expanded into SQL by mysql2
const queryMock = vi.fn();
const deleteImageFile = vi.fn();

vi.mock("../db", () => ({ getPool: () => ({}) }));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("../helper/query", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../helper/query")>()),
    query: queryMock
}));
vi.mock("./_helpers", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./_helpers")>()),
    deleteImageFile
}));

const customer = await import("./customer");
const product = await import("./product");
const worksheet = await import("./worksheet");
const user = await import("./user");

const refused = { success: false, message: "invalidInput" };

const request = (parts: { params?: object; body?: unknown; file?: object; query?: object }) =>
    ({ database: "shop", params: {}, body: {}, query: {}, ...parts }) as unknown as Request;

const sqlStatements = () => queryMock.mock.calls.map(([call]) => call);

beforeEach(() => {
    queryMock.mockReset();
    deleteImageFile.mockReset();
    queryMock.mockResolvedValue({ success: true, data: [], insertId: 7, message: "OK" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("customer", () => {
    const body = { name: "Acme", contact: "Ann", paymentPeriod: "14" };

    it("is not stored with an object or an array as a name", async () => {
        for (const name of [{ a: 1 }, [["x"]]]) {
            expect(await customer.postSingle(request({ body: { ...body, name } }))).toEqual(
                refused
            );
            expect(
                await customer.putSingle(request({ params: { id: "1" }, body: { ...body, name } }))
            ).toEqual(refused);
        }

        expect(queryMock).not.toHaveBeenCalled();
    });

    it("is not stored when a text is longer than its column", async () => {
        expect(
            await customer.postSingle(request({ body: { ...body, name: "x".repeat(151) } }))
        ).toEqual(refused);
        expect(queryMock).not.toHaveBeenCalled();
    });

    it("needs a body", async () => {
        expect(await customer.postSingle(request({ body: undefined }))).toEqual(refused);
    });

    it("is saved with checked values, and a change goes to the customer in the URL", async () => {
        expect(await customer.postSingle(request({ body }))).toMatchObject({ success: true });

        const [insert] = sqlStatements();

        expect(insert.params).toEqual([
            "Acme",
            "Ann",
            null,
            null,
            null,
            "",
            null,
            null,
            "",
            "",
            14,
            null,
            null,
            ""
        ]);

        queryMock.mockClear();

        await customer.putSingle(request({ params: { id: "12" }, body: { ...body, id: 99 } }));

        const [update] = sqlStatements();

        expect(update.params).toHaveLength(15);
        expect(update.params.at(-1)).toBe(12);
    });
});

describe("product", () => {
    const body = { code: "P-1", name: "Cable", price: "19,99", discountPrice: 0, unit: "pc" };

    it("is not stored with an array as a code", async () => {
        expect(await product.postSingle(request({ body: { ...body, code: [["x"]] } }))).toEqual(
            refused
        );
        expect(
            await product.putSingle(
                request({ params: { id: "1" }, body: { ...body, code: ["x"] } })
            )
        ).toEqual(refused);
        expect(queryMock).not.toHaveBeenCalled();
    });

    it("is not stored with a unit or a price the columns cannot hold", async () => {
        for (const change of [{ unit: "tk" }, { price: "cheap" }, { price: [1] }]) {
            expect(await product.postSingle(request({ body: { ...body, ...change } }))).toEqual(
                refused
            );
        }

        expect(queryMock).not.toHaveBeenCalled();
    });

    it("gets its prices as numbers, in a new product too", async () => {
        await product.postSingle(request({ body }));

        expect(sqlStatements()[0].params).toEqual(["P-1", "Cable", 19.99, 0, "pc", ""]);
    });

    it("looks a code up only when it is text", async () => {
        expect(await product.getByCode(request({ query: { code: ["a", "b"] } }))).toEqual(refused);
        expect(await product.getByCode(request({ query: { code: { a: "b" } } }))).toEqual(refused);
        expect(queryMock).not.toHaveBeenCalled();

        queryMock.mockResolvedValue({ success: true, data: [{ count: 1 }] });

        expect(await product.getByCode(request({ query: { code: "P-1" } }))).toEqual({
            success: true,
            data: 1
        });
    });
});

describe("worksheet", () => {
    it("is not stored with a customer, product or quantity that is not a number", async () => {
        for (const change of [
            { customer: { a: 1 } },
            { customer: [3] },
            { product_id: "4 OR 1=1" },
            { quantity: "lots" },
            { quantity: [2] }
        ]) {
            expect(
                await worksheet.postSingle(
                    request({ body: { customer: 3, product_id: 4, quantity: 2, ...change } })
                ),
                JSON.stringify(change)
            ).toEqual(refused);
        }

        expect(
            await worksheet.putSingle(
                request({
                    params: { id: "9" },
                    body: { customer_id: [3], product_id: 4, quantity: 2 }
                })
            )
        ).toEqual(refused);
        expect(queryMock).not.toHaveBeenCalled();
    });

    it("is saved with numbers, and a change goes to the worksheet in the URL", async () => {
        await worksheet.postSingle(
            request({ body: { customer: "3", product_id: "4", quantity: "2,5" } })
        );

        expect(sqlStatements()[0].params).toEqual([3, 4, 0, 2.5]);

        queryMock.mockClear();

        await worksheet.putSingle(
            request({
                params: { id: "9" },
                body: { id: 99, customer_id: 3, product_id: 4, order_id: null, quantity: 2 }
            })
        );

        expect(sqlStatements()[0].params).toEqual([3, 4, 0, 2, 9]);
    });
});

describe("user", () => {
    const body = {
        name: "Ann",
        username: "ann@example.test",
        discount: "1",
        offer: "0",
        role: "user"
    };
    const file = { filename: "avatar-1.png" };

    it("is not stored with an object as a name, an unknown role or no login email", async () => {
        for (const change of [
            { name: { a: "1" } },
            { role: "root" },
            { username: undefined },
            { username: ["ann@example.test"] }
        ]) {
            expect(
                await user.postSingle(request({ body: { ...body, ...change } })),
                JSON.stringify(change)
            ).toEqual(refused);
            expect(
                await user.putSingle(request({ params: { id: "2" }, body: { ...body, ...change } }))
            ).toEqual(refused);
        }

        expect(queryMock).not.toHaveBeenCalled();
    });

    it("removes the avatar that came with a refused request, since nothing will refer to it", async () => {
        await user.postSingle(request({ body: { ...body, role: "root" }, file }));
        await user.putSingle(
            request({ params: { id: "2" }, body: { ...body, role: "root" }, file })
        );

        expect(deleteImageFile.mock.calls).toEqual([["avatar-1.png"], ["avatar-1.png"]]);
    });

    it("is saved with checked values, and a change goes to the user in the URL", async () => {
        queryMock.mockResolvedValue({
            success: true,
            data: [{ count: 0, avatar: "" }],
            insertId: 7
        });

        await user.putSingle(request({ params: { id: "2" }, body: { ...body, id: 99 } }));

        const update = sqlStatements().find(({ sql }) => /UPDATE users/.test(sql));

        expect(update.params).toEqual([
            "ann@example.test",
            "Ann",
            "ann@example.test",
            1,
            0,
            "user",
            2
        ]);
    });
});
