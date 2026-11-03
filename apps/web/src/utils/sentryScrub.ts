// Two links carry a credential in their path. The password reset link (/restore/<token>) sets a
// password, and the public PDF link (/pdf/<hash>) opens an invoice without a login (the API scrubs
// the same hash from what it sends, apps/api/helpers/sentryScrub.ts). Sentry records page URLs in
// errors, traces, breadcrumbs and replays, and the request for the PDF (/api/pdf/<hash>), so both
// are replaced before anything is sent. The request that makes a PDF has the invoice's number in
// that place (/api/pdf/6), which stays.
const resetTokenPattern = /(\/restore\/)[^/?#"\s\\]+/g;
const pdfHashPattern = /(\/pdf\/)[0-9a-f]{16,}/gi;

export const scrubResetToken = (text: string): string =>
    text.replace(resetTokenPattern, '$1[token]');

export const scrubPdfHash = (text: string): string => text.replace(pdfHashPattern, '$1[hash]');

// Works on any JSON-shaped Sentry payload, wherever the URL sits in it
export const scrubSentryPayload = <T>(payload: T): T => {
    const json = JSON.stringify(payload);
    const scrubbed = scrubPdfHash(scrubResetToken(json));

    return scrubbed === json ? payload : (JSON.parse(scrubbed) as T);
};
