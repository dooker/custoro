import { postGeneralSingle, putGeneralSingle } from "./_helpers";
import { query } from "../helper/query";
import { parseInput, type InputValues } from "../helpers/bodyInput";
import { customerInput } from "../helpers/resourceInput";
import type { CustomerIF } from "../types/customer";
import type { QueryResult } from "../types/query";
import type { Request } from "express";

const type = "customer";

export const getSingle = async (
    request: Request,
    invoiceCustomerId?: number
): Promise<QueryResult<CustomerIF>> => {
    const {
        database,
        params: { id }
    } = request;

    const { success, data } = await query<CustomerIF>({
        database,
        sql: `SELECT id,
                     name,
                     contact,
                     reg_number AS regNumber,
                     vat_number    AS vatNumber,
                     phone,
                     phone2,
                     address,
                     email,
                     invoice_email as invoiceEmail,
                     additional_info as additionalInfo,
                     shipping_info AS shippingInfo,
                     www,
                     payment_period as paymentPeriod,
                     department
              FROM customers
              WHERE id = ?;`,
        params: [invoiceCustomerId || (id as string)],
        logger: type
    });

    if (!success) {
        return {
            success: false,
            message: "get.customer"
        };
    }

    return {
        success: true,
        data
    };
};

// The values of a checked body (see customerInput), in the order of the SET lists below
const buildParams = ({
    name,
    contact,
    regNumber,
    vatNumber,
    phone,
    phone2,
    address,
    email,
    invoiceEmail,
    www,
    paymentPeriod,
    additionalInfo,
    shippingInfo,
    department
}: InputValues<typeof customerInput>) => [
    name,
    contact,
    regNumber,
    vatNumber,
    phone,
    phone2,
    address,
    email,
    invoiceEmail,
    www,
    paymentPeriod,
    additionalInfo,
    shippingInfo,
    department
];

export const postSingle = async (request: Request) => {
    const { body, database } = request;
    const input = parseInput(body, customerInput);

    if (!input.ok) {
        return { success: false, message: input.message };
    }

    const sql = `
        INSERT INTO customers
        SET name            = ?,
            contact         = ?,
            reg_number       = ?,
            vat_number      = ?,
            phone           = ?,
            phone2          = ?,
            address         = ?,
            email           = ?,
            invoice_email   = ?,
            www             = ?,
            payment_period  = ?,
            additional_info = ?,
            shipping_info   = ?,
            department      = ?;
    `;

    return await postGeneralSingle({
        database,
        sql,
        params: buildParams(input.values),
        logger: type
    });
};

export const putSingle = async (request: Request) => {
    const {
        body,
        params: { id },
        database
    } = request;
    const input = parseInput(body, customerInput);

    if (!input.ok) {
        return { success: false, message: input.message };
    }

    const sql = `
        UPDATE customers
        SET name            = ?,
            contact         = ?,
            reg_number       = ?,
            vat_number      = ?,
            phone           = ?,
            phone2          = ?,
            address         = ?,
            email           = ?,
            invoice_email   = ?,
            www             = ?,
            payment_period  = ?,
            additional_info = ?,
            shipping_info   = ?,
            department      = ?
        WHERE id = ?;
    `;

    // The customer is the one in the URL, not whatever id the body says
    return await putGeneralSingle({
        database,
        sql,
        params: [...buildParams(input.values), Number(id)],
        logger: type
    });
};

export const deleteSingle = async (request: Request) => {
    const {
        params: { id },
        database
    } = request;

    const { success, code } = await query({
        database,
        sql: `DELETE
              FROM customers
              WHERE id = ?;`,
        params: [id as string],
        logger: `Delete single ${type}`
    });

    // Invoices and worksheets of the customer are kept, so the foreign keys refuse the delete
    if (!success && code === "ER_ROW_IS_REFERENCED_2") {
        return {
            success: false,
            message: "customer.inUse"
        };
    }

    return {
        success
    };
};
