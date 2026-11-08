// The customer a paid invoice is addressed to, without the database, so it can be unit tested.
// A paid (locked) invoice keeps a copy of its customer's details from when it was marked as paid
// (see markAsPaid), and its PDF prints that copy, not the customer as it is now.
import type { CustomerIF } from "../types/customer";
import type { InvoiceIF } from "../types/invoice";

/** Whether the invoice prints its own copy of the customer instead of the customer's row. */
export const printsBilledCustomer = (invoice: Pick<InvoiceIF, "locked" | "customerId">) =>
    Number(invoice.locked) === 1 && invoice.customerId != null;

/** The copy as a customer, with what the copy does not hold left empty. */
export const billedCustomer = (invoice: InvoiceIF): CustomerIF => ({
    id: invoice.customerId,
    name: invoice.customerName ?? "",
    contact: "",
    regNumber: invoice.customerRegNumber ?? "",
    vatNumber: invoice.customerVatNumber ?? "",
    phone: invoice.customerPhone ?? "",
    phone2: "",
    address: invoice.customerAddress ?? "",
    email: invoice.customerEmail ?? "",
    invoiceEmail: "",
    www: "",
    additionalInfo: "",
    shippingInfo: "",
    // The due date counts from the period the customer had when the invoice was paid
    paymentPeriod: invoice.customerPaymentPeriod ?? invoice.paymentPeriod ?? 14,
    department: invoice.customerDepartment ?? ""
});
