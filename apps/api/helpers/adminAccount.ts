// What scripts/createAdmin.ts is asked for, without the terminal or the database, so it can be
// unit tested. The password is never an argument: it would end up in the shell history and in
// the process list. The script asks for it, or reads it from standard input.
import { isValidEmail } from "./credentials";

export interface AdminArgsIF {
    email: string;
    name: string;
    // Set a new password for an existing user and make them an admin, instead of creating one
    reset: boolean;
}

export type AdminArgsResult = { ok: true; args: AdminArgsIF } | { ok: false; error: string };

export const defaultAdminName = "Admin";
// The size of users.name
export const maxNameLength = 100;

export const adminUsage = `Usage: node dist/scripts/createAdmin.js <email> [--name "Full Name"] [--reset]

  <email>   the login of the new admin
  --name    the name shown in the app (default: ${defaultAdminName})
  --reset   the user already exists: set a new password and make them an admin

The password is asked for (hidden), or read from standard input when it is piped in:
  printf '%s' "$PASSWORD" | docker compose -f docker-compose.prod.yml exec -T api node dist/scripts/createAdmin.js <email>`;

export const parseAdminArgs = (argv: string[]): AdminArgsResult => {
    let email: string | undefined;
    let name = defaultAdminName;
    let reset = false;

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

    return { ok: true, args: { email, name, reset } };
};
