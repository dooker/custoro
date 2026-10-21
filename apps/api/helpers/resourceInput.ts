import { dateText, decimal, oneOf, rowId, text, whole } from "./bodyInput";

// The body of each write route, as a schema for parseInput (see helpers/bodyInput.ts). The text
// limits are the sizes of the columns in db/01-schema.sql, so a value that does not fit is
// refused with a message instead of a database error. A column that can be NULL gets null when
// the field is missing; one that cannot gets the empty text, or the column's default.

export const productUnits = ["pc", "set", "hour", "m", "km"] as const;
export const userRoles = ["user", "admin"] as const;
export const paymentTypes = ["cash", "transfer"] as const;
export const invoiceTypes = ["offer", "invoice"] as const;

// Prices are DECIMAL(12,4): 8 digits before the point, 4 after it. Quantities are DECIMAL(12,3).
const priceColumn = { maxAbs: 1e8, scale: 4 };
const quantityColumn = { maxAbs: 1e9, scale: 3 };

export const customerInput = {
    name: text(150, { empty: null }),
    contact: text(100, { empty: null }),
    regNumber: text(150, { empty: null }),
    vatNumber: text(50, { empty: null }),
    phone: text(45, { empty: null }),
    phone2: text(20),
    address: text(250, { empty: null }),
    email: text(254, { empty: null }),
    invoiceEmail: text(254),
    www: text(255),
    paymentPeriod: whole({ max: 3650, empty: 14 }),
    additionalInfo: text(750, { empty: null }),
    shippingInfo: text(250, { empty: null }),
    department: text(250)
};

export const productInput = {
    code: text(45, { required: true }),
    name: text(250, { required: true }),
    price: decimal(priceColumn),
    discountPrice: decimal(priceColumn),
    unit: oneOf(productUnits, { empty: "pc" }),
    comment: text(500)
};

const worksheetFields = {
    product_id: rowId({ required: true }),
    order_id: whole({ empty: 0 }),
    quantity: decimal(quantityColumn)
};

// The web app names the customer "customer" when it adds a worksheet and "customer_id" when it
// changes one (the name of the column)
export const newWorksheetInput = { customer: rowId({ required: true }), ...worksheetFields };
export const worksheetInput = { customer_id: rowId({ required: true }), ...worksheetFields };

export const userInput = {
    name: text(100, { empty: null }),
    username: text(254, { required: true, notBlank: true }),
    discount: whole({ min: -128, max: 127 }),
    offer: whole({ min: -128, max: 127 }),
    role: oneOf(userRoles, { required: true })
};

// The invoice a request creates: its lines are checked on their own (see lineInput)
export const newInvoiceInput = { customerId: rowId() };

// The invoice a line is added to
export const addLineInput = { invoiceId: rowId({ required: true }) };

export const invoiceDataInput = {
    id: rowId({ required: true }),
    customerId: rowId(),
    invoiceDate: dateText({ required: true }),
    paymentType: oneOf(paymentTypes, { required: true }),
    invoiceType: oneOf(invoiceTypes, { required: true }),
    number: text(25, { required: true, notBlank: true })
};

// A line the web app adds to an invoice; a worksheet is only there when the line comes from one
// (0 means none, like null)
export const lineInput = {
    productId: rowId({ required: true }),
    quantity: decimal({ ...quantityColumn, required: true }),
    worksheetId: whole({ empty: null })
};

// The new quantity of a line
export const quantityInput = { value: decimal(quantityColumn) };

export const maxInvoiceLines = 500;
