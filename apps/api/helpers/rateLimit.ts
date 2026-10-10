// In-memory attempt counters for login and password reset, without Express, so they can be
// unit tested. One API process serves the app, so memory is enough; counters reset on restart.

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

// Usernames are emails and the column compares case-insensitively, so the counters do too
export const accountKey = (username: string) => username.trim().toLowerCase();

export interface LoginThrottleIF {
    retryAfterSeconds: (ip: string, username: string) => number;
    recordFailure: (ip: string, username: string) => void;
    recordSuccess: (username: string) => void;
}

// Failed logins are limited per account (guessing one password) and per address (trying many
// accounts). A successful login clears the account's counter, not the address's.
export const createLoginThrottle = (
    perAccount: RateLimitRuleIF,
    perIp: RateLimitRuleIF,
    now?: () => number
): LoginThrottleIF => {
    const accounts = createRateLimiter(perAccount, now);
    const addresses = createRateLimiter(perIp, now);

    return {
        retryAfterSeconds: (ip, username) =>
            Math.max(
                accounts.retryAfterSeconds(accountKey(username)),
                addresses.retryAfterSeconds(ip)
            ),
        recordFailure: (ip, username) => {
            accounts.hit(accountKey(username));
            addresses.hit(ip);
        },
        recordSuccess: (username) => accounts.reset(accountKey(username))
    };
};

export interface ResetThrottleIF {
    // Counts the request and says whether it may send an email
    allow: (ip: string, username: string) => boolean;
}

// Every reset request counts, sent or not, so the limit cannot tell whether an account exists
export const createResetThrottle = (
    perAccount: RateLimitRuleIF,
    perIp: RateLimitRuleIF,
    now?: () => number
): ResetThrottleIF => {
    const accounts = createRateLimiter(perAccount, now);
    const addresses = createRateLimiter(perIp, now);

    return {
        allow: (ip, username) => {
            const key = accountKey(username);
            const blocked =
                accounts.retryAfterSeconds(key) > 0 || addresses.retryAfterSeconds(ip) > 0;

            accounts.hit(key);
            addresses.hit(ip);

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
        { max: envNumber("LOGIN_MAX_FAILURES_PER_ACCOUNT", 10), windowMs: minutes(15) },
        { max: envNumber("LOGIN_MAX_FAILURES_PER_IP", 50), windowMs: minutes(15) }
    ));

export const getResetThrottle = () =>
    (resetThrottle ??= createResetThrottle(
        { max: envNumber("RESET_MAX_REQUESTS_PER_ACCOUNT", 3), windowMs: minutes(60) },
        { max: envNumber("RESET_MAX_REQUESTS_PER_IP", 10), windowMs: minutes(60) }
    ));

export const tooManyAttemptsMessage = "Too many attempts. Please try again later.";
