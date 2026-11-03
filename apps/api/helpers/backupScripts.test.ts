// backup.sh, restore.sh and backup-lib.sh (apps/api/scripts) without Docker: a stand-in `docker` first
// on the PATH records every call (arguments and stdin) and answers from files the test wrote. What
// the real MySQL and MariaDB do with the commands is checked by the rehearsal instead
// (.claude/skills/custoro-deploy/scripts/rehearse-backup.sh).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const scripts = fileURLToPath(new URL("../scripts", import.meta.url));
const lib = path.join(scripts, "backup-lib.sh");
const backupSh = path.join(scripts, "backup.sh");
const restoreSh = path.join(scripts, "restore.sh");
const composeProd = fileURLToPath(new URL("../../../docker-compose.prod.yml", import.meta.url));

const secret = "s3cret-password-value-1234";

const goodDump = [
    "-- MySQL dump 10.13  Distrib 8.4.0, for Linux (x86_64)",
    "-- Server version\t8.4.0",
    "CREATE TABLE `config` (",
    "  `id` int NOT NULL",
    ");",
    "INSERT INTO `config` VALUES (1,'name','Ünïcode €');",
    "-- Dump completed on 2026-11-03 12:00:00",
    ""
].join("\n");

// What mariadb-dump writes: the stored generated column is in the CREATE TABLE and in every INSERT
const mariadbDump = (generated: boolean) =>
    [
        "/*M!999999\\- enable the sandbox mode */",
        "-- MariaDB dump 10.19  Distrib 11.4.13-MariaDB, for debian-linux-gnu (aarch64)",
        "-- Server version\t11.4.13-MariaDB-ubu2404",
        "CREATE TABLE `invoices` (",
        "  `number` varchar(25) NOT NULL,",
        generated
            ? "  `number_sort` bigint(20) unsigned GENERATED ALWAYS AS (cast(`number` as unsigned)) STORED,"
            : "  `note` varchar(5) DEFAULT NULL,",
        "  PRIMARY KEY (`number`)",
        ");",
        "INSERT INTO `invoices` VALUES ('1042',1042);",
        "-- Dump completed on 2026-11-03 12:00:00",
        ""
    ].join("\n");

// The stand-in for `docker`. docker compose ... ps / exec / run / stop and docker inspect, steered by
// STUB_* variables; every call goes to calls.log as NUL separated arguments, an empty one ends a call
const stubDocker = `#!/usr/bin/env bash
log="$STUB_DIR/calls.log"
printf '%s\\0' "$@" >>"$log"
printf '\\0' >>"$log"
if [ "$1" = inspect ]; then echo "\${STUB_PROJECT:-custoro}"; exit 0; fi
shift
while [ $# -gt 0 ]; do
    case $1 in -f|-p|--env-file) shift 2 ;; *) break ;; esac
done
sub=$1
shift
case $sub in
    ps) if [ -n "\${STUB_DB_RUNNING-1}" ]; then echo dbcontainer; fi; exit 0 ;;
    stop) exit 0 ;;
    exec)
        script=\${*: -1}
        case "$script" in
            *--single-transaction*) cat "$STUB_DUMP"; exit "\${STUB_DUMP_STATUS:-0}" ;;
            *"DROP DATABASE"*) exit "\${STUB_RESET_STATUS:-0}" ;;
            *"COUNT(*)"*) printf 'customers\\t3\\ninvoices\\t2\\n'; exit 0 ;;
            *"SELECT VERSION()"*) echo "\${STUB_VERSION:-8.4.0}"; exit 0 ;;
            *) cat >"$STUB_DIR/loaded.sql"; exit "\${STUB_LOAD_STATUS:-0}" ;;
        esac
        ;;
    run)
        case " $* " in
            *" --entrypoint tar "*) cat "$STUB_TAR"; exit "\${STUB_TAR_STATUS:-0}" ;;
            *)
                n=$(ls "$STUB_DIR"/untar-* 2>/dev/null | wc -l | tr -d ' ')
                cat >"$STUB_DIR/untar-$n"
                exit "\${STUB_UNTAR_STATUS:-0}"
                ;;
        esac
        ;;
esac
exit 99
`;

