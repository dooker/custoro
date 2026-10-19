import { sanitize } from "../helper";
import { config } from "../config/config";
import { GetterIF } from "../types/getter";

interface KeywordWhereIF {
    keyword?: string | null;
    table: string;
    customer?: boolean;
    prefix?: "WHERE" | "AND";
}

const positiveInteger = (value: unknown) => {
    const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";

    return /^\d{1,9}$/.test(text) && Number(text) > 0 ? Number(text) : undefined;
};

// NaN is what Number(undefined) gives, so a caller that converted a missing value counts as missing
const isGiven = (value: unknown) =>
    value !== undefined && value !== null && value !== "" && !Number.isNaN(value);

/**
 * The page and page size a list request asks for, as numbers that are safe to put in SQL.
 * page and limit are positive whole numbers, anything else counts as missing (page 1, the
 * default size), and the size never goes over config.maxItemsPerPage. A request with neither
 * gets the first config.maxListRows rows, which is what the web app's pickers rely on.
 */
export const getPaging = (rawPage: unknown, rawLimit: unknown) => {
    if (!isGiven(rawPage) && !isGiven(rawLimit)) {
        return { page: 1, limit: config.maxListRows };
    }

    return {
        page: positiveInteger(rawPage) ?? 1,
        limit: Math.min(positiveInteger(rawLimit) ?? config.itemsPerPage, config.maxItemsPerPage)
    };
};

// Adds the LIMIT of an already checked page (see getPaging)
export const applyPaging = (sql: string, { page, limit }: { page: number; limit: number }) =>
    `${sql}
            LIMIT ${(page - 1) * limit}, ${limit}
        `;

export const getFromTo = (sql: string, page: unknown, limit: unknown) =>
    applyPaging(sql, getPaging(page, limit));

// The keyword comes URL-encoded from older callers; a stray "%" (as in "50%") is not an encoding
const decodeKeyword = (keyword: string) => {
    try {
        return decodeURIComponent(keyword);
    } catch {
        return keyword;
    }
};

// A search word is text, so LIKE's own wildcards in it are escaped
const likePattern = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;

/**
 * The WHERE part for a keyword search: every word has to match, and a word matches when any of
 * the table's search columns contains it ("foo bar" finds rows that have foo and bar, each
 * somewhere in the searched columns). `prefix` is "AND" to add the condition to a WHERE that
 * already exists.
 */
export const keywordWhere = ({ keyword, table, customer, prefix = "WHERE" }: KeywordWhereIF) => {
    const groups: string[] = [];
    const params: string[] = [];

    for (const word of decodeKeyword(keyword ?? "").split(" ")) {
        if (!word) {
            continue;
        }

        const pattern = likePattern(word);

        if (table === "products") {
            groups.push(`(${table}.code LIKE ? OR ${table}.name LIKE ?)`);
            params.push(pattern, pattern);
        } else if (table === "invoices") {
            if (customer) {
                groups.push(`(products.name LIKE ?)`);
                params.push(pattern);
            } else {
                groups.push(`(customers.name LIKE ? OR invoices.number LIKE ?)`);
                params.push(pattern, pattern);
            }
        } else if (table === "worksheets") {
            if (customer) {
                groups.push(`(products.name LIKE ? OR products.code LIKE ?)`);
                params.push(pattern, pattern);
            } else {
                groups.push(`(customers.name LIKE ?)`);
                params.push(pattern);
            }
        } else if (table === "users") {
            groups.push(`(${table}.username LIKE ? OR ${table}.name LIKE ?)`);
            params.push(pattern, pattern);
        } else {
            groups.push(`(${table}.name LIKE ? OR ${table}.contact LIKE ?)`);
            params.push(pattern, pattern);
        }
    }

    if (!groups.length) {
        return {
            sql: "",
            params: []
        };
    }

    return {
        sql: `${prefix} ${groups.join(" AND ")}`,
        params
    };
};

export const getCustomers = ({ keyword, order, direction }: GetterIF) => {
    const sql = [];
    const totalSql = [];
    const params = [];

    let currentOrder;
    const allowedOrderFields = [
        "id",
        "name",
        "contact",
        "reg_number",
        "vat_number",
        "phone",
        "address",
        "email"
    ];
    const currentDirection = direction === "DESC" ? "DESC" : "ASC";

    if (order && allowedOrderFields.includes(order)) {
        currentOrder = sanitize(order);
    }

    sql.push(`
        SELECT id,
               name,
               contact,
               reg_number,
               vat_number as vatNumber,
               phone,
               address,
               email
        FROM customers`);

    totalSql.push(`
        SELECT COUNT(id) AS total
        FROM customers`);

    if (keyword) {
        const { sql: keywordSql, params: keywordParams } = keywordWhere({
            keyword,
            table: "customers"
        });

        sql.push(keywordSql);
        totalSql.push(keywordSql);
        params.push(...keywordParams);
    }

    sql.push(`
        ORDER BY ${currentOrder ? `${currentOrder}` : "name"} ${currentDirection}`);

    return {
        sql: sql.join(" "),
        totalSql: totalSql.join(" "),
        params
    };
};

