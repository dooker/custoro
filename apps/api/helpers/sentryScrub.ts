// What leaves the API for Sentry, without Sentry's own types, so it can be unit tested.
// Request bodies carry passwords and reset tokens, the Authorization header carries the login
// token, the public PDF link /pdf/<hash> is the only credential of an invoice, and the page
// /restore/<token> carries a password-reset or account-setup token, so none of them are sent.
// The restore page reaches the API in the Referer of its own calls, and as a request of its own
// when the API serves the web app (WEB_DIR); case and doubled slashes as nginx's log rule.

const pdfHash = /(\/pdf\/)[0-9a-f]{16,}/gi;
const restoreToken = /(\/+restore\/+)[^/?#\s"']+/gi;

const scrubText = (text: string) =>
    text.replace(pdfHash, "$1[hash]").replace(restoreToken, "$1[token]");

const maxDepth = 12;

// Replaces the hash and the token in every string of the event: the request URL, a transaction's name, its
// spans and their data, breadcrumbs and anything else a SDK put there
const scrubDeep = (value: unknown, seen: WeakSet<object>, depth: number): unknown => {
    if (typeof value === "string") return scrubText(value);

    if (!value || typeof value !== "object" || depth > maxDepth || seen.has(value)) return value;

    seen.add(value);

    const record = value as Record<string, unknown>;

    for (const key of Object.keys(record)) {
        record[key] = scrubDeep(record[key], seen, depth + 1);
    }

    return value;
};

interface EventLike {
    request?: {
        data?: unknown;
        cookies?: unknown;
        headers?: Record<string, unknown>;
    };
}

// For beforeSend (errors) and beforeSendTransaction (traces, which have URLs and spans too)
export const scrubSentryEvent = <T extends EventLike>(event: T): T => {
    if (event.request) {
        delete event.request.data;
        delete event.request.cookies;

        if (event.request.headers) {
            delete event.request.headers.authorization;
            delete event.request.headers.Authorization;
        }
    }

    return scrubDeep(event, new WeakSet(), 0) as T;
};

// Every transaction of a busy production API is not needed to see what is slow
export const tracesSampleRate = (nodeEnv: string, override?: string) => {
    const value = override?.trim() ? Number(override) : NaN;

    if (Number.isFinite(value) && value >= 0 && value <= 1) return value;

    return nodeEnv === "production" ? 0.1 : 1.0;
};