type Result = { status: number | null; stdout: string; stderr: string };

let work: string;
let stubDir: string;
let backups: string;

const env = (extra: Record<string, string> = {}) => ({
    ...process.env,
    PATH: `${path.join(stubDir, "bin")}:${process.env.PATH}`,
    STUB_DIR: stubDir,
    STUB_DUMP: path.join(stubDir, "dump.sql"),
    STUB_TAR: path.join(stubDir, "volume.tgz"),
    // None of these may ever show up in a command line or in what the scripts print
    DB_ROOT_PASSWORD: secret,
    MYSQL_ROOT_PASSWORD: secret,
    DB_PASSWORD: secret,
    ...extra
});

const bash = (args: string[], extra: Record<string, string> = {}, input = ""): Result => {
    const r = spawnSync("bash", args, { env: env(extra), input, encoding: "utf8" });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
};

const backup = (args: string[] = [], extra: Record<string, string> = {}) =>
    bash([backupSh, "--dir", backups, ...args], extra);

const restore = (args: string[], extra: Record<string, string> = {}, input = "custoro\n") =>
    bash([restoreSh, ...args], extra, input);

/** A bash function of backup-lib.sh run on its own: [status, what it printed] */
const libFn = (fn: string, ...args: string[]): [number | null, string] => {
    const r = bash(["-c", `. "$1"; shift; ${fn} "$@"`, "_", lib, ...args]);
    return [r.status, `${r.stdout}${r.stderr}`.trim()];
};

const calls = (): string[][] => {
    const file = path.join(stubDir, "calls.log");
    if (!existsSync(file)) return [];
    const out: string[][] = [];
    let current: string[] = [];
    for (const part of readFileSync(file, "utf8").split("\0")) {
        if (part === "") {
            if (current.length) out.push(current);
            current = [];
        } else {
            current.push(part);
        }
    }
    return out;
};

/** ps, exec, run, stop or inspect: what a recorded call did */
const kind = (call: string[]): string => {
    if (call[0] === "inspect") return "inspect";
    let i = 1;
    while (["-f", "-p", "--env-file"].includes(call[i])) i += 2;
    const sub = call[i];
    if (sub === "exec") {
        const script = call[call.length - 1];
        if (script.includes("--single-transaction")) return "dump";
        if (script.includes("DROP DATABASE")) return "reset";
        if (script.includes("COUNT(*)")) return "counts";
        if (script.includes("SELECT VERSION()")) return "version";
        return "load";
    }
    if (sub === "run") return call.includes("tar") ? "tar" : "untar";
    return sub;
};
const kinds = () => calls().map(kind);

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

const tarGz = (): Buffer => {
    const src = path.join(work, "volume-src");
    mkdirSync(src, { recursive: true });
    writeFileSync(path.join(src, "logo.png"), "png bytes");
    const out = path.join(work, "made.tgz");
    spawnSync("tar", ["-czf", out, "-C", src, "."]);
    return readFileSync(out);
};

const tarGzFromStub = () => readFileSync(path.join(stubDir, "volume.tgz"));

const oneBackup = (): string => {
    const names = readdirSync(backups);
    expect(names).toHaveLength(1);
    return path.join(backups, names[0]);
};

beforeEach(() => {
    work = mkdtempSync(path.join(tmpdir(), "custoro-backup-test-"));
    stubDir = path.join(work, "stub");
    backups = path.join(work, "backups");
    mkdirSync(path.join(stubDir, "bin"), { recursive: true });
    writeFileSync(path.join(stubDir, "bin", "docker"), stubDocker);
    chmodSync(path.join(stubDir, "bin", "docker"), 0o755);
    writeFileSync(path.join(stubDir, "dump.sql"), goodDump);
    writeFileSync(path.join(stubDir, "volume.tgz"), tarGz());
});

afterEach(() => {
    rmSync(work, { recursive: true, force: true });
});

