import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShutdown } from "./shutdown";

// A server whose close() finishes when the test says the last request is done
const fakeServer = () => {
    let finish: (error?: Error) => void = () => undefined;

    return {
        close: vi.fn((callback?: (error?: Error) => void) => {
            finish = (error) => callback?.(error);
        }),
        closeIdleConnections: vi.fn(),
        closeAllConnections: vi.fn(),
        requestsDone: (error?: Error) => finish(error)
    };
};

const setup = (timeoutMs = 1000) => {
    const server = fakeServer();
    const order: string[] = [];
    const closeResources = vi.fn(async () => {
        order.push("resources");
    });
    const exit = vi.fn((code: number) => {
        order.push(`exit ${code}`);
    });
    const shutdown = createShutdown({
        server,
        closeResources,
        exit,
        timeoutMs,
        log: () => undefined
    });

    return { server, order, closeResources, exit, shutdown };
};

beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
    vi.useRealTimers();
});

describe("createShutdown", () => {
    it("stops taking connections, waits for the running requests, then closes the resources and exits 0", async () => {
        const { server, order, closeResources, exit, shutdown } = setup();
        const stopping = shutdown("SIGTERM");

        await vi.advanceTimersByTimeAsync(10);

        // a request is still running: nothing is closed and the process has not exited
        expect(server.close).toHaveBeenCalledOnce();
        expect(server.closeIdleConnections).toHaveBeenCalledOnce();
        expect(closeResources).not.toHaveBeenCalled();
        expect(exit).not.toHaveBeenCalled();

        server.requestsDone();
        await stopping;

        expect(order).toEqual(["resources", "exit 0"]);
        expect(server.closeAllConnections).not.toHaveBeenCalled();
    });

    it("cuts off the requests that are still running after the timeout, and still exits 0", async () => {
        const { server, order, shutdown } = setup(1000);
        const stopping = shutdown("SIGTERM");

        await vi.advanceTimersByTimeAsync(999);
        expect(server.closeAllConnections).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(server.closeAllConnections).toHaveBeenCalledOnce();

        // cutting the connections makes close() finish
        server.requestsDone();
        await stopping;

        expect(order).toEqual(["resources", "exit 0"]);
    });

    it("ignores a second signal while it is stopping", async () => {
        const { server, shutdown } = setup();
        const first = shutdown("SIGTERM");

        await shutdown("SIGINT");
        await vi.advanceTimersByTimeAsync(10);
        server.requestsDone();
        await first;

        expect(server.close).toHaveBeenCalledOnce();
    });

    it("exits 1 when the server cannot be closed, without closing the resources", async () => {
        const { server, order, closeResources, shutdown } = setup();
        const stopping = shutdown("SIGTERM");

        await vi.advanceTimersByTimeAsync(10);
        server.requestsDone(new Error("not running"));
        await stopping;

        expect(closeResources).not.toHaveBeenCalled();
        expect(order).toEqual(["exit 1"]);
    });

    it("exits 1 when a resource fails to close", async () => {
        const { server, order, closeResources, shutdown } = setup();

        closeResources.mockRejectedValue(new Error("pool"));

        const stopping = shutdown("SIGTERM");

        await vi.advanceTimersByTimeAsync(10);
        server.requestsDone();
        await stopping;

        expect(order).toEqual(["exit 1"]);
    });

    it("does not leave the cut-off timer running after a clean stop", async () => {
        const { server, shutdown } = setup(1000);
        const stopping = shutdown("SIGTERM");

        await vi.advanceTimersByTimeAsync(10);
        server.requestsDone();
        await stopping;
        await vi.advanceTimersByTimeAsync(5000);

        expect(server.closeAllConnections).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
});
