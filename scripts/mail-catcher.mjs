// A mail server for development and tests that delivers nothing: it accepts every email on SMTP
// port 1025 (any login, no TLS) and keeps the last 500 in memory, readable as JSON on port 8025.
// docker-compose.yml runs it as the `mail` service; the Playwright tests read reset links from it.
//
//   GET    http://localhost:8025/messages            every email, oldest first
//   GET    http://localhost:8025/messages?to=a@b.c   the emails to one address
//   DELETE http://localhost:8025/messages            forget them all
//
// Plain Node, no packages: only for local use, never on a server that sends real email.
import http from "node:http";
import net from "node:net";

const smtpPort = Number(process.env.SMTP_PORT ?? 1025);
const httpPort = Number(process.env.HTTP_PORT ?? 8025);
const maxMessages = 500;
const messages = [];

const decodeWords = (value) =>
    value.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, charset, kind, text) =>
        kind.toUpperCase() === "B"
            ? Buffer.from(text, "base64").toString("utf8")
            : Buffer.from(
                  text
                      .replace(/_/g, " ")
                      .replace(/=([0-9A-F]{2})/gi, (__, hex) =>
                          String.fromCharCode(parseInt(hex, 16))
                      ),
                  "latin1"
              ).toString("utf8")
    );

const decodeBody = (body, encoding = "") => {
    if (/quoted-printable/i.test(encoding)) {
        const bytes = body
            .replace(/=\r?\n/g, "")
            .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

        return Buffer.from(bytes, "latin1").toString("utf8");
    }

    if (/base64/i.test(encoding)) {
        return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
    }

    return Buffer.from(body, "latin1").toString("utf8");
};

const splitHeaders = (raw) => {
    const end = raw.indexOf("\r\n\r\n");
    const head = (end < 0 ? raw : raw.slice(0, end)).replace(/\r\n[ \t]+/g, " ");
    const headers = {};

    for (const line of head.split("\r\n")) {
        const colon = line.indexOf(":");

        if (colon > 0) {
            headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
        }
    }

    return { headers, body: end < 0 ? "" : raw.slice(end + 4) };
};

// The text and HTML of a message, from a single part or from multipart/alternative or mixed
const bodies = (raw, found = { text: "", html: "" }) => {
    const { headers, body } = splitHeaders(raw);
    const type = headers["content-type"] ?? "text/plain";
    const boundary = /boundary="?([^";]+)"?/i.exec(type)?.[1];

    if (/^multipart\//i.test(type) && boundary) {
        for (const part of body.split(`--${boundary}`).slice(1)) {
            if (!part.startsWith("--")) bodies(part.replace(/^\r\n/, ""), found);
        }
    } else if (/^text\/html/i.test(type)) {
        found.html ||= decodeBody(body, headers["content-transfer-encoding"]);
    } else if (/^text\/plain/i.test(type)) {
        found.text ||= decodeBody(body, headers["content-transfer-encoding"]);
    }

    return found;
};

const store = (envelopeTo, raw) => {
    const { headers } = splitHeaders(raw);
    const { text, html } = bodies(raw);

    messages.push({
        to: envelopeTo,
        from: headers.from ?? "",
        subject: decodeWords(headers.subject ?? ""),
        text,
        html,
        receivedAt: new Date().toISOString()
    });
    messages.splice(0, Math.max(0, messages.length - maxMessages));
};

net.createServer((socket) => {
    let buffer = "";
    let data = null;
    let to = [];
    let waitingForAuth = 0;

    socket.write("220 custoro mail catcher\r\n");
    socket.on("error", () => {});
    socket.on("data", (chunk) => {
        buffer += chunk.toString("latin1");

        let end;

        while ((end = buffer.indexOf("\r\n")) >= 0) {
            const line = buffer.slice(0, end);

            buffer = buffer.slice(end + 2);

            if (data !== null) {
                if (line === ".") {
                    store(to, data.join("\r\n"));
                    data = null;
                    to = [];
                    socket.write("250 OK kept\r\n");
                } else {
                    data.push(line.startsWith("..") ? line.slice(1) : line);
                }

                continue;
            }

            if (waitingForAuth > 0) {
                waitingForAuth -= 1;
                socket.write(waitingForAuth > 0 ? "334 UGFzc3dvcmQ6\r\n" : "235 OK\r\n");
                continue;
            }

            const verb = line.split(" ")[0].toUpperCase();

            if (verb === "EHLO") {
                socket.write("250-custoro\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n");
            } else if (verb === "AUTH") {
                const [, method, initial] = line.split(" ");

                if (/^PLAIN$/i.test(method)) {
                    waitingForAuth = initial ? 0 : 1;
                    socket.write(initial ? "235 OK\r\n" : "334 \r\n");
                } else {
                    waitingForAuth = initial ? 1 : 2;
                    socket.write(initial ? "334 UGFzc3dvcmQ6\r\n" : "334 VXNlcm5hbWU6\r\n");
                }
            } else if (verb === "RCPT") {
                to.push((/<([^>]*)>/.exec(line)?.[1] ?? "").toLowerCase());
                socket.write("250 OK\r\n");
            } else if (verb === "DATA") {
                data = [];
                socket.write("354 End with <CRLF>.<CRLF>\r\n");
            } else if (verb === "QUIT") {
                socket.end("221 Bye\r\n");
            } else {
                socket.write("250 OK\r\n");
            }
        }
    });
}).listen(smtpPort, () => console.log(`mail catcher: SMTP on ${smtpPort}`));

http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (url.pathname !== "/messages") {
        response.writeHead(404).end();
        return;
    }

    if (request.method === "DELETE") {
        messages.length = 0;
        response.writeHead(204).end();
        return;
    }

    const to = url.searchParams.get("to")?.toLowerCase();
    const list = to ? messages.filter((message) => message.to.includes(to)) : messages;

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(list));
}).listen(httpPort, () =>
    console.log(`mail catcher: messages on http://localhost:${httpPort}/messages`)
);
