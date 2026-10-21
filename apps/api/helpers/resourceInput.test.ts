import { describe, expect, it } from "vitest";
import { parseInput } from "./bodyInput";
import {
    customerInput,
    invoiceDataInput,
    lineInput,
    newInvoiceInput,
    newWorksheetInput,
    productInput,
    quantityInput,
    userInput,
    worksheetInput
} from "./resourceInput";

// What the web app sends when it saves a customer (the whole draft, null for what is empty)
const webCustomer = {
    id: 12,
    name: "Acme OÜ",
    contact: null,
    regNumber: "12345678",
    vatNumber: null,
    phone: "+372 5551234",
    phone2: "",
    address: "Tartu mnt 1",
    email: "info@acme.example",
    invoiceEmail: "",
    www: "",
    paymentPeriod: "14",
    additionalInfo: null,
    shippingInfo: null,
    department: ""
};

describe("customerInput", () => {
    it("takes what the web app sends, with null for the columns that can be NULL", () => {
        expect(parseInput(webCustomer, customerInput)).toEqual({
            ok: true,
            values: {
                name: "Acme OÜ",
                contact: null,
                regNumber: "12345678",
                vatNumber: null,
                phone: "+372 5551234",
                phone2: "",
                address: "Tartu mnt 1",
                email: "info@acme.example",
                invoiceEmail: "",
                www: "",
                paymentPeriod: 14,
                additionalInfo: null,
                shippingInfo: null,
                department: ""
            }
        });
    });

    it("fills a body with nothing in it the way the table does", () => {
        expect(parseInput({}, customerInput)).toMatchObject({
            ok: true,
            values: { name: null, phone2: "", invoiceEmail: "", paymentPeriod: 14, department: "" }
        });
    });

    it("refuses an object or an array as a name, which was stored as '[object Object]'", () => {
        for (const name of [{ a: 1 }, ["x"], [["x"]]]) {
            expect(parseInput({ ...webCustomer, name }, customerInput).ok).toBe(false);
        }
    });

    it("refuses text that does not fit its column", () => {
        const limits = {
            name: 150,
            contact: 100,
            regNumber: 150,
            vatNumber: 50,
            phone: 45,
            phone2: 20,
            address: 250,
            email: 254,
            invoiceEmail: 254,
            www: 255,
            additionalInfo: 750,
            shippingInfo: 250,
            department: 250
        };

        for (const [field, limit] of Object.entries(limits)) {
            const fits = { ...webCustomer, [field]: "x".repeat(limit) };
            const tooLong = { ...webCustomer, [field]: "x".repeat(limit + 1) };

            expect(parseInput(fits, customerInput).ok, `${field} of ${limit}`).toBe(true);
            expect(parseInput(tooLong, customerInput).ok, `${field} of ${limit + 1}`).toBe(false);
        }
    });

    it("refuses a payment period that is not a whole number of days", () => {
        for (const paymentPeriod of ["soon", 14.5, [14], -1, 99999]) {
            expect(parseInput({ ...webCustomer, paymentPeriod }, customerInput).ok).toBe(false);
        }
    });
});

describe("productInput", () => {
    const product = {
        code: "P-1",
        name: "Cable",
        price: 19.99,
        discountPrice: "17,5",
        unit: "pc",
        comment: ""
    };

    it("takes a product, with prices as numbers or as text with a comma", () => {
        expect(parseInput(product, productInput)).toEqual({
            ok: true,
            values: { ...product, discountPrice: 17.5 }
        });
    });

    it("refuses an array as a code, which mysql2 expanded into SQL", () => {
        expect(parseInput({ ...product, code: [["x"]] }, productInput).ok).toBe(false);
        expect(parseInput({ ...product, code: ["x"] }, productInput).ok).toBe(false);
    });

    it("needs a code and a name, which may be empty text, and refuses a unit the column does not have", () => {
        expect(parseInput({ ...product, code: undefined }, productInput).ok).toBe(false);
        expect(parseInput({ ...product, name: undefined }, productInput).ok).toBe(false);
        expect(parseInput({ ...product, code: "" }, productInput).ok).toBe(true);
        expect(parseInput({ ...product, unit: "box" }, productInput).ok).toBe(false);
        expect(parseInput({ ...product, unit: undefined }, productInput)).toMatchObject({
            values: { unit: "pc" }
        });
    });

    it("refuses text and prices that do not fit their columns", () => {
        expect(parseInput({ ...product, code: "x".repeat(46) }, productInput).ok).toBe(false);
        expect(parseInput({ ...product, name: "x".repeat(251) }, productInput).ok).toBe(false);
        expect(parseInput({ ...product, comment: "x".repeat(501) }, productInput).ok).toBe(false);
        expect(parseInput({ ...product, price: 1e8 }, productInput).ok).toBe(false);
        expect(parseInput({ ...product, price: "cheap" }, productInput).ok).toBe(false);
    });

    it("refuses a price that rounds up to more than DECIMAL(12,4) holds", () => {
        for (const price of [99999999.99995, 99999999.99999, "99999999.99996"]) {
            expect(parseInput({ ...product, price }, productInput).ok, String(price)).toBe(false);
            expect(parseInput({ ...product, discountPrice: price }, productInput).ok).toBe(false);
        }

        expect(parseInput({ ...product, price: 99999999.9999 }, productInput).ok).toBe(true);
    });

    it("counts a missing price as 0", () => {
        expect(
            parseInput({ ...product, price: "", discountPrice: undefined }, productInput)
        ).toMatchObject({
            values: { price: 0, discountPrice: 0 }
        });
    });
});

