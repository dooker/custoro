import { describe, expect, it } from "vitest";
import {
    accountKey,
    addressKey,
    createLoginThrottle,
    createRateLimiter,
    createResetThrottle,
    nameKey
} from "./rateLimit";

const minute = 60 * 1000;

const clock = () => {
    let time = 1_000_000;

    return {
        now: () => time,
        advance: (ms: number) => {
            time += ms;
        }
    };
};

describe("createRateLimiter", () => {
    it("blocks a key after the maximum number of hits until the window ends", () => {
        const { now, advance } = clock();
        const limiter = createRateLimiter({ max: 3, windowMs: 10 * minute }, now);

        limiter.hit("a");
        limiter.hit("a");
        expect(limiter.retryAfterSeconds("a")).toBe(0);

        limiter.hit("a");
        expect(limiter.retryAfterSeconds("a")).toBe(600);

        advance(4 * minute);
        expect(limiter.retryAfterSeconds("a")).toBe(360);

        advance(6 * minute);
        expect(limiter.retryAfterSeconds("a")).toBe(0);
    });

    it("counts keys separately", () => {
        const limiter = createRateLimiter({ max: 1, windowMs: minute });

        limiter.hit("a");

        expect(limiter.retryAfterSeconds("a")).toBeGreaterThan(0);
        expect(limiter.retryAfterSeconds("b")).toBe(0);
    });

    it("forgets a key on reset", () => {
        const limiter = createRateLimiter({ max: 1, windowMs: minute });

        limiter.hit("a");
        limiter.reset("a");

        expect(limiter.retryAfterSeconds("a")).toBe(0);
    });
});

describe("nameKey and accountKey", () => {
    it("folds case, accents, width forms and surrounding spaces of a name nobody has", () => {
        const spellings = [
            "admin@example.test",
            "Admin@Example.test",
            " admin@example.test ",
            "admín@example.test",
            "ädmin@example.test",
            "ａdmin@example.test"
        ];

        for (const spelling of spellings) {
            expect(nameKey(spelling), spelling).toBe("admin@example.test");
        }
    });

    it("counts an account that exists by its id, whatever was typed", () => {
        expect(accountKey(7, "admin@example.test")).toBe("id:7");
        expect(accountKey(7, "ADMÍN@example.test")).toBe("id:7");
        expect(accountKey(7, "something the database treats as the same")).toBe("id:7");
    });

    it("keeps a name and an id apart", () => {
        expect(accountKey(undefined, "Id:7")).toBe("name:id:7");
        expect(accountKey(null, "x@example.test")).not.toBe(accountKey(1, "x@example.test"));
    });
});

describe("addressKey", () => {
    it("leaves IPv4 addresses alone", () => {
        expect(addressKey("203.0.113.9")).toBe("203.0.113.9");
        expect(addressKey("unknown")).toBe("unknown");
    });

    it("treats an IPv4 address mapped into IPv6 as the IPv4 address", () => {
        expect(addressKey("::ffff:203.0.113.9")).toBe("203.0.113.9");
        expect(addressKey("::FFFF:203.0.113.9")).toBe("203.0.113.9");
        expect(addressKey("::ffff:cb00:7109")).toBe("203.0.113.9");
    });

    it("gives every address in one IPv6 /64 the same key", () => {
        const key = addressKey("2001:db8:1234:5678::1");

        expect(key).toBe("2001:0db8:1234:5678::/64");
        expect(addressKey("2001:db8:1234:5678:aaaa:bbbb:cccc:dddd")).toBe(key);
        expect(addressKey("2001:DB8:1234:5678:0:0:0:2")).toBe(key);
        expect(addressKey("2001:db8:1234:5678::ffff")).toBe(key);
        expect(addressKey("2001:db8:1234:5679::1")).not.toBe(key);
    });

    it("handles :: at either end and the loopback address", () => {
        expect(addressKey("::1")).toBe("0000:0000:0000:0000::/64");
        expect(addressKey("::")).toBe("0000:0000:0000:0000::/64");
        expect(addressKey("2001:db8::")).toBe("2001:0db8:0000:0000::/64");
        expect(addressKey("fe80::1%eth0")).toBe("fe80:0000:0000:0000::/64");
    });

    it("leaves anything that is not an address as it is", () => {
        expect(addressKey("not-an-ip")).toBe("not-an-ip");
        expect(addressKey("1:2:3")).toBe("1:2:3");
    });
});