describe("dump_problem", () => {
    const dumpFile = (content: string | Buffer) => {
        const file = path.join(work, "db.sql.gz");
        writeFileSync(file, typeof content === "string" ? gzipSync(content) : content);
        return file;
    };

    it("accepts a complete dump with tables and rows", () => {
        expect(libFn("dump_problem", dumpFile(goodDump))).toEqual([0, ""]);
    });

    it("accepts what MariaDB's dump tool writes", () => {
        const mariadb = goodDump
            .replace(
                "-- MySQL dump 10.13  Distrib 8.4.0, for Linux (x86_64)",
                "/*M!999999\\- enable the sandbox mode */"
            )
            .replace("8.4.0", "11.4.5-MariaDB");
        expect(libFn("dump_problem", dumpFile(mariadb))[0]).toBe(0);
    });

    it("refuses a file of zero bytes", () => {
        expect(libFn("dump_problem", dumpFile(Buffer.alloc(0)))).toEqual([
            1,
            "the dump file is empty"
        ]);
    });

    it("refuses a gzip file with nothing in it, which is what a dump tool that failed leaves", () => {
        const [status, message] = libFn("dump_problem", dumpFile(""));
        expect(status).toBe(1);
        expect(message).toMatch(/dump is empty/);
    });

    it("refuses a gzip stream that was cut off", () => {
        const whole = gzipSync(goodDump.repeat(2000));
        const [status, message] = libFn(
            "dump_problem",
            dumpFile(whole.subarray(0, whole.length - 40))
        );
        expect(status).toBe(1);
        expect(message).toMatch(/not a complete gzip file/);
    });

    it("refuses text that is not gzip at all", () => {
        const [status, message] = libFn(
            "dump_problem",
            dumpFile(Buffer.from("not gzip, just text"))
        );
        expect(status).toBe(1);
        expect(message).toMatch(/not a complete gzip file/);
    });

    it("refuses a dump that stops before its last line, even if it has tables and rows", () => {
        const cut = goodDump.replace(/-- Dump completed.*\n/, "");
        const [status, message] = libFn("dump_problem", dumpFile(cut));
        expect(status).toBe(1);
        expect(message).toMatch(/does not end with the 'Dump completed' line/);
    });

    it("refuses a dump without tables", () => {
        const [status, message] = libFn(
            "dump_problem",
            dumpFile("-- MySQL dump\n-- Dump completed on 2026-11-03 12:00:00\n")
        );
        expect(status).toBe(1);
        expect(message).toMatch(/no tables/);
    });

    it("refuses a dump with tables but no rows, the shape of a wrong or wiped database", () => {
        const noRows = goodDump.replace(/INSERT INTO.*\n/, "");
        const [status, message] = libFn("dump_problem", dumpFile(noRows));
        expect(status).toBe(1);
        expect(message).toMatch(/1 tables but no rows/);
    });

    it("copes with a very long INSERT line", () => {
        const wide = goodDump.replace("'Ünïcode €'", `'${"x".repeat(3_000_000)}'`);
        expect(libFn("dump_problem", dumpFile(wide))[0]).toBe(0);
    });
});

