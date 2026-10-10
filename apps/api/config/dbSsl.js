// TLS for database connections, shared by the API (db.ts) and the migrations (database.js).
//
// DB_SSL=verify  encrypted, and the server certificate must be signed by a trusted CA and name
//                DB_HOST. A certificate from a public CA works as is; for a self-signed one
//                (MySQL's default) point DB_SSL_CA at the CA certificate (PEM), e.g. the
//                server's ca.pem. DB_HOST must be the host name in the certificate; an IP
//                address cannot be checked. MySQL's auto-generated certificates name no host,
//                so they never pass: give the server a certificate for its name, or use
//                DB_SSL=off where the network between app and database is trusted.
// DB_SSL=off     no TLS, for a database on the same host or a private Docker network.
//
// There is deliberately no "encrypt but don't check" mode: without the check anyone between
// the app and the database can read the traffic, password included.
const fs = require("fs");
const net = require("net");

const modes = ["verify", "off"];

const getDbSsl = (defaultMode) => {
    const mode = String(process.env.DB_SSL || defaultMode).toLowerCase();

    if (!modes.includes(mode)) {
        throw new Error(`DB_SSL must be "verify" or "off", not "${process.env.DB_SSL}"`);
    }

    if (mode === "off") {
        return undefined;
    }

    const caPath = process.env.DB_SSL_CA;

    if (net.isIP(process.env.DB_HOST || "")) {
        throw new Error(
            "DB_SSL=verify needs the database's host name in DB_HOST, not an IP address, so the certificate can be checked"
        );
    }

    return {
        rejectUnauthorized: true,
        // mysql2 only compares the certificate with the host name when asked to
        verifyIdentity: true,
        ...(caPath ? { ca: fs.readFileSync(caPath, "utf8") } : {})
    };
};

module.exports = { getDbSsl };
