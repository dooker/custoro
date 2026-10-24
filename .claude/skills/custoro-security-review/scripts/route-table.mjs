#!/usr/bin/env node
// Lists every API route with the middleware in front of it, read from the source (no server, no
// database, no dependencies; works on the host's Node 22):
//
//   node .claude/skills/custoro-security-review/scripts/route-table.mjs
//
// Columns: method, full path, who may call it, the other checks. Exit status 1 when a route
// is public without being in `publicByDesign`, has no `authorize`, or runs an upload before
// `authorize` / `requireIds` (a refused request must never write a file). This only reads
// route files: services that check roles themselves (search) and anything mounted elsewhere
// still need a look.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Public on purpose. Add a route here only with the reason next to it.
const publicByDesign = new Map([
    ["POST /login", "login"],
    ["POST /login/forgot", "password reset email; always answers the same"],
    ["POST /login/token", "checks a reset token"],
    ["PUT /login/token", "sets a new password with a reset token"],
    ["GET /pdf/:hash", "customers open the invoice from the email; the hash is the credential"]
]);

const api = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../apps/api");
const read = (file) => fs.readFileSync(path.join(api, file), "utf8");

// Which file is mounted where: `import x from "../routes/file"` + `app.use("/prefix", x)`
const mounts = [];

for (const file of ["config/importer.ts", "index.ts"]) {
    const source = read(file);
    const files = Object.fromEntries(
        [...source.matchAll(/import (\w+) from "\.{1,2}\/routes\/(\w+)"/g)].map((m) => [m[1], m[2]])
    );

    for (const [, prefix, name] of source.matchAll(/app\.use\("([^"]+)",\s*(\w+)\)/g)) {
        if (files[name]) mounts.push({ prefix, file: files[name] });
    }
}

const rows = [];

for (const { prefix, file } of mounts) {
    const source = read(`routes/${file}.ts`);
    const starts = [...source.matchAll(/router\.(get|post|put|patch|delete)\(/g)];

    starts.forEach((start, index) => {
        const end = starts[index + 1]?.index ?? source.length;
        const call = source.slice(start.index + start[0].length, end);
        const head = call.slice(0, call.search(/\basync\s*\(/) >>> 0 || call.length);
        const first = head.match(/^\s*(\[[^\]]*\]|"[^"]*")/)?.[1] ?? "?";
        const paths = [...first.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
        const order = [
            ...head.matchAll(/authenticate|authorize|requireIds|requireParams|imageUpload/g)
        ];
        const first_of = (name) => order.findIndex((m) => m[0] === name);
        const roles = head.match(/authorize\(\[([^\]]*)\]\)/)?.[1].replace(/["\s]/g, "");
        const extra = [
            ...[...head.matchAll(/requireIds\(([^)]*)\)/g)].map(
                (m) => `ids(${m[1].replace(/["\s]/g, "")})`
            ),
            ...(head.includes("requireParams") ? ["params"] : []),
            ...[...head.matchAll(/imageUpload\("(\w+)"\)/g)].map((m) => `upload(${m[1]})`)
        ];
        const problems = [];

        if (first_of("authenticate") === -1) problems.push("public");
        else if (first_of("authorize") === -1) problems.push("no authorize");
        else if (first_of("authorize") < first_of("authenticate"))
            problems.push("authorize before authenticate");

        const upload = first_of("imageUpload");
        const checks = ["authorize", "requireIds", "requireParams"]
            .map(first_of)
            .filter((i) => i !== -1);

        if (upload !== -1 && checks.some((i) => i > upload)) problems.push("upload before checks");

        for (const route of paths) {
            const full = path.posix.join(prefix, route) + (route.endsWith("/") ? "/" : "");

            rows.push({
                method: start[1].toUpperCase(),
                full: full.replace(/\/\/+/g, "/"),
                who: roles ?? (problems.includes("public") ? "anyone" : "any logged-in user"),
                extra: extra.join(" "),
                problems
            });
        }
    });
}

let failed = false;

for (const row of rows) {
    const key = `${row.method} ${row.full.replace(/\/$/, "") || "/"}`;
    const reason = publicByDesign.get(key);
    let note = "";

    if (row.problems.includes("public") && reason) {
        note = `by design: ${reason}`;
        row.problems = row.problems.filter((p) => p !== "public");
    }

    if (row.problems.length) {
        failed = true;
        note = `!! ${row.problems.join(", ")}`;
    }

    console.log(
        `${row.method.padEnd(6)} ${row.full.padEnd(46)} ${row.who.padEnd(12)} ${row.extra.padEnd(22)} ${note}`.trimEnd()
    );
}

console.log(
    `\n${rows.length} routes. Not in the table: GET / (version), static /uploads, error handler.`
);
process.exit(failed ? 1 : 0);
