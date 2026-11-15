import { sanitize } from "../helper";
import { config } from "../config/config";
import { GetterIF } from "../types/getter";

export type SearchTable = "customers" | "products" | "users" | "invoices" | "worksheets";

interface KeywordWhereIF {
    keyword?: string | null;
    table: SearchTable;
    customer?: boolean;
    prefix?: "WHERE" | "AND";
}

const positiveInteger = (value: unknown) => {
    const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";

    return /^\d{1,9}$/.test(text) && Number(text) > 0 ? Number(text) : undefined;
};

/**
 * The page and page size a list request asks for, as numbers that are safe to put in SQL.
 * page and limit are positive whole numbers, anything else counts as missing (page 1, the
 * default size), and the size never goes over config.maxItemsPerPage. A request with neither gets
 * the first page: no list answers with a whole table (the web app's pickers search instead).
 */
export const getPaging = (rawPage: unknown, rawLimit: unknown) => ({
    page: positiveInteger(rawPage) ?? 1,
    limit: Math.min(positiveInteger(rawLimit) ?? config.itemsPerPage, config.maxItemsPerPage)
});

// Where a statement wants its paging LIMIT instead of at the end: a getter that pages inside a
// derived table (it picks the rows of the page first and joins the rest after) puts this comment
// there, and applyPaging replaces it. The comment keeps the statement valid without paging.
export const limitMarker = "/* LIMIT */";

// Adds the LIMIT of an already checked page (see getPaging)
export const applyPaging = (sql: string, { page, limit }: { page: number; limit: number }) => {
    const limitSql = `LIMIT ${(page - 1) * limit}, ${limit}`;

    return sql.includes(limitMarker)
        ? sql.replace(limitMarker, limitSql)
        : `${sql}
            ${limitSql}
        `;
};

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

// The words a search uses: the first config.maxKeywordWords non-empty ones, each cut to
// config.maxKeywordLength characters (whole characters, so a cut never splits an emoji)
export const keywordWords = (keyword: string) => {
    const words: string[] = [];

    for (const word of keyword.split(" ")) {
        if (!word) {
            continue;
        }

        words.push(Array.from(word).slice(0, config.maxKeywordLength).join(""));

        if (words.length === config.maxKeywordWords) {
            break;
        }
    }

    return words;
};

/**
 * The WHERE part for a keyword search: every word has to match, and a word matches when any of
 * the table's search columns contains it ("foo bar" finds rows that have foo and bar, each
 * somewhere in the searched columns). Only the first words count (see keywordWords), so a
 * search cannot be made arbitrarily expensive. `prefix` is "AND" to add the condition to a
 * WHERE that already exists.
 */