describe("createLoginThrottle", () => {
    const perAccount = { max: 6, windowMs: 15 * minute };
    const perAccountAddress = { max: 3, windowMs: 15 * minute };
    const perAddress = { max: 5, windowMs: 15 * minute };
    const create = (now?: () => number) =>
        createLoginThrottle(perAccount, perAccountAddress, perAddress, now);

    it("blocks an account from an address after a few failures from that address", () => {
        const throttle = create();

        for (let i = 0; i < 3; i++) {
            throttle.recordFailure("10.0.0.1", "id:7");
        }

        expect(throttle.retryAfterSeconds("10.0.0.1", "id:7")).toBeGreaterThan(0);
        expect(throttle.retryAfterSeconds("10.0.0.1", "id:8")).toBe(0);
    });

    // The account's owner must not be locked out by a stranger's failures
    it("does not lock the account for other addresses on the strength of one address's failures", () => {
        const throttle = create();

        for (let i = 0; i < 3; i++) {
            throttle.recordFailure("203.0.113.66", "id:7");
        }

        expect(throttle.retryAfterSeconds("203.0.113.66", "id:7")).toBeGreaterThan(0);
        expect(throttle.retryAfterSeconds("198.51.100.1", "id:7")).toBe(0);
    });

    it("blocks an account that is guessed at from many addresses, once its larger budget is spent", () => {
        const throttle = create();

        for (let i = 0; i < 6; i++) {
            throttle.recordFailure(`198.51.100.${i}`, "id:7");
        }

        expect(throttle.retryAfterSeconds("198.51.100.200", "id:7")).toBeGreaterThan(0);
        expect(throttle.retryAfterSeconds("198.51.100.200", "id:8")).toBe(0);
    });

    it("blocks an address that tries many accounts", () => {
        const throttle = create();

        for (let i = 0; i < 5; i++) {
            throttle.recordFailure("10.0.0.1", `id:${i}`);
        }

        expect(throttle.addressRetryAfterSeconds("10.0.0.1")).toBeGreaterThan(0);
        expect(throttle.retryAfterSeconds("10.0.0.1", "id:99")).toBeGreaterThan(0);
        expect(throttle.addressRetryAfterSeconds("10.0.0.2")).toBe(0);
        expect(throttle.retryAfterSeconds("10.0.0.2", "id:99")).toBe(0);
    });

    it("counts a client's whole IPv6 /64 as one address", () => {
        const throttle = create();

        for (let i = 0; i < 3; i++) {
            throttle.recordFailure(`2001:db8:1:2::${i + 1}`, "id:7");
        }

        expect(throttle.retryAfterSeconds("2001:db8:1:2:ffff::9", "id:7")).toBeGreaterThan(0);
        expect(throttle.retryAfterSeconds("2001:db8:1:3::1", "id:7")).toBe(0);
    });

    it("clears the account's failures after a successful login, not the address's", () => {
        const throttle = create();

        throttle.recordFailure("10.0.0.1", "id:7");
        throttle.recordFailure("10.0.0.1", "id:7");
        throttle.recordSuccess("10.0.0.1", "id:7");
        throttle.recordFailure("10.0.0.1", "id:7");
        throttle.recordFailure("10.0.0.1", "id:7");

        expect(throttle.retryAfterSeconds("10.0.0.1", "id:7")).toBe(0);

        // The address kept its four failures, so one more account failure reaches its limit
        throttle.recordFailure("10.0.0.1", "id:8");

        expect(throttle.addressRetryAfterSeconds("10.0.0.1")).toBeGreaterThan(0);
    });

    it("lets the address try again when the window has passed", () => {
        const { now, advance } = clock();
        const throttle = create(now);

        for (let i = 0; i < 3; i++) {
            throttle.recordFailure("10.0.0.1", "id:7");
        }

        advance(15 * minute);

        expect(throttle.retryAfterSeconds("10.0.0.1", "id:7")).toBe(0);
    });
});

describe("createResetThrottle", () => {
    it("allows a few requests per account, then refuses until the window ends", () => {
        const { now, advance } = clock();
        const throttle = createResetThrottle(
            { max: 2, windowMs: 60 * minute },
            { max: 10, windowMs: 60 * minute },
            now
        );

        expect(throttle.allow("10.0.0.1", "id:7")).toBe(true);
        expect(throttle.allow("10.0.0.2", "id:7")).toBe(true);
        expect(throttle.allow("10.0.0.3", "id:7")).toBe(false);

        advance(60 * minute);
        expect(throttle.allow("10.0.0.3", "id:7")).toBe(true);
    });

    it("limits one address across accounts, known or not", () => {
        const throttle = createResetThrottle(
            { max: 5, windowMs: 60 * minute },
            { max: 2, windowMs: 60 * minute }
        );

        expect(throttle.allow("10.0.0.1", "id:7")).toBe(true);
        expect(throttle.allow("10.0.0.1", accountKey(undefined, "nobody@example.test"))).toBe(true);
        expect(throttle.allow("10.0.0.1", "id:9")).toBe(false);
        expect(throttle.allow("10.0.0.2", "id:9")).toBe(true);
    });

    it("counts a client's IPv6 /64 as one address", () => {
        const throttle = createResetThrottle(
            { max: 5, windowMs: 60 * minute },
            { max: 2, windowMs: 60 * minute }
        );

        expect(throttle.allow("2001:db8:1:2::1", "id:1")).toBe(true);
        expect(throttle.allow("2001:db8:1:2::2", "id:2")).toBe(true);
        expect(throttle.allow("2001:db8:1:2::3", "id:3")).toBe(false);
    });
});