describe("worksheetInput", () => {
    it("takes a new worksheet: the customer is called 'customer'", () => {
        expect(
            parseInput({ customer: "3", product_id: 4, quantity: "2.5" }, newWorksheetInput)
        ).toEqual({
            ok: true,
            values: { customer: 3, product_id: 4, order_id: 0, quantity: 2.5 }
        });
    });

    it("takes a changed worksheet, as the table holds it: the customer is called 'customer_id'", () => {
        const stored = {
            id: 9,
            product_id: 4,
            customer_id: 3,
            order_id: null,
            quantity: 2.5,
            invoice: null,
            locked: "0"
        };

        expect(parseInput(stored, worksheetInput)).toEqual({
            ok: true,
            values: { customer_id: 3, product_id: 4, order_id: 0, quantity: 2.5 }
        });
    });

    it("needs a customer and a product, and a quantity that is a number", () => {
        expect(parseInput({ product_id: 4 }, newWorksheetInput).ok).toBe(false);
        expect(parseInput({ customer: 3 }, newWorksheetInput).ok).toBe(false);
        expect(parseInput({ customer: [3], product_id: 4 }, newWorksheetInput).ok).toBe(false);
        expect(
            parseInput({ customer: 3, product_id: 4, quantity: "lots" }, newWorksheetInput).ok
        ).toBe(false);
        expect(
            parseInput({ customer: 3, product_id: 4, quantity: "" }, newWorksheetInput)
        ).toMatchObject({
            values: { quantity: 0 }
        });
    });
});

describe("userInput", () => {
    it("takes the fields of the user form, which arrive as text", () => {
        expect(
            parseInput(
                {
                    name: "Ann",
                    username: "ann@example.test",
                    discount: "1",
                    offer: "0",
                    role: "admin"
                },
                userInput
            )
        ).toEqual({
            ok: true,
            values: {
                name: "Ann",
                username: "ann@example.test",
                discount: 1,
                offer: 0,
                role: "admin"
            }
        });
    });

    it("needs a login email and a role the column has", () => {
        const ann = { username: "ann@example.test", role: "user" };

        expect(parseInput(ann, userInput).ok).toBe(true);
        expect(parseInput({ ...ann, username: "" }, userInput).ok).toBe(false);
        expect(parseInput({ ...ann, username: undefined }, userInput).ok).toBe(false);
        expect(parseInput({ ...ann, username: ["ann@example.test"] }, userInput).ok).toBe(false);
        expect(parseInput({ ...ann, username: `${"a".repeat(250)}@x.test` }, userInput).ok).toBe(
            false
        );
        expect(parseInput({ ...ann, role: "root" }, userInput).ok).toBe(false);
        expect(parseInput({ ...ann, role: undefined }, userInput).ok).toBe(false);
        expect(parseInput({ ...ann, name: "x".repeat(101) }, userInput).ok).toBe(false);
        expect(parseInput({ ...ann, discount: "yes" }, userInput).ok).toBe(false);
    });

    it("refuses what a multipart form can nest: name[a]=1 arrives as an object", () => {
        expect(
            parseInput({ username: "ann@example.test", role: "user", name: { a: "1" } }, userInput)
                .ok
        ).toBe(false);
    });
});

