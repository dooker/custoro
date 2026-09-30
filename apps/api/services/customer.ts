import { postGeneralSingle, putGeneralSingle } from "./_helpers";
import { query } from "../helper/query";
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
    additionalInfo,
    shippingInfo,
    id,
    www,
    paymentPeriod,
    department
}: CustomerIF) => [
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
    department,
    id
];

export const postSingle = async (request: Request) => {
    const { body: params, database } = request;
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

    return await postGeneralSingle({ database, sql, params: buildParams(params), logger: type });
};

export const putSingle = async (request: Request) => {
    const { body: params, database } = request;
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

    return await putGeneralSingle({ database, sql, params: buildParams(params), logger: type });
};

export const deleteSingle = async (request: Request) => {
    const {
        params: { id },
        database
    } = request;

    const { success } = await query({
        database,
        sql: `DELETE
              FROM customers
              WHERE id = ?;`,
        params: [id as string],
        logger: `Delete single ${type}`
    });

    return {
        success
    };
};
