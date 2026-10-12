// The password reset link carries its token in the path (/restore/<token>). Sentry records page
// URLs in errors, traces, breadcrumbs and replays, so the token is replaced before anything
// is sent.
const resetTokenPattern = /(\/restore\/)[^/?#"\s\\]+/g;

export const scrubResetToken = (text: string): string =>
    text.replace(resetTokenPattern, '$1[token]');

// Works on any JSON-shaped Sentry payload, wherever the URL sits in it
export const scrubSentryPayload = <T>(payload: T): T => {
    const json = JSON.stringify(payload);
    const scrubbed = scrubResetToken(json);

    return scrubbed === json ? payload : (JSON.parse(scrubbed) as T);
};
