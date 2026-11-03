// Creates an admin, or gives an existing user a new password and the admin role. A production
// database starts without users, and an admin who is locked out has no other way back in.
//
//   docker compose -f docker-compose.prod.yml exec api node dist/scripts/createAdmin.js <email>
//
// Run it where the API runs, so it reads the same database settings. See adminUsage.
import dotenv from "dotenv";
import path from "path";
import readline from "readline/promises";
import { Writable } from "stream";
import { dbConfig } from "../config/dbConfig";
import { getPool } from "../db";
import { adminUsage, parseAdminArgs } from "../helpers/adminAccount";
import { saveAdmin } from "../services/admin";

const env = process.env.NODE_ENV || "development";

// Same precedence as index.ts: real environment (e.g. Docker) > .env.<env> > .env
dotenv.config({
    path: path.join(process.cwd(), env === "production" ? ".env.production" : ".env.development"),
    quiet: true
});
dotenv.config({ path: path.join(process.cwd(), ".env"), quiet: true });

const database = dbConfig.default[env === "production" ? "prod" : "dev"];

const refusals: Record<string, string> = {
    passwordLength: "The password must be 8 to 72 characters long.",
    "user.exists":
        "A user with this email already exists. Run it again with --reset to give them a new password and the admin role.",
    "get.user": "There is no user with this email. Run it again without --reset to create one.",
    error: "The database refused it. The reason is in the log above."
};

// Typed without an echo, so the password does not stay on the screen or in a recording
const promptHidden = async (question: string) => {
    const muted = new Writable({ write: (_chunk, _encoding, done) => done() });
    const terminal = readline.createInterface({
        input: process.stdin,
        output: muted,
        terminal: true
    });

    process.stdout.write(question);

    try {
        return await terminal.question("");
    } finally {
        terminal.close();
        process.stdout.write("\n");
    }
};

// One line from a pipe, without its line break
const readPiped = async () => {
    const chunks: Buffer[] = [];

    for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
    }

    return Buffer.concat(chunks)
        .toString("utf8")
        .replace(/\r?\n$/, "");
};

const readPassword = async () => {
    if (!process.stdin.isTTY) {
        return readPiped();
    }

    const password = await promptHidden("Password: ");

    if (password !== (await promptHidden("Repeat the password: "))) {
        throw new Error("The two passwords are not the same.");
    }

    return password;
};

const run = async () => {
    const parsed = parseAdminArgs(process.argv.slice(2));

    if (!parsed.ok) {
        console.error(`${parsed.error}\n\n${adminUsage}`);

        return 2;
    }

    const { email, name, reset } = parsed.args;
    const result = await saveAdmin({
        database,
        username: email,
        name,
        password: await readPassword(),
        reset
    });

    if (!result.ok) {
        console.error(refusals[result.message] ?? refusals.error);

        return 1;
    }

    console.log(
        result.created
            ? `Created the admin ${email}.`
            : `${email} is an admin now, with the new password. Their other sessions have ended.`
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
