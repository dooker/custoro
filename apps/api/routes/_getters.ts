import { sanitize } from "../helper";
import { GetterIF } from "../types/getter";

interface KeywordWhereIF {
    keyword: string;
    table: string;
    customer?: boolean;
}

export const getFromTo = (sql: string, page: number, itemsPerPage: number) => {
    const offset = (page - 1) * itemsPerPage;

    if (page) {
        sql =
            sql +
            `
            LIMIT ${offset}, ${itemsPerPage}
        `;
    }

    return sql;
};

export const keywordWhere = ({ keyword, table, customer }: KeywordWhereIF) => {
    if (!keyword) {
        return {
            sql: "",
            params: []
        };
    }

    const sql = ["WHERE"];
    const likes: string[] = [];
    const params: string[] = [];
    let flag = false;

    decodeURIComponent(keyword)
        .split(" ")
        .forEach((value) => {
            if (!value) {
                return;
            }

            if (flag) {
                likes.push(`AND`);
            }

            flag = true;

            if (table === "products") {
                likes.push(`${table}.code LIKE ? OR ${table}.name LIKE ?`);
                params.push(`%${value}%`, `%${value}%`);
            } else if (table === "invoices") {
                if (customer) {
                    likes.push(`products.name LIKE ?`);
                    params.push(`%${value}%`);
                } else {
                    likes.push(`customers.name LIKE ? OR invoices.number LIKE ?`);
                    params.push(`%${value}%`, `%${value}%`);
                }
            } else if (table === "worksheets") {
                if (customer) {
                    likes.push(`(products.name LIKE ? OR products.code LIKE ?)`);
                    params.push(`%${value}%`, `%${value}%`);
                } else {
                    likes.push(`customers.name LIKE ?`);
                    params.push(`%${value}%`);
                }
            } else if (table === "users") {
                likes.push(`${table}.username LIKE ? OR ${table}.name LIKE ?`);
                params.push(`%${value}%`, `%${value}%`);
            } else {
                likes.push(`${table}.name LIKE ? OR ${table}.contact LIKE ?`);
                params.push(`%${value}%`, `%${value}%`);
            }
        });

    sql.push(likes.join(" "));

    return {
        sql: sql.join(" "),
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
    const sql = [];
    const totalSql = [];
    const params = [];

    sql.push(`
        SELECT customers.name,
               invoices.number,
               invoices.id,
               invoices.locked,
               COUNT(invoice_items.id) AS total
        FROM invoices
                 LEFT JOIN customers ON invoices.customer_id = customers.id
                 LEFT JOIN invoice_items ON invoices.id = invoice_items.invoice_id
    `);

    if (customerId) {
        sql.push(`
                WHERE invoices.customer_id = ?
            `);
        params.push(customerId);
    }

    totalSql.push(`
        SELECT COUNT(invoices.id) AS total
        FROM invoices
                 LEFT JOIN customers ON invoices.customer_id = customers.id
    `);

    if (keyword) {
        const { sql: keywordSql, params: keywordParams } = keywordWhere({
            keyword,
            table: "invoices"
        });

        sql.push(keywordSql);
        totalSql.push(keywordSql);
        params.push(...keywordParams);
    }

    sql.push(`
            GROUP BY invoices.id, customers.name, invoices.number
            ORDER BY invoices.number + 0 DESC
        `);

    return {
        sql: sql.join(" "),
        totalSql: totalSql.join(" "),
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