describe("verify_checksums", () => {
    const folder = () => {
        const dir = path.join(work, "folder");
        mkdirSync(dir);
        writeFileSync(path.join(dir, "a.gz"), "alpha");
        writeFileSync(path.join(dir, "b.gz"), "beta");
        writeFileSync(
            path.join(dir, "SHA256SUMS"),
            `${sha256(Buffer.from("alpha"))}  a.gz\n${sha256(Buffer.from("beta"))}  b.gz\n`
        );
        return dir;
    };

    it("passes when every named file has the recorded checksum", () => {
        expect(libFn("verify_checksums", folder(), "a.gz", "b.gz")).toEqual([0, ""]);
    });

    it("only looks at the files it is asked about", () => {
        const dir = folder();
        writeFileSync(path.join(dir, "b.gz"), "changed");
        expect(libFn("verify_checksums", dir, "a.gz")[0]).toBe(0);
    });

    it("names a file that changed", () => {
        const dir = folder();
        writeFileSync(path.join(dir, "b.gz"), "changed");
        expect(libFn("verify_checksums", dir, "a.gz", "b.gz")).toEqual([
            1,
            "b.gz does not match its checksum (damaged or changed)"
        ]);
    });

    it("names a file that is gone, a file nobody recorded, and a missing SHA256SUMS", () => {
        const dir = folder();
        rmSync(path.join(dir, "a.gz"));
        expect(libFn("verify_checksums", dir, "a.gz")).toEqual([1, "a.gz is missing"]);
        expect(libFn("verify_checksums", dir, "c.gz")).toEqual([
            1,
            "c.gz has no checksum in SHA256SUMS"
        ]);
        rmSync(path.join(dir, "SHA256SUMS"));
        expect(libFn("verify_checksums", dir, "b.gz")).toEqual([1, "SHA256SUMS is missing"]);
    });
});

describe("engine_problem", () => {
    const dumpFile = (text: string) => {
        const file = path.join(work, "engine.sql.gz");
        writeFileSync(file, gzipSync(text));
        return file;
    };
    const mysqlTarget = "8.4.11";
    const mariadbTarget = "11.4.13-MariaDB-ubu2404";
    // What mysqldump writes: no generated value in the INSERT, the expression in MySQL's own form
    const mysqlDump = (generated: boolean) =>
        goodDump.replace(
            "  `id` int NOT NULL",
            generated
                ? "  `id` int NOT NULL,\n  `n` bigint GENERATED ALWAYS AS (regexp_like(`id`,_utf8mb4'^1')) STORED"
                : "  `id` int NOT NULL"
        );

    it("refuses a MariaDB dump with a generated column for a MySQL server, and says why", () => {
        const [status, message] = libFn("engine_problem", dumpFile(mariadbDump(true)), mysqlTarget);
        expect(status).toBe(1);
        expect(message).toMatch(
            /made by MariaDB \(11\.4\.13-MariaDB-ubu2404\) and has a generated column/
        );
        expect(message).toMatch(/target server, MySQL \(8\.4\.11\), cannot load/);
        expect(message).toMatch(/writes the generated value into each INSERT/);
    });

    it("refuses a MySQL dump with a generated column for a MariaDB server, and says why", () => {
        const [status, message] = libFn("engine_problem", dumpFile(mysqlDump(true)), mariadbTarget);
        expect(status).toBe(1);
        expect(message).toMatch(/made by MySQL \(8\.4\.0\) and has a generated column/);
        expect(message).toMatch(
            /target server, MariaDB \(11\.4\.13-MariaDB-ubu2404\), cannot load/
        );
        expect(message).toMatch(/regexp_like\(\)/);
    });

    it("lets a dump into the same kind of server", () => {
        expect(libFn("engine_problem", dumpFile(mariadbDump(true)), mariadbTarget)).toEqual([
            0,
            ""
        ]);
        expect(libFn("engine_problem", dumpFile(mysqlDump(true)), mysqlTarget)).toEqual([0, ""]);
    });

    it("does not hold back a dump without a generated column, whichever way it goes", () => {
        expect(libFn("engine_problem", dumpFile(mariadbDump(false)), mysqlTarget)).toEqual([0, ""]);
        expect(libFn("engine_problem", dumpFile(mysqlDump(false)), mariadbTarget)).toEqual([0, ""]);
    });

    it("does not guess when the dump has no version line", () => {
        const noVersion = mariadbDump(true).replace(/-- Server version.*\n/, "");
        expect(libFn("engine_problem", dumpFile(noVersion), mysqlTarget)).toEqual([0, ""]);
    });
});