describe("invoice input", () => {
    it("takes the customer of a new invoice, or none", () => {
        expect(parseInput({ customerId: "5" }, newInvoiceInput)).toEqual({
            ok: true,
            values: { customerId: 5 }
        });
        expect(parseInput({}, newInvoiceInput)).toEqual({ ok: true, values: { customerId: null } });
        expect(parseInput({ customerId: null, items: [] }, newInvoiceInput).ok).toBe(true);
        expect(parseInput({ customerId: { a: 1 } }, newInvoiceInput).ok).toBe(false);
        expect(parseInput({ customerId: "5 OR 1=1" }, newInvoiceInput).ok).toBe(false);
        expect(parseInput({ customerId: 0 }, newInvoiceInput).ok).toBe(false);
    });

    it("takes the data of an invoice the way the web app sends it, with the whole draft around it", () => {
        const draft = {
            id: 7,
            number: "42",
            customerId: 5,
            invoiceDate: "2026-10-21",
            paymentType: "transfer",
            invoiceType: "invoice",
            locked: 0,
            items: [{ id: 1 }],
            createDate: "2026-10-01"
        };

        expect(parseInput(draft, invoiceDataInput)).toEqual({
            ok: true,
            values: {
                id: 7,
                number: "42",
                customerId: 5,
                invoiceDate: "2026-10-21",
                paymentType: "transfer",
                invoiceType: "invoice"
            }
        });
        expect(parseInput({ ...draft, number: 43 }, invoiceDataInput)).toMatchObject({
            values: { number: "43" }
        });
        // no spaces at the ends: "42 " would be 42 to the database's unique key but not to the counter
        for (const number of ["42 ", " 42", "42  "]) {
            expect(parseInput({ ...draft, number }, invoiceDataInput), number).toMatchObject({
                values: { number: "42" }
            });
        }
        expect(parseInput({ ...draft, customerId: null }, invoiceDataInput)).toMatchObject({
            values: { customerId: null }
        });
    });

    it("refuses an invoice with a bad id, date, type or number", () => {
        const draft = {
            id: 7,
            number: "42",
            customerId: 5,
            invoiceDate: "2026-10-21",
            paymentType: "transfer",
            invoiceType: "invoice"
        };

        for (const change of [
            { id: undefined },
            { id: "7;DROP TABLE invoices" },
            { invoiceDate: "tomorrow" },
            { invoiceDate: undefined },
            { paymentType: "gold" },
            { invoiceType: undefined },
            { number: "" },
            { number: "x".repeat(26) },
            { number: ["42"] },
            { customerId: [5] }
        ]) {
            expect(
                parseInput({ ...draft, ...change }, invoiceDataInput).ok,
                JSON.stringify(change)
            ).toBe(false);
        }
    });

    it("takes a line: a product, a quantity and maybe a worksheet", () => {
        expect(
            parseInput({ productId: "3", quantity: "2,5", worksheetId: "11" }, lineInput)
        ).toEqual({
            ok: true,
            values: { productId: 3, quantity: 2.5, worksheetId: 11 }
        });
        expect(parseInput({ productId: 3, quantity: 0 }, lineInput)).toEqual({
            ok: true,
            values: { productId: 3, quantity: 0, worksheetId: null }
        });
        expect(parseInput({ productId: 3, quantity: 1, worksheetId: 0 }, lineInput)).toMatchObject({
            values: { worksheetId: 0 }
        });

        for (const line of [
            { quantity: 1 },
            { productId: [3], quantity: 1 },
            { productId: 3 },
            { productId: 3, quantity: "lots" },
            { productId: 3, quantity: [1] },
            { productId: 3, quantity: 1, worksheetId: {} }
        ]) {
            expect(parseInput(line, lineInput).ok, JSON.stringify(line)).toBe(false);
        }
    });

    it("takes the new quantity of a line", () => {
        expect(parseInput({ value: "4.25" }, quantityInput)).toEqual({
            ok: true,
            values: { value: 4.25 }
        });
        expect(parseInput({ value: "" }, quantityInput)).toEqual({
            ok: true,
            values: { value: 0 }
        });
        expect(parseInput({ value: "x" }, quantityInput).ok).toBe(false);
        expect(parseInput({ value: [4] }, quantityInput).ok).toBe(false);
    });
});