export const getProducts = ({ keyword, order, direction }: GetterIF) => {
    const sql = [];
    const totalSql = [];
    const params = [];

    let currentOrder;
    const allowedOrderFields = ["id", "code", "name", "price", "discount_price", "unit"];
    const currentDirection = direction === "DESC" ? "DESC" : "ASC";

    if (order && allowedOrderFields.includes(order)) {
        currentOrder = sanitize(order);
    }

    sql.push(`
        SELECT id,
               code,
               name,
               price,
               discount_price as discountPrice,
               unit,
               comment
        FROM products`);

    totalSql.push(`
        SELECT COUNT(id) AS total
        FROM products`);

    if (keyword) {
        const { sql: keywordSql, params: keywordParams } = keywordWhere({
            keyword,
            table: "products"
        });

        sql.push(keywordSql);
        totalSql.push(keywordSql);
        params.push(...keywordParams);
    }

    sql.push(`
        ORDER BY ${currentOrder ? `${currentOrder}` : "code"} ${currentDirection}`);

    return {
        sql: sql.join(" "),
        totalSql: totalSql.join(" "),
        params
    };
};

export const getWorksheets = ({ keyword = null, customerId }: GetterIF) => {
    const sql = [];
    const totalSql = [];
    const params = [];

    if (customerId) {
        sql.push(`
            SELECT worksheets.quantity,
                   worksheets.id,
                   products.code,
                   products.name,
                   products.price,
                   products.discount_price AS discountPrice,
                   products.id             AS product_id,
                   worksheets.invoice
            FROM worksheets
                     LEFT JOIN products ON worksheets.product_id = products.id
        `);

        totalSql.push(`
            SELECT COUNT(worksheets.id) AS total
            FROM worksheets
                     LEFT JOIN products ON worksheets.product_id = products.id
        `);

        if (keyword) {
            const { sql: keywordSql, params: keywordParams } = keywordWhere({
                keyword,
                table: "worksheets",
                customer: true
            });

            sql.push(keywordSql);
            totalSql.push(keywordSql);
            params.push(...keywordParams);

            sql.push(`AND`);
            totalSql.push(`AND`);
        } else {
            sql.push(`WHERE`);
            totalSql.push(`WHERE`);
        }

        sql.push(`
            worksheets.customer_id = ?
                ORDER BY worksheets.id DESC
        `);
        totalSql.push(`
            worksheets.customer_id = ?
                AND worksheets.locked!="1"
        `);
        params.push(customerId);
    } else {
        sql.push(`
            SELECT customers.name,
                   customers.id,
                   COUNT(worksheets.id) AS worksheet_count
            FROM worksheets
                     LEFT JOIN customers ON worksheets.customer_id = customers.id
        `);

        totalSql.push(`
            SELECT COUNT(DISTINCT customers.name) AS total
            FROM worksheets
                     LEFT JOIN customers ON worksheets.customer_id = customers.id
        `);

        if (keyword) {
            const { sql: keywordSql, params: keywordParams } = keywordWhere({
                keyword,
                table: "worksheets"
            });

            sql.push(keywordSql);
            totalSql.push(keywordSql);
            params.push(...keywordParams);
        }

        sql.push(`
            GROUP BY customers.name, customers.id
            ORDER BY MAX(worksheets.id) DESC
        `);
    }

    return {
        sql: sql.join(" "),
        totalSql: totalSql.join(" "),
        params
    };
};

export const getInvoices = ({ keyword = null, customerId }: GetterIF) => {
    const params: (string | number)[] = [];
    const where: string[] = [];

    if (customerId) {
        where.push(`WHERE invoices.customer_id = ?`);
        params.push(customerId);
    }

    if (keyword) {
        const { sql: keywordSql, params: keywordParams } = keywordWhere({
            keyword,
            table: "invoices",
            prefix: customerId ? "AND" : "WHERE"
        });

        where.push(keywordSql);
        params.push(...keywordParams);
    }

    // The page and the total are filtered the same way and take the same params. Newest number
    // first: number_sort is the number as a number (see the migration), with the id as tie-break,
    // so the order is the same on every request and an index serves it. The line count is a
    // subquery, evaluated for the rows of the page only, instead of a join that groups every invoice.
    const conditions = where.join(" ");
    const from = `
        FROM invoices
                 LEFT JOIN customers ON invoices.customer_id = customers.id
        ${conditions}`;

    return {
        sql: `
        SELECT customers.name,
               invoices.number,
               invoices.id,
               invoices.locked,
               (SELECT COUNT(*)
                FROM invoice_items
                WHERE invoice_items.invoice_id = invoices.id) AS total
        ${from}
        ORDER BY invoices.number_sort DESC, invoices.id DESC`,
        // Customers are only needed to count when the keyword searches their names
        totalSql: `
        SELECT COUNT(invoices.id) AS total
        FROM invoices
                 ${keyword ? "LEFT JOIN customers ON invoices.customer_id = customers.id" : ""}
        ${conditions}`,
        params
    };
};

export const getUsers = ({ keyword, order, direction }: GetterIF) => {
    const sql = [];
    const totalSql = [];
    const params = [];

    let currentOrder;
    const allowedOrderFields = ["id", "username", "name", "discount", "offer", "role"];
    const currentDirection = direction === "DESC" ? "DESC" : "ASC";

    if (order && allowedOrderFields.includes(order)) {
        currentOrder = sanitize(order);
    }

    sql.push(`
        SELECT id,
               username,
               name,
               timestamp,
               discount,
               offer,
               avatar,
               role
        FROM users`);

    totalSql.push(`
        SELECT COUNT(id) AS total
        FROM users`);

    if (keyword) {
        const { sql: keywordSql, params: keywordParams } = keywordWhere({
            keyword,
            table: "users"
        });

        sql.push(keywordSql);
        totalSql.push(keywordSql);
        params.push(...keywordParams);
    }

    sql.push(`
        ORDER BY ${currentOrder ? `${currentOrder}` : "id"} ${currentDirection}`);

    return {
        sql: sql.join(" "),
        totalSql: totalSql.join(" "),
        params
    };
};
