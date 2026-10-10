import { describe, expect, it } from "vitest";
import { createLoginThrottle, createRateLimiter, createResetThrottle } from "./rateLimit";

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

describe("createLoginThrottle", () => {
    const perAccount = { max: 3, windowMs: 15 * minute };
    const perIp = { max: 5, windowMs: 15 * minute };

    it("blocks an account after repeated failures, whatever the address", () => {
        const throttle = createLoginThrottle(perAccount, perIp);

        for (const ip of ["10.0.0.1", "10.0.0.2", "10.0.0.3"]) {
            throttle.recordFailure(ip, "Admin@Example.test");
        }

        expect(throttle.retryAfterSeconds("10.0.0.9", "admin@example.test")).toBeGreaterThan(0);
        expect(throttle.retryAfterSeconds("10.0.0.9", "other@example.test")).toBe(0);
    });

    it("blocks an address that tries many accounts", () => {
        const throttle = createLoginThrottle(perAccount, perIp);

        for (let i = 0; i < 5; i++) {
            throttle.recordFailure("10.0.0.1", `user${i}@example.test`);
        }

        expect(throttle.retryAfterSeconds("10.0.0.1", "new@example.test")).toBeGreaterThan(0);
        expect(throttle.retryAfterSeconds("10.0.0.2", "new@example.test")).toBe(0);
    });

    it("clears the account's failures after a successful login", () => {
        const throttle = createLoginThrottle(perAccount, perIp);

        throttle.recordFailure("10.0.0.1", "a@example.test");
        throttle.recordFailure("10.0.0.1", "a@example.test");
        throttle.recordSuccess("a@example.test");
        throttle.recordFailure("10.0.0.1", "a@example.test");
        throttle.recordFailure("10.0.0.1", "a@example.test");

        expect(throttle.retryAfterSeconds("10.0.0.1", "a@example.test")).toBe(0);
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

        expect(throttle.allow("10.0.0.1", "a@example.test")).toBe(true);
        expect(throttle.allow("10.0.0.2", "A@example.test")).toBe(true);
        expect(throttle.allow("10.0.0.3", "a@example.test")).toBe(false);

        advance(60 * minute);
        expect(throttle.allow("10.0.0.3", "a@example.test")).toBe(true);
    });

    it("limits one address across accounts, known or not", () => {
        const throttle = createResetThrottle(
            { max: 5, windowMs: 60 * minute },
            { max: 2, windowMs: 60 * minute }
        );

        expect(throttle.allow("10.0.0.1", "a@example.test")).toBe(true);
        expect(throttle.allow("10.0.0.1", "nobody@example.test")).toBe(true);
        expect(throttle.allow("10.0.0.1", "c@example.test")).toBe(false);
        expect(throttle.allow("10.0.0.2", "c@example.test")).toBe(true);
    });
});