export const keywordWhere = ({ keyword, table, customer, prefix = "WHERE" }: KeywordWhereIF) => {
    const groups: string[] = [];
    const params: string[] = [];

    for (const word of keywordWords(decodeKeyword(keyword ?? ""))) {
        const pattern = likePattern(word);

        if (table === "products") {
            groups.push(`(${table}.code LIKE ? OR ${table}.name LIKE ?)`);
            params.push(pattern, pattern);
        } else if (table === "invoices") {
            if (customer) {
                groups.push(`(products.name LIKE ?)`);
                params.push(pattern);
            } else {
                // A paid invoice is also found by the name it was billed to
                groups.push(
                    `(customers.name LIKE ? OR invoices.customer_name LIKE ? OR invoices.number LIKE ?)`
                );
                params.push(pattern, pattern, pattern);
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

export const getCustomers = ({ tenantId, keyword, order, direction }: GetterIF) => {
    const sql = [];
    const totalSql = [];
    const params: (string | number)[] = [tenantId];

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
        FROM customers
        WHERE customers.tenant_id = ?`);

    totalSql.push(`
        SELECT COUNT(id) AS total
        FROM customers
        WHERE customers.tenant_id = ?`);

    if (keyword) {
        const { sql: keywordSql, params: keywordParams } = keywordWhere({
            keyword,
            table: "customers",
            prefix: "AND"
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

export const getProducts = ({ tenantId, keyword, order, direction }: GetterIF) => {
    const sql = [];
    const totalSql = [];
    const params: (string | number)[] = [tenantId];

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
        FROM products
        WHERE products.tenant_id = ?`);

    totalSql.push(`
        SELECT COUNT(id) AS total
        FROM products
        WHERE products.tenant_id = ?`);

    if (keyword) {
        const { sql: keywordSql, params: keywordParams } = keywordWhere({
            keyword,
            table: "products",
            prefix: "AND"
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

export const getWorksheets = ({ tenantId, keyword = null, customerId }: GetterIF) => {
    const sql = [];
    const totalSql = [];
    const params: (string | number)[] = [tenantId];

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
            WHERE worksheets.tenant_id = ?
        `);

        totalSql.push(`
            SELECT COUNT(worksheets.id) AS total
            FROM worksheets
                     LEFT JOIN products ON worksheets.product_id = products.id
            WHERE worksheets.tenant_id = ?
        `);

        if (keyword) {
            const { sql: keywordSql, params: keywordParams } = keywordWhere({
                keyword,
                table: "worksheets",
                customer: true,
                prefix: "AND"
            });

            sql.push(keywordSql);
            totalSql.push(keywordSql);
            params.push(...keywordParams);
        }

        sql.push(`
            AND worksheets.customer_id = ?
                ORDER BY worksheets.id DESC
        `);
        totalSql.push(`
            AND worksheets.customer_id = ?
                AND worksheets.locked!="1"
        `);
        params.push(customerId as number);
    } else if (keyword) {
        // The words are looked for in the customers' names, so the customers are joined before
        // the worksheets are grouped
        const { sql: keywordSql, params: keywordParams } = keywordWhere({
            keyword,
            table: "worksheets",
            prefix: "AND"
        });

        sql.push(`
            SELECT customers.name,
                   customers.id,
                   COUNT(worksheets.id) AS worksheet_count
            FROM worksheets
                     LEFT JOIN customers ON worksheets.customer_id = customers.id
            WHERE worksheets.tenant_id = ?
            ${keywordSql}
            GROUP BY customers.name, customers.id
            ORDER BY MAX(worksheets.id) DESC
        `);

        totalSql.push(`
            SELECT COUNT(DISTINCT worksheets.customer_id) AS total
            FROM worksheets
                     LEFT JOIN customers ON worksheets.customer_id = customers.id
            WHERE worksheets.tenant_id = ?
            ${keywordSql}
        `);
        params.push(...keywordParams);
    } else {
        // The customers with worksheets, the newest worksheet first. The grouping is done on the
        // covering index (customer_id, id) alone and the page's customers are looked up after,
        // instead of joining all 100 000 worksheets to their customers first: 55 ms became 11 ms.
        // The paging LIMIT goes inside, where the rows are picked (see limitMarker).
        sql.push(`
            SELECT customers.name,
                   customers.id,
                   g.worksheet_count
            FROM (SELECT customer_id,
                         COUNT(*)  AS worksheet_count,
                         MAX(id)   AS last_id
                  FROM worksheets
                  WHERE tenant_id = ?
                  GROUP BY customer_id
                  ORDER BY last_id DESC
                  ${limitMarker}) g
                     JOIN customers ON customers.id = g.customer_id
            ORDER BY g.last_id DESC
        `);

        // One row per customer, so this counts the rows of the list (it counted distinct names,
        // which is fewer when two customers have the same name). Grouped by the index's first two
        // columns so MySQL reads it with a loose index scan (one entry per customer): COUNT(DISTINCT
        // customer_id) with the company filter read every worksheet of the company instead (50 000
        // invoices: 42.6 ms; before companies, without the filter, 0.75 ms)
        totalSql.push(`
            SELECT COUNT(*) AS total
            FROM (SELECT tenant_id, customer_id
                  FROM worksheets
                  WHERE tenant_id = ?
                  GROUP BY tenant_id, customer_id) c
        `);
    }

    return {
        sql: sql.join(" "),
        totalSql: totalSql.join(" "),
        params
    };
};

export const getInvoices = ({ tenantId, keyword = null, customerId }: GetterIF) => {
    const params: (string | number)[] = [tenantId];
    // What follows the company condition, each part starting with AND
    const where: string[] = [];

    if (customerId) {
        where.push(`AND invoices.customer_id = ?`);
        params.push(customerId);
    }

    if (keyword) {
        const { sql: keywordSql, params: keywordParams } = keywordWhere({
            keyword,
            table: "invoices",
            prefix: "AND"
        });

        where.push(keywordSql);
        params.push(...keywordParams);
    }

    // The page and the total are filtered the same way and take the same params: the company
    // first, written into every statement. Newest number first: number_sort is the number as a
    // number (see the migration), with the id as tie-break, so the order is the same on every
    // request and an index (tenant_id, number_sort) serves it. The line count is a subquery,
    // evaluated for the rows of the page only, instead of a join that groups every invoice; it
    // uses the index (tenant_id, invoice_id).
    const conditions = where.join(" ");
    const lineCount = `(SELECT COUNT(*)
                FROM invoice_items
                WHERE invoice_items.tenant_id = invoices.tenant_id
                  AND invoice_items.invoice_id = invoices.id) AS total`;

    // Customers are only needed to count when the keyword searches their names
    const totalSql = `
        SELECT COUNT(invoices.id) AS total
        FROM invoices
                 ${keyword ? "LEFT JOIN customers ON customers.tenant_id = invoices.tenant_id AND customers.id = invoices.customer_id" : ""}
        WHERE invoices.tenant_id = ?
        ${conditions}`;

    if (keyword) {
        // The keyword is looked for in the customers' names too, so the customers are joined
        // before the rows are cut to a page
        return {
            sql: `
        SELECT IF(invoices.locked = 1, invoices.customer_name, customers.name) AS name,
               invoices.number,
               invoices.id,
               invoices.locked,
               ${lineCount}
        FROM invoices
                 LEFT JOIN customers ON customers.tenant_id = invoices.tenant_id
                     AND customers.id = invoices.customer_id
        WHERE invoices.tenant_id = ?
        ${conditions}
        ORDER BY invoices.number_sort DESC, invoices.id DESC`,
            totalSql,
            params
        };
    }

    // Without a keyword the page is picked first, from the index alone (tenant_id, number_sort and
    // the id), and only its rows are joined to the invoices and customers and get their line
    // count: the cost no longer grows with the page number (page 1350 of 50 000 invoices: 33 ms
    // became 3.3 ms, page 1: 1 ms became 0.07 ms). The paging LIMIT goes inside, where the rows
    // are picked (see limitMarker).
    return {
        sql: `
        SELECT IF(invoices.locked = 1, invoices.customer_name, customers.name) AS name,
               invoices.number,
               invoices.id,
               invoices.locked,
               ${lineCount}
        FROM (SELECT id, number_sort
              FROM invoices
              WHERE tenant_id = ?
              ${conditions}
              ORDER BY number_sort DESC, id DESC
              ${limitMarker}) p
                 JOIN invoices ON invoices.id = p.id
                 LEFT JOIN customers ON customers.tenant_id = invoices.tenant_id
                     AND customers.id = invoices.customer_id
        ORDER BY p.number_sort DESC, p.id DESC`,
        totalSql,
        params
    };
};

export const getUsers = ({ tenantId, keyword, order, direction }: GetterIF) => {
    const sql = [];
    const totalSql = [];
    const params: (string | number)[] = [tenantId];

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
        FROM users
        WHERE users.tenant_id = ?`);

    totalSql.push(`
        SELECT COUNT(id) AS total
        FROM users
        WHERE users.tenant_id = ?`);

    if (keyword) {
        const { sql: keywordSql, params: keywordParams } = keywordWhere({
            keyword,
            table: "users",
            prefix: "AND"
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
