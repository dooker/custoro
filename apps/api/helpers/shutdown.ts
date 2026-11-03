// What happens when Docker (or Ctrl+C) asks the API to stop, without Express, so it can be unit
// tested. Without it the first SIGTERM is ignored, because Node runs as process 1 in the container,
// and Docker kills the process after its grace period: a request in the middle of creating an
// invoice, a PDF or an email is cut off.
import type { Server } from "http";

export const shutdownSignals = ["SIGTERM", "SIGINT"] as const;

// Docker waits 10 s before it kills a container; docker-compose.prod.yml gives the API 30 s
export const defaultShutdownTimeoutMs = 25_000;

interface ShutdownDepsIF {
    server: Pick<Server, "close" | "closeIdleConnections" | "closeAllConnections">;
    // Everything that has to be closed once no request is running: database pools, error reporting
    closeResources: () => Promise<void>;
    exit: (code: number) => void;
    timeoutMs?: number;
    log?: (message: string) => void;
}

/**
 * The function to call on a stop signal: it stops taking new connections, waits for the requests
 * that are running, closes the resources and exits with 0. Requests still running after
 * `timeoutMs` are cut off. A second signal while it waits is ignored. Any failure exits with 1.
 */
export const createShutdown = ({
    server,
    closeResources,
    exit,
    timeoutMs = defaultShutdownTimeoutMs,
    log = console.log
}: ShutdownDepsIF) => {
    let started = false;

    return async (signal: string) => {
        if (started) return;

        started = true;
        log(`${signal} received: finishing the open requests`);

        const timer = setTimeout(() => {
            log(`Still busy after ${Math.round(timeoutMs / 1000)} s: cutting off what is left`);
            server.closeAllConnections();
        }, timeoutMs);

        try {
            const closed = new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });

            // Connections that wait for a next request have nothing to finish
            server.closeIdleConnections();
            await closed;
            await closeResources();
            clearTimeout(timer);
            log("Stopped");
            exit(0);
        } catch (error) {
            clearTimeout(timer);
            console.error("Shutdown failed:", error);
            exit(1);
        }
    };
};
