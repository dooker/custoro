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

// An IPv6 address as its eight 16-bit groups, whatever way it is written (zeros left out, "::",
// upper case, an IPv4 address in the last 32 bits); null when it is not one
const ipv6Groups = (address: string): number[] | null => {
    if (!net.isIPv6(address)) {
        return null;
    }

    let text = address.toLowerCase();
    const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);

    if (dotted) {
        const v4 = ipv4Number(dotted[1]);
        text = `${text.slice(0, -dotted[1].length)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
    }

    const [head, tail] = text.includes("::") ? text.split("::") : [text, undefined];
    const left = head ? head.split(":") : [];
    const right = tail ? tail.split(":") : [];
    const missing = 8 - left.length - right.length;
    const groups = [...left, ...(tail !== undefined ? Array(missing).fill("0") : []), ...right];

    return groups.length === 8 ? groups.map((group) => parseInt(group, 16)) : null;
};

const groupsToIpv4 = (high: number, low: number) =>
    [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");

/**
 * Whether an address is one a company's mail server may not be on. IPv6 is read as its eight
 * groups, so every way of writing the same address gets the same answer (Copilot review of PR 40:
 * "0:0:0:0:0:0:0:1" and "::ffff:7f00:1" are loopback too), and an IPv6 address that carries an
 * IPv4 one (mapped, compatible, NAT64, 6to4) is judged by that IPv4 address.
 */
export const isPrivateAddress = (address: string): boolean => {
    if (net.isIPv4(address)) {
        return ipv4Blocks.some((block) => inBlock(address, block));
    }

    const groups = ipv6Groups(address);

    if (!groups) {
        return true;
    }

    const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
    const zeroUpTo = (count: number) => groups.slice(0, count).every((group) => group === 0);

    // ::/96 (unspecified, loopback and IPv4-compatible) and ::ffff:0:0/96 (IPv4-mapped)
    if (zeroUpTo(6) || (zeroUpTo(5) && g5 === 0xffff)) {
        return zeroUpTo(7) && g7 <= 1 ? true : isPrivateAddress(groupsToIpv4(g6, g7));
    }

    // 64:ff9b::/96 (NAT64) carries an IPv4 address in its last 32 bits
    if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
        return isPrivateAddress(groupsToIpv4(g6, g7));
    }

    // 2002::/16 (6to4) carries one in its second and third groups
    if (g0 === 0x2002) {
        return isPrivateAddress(groupsToIpv4(g1, g2));
    }

    return (
        (g0 & 0xfe00) === 0xfc00 || // unique local fc00::/7
        (g0 & 0xffc0) === 0xfe80 || // link-local fe80::/10
        (g0 & 0xff00) === 0xff00 // multicast ff00::/8
    );
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
