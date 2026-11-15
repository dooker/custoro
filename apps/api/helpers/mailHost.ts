// Which mail servers a company may have its emails sent through. Since every company's admin sets
// its own (docs/multi-tenant.md), the API would otherwise open connections to any host and port a
// company typed: the database, 127.0.0.1 or another service on the server's network (server-side
// request forgery). A company's own server must be on a mail port and must not resolve to a
// private, loopback or link-local address. The install's default server (EMAIL_HOST) is set by
// whoever runs the server and is not checked. MAIL_ALLOW_PRIVATE_HOSTS=true lifts both rules, for
// the dev stack's mail catcher.
import dns from "node:dns/promises";
import net from "node:net";

export const mailPorts = [25, 465, 587, 2525];

export const mailHostNotAllowedMessage = "mailHostNotAllowed";

export const allowPrivateMailHosts = (env: Record<string, string | undefined> = process.env) =>
    env.MAIL_ALLOW_PRIVATE_HOSTS?.trim().toLowerCase() === "true";

const ipv4Blocks: [string, number][] = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4]
];

const ipv4Number = (ip: string) =>
    ip.split(".").reduce((value, part) => value * 256 + Number(part), 0);

const inBlock = (ip: string, [base, bits]: [string, number]) => {
    const size = 2 ** (32 - bits);

    return Math.floor(ipv4Number(ip) / size) === Math.floor(ipv4Number(base) / size);
};

/** Whether an address is one a company's mail server may not be on */
export const isPrivateAddress = (address: string): boolean => {
    if (net.isIPv4(address)) {
        return ipv4Blocks.some((block) => inBlock(address, block));
    }

    if (net.isIPv6(address)) {
        const lower = address.toLowerCase();
        const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);

        if (mapped) {
            return isPrivateAddress(mapped[1]);
        }

        return (
            lower === "::" ||
            lower === "::1" ||
            /^f[cd]/.test(lower) || // unique local fc00::/7
            /^fe[89ab]/.test(lower) || // link-local fe80::/10
            /^ff/.test(lower) // multicast
        );
    }

    return true;
};

export type MailHostCheck = { ok: true; address: string } | { ok: false; message: string };

/**
 * Checks a company's own mail server and gives the address to connect to: the one that was
 * checked, so a name that resolves differently a moment later (DNS rebinding) cannot reach another.
 */
export const checkCompanyMailHost = async (
    host: string | undefined,
    port: number,
    allowPrivate = allowPrivateMailHosts(),
    lookup: (host: string) => Promise<{ address: string }[]> = (name) =>
        dns.lookup(name, { all: true })
): Promise<MailHostCheck> => {
    const name = host?.trim();

    if (!name) {
        return { ok: false, message: mailHostNotAllowedMessage };
    }

    if (allowPrivate) {
        return { ok: true, address: name };
    }

    if (!mailPorts.includes(port) || name.toLowerCase() === "localhost") {
        return { ok: false, message: mailHostNotAllowedMessage };
    }

    let addresses: { address: string }[];

    try {
        addresses = net.isIP(name) ? [{ address: name }] : await lookup(name);
    } catch {
        return { ok: false, message: mailHostNotAllowedMessage };
    }

    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
        return { ok: false, message: mailHostNotAllowedMessage };
    }

    return { ok: true, address: addresses[0].address };
};
