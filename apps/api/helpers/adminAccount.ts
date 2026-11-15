// What scripts/createAdmin.ts is asked for, without the terminal or the database, so it can be
// unit tested. The password is never an argument: it would end up in the shell history and in
// the process list. The script asks for it, or reads it from standard input.
import { isValidEmail } from "./credentials";

export interface AdminArgsIF {
    email: string;
    name: string;
    // Set a new password for an existing user and make them an admin, instead of creating one
    reset: boolean;
    // The company a new admin belongs to (company 1 by default: a fresh install has only it)
    tenantId: number;
}

export type AdminArgsResult = { ok: true; args: AdminArgsIF } | { ok: false; error: string };

export const defaultAdminName = "Admin";
// The size of users.name
export const maxNameLength = 100;

export const adminUsage = `Usage: node dist/scripts/createAdmin.js <email> [--name "Full Name"] [--tenant <id>] [--reset]

  <email>   the login of the new admin
  --name    the name shown in the app (default: ${defaultAdminName})
  --tenant  the company of a new admin (default: 1); the owner page lists the ids
  --reset   the user already exists: set a new password and make them an admin

The first admin of an install that has no owner yet (a fresh install) is its owner.

The password is asked for (hidden), or read from standard input when it is piped in:
  printf '%s' "$PASSWORD" | docker compose -f docker-compose.prod.yml exec -T api node dist/scripts/createAdmin.js <email>`;

export const parseAdminArgs = (argv: string[]): AdminArgsResult => {
    let email: string | undefined;
    let name = defaultAdminName;
    let reset = false;
    let tenantId = 1;

    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];

        if (arg === "--reset") {
            reset = true;
        } else if (arg === "--name" || arg.startsWith("--name=")) {
            const value = arg === "--name" ? argv[++index] : arg.slice("--name=".length);

            if (!value?.trim()) {
                return { ok: false, error: "--name needs a value" };
            }

            name = value.trim();
        } else if (arg === "--tenant" || arg.startsWith("--tenant=")) {
            const value = arg === "--tenant" ? argv[++index] : arg.slice("--tenant=".length);

            if (!/^[1-9]\d{0,8}$/.test(value?.trim() ?? "")) {
                return { ok: false, error: "--tenant needs a company id (a whole number)" };
            }

            tenantId = Number(value.trim());
        } else if (arg.startsWith("-")) {
            return { ok: false, error: `Unknown option ${arg}` };
        } else if (email === undefined) {
            email = arg.trim();
        } else {
            return { ok: false, error: `Unexpected argument ${arg}` };
        }
    }

    if (email === undefined) {
        return { ok: false, error: "The email of the admin is missing" };
    }

    if (!isValidEmail(email)) {
        return { ok: false, error: "That is not a valid email address" };
    }

    if (name.length > maxNameLength) {
        return { ok: false, error: `The name can have up to ${maxNameLength} characters` };
    }

    return { ok: true, args: { email, name, reset, tenantId } };
};

export interface TenantArgsIF {
    name: string;
    adminEmail: string;
    adminName: string;
}

export const tenantUsage = `Usage: node dist/scripts/createTenant.js "<company name>" --admin <email> [--admin-name "Full Name"]

  <company name>  the new company, shown on the owner page and as its company name
  --admin         the login of its first admin, who gets the "set your password" email
  --admin-name    the admin's name in the app (default: ${defaultAdminName})`;

/** What scripts/createTenant.ts is asked for (custoro create-tenant) */
export const parseTenantArgs = (
    argv: string[]
): { ok: true; args: TenantArgsIF } | { ok: false; error: string } => {
    let name: string | undefined;
    let adminEmail: string | undefined;
    let adminName = defaultAdminName;

    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        const valueOf = (option: string) =>
            arg === option ? argv[++index] : arg.slice(option.length + 1);

        if (arg === "--admin" || arg.startsWith("--admin=")) {
            adminEmail = valueOf("--admin")?.trim();
        } else if (arg === "--admin-name" || arg.startsWith("--admin-name=")) {
            const value = valueOf("--admin-name")?.trim();

            if (!value) {
                return { ok: false, error: "--admin-name needs a value" };
            }

            adminName = value;
        } else if (arg.startsWith("-")) {
            return { ok: false, error: `Unknown option ${arg}` };
        } else if (name === undefined) {
            name = arg.trim();
        } else {
            return {
                ok: false,
                error: `Unexpected argument ${arg} (put the company name in quotes)`
            };
        }
    }

    if (!name || name.length > 150 || /[\r\n]/.test(name)) {
        return { ok: false, error: "The company name is missing, or longer than 150 characters" };
    }

    if (!adminEmail || !isValidEmail(adminEmail)) {
        return { ok: false, error: "--admin needs the email of the company's first admin" };
    }

    if (adminName.length > maxNameLength) {
        return { ok: false, error: `The name can have up to ${maxNameLength} characters` };
    }

    return { ok: true, args: { name, adminEmail, adminName } };
};
