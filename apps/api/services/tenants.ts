// The owner page (docs/multi-tenant.md): the owner of the install lists, creates, renames,
// deactivates and reactivates the companies. It shows counts, never another company's customers or
// invoices. The routes are behind requireOwner; the command line (scripts/createTenant.ts,
// scripts/setOwner.ts) uses the same functions.
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { query } from "../helper/query";
import { applyPaging, getPaging, keywordOf, keywordWhere } from "../routes/_getters";
import { TransactionRefusal, withTransaction } from "../helper/transaction";
import { companySeed } from "../helpers/companySeed";
import { isValidEmail } from "../helpers/credentials";

export interface TenantRow {
    id: number;
    name: string;
    active: number;
    created: string;
    people: number;
    invoices: number;
}

const duplicateEntry = "ER_DUP_ENTRY";

// A company with its counts; the counts are read per row, so a page of the list reads them only
// for the companies it shows
const tenantColumns = `tenants.id,
                     tenants.name,
                     tenants.active,
                     tenants.created,
                     (SELECT COUNT(*) FROM users WHERE users.tenant_id = tenants.id) AS people,
                     (SELECT COUNT(*) FROM invoices WHERE invoices.tenant_id = tenants.id) AS invoices`;

export interface TenantListIF {
    page?: unknown;
    limit?: unknown;
    keyword?: unknown;
}

/** One page of the companies, like the other lists: { resource, meta: { total pages, page } } */
export const listTenants = async (database: string, { page, limit, keyword }: TenantListIF) => {
    const paging = getPaging(page, limit);
    const search = keywordWhere({
        keyword: keywordOf(keyword),
        table: "tenants"
    });

    const [rows, total] = await Promise.all([
        query<TenantRow>({
            database,
            sql: applyPaging(
                `SELECT ${tenantColumns}
                 FROM tenants
                 ${search.sql}
                 ORDER BY tenants.id`,
                paging
            ),
            params: search.params,
            logger: "List the companies"
        }),
        query<{ total: number }>({
            database,
            sql: `SELECT COUNT(*) AS total
                  FROM tenants
                  ${search.sql};`,
            params: search.params,
            logger: "Count the companies"
        })
    ]);

    if (!rows.success || !total.success) {
        return { success: false, message: "error" };
    }

    return {
        success: true,
        resource: rows.data,
        meta: {
            total: Math.ceil((total.data?.[0]?.total ?? 0) / paging.limit),
            page: paging.page
        }
    };
};

/** One company with its counts, in the shape of the other single reads: { data: [row] } */
export const getTenant = async (database: string, id: number) => {
    const { success, data } = await query<TenantRow>({
        database,
        sql: `SELECT ${tenantColumns}
              FROM tenants
              WHERE tenants.id = ?;`,
        params: [id],
        logger: "Get a company"
    });

    if (!success) {
        return { success: false, message: "error" };
    }

    return data?.length ? { success: true, data } : { success: false, message: "notFound" };
};

export interface NewTenantIF {
    name: string;
    adminEmail: string;
    adminName: string;
}

export type CreateTenantResult =
    { ok: true; tenantId: number; userId: number } | { ok: false; message: string };

/**
 * A new company with the default settings (its name as the company name) and its first admin,
 * all or nothing. The admin has no password yet: the caller sends the "set your password" link.
 */
export const createTenant = async (
    database: string,
    { name, adminEmail, adminName }: NewTenantIF
): Promise<CreateTenantResult> => {
    if (!isValidEmail(adminEmail)) {
        return { ok: false, message: "emailFormat" };
    }

    const created = await withTransaction(
        database,
        "Create a company",
        "error",
        async (connection) => {
            // An email logs in to one company, so it can be in one only
            const [taken] = await connection.query<RowDataPacket[]>(
                `/* every company: an email is unique over all companies */
                 SELECT id
                 FROM users
                 WHERE username = ?
                 FOR UPDATE;`,
                [adminEmail.trim()]
            );

            if (taken.length) {
                throw new TransactionRefusal("user.exists");
            }

            const [tenant] = await connection.query<ResultSetHeader>(
                `INSERT INTO tenants
                 SET name = ?;`,
                [name]
            );
            const tenantId = tenant.insertId;

            await connection.query(
                `INSERT INTO config (tenant_id, name, value, long_value)
                 VALUES ?;`,
                [companySeed(name).map(([setting, value]) => [tenantId, setting, value, ""])]
            );

            const [user] = await connection.query<ResultSetHeader>(
                `INSERT INTO users
                 SET tenant_id = ?,
                     username  = ?,
                     name      = ?,
                     role      = 'admin';`,
                [tenantId, adminEmail.trim(), adminName]
            );

            return { tenantId, userId: user.insertId };
        }
    );

    if (!created.ok) {
        return {
            ok: false,
            message: created.code === duplicateEntry ? "tenant.exists" : created.message
        };
    }

    return { ok: true, ...created.value };
};

/**
 * Renames a company, or turns it off and on. A deactivated company's people cannot log in and
 * their sessions end; nothing is deleted. The owner's own company cannot be deactivated: the owner
 * would lock themself out of the owner page.
 */
export const updateTenant = async (
    database: string,
    id: number,
    change: { name?: string; active?: boolean },
    ownerTenantId: number
) => {
    if (change.active === false && id === ownerTenantId) {
        return { success: false, message: "tenant.ownCompany" };
    }

    const assignments: string[] = [];
    const params: (string | number)[] = [];

    if (change.name !== undefined) {
        assignments.push("name = ?");
        params.push(change.name);
    }

    if (change.active !== undefined) {
        assignments.push("active = ?");
        params.push(change.active ? 1 : 0);
    }

    if (!assignments.length) {
        return { success: false, message: "invalidInput" };
    }

    const { success, affectedRows, code } = await query({
        database,
        sql: `UPDATE tenants
              SET ${assignments.join(", ")}
              WHERE id = ?;`,
        params: [...params, id],
        logger: "Change a company"
    });

    if (!success) {
        return { success: false, message: code === duplicateEntry ? "tenant.exists" : "error" };
    }

    return affectedRows === 0 ? { success: false, message: "notFound" } : { success: true };
};

/**
 * Makes the person with this email the owner of the install, and nobody else (the command line
 * only: custoro set-owner). False when there is no such person.
 */
export const setOwner = async (database: string, email: string) => {
    const changed = await withTransaction(
        database,
        "Set the owner of the install",
        "error",
        async (connection) => {
            const [found] = await connection.query<RowDataPacket[]>(
                `/* every company: the owner is found by email, in whichever company they are */
                 SELECT id
                 FROM users
                 WHERE username = ?
                 FOR UPDATE;`,
                [email.trim()]
            );

            if (!found.length) {
                throw new TransactionRefusal("get.user");
            }

            await connection.query(
                `/* every company: one owner for the whole install */
                 UPDATE users
                 SET owner = IF(id = ?, 1, 0)
                 WHERE owner = 1
                    OR id = ?;`,
                [found[0].id, found[0].id]
            );
        }
    );

    return changed.ok ? { ok: true as const } : { ok: false as const, message: changed.message };
};
