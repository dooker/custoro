import { describe, expect, it } from "vitest";
import { billedCustomer, printsBilledCustomer } from "./billedCustomer";
import type { InvoiceIF } from "../types/invoice";

const invoice = (parts: Partial<InvoiceIF>) =>
    ({ id: 7, customerId: 5, locked: 1, paymentPeriod: 14, ...parts }) as InvoiceIF;

describe("printsBilledCustomer", () => {
    it("is true for a paid invoice with a customer only", () => {
        expect(printsBilledCustomer(invoice({}))).toBe(true);
        expect(printsBilledCustomer(invoice({ locked: 0 }))).toBe(false);
        expect(printsBilledCustomer(invoice({ customerId: null as unknown as number }))).toBe(
            false
        );
    });
});

describe("billedCustomer", () => {
    it("is the copy the invoice keeps", () => {
        expect(
            billedCustomer(
                invoice({
                    customerName: "Acme",
                    customerRegNumber: "123",
                    customerVatNumber: "EE123",
                    customerAddress: "Old street 1",
                    customerPhone: "555",
                    customerEmail: "billing@acme.example",
                    customerDepartment: "Accounts",
                    customerPaymentPeriod: 30
                })
            )
        ).toMatchObject({
            id: 5,
            name: "Acme",
            regNumber: "123",
            vatNumber: "EE123",
            address: "Old street 1",
            phone: "555",
            email: "billing@acme.example",
            department: "Accounts",
            paymentPeriod: 30
        });
    });

    it("prints a field the customer did not have as empty, never as null", () => {
        const customer = billedCustomer(
            invoice({ customerName: null, customerPaymentPeriod: null })
        );

        expect(customer.name).toBe("");
        expect(customer.vatNumber).toBe("");
        // without a copied period, the invoice's own
        expect(customer.paymentPeriod).toBe(14);
    });
});
