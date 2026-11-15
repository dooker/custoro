// Separation guard 2 of docs/multi-tenant.md: every SQL statement of the API that reads or writes a
// company table filters by tenant_id. A statement that must work over all companies says so, with
// its reason, in a comment inside the SQL: /* every company: <why> */. This test reads the source,
// so a new statement that forgets its company fails here before it can show one company's rows to
// another.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const apiRoot = path.resolve(import.meta.dirname, "..");
const sourceFolders = ["services", "routes", "helpers", "helper", "scripts"];
const companyTables = [
    "config",
    "customers",
    "products",
    "invoices",
    "worksheets",
    "invoice_items",
    "users"
];
const touchesCompanyTable = new RegExp(
    `\\b(FROM|JOIN|UPDATE|INTO)\\s+\`?(${companyTables.join("|")})\\b`,
    "i"
);
const everyCompany = /\/\*\s*every company:\s*\S[^*]*\*\//;

interface Statement {
    file: string;
    line: number;
    sql: string;
}

const sourceFiles = (folder: string): string[] =>
    fs.readdirSync(path.join(apiRoot, folder), { withFileTypes: true }).flatMap((entry) => {
        const relative = path.join(folder, entry.name);

        if (entry.isDirectory()) {
            return sourceFiles(relative);
        }

        return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
            ? [relative]
            : [];
    });

// The template literals of a file (SQL is always written in backticks here), with ${...} parts
// kept as text, so a statement built from pieces is checked as a whole. Comments and quoted
// strings are skipped, so a backtick in a comment does not pair up with one in the code.
const templateLiterals = (file: string): Statement[] => {
    const text = fs.readFileSync(path.join(apiRoot, file), "utf8");
    const found: Statement[] = [];
    let index = 0;

    const skipQuoted = (from: number, quote: string) => {
        let end = from + 1;

        while (end < text.length && text[end] !== quote && text[end] !== "\n") {
            end += text[end] === "\\" ? 2 : 1;
        }

        return end + 1;
    };

    while (index < text.length) {
        const char = text[index];

        if (char === "/" && text[index + 1] === "/") {
            const lineEnd = text.indexOf("\n", index);
            index = lineEnd === -1 ? text.length : lineEnd;
        } else if (char === "/" && text[index + 1] === "*") {
            const commentEnd = text.indexOf("*/", index + 2);
            index = commentEnd === -1 ? text.length : commentEnd + 2;
        } else if (char === '"' || char === "'") {
            index = skipQuoted(index, char);
        } else if (char === "`") {
            let end = index + 1;
            let depth = 0;

            while (end < text.length) {
                const inner = text[end];

                if (inner === "\\") {
                    end += 2;
                    continue;
                }
                if (inner === "$" && text[end + 1] === "{") depth++;
                else if (inner === "}" && depth > 0) depth--;
                else if (inner === "`" && depth === 0) break;
                end++;
            }

            found.push({
                file,
                line: text.slice(0, index).split("\n").length,
                sql: text.slice(index + 1, end)
            });
            index = end + 1;
        } else {
            index++;
        }
    }

    return found;
};

const statements = sourceFolders
    .flatMap(sourceFiles)
    .flatMap(templateLiterals)
    .filter(({ sql }) => touchesCompanyTable.test(sql));

describe("SQL on company tables", () => {
    it("finds the statements it checks (the scan itself works)", () => {
        // the invoice service alone has more than a dozen
        expect(statements.filter(({ file }) => file.endsWith("invoice.ts")).length).toBeGreaterThan(
            12
        );
        expect(statements.length).toBeGreaterThan(60);
    });

    it("filters every one by tenant_id, or says why it works over every company", () => {
        // A condition on tenant_id (WHERE, AND, a join's ON, an UPDATE's SET of a new row), or
        // tenant_id first in an INSERT's column list. Only selecting the column filters nothing.
        const filters = (sql: string) =>
            /\btenant_id\s*=\s*[?\w]/.test(sql) || /\(\s*tenant_id\s*,/.test(sql);
        const unfiltered = statements
            .filter(({ sql }) => !filters(sql) && !everyCompany.test(sql))
            .map(({ file, line, sql }) => `${file}:${line}: ${sql.replace(/\s+/g, " ").trim()}`);

        expect(unfiltered).toEqual([]);
    });

    it("keeps the statements over every company few and known", () => {
        const marked = statements
            .filter(({ sql }) => everyCompany.test(sql))
            .map(({ file }) => file)
            .sort();

        // each one is a lookup before anyone is logged in (login, password links), the caller's
        // own row by a verified token, an email that is unique over all companies, the public PDF
        // link, or the install's owner; a new one belongs on this list
        // only after a look at why it may see every company
        expect(marked).toEqual([
            "helpers/authenticate.ts",
            "helpers/users.ts",
            "services/admin.ts",
            "services/admin.ts",
            "services/admin.ts",
            "services/login.ts",
            "services/pdf.tsx",
            "services/profile.ts",
            "services/profile.ts",
            "services/profile.ts",
            "services/profile.ts",
            "services/user.ts"
        ]);
    });
});
