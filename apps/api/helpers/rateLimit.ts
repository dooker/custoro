// In-memory attempt counters for login and password reset, without Express, so they can be
// unit tested. One API process serves the app, so memory is enough; counters reset on restart.
import { isIPv6 } from "node:net";

export interface RateLimitRuleIF {
    max: number;
    windowMs: number;
}

export interface RateLimiterIF {
    // Seconds until the key may try again, or 0 when it is not blocked
    retryAfterSeconds: (key: string) => number;
    hit: (key: string) => void;
    reset: (key: string) => void;
}

// Old windows are dropped once the map grows past this, so random keys cannot fill memory
const pruneThreshold = 10_000;

export const createRateLimiter = (
    { max, windowMs }: RateLimitRuleIF,
    now: () => number = Date.now
): RateLimiterIF => {
    const entries = new Map<string, { count: number; resetAt: number }>();

    const current = (key: string) => {
        const entry = entries.get(key);

        if (entry && entry.resetAt <= now()) {
            entries.delete(key);
            return undefined;
        }

        return entry;
    };

    const prune = () => {
        if (entries.size < pruneThreshold) return;

        const time = now();

        for (const [key, entry] of entries) {
            if (entry.resetAt <= time) entries.delete(key);
        }
    };

    return {
        retryAfterSeconds: (key) => {
            const entry = current(key);

            return entry && entry.count >= max ? Math.ceil((entry.resetAt - now()) / 1000) : 0;
        },
        hit: (key) => {
            const entry = current(key);

            if (entry) {
                entry.count += 1;
                return;
            }

            prune();
            entries.set(key, { count: 1, resetAt: now() + windowMs });
        },
        reset: (key) => {
            entries.delete(key);
        }
    };
};

const minutes = (count: number) => count * 60 * 1000;

const envNumber = (name: string, fallback: number) => {
    const value = Number(process.env[name]);

    return Number.isInteger(value) && value > 0 ? value : fallback;
};

// Who a counter belongs to. The users.username column compares with utf8mb4_general_ci, which
// ignores case, accents and trailing spaces ("admín@x.com " finds "admin@x.com"), so counting
// per typed name would give every spelling of one account its own budget. An account that
// exists is therefore counted by its id (the lookup the login already makes finds it the way
// the database compares); a name nobody has is only folded the way people vary it.
export const nameKey = (username: string) =>
    username.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLowerCase();

export const accountKey = (userId: number | null | undefined, username = "") =>
    userId ? `id:${userId}` : `name:${nameKey(username)}`;

// A client usually owns a whole IPv6 /64 and can send from any address in it, so the first
// four groups stand for it. An IPv4 address mapped into IPv6 is the IPv4 address.
const expandIpv6 = (address: string): string[] | null => {
    if (!isIPv6(address) || address.includes(".")) return null;

    const [head, tail] = address.split("::");
    const headGroups = head ? head.split(":") : [];
    const tailGroups = tail ? tail.split(":") : [];
    const fill = tail === undefined ? 0 : 8 - headGroups.length - tailGroups.length;
    const groups = [...headGroups, ...Array<string>(Math.max(fill, 0)).fill("0"), ...tailGroups];

    return groups.length === 8 ? groups.map((group) => group.toLowerCase().padStart(4, "0")) : null;
};

export const addressKey = (ip: string) => {
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);

    if (mapped) return mapped[1];

    const groups = expandIpv6(ip.split("%")[0]);

    if (!groups) return ip;

    if (groups.slice(0, 5).every((group) => group === "0000") && groups[5] === "ffff") {
        const [high, low] = [groups[6], groups[7]].map((group) => parseInt(group, 16));

        return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
    }

    return `${groups.slice(0, 4).join(":")}::/64`;
};

export interface LoginThrottleIF {
    // Seconds until this address may try anything, or 0. Needs no account, so it runs first.
    addressRetryAfterSeconds: (ip: string) => number;
    // Seconds until this address may try this account, or 0
    retryAfterSeconds: (ip: string, account: string) => number;
    recordFailure: (ip: string, account: string) => void;
    // Clears the account's failures, not the address's other failures
    recordSuccess: (ip: string, account: string) => void;
}

// Failed logins are limited three ways:
//  - per account and address: guessing one password from one place stops after a few tries,
//    and the account's owner, logging in from elsewhere, is not locked out by that;
//  - per account, across addresses: a larger budget that still stops a guess spread over
//    many addresses;
//  - per address, across accounts: trying many accounts from one place.
// A successful login clears the account's counters, not the address's.
export const createLoginThrottle = (
    perAccount: RateLimitRuleIF,
    perAccountAddress: RateLimitRuleIF,
    perAddress: RateLimitRuleIF,
    now?: () => number
): LoginThrottleIF => {
    const accounts = createRateLimiter(perAccount, now);
    const accountAddresses = createRateLimiter(perAccountAddress, now);
    const addresses = createRateLimiter(perAddress, now);
    const pair = (ip: string, account: string) => `${account}|${addressKey(ip)}`;

    return {
        addressRetryAfterSeconds: (ip) => addresses.retryAfterSeconds(addressKey(ip)),
        retryAfterSeconds: (ip, account) =>
            Math.max(
                accounts.retryAfterSeconds(account),
                accountAddresses.retryAfterSeconds(pair(ip, account)),
                addresses.retryAfterSeconds(addressKey(ip))
            ),
        recordFailure: (ip, account) => {
            accounts.hit(account);
            accountAddresses.hit(pair(ip, account));
            addresses.hit(addressKey(ip));
        },
        recordSuccess: (ip, account) => {
            accounts.reset(account);
            accountAddresses.reset(pair(ip, account));
        }
    };
};

export interface ResetThrottleIF {
    // Counts the request and says whether it may send an email
    allow: (ip: string, account: string) => boolean;
}

// Every reset request counts, sent or not, so the limit cannot tell whether an account exists
export const createResetThrottle = (
    perAccount: RateLimitRuleIF,
    perAddress: RateLimitRuleIF,
    now?: () => number
): ResetThrottleIF => {
    const accounts = createRateLimiter(perAccount, now);
    const addresses = createRateLimiter(perAddress, now);

    return {
        allow: (ip, account) => {
            const address = addressKey(ip);
            const blocked =
                accounts.retryAfterSeconds(account) > 0 || addresses.retryAfterSeconds(address) > 0;

            accounts.hit(account);
            addresses.hit(address);

            return !blocked;
        }
    };
};

// The limits the API runs with; each can be changed through the environment. Created on first
// use, because index.ts loads the .env files after its imports have run.
let loginThrottle: LoginThrottleIF | undefined;
let resetThrottle: ResetThrottleIF | undefined;

export const getLoginThrottle = () =>
    (loginThrottle ??= createLoginThrottle(
        { max: envNumber("LOGIN_MAX_FAILURES_PER_ACCOUNT", 50), windowMs: minutes(15) },
        { max: envNumber("LOGIN_MAX_FAILURES_PER_ACCOUNT_ADDRESS", 10), windowMs: minutes(15) },
        { max: envNumber("LOGIN_MAX_FAILURES_PER_IP", 50), windowMs: minutes(15) }
    ));

export const getResetThrottle = () =>
    (resetThrottle ??= createResetThrottle(
        { max: envNumber("RESET_MAX_REQUESTS_PER_ACCOUNT", 3), windowMs: minutes(60) },
        { max: envNumber("RESET_MAX_REQUESTS_PER_IP", 10), windowMs: minutes(60) }
    ));

export const tooManyAttemptsMessage = "Too many attempts. Please try again later.";