describe("archive_problem", () => {
    it("accepts a tar.gz, also one of an empty volume", () => {
        const file = path.join(work, "ok.tgz");
        writeFileSync(file, tarGz());
        expect(libFn("archive_problem", file)).toEqual([0, ""]);
        const empty = path.join(work, "empty-src");
        mkdirSync(empty);
        const emptyTgz = path.join(work, "empty.tgz");
        spawnSync("tar", ["-czf", emptyTgz, "-C", empty, "."]);
        expect(libFn("archive_problem", emptyTgz)).toEqual([0, ""]);
    });

    it("refuses a missing, empty, cut off or foreign file", () => {
        const good = tarGz();
        const cases: [string, Buffer | null][] = [
            ["missing.tgz", null],
            ["zero.tgz", Buffer.alloc(0)],
            ["cut.tgz", good.subarray(0, good.length - 12)],
            ["text.tgz", Buffer.from("this is not an archive")]
        ];
        for (const [name, content] of cases) {
            const file = path.join(work, name);
            if (content) writeFileSync(file, content);
            const [status] = libFn("archive_problem", file);
            expect(status, name).toBe(1);
        }
    });
});

describe("backup.sh", () => {
    it("writes a dated folder with the dump, both volumes, checksums and a manifest", () => {
        const r = backup();
        expect(r.status, r.stderr).toBe(0);
        const dir = oneBackup();
        expect(path.basename(dir)).toMatch(/^custoro-\d{8}T\d{6}Z$/);
        expect(readdirSync(dir).sort()).toEqual([
            "SHA256SUMS",
            "db.sql.gz",
            "invoices.tar.gz",
            "manifest.txt",
            "uploads.tar.gz"
        ]);
        expect(readdirSync(dir)).not.toContain(".partial");
        expect(
            libFn("verify_checksums", dir, "db.sql.gz", "uploads.tar.gz", "invoices.tar.gz")[0]
        ).toBe(0);
        expect(libFn("dump_problem", path.join(dir, "db.sql.gz"))[0]).toBe(0);
        const manifest = readFileSync(path.join(dir, "manifest.txt"), "utf8");
        expect(manifest).toMatch(/^created:\s+\d{4}-\d{2}-\d{2}T/m);
        expect(manifest).toMatch(/^project:\s+custoro$/m);
        expect(manifest).toMatch(/^server:\s+8\.4\.0$/m);
        expect(r.stdout).toContain(`Backup written to ${dir}`);
    });

    it("keeps the backup private: folder 700, files 600", () => {
        backup();
        const dir = oneBackup();
        expect(statSync(dir).mode & 0o777).toBe(0o700);
        for (const name of readdirSync(dir)) {
            expect(statSync(path.join(dir, name)).mode & 0o777, name).toBe(0o600);
        }
    });

    it("dumps the database first, then archives uploads, then invoices", () => {
        backup();
        expect(kinds().filter((k) => k === "dump" || k === "tar")).toEqual(["dump", "tar", "tar"]);
        const tars = calls().filter((c) => kind(c) === "tar");
        expect(tars[0]).toContain("/app/uploads");
        expect(tars[1]).toContain("/app/storage");
    });

    it("stores exactly what the dump tool and tar printed", () => {
        backup();
        const dir = oneBackup();
        // gunzip through the lib's own reader: the dump text comes back unchanged
        const text = spawnSync("gzip", ["-dc", path.join(dir, "db.sql.gz")], { encoding: "utf8" });
        expect(text.stdout).toBe(goodDump);
        expect(readFileSync(path.join(dir, "uploads.tar.gz")).equals(tarGzFromStub())).toBe(true);
    });

    it("runs a single-transaction dump inside the db service, reading the password there", () => {
        backup();
        const dump = calls().find((c) => kind(c) === "dump")!;
        expect(dump.slice(dump.indexOf("exec"), -1)).toEqual(["exec", "-T", "db", "sh", "-c"]);
        const script = dump[dump.length - 1];
        expect(script).toContain("--single-transaction");
        expect(script).toContain('MYSQL_PWD="$MYSQL_ROOT_PASSWORD"');
        expect(script).not.toMatch(/-p["'$A-Za-z]/);
        expect(script).toContain("mariadb-dump");
        expect(script).toContain("mysqldump");
    });

    it("never puts a password on a command line or prints one", () => {
        const r = backup();
        expect(r.status).toBe(0);
        const log = readFileSync(path.join(stubDir, "calls.log"), "utf8");
        expect(log).not.toContain(secret);
        expect(`${r.stdout}${r.stderr}`).not.toContain(secret);
        const manifest = readFileSync(path.join(oneBackup(), "manifest.txt"), "utf8");
        expect(manifest).not.toContain(secret);
    });

    it("refuses an empty dump, archives nothing and keeps no folder", () => {
        writeFileSync(path.join(stubDir, "dump.sql"), "");
        const r = backup();
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/refusing to go on, the dump is empty/);
        expect(kinds()).not.toContain("tar");
        expect(readdirSync(backups)).toEqual([]);
    });

    it("refuses a dump that was cut off", () => {
        writeFileSync(
            path.join(stubDir, "dump.sql"),
            goodDump.replace(/-- Dump completed.*\n/, "")
        );
        const r = backup();
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/incomplete/);
        expect(kinds()).not.toContain("tar");
        expect(readdirSync(backups)).toEqual([]);
    });

    it("refuses when the dump tool fails, even if what it printed looks complete", () => {
        const r = backup([], { STUB_DUMP_STATUS: "2" });
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/database dump failed/);
        expect(kinds()).not.toContain("tar");
        expect(readdirSync(backups)).toEqual([]);
    });

    it("keeps an archive when tar only saw files change, and says so", () => {
        const r = backup([], { STUB_TAR_STATUS: "1" });
        expect(r.status, r.stderr).toBe(0);
        expect(r.stderr).toMatch(/changed while they were archived/);
        expect(readdirSync(oneBackup())).toContain("uploads.tar.gz");
    });

    it("fails and keeps nothing when tar fails", () => {
        const r = backup([], { STUB_TAR_STATUS: "2" });
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/archiving the uploads volume failed/);
        expect(readdirSync(backups)).toEqual([]);
    });

    it("fails and keeps nothing when what tar printed is not an archive", () => {
        writeFileSync(path.join(stubDir, "volume.tgz"), "");
        const r = backup();
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/not a complete \.tar\.gz/);
        expect(readdirSync(backups)).toEqual([]);
    });

    it("says what to do when the db service is not running", () => {
        const r = backup([], { STUB_DB_RUNNING: "" });
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/db service is not running/);
        expect(kinds()).toEqual(["ps"]);
    });

    it("targets docker-compose.prod.yml unless told otherwise", () => {
        backup();
        const first = calls()[0];
        expect(first.slice(0, 3)).toEqual([
            "compose",
            "-f",
            expect.stringMatching(/docker-compose\.prod\.yml$/)
        ]);
    });

    it("passes the project, env file and compose files to every compose call", () => {
        backup([
            "--project",
            "custoro-test",
            "--env-file",
            "/x/.env",
            "-f",
            "a.yml",
            "-f",
            "b.yml"
        ]);
        const compose = calls().filter((c) => c[0] === "compose");
        expect(compose.length).toBeGreaterThanOrEqual(4);
        for (const call of compose) {
            expect(call.slice(0, 9)).toEqual([
                "compose",
                "-f",
                "a.yml",
                "-f",
                "b.yml",
                "-p",
                "custoro-test",
                "--env-file",
                "/x/.env"
            ]);
        }
    });

    it("refuses arguments it does not know", () => {
        const r = backup(["--nope"]);
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/unknown argument: --nope/);
        expect(calls()).toEqual([]);
    });
});

