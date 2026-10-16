// Where invoice PDFs are stored and how they are named in a download, without Express, so the
// rules can be unit tested. The file name is `${invoiceFilenamePrefix}${number}.pdf`, and both
// parts come from the database, so nothing here trusts them.
import path from "node:path";

// What the invoice filename prefix may contain. Also the rule when it is saved, so a prefix
// cannot hold a path ("../"), a line break or a character a header cannot carry.
export const invoiceFilenamePrefixPattern = /^[A-Za-z0-9_-]{0,32}$/;

/**
 * The absolute path of a file directly inside `dir`, or null when `filename` would point
 * anywhere else (a path, "..", an empty name or a NUL byte). PDFs are flat in their folder.
 */
export const resolveInside = (dir: string, filename: string): string | null => {
    if (!filename || filename.includes("\0")) {
        return null;
    }

    const root = path.resolve(dir);
    const resolved = path.resolve(root, filename);

    return path.dirname(resolved) === root && resolved !== root ? resolved : null;
};

// ASCII fallback of a file name for the plain `filename` parameter: printable ASCII only, and
// none of the characters that end or escape a quoted string or start a percent escape
const asciiFilename = (filename: string) => filename.replace(/[^\x20-\x7e]|["\\%;]/g, "_");

// A half of a surrogate pair makes encodeURIComponent throw, so it becomes U+FFFD first
const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

// RFC 5987 percent encoding for `filename*`; encodeURIComponent leaves ' ( ) * alone
const encodeFilename = (filename: string) =>
    encodeURIComponent(filename.replace(loneSurrogate, "\uFFFD")).replace(
        /['()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );

/**
 * A Content-Disposition value for showing `filename` in the browser. Any text is allowed:
 * the plain name is limited to safe ASCII (so a header can never be split or rejected) and
 * the real name goes in `filename*` as UTF-8.
 */
export const inlineContentDisposition = (filename: string) =>
    `inline; filename="${asciiFilename(filename)}"; filename*=UTF-8''${encodeFilename(filename)}`;
