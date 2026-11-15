// Creates a company with the default settings and its first admin, who gets the "set your
// password" email (the owner page does the same). Over SSH: custoro create-tenant.
//
//   node dist/scripts/createTenant.js "<company name>" --admin <email> [--admin-name "Full Name"]
import dotenv from "dotenv";
import path from "path";
import { dbConfig } from "../config/dbConfig";
import { getPool } from "../db";
import { parseTenantArgs, tenantUsage } from "../helpers/adminAccount";
import { createTenant } from "../services/tenants";
import { sendPasswordSetupLink } from "../services/profile";

const env = process.env.NODE_ENV || "development";

dotenv.config({
    path: path.join(process.cwd(), env === "production" ? ".env.production" : ".env.development"),
    quiet: true
});
dotenv.config({ path: path.join(process.cwd(), ".env"), quiet: true });

const database = dbConfig.default[env === "production" ? "prod" : "dev"];

const refusals: Record<string, string> = {
    "tenant.exists": "A company with this name exists already.",
    "user.exists": "This email already has an account (an email can be in one company only).",
    emailFormat: "That is not a valid email address.",
    error: "The database refused it. The reason is in the log above."
};

const run = async () => {
    const parsed = parseTenantArgs(process.argv.slice(2));

    if (!parsed.ok) {
        console.error(`${parsed.error}\n\n${tenantUsage}`);

        return 2;
    }

    const { name, adminEmail, adminName } = parsed.args;
    const created = await createTenant(database, { name, adminEmail, adminName });

    if (!created.ok) {
        console.error(refusals[created.message] ?? refusals.error);

        return 1;
    }

    const sent = await sendPasswordSetupLink(
        database,
        created.tenantId,
        created.userId,
        adminEmail
    );

    console.log(
        `Created the company ${name} (id ${created.tenantId}) with the admin ${adminEmail}.`
    );
    console.log(
        sent
            ? "The admin got the email with the link to set their password (valid for 7 days)."
            : 'The password email could not be sent (no mail server?): the admin can use "Forgot password?" on the login page.'
    );

    return 0;
};

run()
    .then(async (code) => {
        await getPool(database).end();
        process.exit(code);
    })
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