describe("restore.sh", () => {
    const makeBackup = () => {
        const r = backup();
        expect(r.status, r.stderr).toBe(0);
        const dir = oneBackup();
        rmSync(path.join(stubDir, "calls.log"));
        return dir;
    };

    // Replace a file of a backup and keep SHA256SUMS right, to get past the checksum check
    const swap = (dir: string, name: string, content: Buffer) => {
        writeFileSync(path.join(dir, name), content);
        const sums = readFileSync(path.join(dir, "SHA256SUMS"), "utf8")
            .split("\n")
            .filter(Boolean)
            .map((line) => (line.endsWith(`  ${name}`) ? `${sha256(content)}  ${name}` : line));
        writeFileSync(path.join(dir, "SHA256SUMS"), `${sums.join("\n")}\n`);
    };

    it("loads the dump and unpacks both volumes, in that order, after stopping the api", () => {
        const dir = makeBackup();
        const r = restore([dir]);
        expect(r.status, r.stderr).toBe(0);
        expect(kinds()).toEqual([
            "ps",
            "inspect",
            "version",
            "stop",
            "reset",
            "load",
            "untar",
            "untar",
            "counts"
        ]);
        const stop = calls().find((c) => kind(c) === "stop")!;
        expect(stop[stop.length - 1]).toBe("api");
        expect(readFileSync(path.join(stubDir, "loaded.sql"), "utf8")).toBe(goodDump);
        const untars = calls().filter((c) => kind(c) === "untar");
        expect(untars[0].slice(-2)).toEqual(["sh", "/app/uploads"]);
        expect(untars[1].slice(-2)).toEqual(["sh", "/app/storage"]);
        expect(readFileSync(path.join(stubDir, "untar-0")).equals(tarGzFromStub())).toBe(true);
        expect(readFileSync(path.join(stubDir, "untar-1")).equals(tarGzFromStub())).toBe(true);
        expect(r.stdout).toMatch(/customers\t3/);
        expect(r.stdout).toMatch(/api service is stopped/);
    });

    it("empties the mount point before it unpacks, as root", () => {
        const dir = makeBackup();
        restore([dir]);
        const untar = calls().find((c) => kind(c) === "untar")!;
        expect(untar).toContain("--user");
        expect(untar[untar.indexOf("--user") + 1]).toBe("root");
        const script = untar[untar.length - 3];
        expect(script).toMatch(/find "\$1" -mindepth 1 -delete && exec tar -xzf -/);
    });

    it("asks for the project name and changes nothing on a wrong answer", () => {
        const dir = makeBackup();
        for (const answer of ["no\n", "\n", "yes\n", "custor\n", ""]) {
            const r = restore([dir], {}, answer);
            expect(r.status, JSON.stringify(answer)).toBe(1);
            expect(r.stderr).toMatch(/not confirmed, nothing was changed/);
        }
        expect(kinds().every((k) => ["ps", "inspect", "version"].includes(k))).toBe(true);
    });

    it("shows what it will overwrite before it asks", () => {
        const dir = makeBackup();
        const r = restore([dir], { STUB_PROJECT: "shop" }, "shop\n");
        expect(r.status, r.stderr).toBe(0);
        expect(r.stdout).toMatch(/replaces the data of the Docker project "shop"/);
        expect(r.stdout).toMatch(/Type the project name \(shop\)/);
        expect(r.stdout).toMatch(/Everything written since the backup is lost/);
    });

    it("does not ask with --yes", () => {
        const dir = makeBackup();
        const r = restore([dir, "--yes"], {}, "");
        expect(r.status, r.stderr).toBe(0);
        expect(kinds()).toContain("load");
    });

    it("leaves the volumes alone with --db-only, even if an archive is damaged", () => {
        const dir = makeBackup();
        swap(dir, "uploads.tar.gz", Buffer.from("garbage"));
        const r = restore([dir, "--db-only"]);
        expect(r.status, r.stderr).toBe(0);
        expect(kinds()).toEqual(["ps", "inspect", "version", "stop", "reset", "load", "counts"]);
    });

    it("refuses a damaged file before it touches the stack", () => {
        const dir = makeBackup();
        writeFileSync(path.join(dir, "db.sql.gz"), gzipSync(`${goodDump}-- tampered\n`));
        const r = restore([dir]);
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/db\.sql\.gz does not match its checksum/);
        expect(r.stderr).toMatch(/nothing was changed/);
        expect(calls()).toEqual([]);
    });

    it("refuses a backup whose dump is empty, however good its checksums look", () => {
        const dir = makeBackup();
        swap(dir, "db.sql.gz", gzipSync(""));
        const r = restore([dir]);
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/dump in this backup cannot be used, the dump is empty/);
        expect(calls()).toEqual([]);
    });

    it("refuses a damaged archive before it touches the stack", () => {
        const dir = makeBackup();
        swap(dir, "invoices.tar.gz", Buffer.from("garbage"));
        const r = restore([dir]);
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/invoices\.tar\.gz is not a complete \.tar\.gz/);
        expect(calls()).toEqual([]);
    });

    it("refuses an unfinished backup, a folder that is not a backup, and no folder at all", () => {
        const partial = path.join(work, "custoro-20261103T120000Z.partial");
        mkdirSync(partial);
        expect(restore([partial]).stderr).toMatch(/unfinished backup/);
        const empty = path.join(work, "empty");
        mkdirSync(empty);
        expect(restore([empty]).stderr).toMatch(/db\.sql\.gz is missing/);
        expect(restore([path.join(work, "nope")]).stderr).toMatch(/is not a folder/);
        expect(restore([]).stderr).toMatch(/which backup\?/);
        expect(calls()).toEqual([]);
    });

    it("tells the owner the database is incomplete when the load fails, and does not touch the volumes", () => {
        const dir = makeBackup();
        const r = restore([dir], { STUB_LOAD_STATUS: "1" });
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/EMPTY OR INCOMPLETE/);
        expect(kinds()).not.toContain("untar");
    });

    it("stops when the database cannot be reset, before loading anything", () => {
        const dir = makeBackup();
        const r = restore([dir], { STUB_RESET_STATUS: "1" });
        expect(r.status).toBe(1);
        expect(kinds()).not.toContain("load");
    });

    it("refuses a dump from the other kind of server before it changes anything", () => {
        writeFileSync(path.join(stubDir, "dump.sql"), mariadbDump(true));
        const dir = makeBackup();
        const r = restore([dir, "--yes"], { STUB_VERSION: "8.4.11" });
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/made by MariaDB.*Nothing was changed/);
        expect(kinds()).toEqual(["ps", "inspect", "version"]);
    });

    it("restores a MariaDB dump into a MariaDB service", () => {
        writeFileSync(path.join(stubDir, "dump.sql"), mariadbDump(true));
        const dir = makeBackup();
        const r = restore([dir, "--yes"], { STUB_VERSION: "11.4.13-MariaDB-ubu2404" });
        expect(r.status, r.stderr).toBe(0);
        expect(kinds()).toContain("load");
    });

    it("never puts a password on a command line or prints one", () => {
        const dir = makeBackup();
        const r = restore([dir]);
        expect(r.status).toBe(0);
        expect(readFileSync(path.join(stubDir, "calls.log"), "utf8")).not.toContain(secret);
        expect(`${r.stdout}${r.stderr}`).not.toContain(secret);
        const reset = calls().find((c) => kind(c) === "reset")!;
        expect(reset[reset.length - 1]).toContain('MYSQL_PWD="$MYSQL_ROOT_PASSWORD"');
    });

    it("says the db service must be running", () => {
        const dir = makeBackup();
        const r = restore([dir], { STUB_DB_RUNNING: "" });
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/db service is not running/);
        expect(kinds()).toEqual(["ps"]);
    });
});

// The scripts read the volumes through the api service at the paths the compose file mounts them at.
// The compose file is not in the api container's folder, so this only runs on a full checkout (CI).
describe.skipIf(!existsSync(composeProd))("mount paths", () => {
    it("are the ones docker-compose.prod.yml mounts the uploads and invoices volumes at", () => {
        const compose = readFileSync(composeProd, "utf8");
        const libText = readFileSync(lib, "utf8");
        const mount = (volume: string) =>
            new RegExp(`^\\s+- ${volume}:(\\S+)$`, "m").exec(compose)?.[1];
        expect(libText).toContain(`uploads_path=${mount("uploads")}`);
        expect(libText).toContain(`invoices_path=${mount("invoices")}`);
        expect(mount("uploads")).toBe("/app/uploads");
    });
});
