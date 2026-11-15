// Makes the person with this email the owner of the install (the owner page), and nobody else.
// The app never changes the owner; the migration made the first admin of company 1 the owner.
// Over SSH: custoro set-owner <email>.
import dotenv from "dotenv";
import path from "path";
import { dbConfig } from "../config/dbConfig";
import { getPool } from "../db";
import { isValidEmail } from "../helpers/credentials";
import { setOwner } from "../services/tenants";

const env = process.env.NODE_ENV || "development";

dotenv.config({
    path: path.join(process.cwd(), env === "production" ? ".env.production" : ".env.development"),
    quiet: true
});
dotenv.config({ path: path.join(process.cwd(), ".env"), quiet: true });

const database = dbConfig.default[env === "production" ? "prod" : "dev"];

const run = async () => {
    const [email, ...rest] = process.argv.slice(2);

    if (!email || rest.length || !isValidEmail(email)) {
        console.error("Usage: node dist/scripts/setOwner.js <email>");

        return 2;
    }

    const result = await setOwner(database, email);

    if (!result.ok) {
        console.error(
            result.message === "get.user"
                ? "There is no user with this email."
                : "The database refused it. The reason is in the log above."
        );

        return 1;
    }

    console.log(`${email.trim()} is the owner of the install now.`);

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
