// How the API connects to the mail server, without nodemailer or the environment, so it can be
// unit tested. The mail server's login (user and password) is sent over this connection.

export interface MailServerIF {
    host?: string;
    port?: string;
    username?: string;
    password?: string;
}

const defaultPort = 587;
// Port 465 is TLS from the first byte ("implicit TLS"); every other port starts in plain text
const implicitTlsPort = 465;

export const mailPort = (port: string | undefined) => parseInt(String(port), 10) || defaultPort;

/**
 * The connection options for nodemailer. On any port but 465 the connection starts in plain text
 * and is upgraded with STARTTLS, which nodemailer only does when the server offers it: a network
 * attacker who removes that offer would get the mail server login in the clear. `requireTLS`
 * makes the upgrade mandatory, so the connection fails instead. The server certificate is always
 * checked (nodemailer's default).
 *
 * EMAIL_REQUIRE_TLS=false allows the plain connection, for a mail server or test mail catcher on
 * the same machine; leave it unset anywhere else.
 */
export const mailTransportOptions = (server: MailServerIF, requireTlsSetting?: string) => {
    const port = mailPort(server.port);
    const implicitTls = port === implicitTlsPort;

    return {
        host: String(server.host),
        port,
        secure: implicitTls,
        requireTLS: !implicitTls && requireTlsSetting?.trim().toLowerCase() !== "false",
        auth: {
            user: String(server.username),
            pass: String(server.password)
        }
    };
};
